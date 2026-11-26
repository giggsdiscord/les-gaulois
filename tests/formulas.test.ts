import { describe, expect, it } from 'vitest';
import {
  alcoholInsecurity,
  alcoholProductivityMalus,
  alcoholTier,
  collectivismMalus,
  computeInsecurity,
  computeNatality,
  computeProductivity,
  computeWaterBalance,
  deliverySurchargeFactor,
  drugInsecurity,
  drugProductivityMalus,
  drugTier,
  massMoraleGain,
  smugglingRiskPct,
  understaffingMalus,
  viabilitySeasonDelta,
} from '../src/engine/index.ts';
import { makeMigrant, seedSnapshot } from './fixtures.ts';

const NOW = new Date('2026-11-26T10:00:00Z');

describe('Productivité globale [GDD §3.3 formule 1]', () => {
  it('état initial : 7 fondateurs pour 10 travailleurs requis à l\'Acte I → 75 %', () => {
    const p = computeProductivity(seedSnapshot());
    expect(p.malusUnderstaffing).toBe(25);
    expect(p.malusTools).toBe(0);
    expect(p.total).toBe(75);
  });

  it('malus alcool = 0,40 × max(0, alcool − 20) et drogues = 0,60 × max(0, drogues − 5)', () => {
    expect(alcoholProductivityMalus(45)).toBeCloseTo(10);
    expect(alcoholProductivityMalus(20)).toBe(0);
    expect(drugProductivityMalus(25)).toBeCloseTo(12);
  });

  it('malus collectiviste = 1,10 × max(0, gauche − 40) + 15 si collectivisation votée', () => {
    expect(collectivismMalus(60, true)).toBeCloseTo(37);
    expect(collectivismMalus(40, false)).toBe(0);
  });

  it('pénalité outils −35 % si outils < travailleurs actifs', () => {
    const s = seedSnapshot({ tools_stock: 3 });
    expect(computeProductivity(s).malusTools).toBe(35);
  });

  it('bornée entre 15 % et 150 %', () => {
    const s = seedSnapshot({ tools_stock: 0, alcohol_consumption_pct: 100, drug_prevalence_pct: 100, left_wing_ideology_pct: 100, collectivization_active: true });
    expect(computeProductivity(s).total).toBe(15);
  });

  it('sous-effectif : aucune pénalité dans la tolérance de 10 %', () => {
    expect(understaffingMalus(9, 1)).toBe(0);
    expect(understaffingMalus(0, 1)).toBe(40);
  });

  it('spécialistes et emploi privé augmentent la productivité', () => {
    const s = seedSnapshot();
    s.migrants.push(makeMigrant('m1', { specialty_level: 4, private_employer_id: s.players[0]!.id, private_wage_eur_week: 120 }));
    const p = computeProductivity(s);
    expect(p.bonusSpecialties).toBeCloseTo(6);
    expect(p.bonusPrivateProperty).toBe(10);
  });
});

describe('Insécurité [GDD §3.3 formule 2]', () => {
  it('état initial : tensions de base seules (5 %)', () => {
    expect(computeInsecurity(seedSnapshot(), NOW).total).toBe(5);
  });

  it('alcool = 0,35 × max(0, alcool − 30) ; drogues = 0,80 × max(0, drogues − 5)', () => {
    expect(alcoholInsecurity(50)).toBeCloseTo(7);
    expect(drugInsecurity(15)).toBeCloseTo(8);
  });

  it('marché noir et faction aggravent, la part événementielle s\'ajoute', () => {
    const s = seedSnapshot({ black_market_active: true, faction_active: true, insecurity_offset: 4 });
    const b = computeInsecurity(s, NOW);
    expect(b.baseTensions).toBe(15);
    expect(b.blackMarket).toBeGreaterThanOrEqual(10);
    expect(b.total).toBeGreaterThan(25);
  });
});

describe('Paliers d\'exposition [GDD §3.3]', () => {
  it('classe alcool et drogues', () => {
    expect(alcoholTier(20)).toBe(1);
    expect(alcoholTier(21)).toBe(2);
    expect(alcoholTier(46)).toBe(3);
    expect(alcoholTier(71)).toBe(4);
    expect(drugTier(5)).toBe(1);
    expect(drugTier(6)).toBe(2);
    expect(drugTier(56)).toBe(4);
  });
});

describe('Hydraulique [GDD §3.1]', () => {
  it('D_eau = Npop × 150 L + besoin du potager + besoin de l\'élevage', () => {
    const s = seedSnapshot({ livestock_count: 10 });
    const w = computeWaterBalance(s, 'summer');
    expect(w.demandPeople).toBe(1050);
    expect(w.demandGarden).toBe(1800);
    expect(w.demandLivestock).toBe(80);
    expect(w.demandTotal).toBe(2930);
    expect(w.capacity).toBe(1200);
  });
});

describe('Natalité & pérennité [GDD §3.2]', () => {
  it('Natalité_eff = base × (1 − homo/100) × mariages × logement × moral', () => {
    const n = computeNatality(seedSnapshot());
    expect(n.effectiveRatePct).toBeCloseTo(2.75);
    expect(n.expectedBirths).toBeCloseTo(0.1925);
  });

  it('chute mécaniquement quand le taux d\'homosexualité augmente', () => {
    const low = computeNatality(seedSnapshot({ homosexuality_rate_pct: 12 })).effectiveRatePct;
    const high = computeNatality(seedSnapshot({ homosexuality_rate_pct: 50 })).effectiveRatePct;
    expect(high).toBeLessThan(low);
  });

  it('Δ pérennité = naissances × 8 − (vieillissement + malus homosexualité)', () => {
    expect(viabilitySeasonDelta(seedSnapshot(), 0)).toBeCloseTo(-1.5);
    expect(viabilitySeasonDelta(seedSnapshot(), 1)).toBeCloseTo(6.5);
  });
});

describe('Logistique, contrebande & Messe', () => {
  it('surcoût de +40 % si piste < 40 %', () => {
    expect(deliverySurchargeFactor(seedSnapshot({ track_condition_pct: 39 }).village)).toBe(1.4);
    expect(deliverySurchargeFactor(seedSnapshot({ track_condition_pct: 40 }).village)).toBe(1);
  });

  it('risque d\'embuscade borné entre 25 % et 45 %', () => {
    expect(smugglingRiskPct(seedSnapshot({ spanish_fluency_pct: 100 }).village)).toBe(25);
    expect(smugglingRiskPct(seedSnapshot({ smuggling_runs_this_season: 10 }).village)).toBe(45);
  });

  it('la friction culturelle réduit l\'efficacité morale de la Messe', () => {
    expect(massMoraleGain(seedSnapshot({ cultural_friction_pct: 10 }).village)).toBe(12);
    expect(massMoraleGain(seedSnapshot({ cultural_friction_pct: 70 }).village)).toBe(6);
  });
});
