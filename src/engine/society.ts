/**
 * Dynamiques sociales quotidiennes : idéologie Droite/Gauche, friction culturelle, factions,
 * grèves, sabotages, alcool & stupéfiants, marché noir [GDD §3.3, §4, §5.2].
 */
import * as C from './constants.ts';
import { addHours, daysSince, isAfter } from './calendar.ts';
import { pushEvent } from './effects.ts';
import { exposureTier } from './formulas.ts';
import { driftToward, gauge, mean, money } from './math.ts';
import { activePlayers, countPopulation, countRuins, residents } from './population.ts';
import type { Rng } from './rng.ts';
import type { EngineEffects, GameSnapshot, Migrant } from './types.ts';

export function religionDistance(religion: string): number {
  const key = religion.trim().toLowerCase();
  return C.RELIGION_DISTANCE[key] ?? C.DEFAULT_RELIGION_DISTANCE;
}

/** Orientation cible : moyenne des sensibilités des habitants, corrigée par le contexte. */
export function targetLeftWing(s: GameSnapshot): number {
  const v = s.village;
  const founderScores = activePlayers(s).map(() => C.FOUNDER_LEFT_SCORE);
  const residentScores = residents(s).map((m) => m.left_wing_score);
  let target = mean([...founderScores, ...residentScores], C.FOUNDER_LEFT_SCORE);
  if (v.collectivization_active) target += 10;
  if (v.morale_pct < 40) target += 5;
  if (v.insecurity_pct > 50) target -= 3; // demande d'ordre
  if (!v.collectivization_active && residents(s).some((m) => m.private_employer_id)) target -= 3;
  return target;
}

export interface IntegrationPressure {
  pressure: number;
  capacity: number;
}

/** Pression d'intégration des résidents récents vs capacité d'intégration du hameau [GDD §4.2, §4.4]. */
export function integrationPressure(s: GameSnapshot, now: Date): IntegrationPressure {
  const v = s.village;
  const recent = residents(s).filter((m) => daysSince(m.arrived_at, now) <= C.INTEGRATION_PERIOD_DAYS);
  const pressure = recent.reduce(
    (acc, m) => acc + religionDistance(m.religion) + (m.spanish_speaker ? 0 : 0.2) + (m.faction_type === 'union_agitator' ? 0.3 : 0),
    0,
  );
  const capacity =
    C.INTEGRATION_BASE_CAPACITY +
    Math.floor(v.spanish_fluency_pct / 20) +
    2 * v.mediations_this_season +
    (v.mass_held_this_season ? 1 : 0);
  return { pressure, capacity };
}

export function updateIdeologyAndFriction(s: GameSnapshot, fx: EngineEffects, rng: Rng, midnight: Date): void {
  const v = s.village;
  v.left_wing_ideology_pct = gauge(driftToward(v.left_wing_ideology_pct, targetLeftWing(s), C.LEFT_DRIFT_RATE));

  const { pressure, capacity } = integrationPressure(s, midnight);
  const pop = countPopulation(s);
  if (pressure > capacity) {
    v.cultural_friction_pct = gauge(v.cultural_friction_pct + (pressure - capacity) * C.FRICTION_RISE_FACTOR);
  } else {
    v.cultural_friction_pct = gauge(Math.max(C.FRICTION_FLOOR, v.cultural_friction_pct - C.FRICTION_DECAY));
  }
  if (pop.total > v.housing_capacity) v.cultural_friction_pct = gauge(v.cultural_friction_pct + 1);

  // Pénuries collectivistes : fuite des patrimoines privés vers Andorre [GDD §4.1]
  if (v.left_wing_ideology_pct > C.COLLECTIVIST_SHORTAGE_THRESHOLD) {
    for (const p of activePlayers(s)) {
      const flight = money(p.private_wealth_eur * C.COLLECTIVIST_CAPITAL_FLIGHT_DAY);
      p.private_wealth_eur = money(p.private_wealth_eur - flight);
      v.andorra_hidden_capital_eur = money(v.andorra_hidden_capital_eur + flight);
    }
  }

  // Factions clandestines, grèves et sabotages [GDD §4.3]
  const hasResidents = residents(s).length > 0;
  const wasActive = v.faction_active;
  v.faction_active =
    hasResidents &&
    (v.left_wing_ideology_pct > C.FACTION_LEFT_THRESHOLD || v.cultural_friction_pct > C.FACTION_FRICTION_THRESHOLD);
  if (v.faction_active && !wasActive) {
    for (const m of residents(s)) {
      if (m.left_wing_score >= 60 && m.faction_type === 'loyalist') m.faction_type = 'union_agitator';
    }
    pushEvent(fx, s, {
      event_type: 'faction_formed',
      visibility: 'role',
      role_code: 'portfolio:interior',
      title: 'Cellule clandestine',
      body: 'Des résidents mécontents se réunissent la nuit dans les ruines.',
    });
  }
  const striking = isAfter(v.strike_until, midnight);
  if (v.faction_active && !striking && rng.chance(C.STRIKE_DAILY_RISK_PCT)) {
    v.strike_until = addHours(midnight, C.STRIKE_DAYS * 24).toISOString();
    pushEvent(fx, s, {
      event_type: 'strike',
      title: 'Grève générale',
      body: 'Les chantiers de Tiphaine et d\'Alex sont à l\'arrêt : productivité divisée par deux pendant 3 jours.',
    });
  }
  if (v.faction_active && !v.sabotage_pending && rng.chance(C.SABOTAGE_DAILY_RISK_PCT)) {
    v.sabotage_pending = true; // détectable par Alex (indicateur caché) avant dégât
  }
}

/** Alcool, stupéfiants, addiction moyenne et marché noir dans les ruines. */
export function updateSubstancesAndBlackMarket(s: GameSnapshot, fx: EngineEffects, rng: Rng): void {
  const v = s.village;
  let alcoholTarget = 15;
  if (v.gite_open) alcoholTarget += 5;
  if (v.prohibition_alcohol) alcoholTarget -= 10;
  if (v.morale_pct < 40) alcoholTarget += 10;
  if (v.insecurity_pct > 50) alcoholTarget += 5;
  if (v.bor_concert_season === v.season_number) alcoholTarget += 5;
  v.alcohol_consumption_pct = gauge(driftToward(v.alcohol_consumption_pct, Math.max(0, alcoholTarget), 0.03));

  let drugTarget = 0;
  if (v.gite_open) drugTarget += 4;
  if (v.black_market_active) drugTarget += 6;
  if (v.bor_concert_season === v.season_number) drugTarget += 3;
  if (v.left_wing_ideology_pct > C.COLLECTIVIST_SHORTAGE_THRESHOLD) drugTarget += 3;
  if (v.prohibition_drugs) drugTarget -= 3;
  v.drug_prevalence_pct = gauge(driftToward(v.drug_prevalence_pct, Math.max(0, drugTarget), 0.02));

  const individuals = [
    ...activePlayers(s).map((p) => p.addiction_level_pct),
    ...residents(s).map((m) => m.addiction_level_pct),
  ];
  v.addiction_level_pct = gauge(mean(individuals, v.addiction_level_pct));

  // Marché noir : rationnement ou prohibition + ruines non rénovées [GDD §5.2]
  const conditions = v.rationing_active || v.prohibition_alcohol || v.prohibition_drugs || v.prohibition_tomatoes;
  if (conditions && countRuins(s) > 0) {
    if (!v.black_market_active && rng.chance(50)) {
      v.black_market_active = true;
      pushEvent(fx, s, {
        event_type: 'black_market',
        visibility: 'role',
        role_code: 'portfolio:interior',
        title: 'Marché noir',
        body: 'Un réseau clandestin s\'est installé dans les bâtisses en ruine.',
      });
    }
  } else {
    v.black_market_active = false;
  }

  // Ponctions occultes dans la caisse commune (palier 3+ ou marché noir) [GDD §3.3]
  if (exposureTier(v) >= 3 || v.black_market_active) {
    const leak = money(Math.max(0, v.treasury_eur) * C.TREASURY_LEAK_DAILY);
    if (leak > 0) {
      v.treasury_eur = money(v.treasury_eur - leak);
      v.treasury_leak_eur = money(v.treasury_leak_eur + leak);
    }
  }
}

/** Meneur d'un putsch dominical : le résident le plus radical (agitateur syndical en priorité). */
export function pickPutschLeader(s: GameSnapshot): Migrant | undefined {
  const pool = residents(s).filter((m) => m.status === 'accepted');
  const agitators = pool.filter((m) => m.faction_type === 'union_agitator');
  const source = agitators.length > 0 ? agitators : pool;
  return [...source].sort((a, b) => b.left_wing_score - a.left_wing_score || a.id.localeCompare(b.id))[0];
}

export function putschConditions(s: GameSnapshot): boolean {
  const v = s.village;
  return v.faction_active && v.insecurity_pct > 40 && v.left_wing_ideology_pct > 50 && v.last_putsch_season !== v.season_number;
}
