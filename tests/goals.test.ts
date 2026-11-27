/** Objectifs d'Acte (V5.1) : liste à cocher, récompenses une seule fois, prime de fin de liste. */
import { describe, expect, it } from 'vitest';
import {
  actGoalProgress,
  actGoalsOf,
  applyElapsedTime,
  checkActGoals,
  constants as C,
  describeReward,
  emptyEffects,
  lifeOf,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { seedSnapshot } from './fixtures.ts';

const NOW = new Date('2026-11-25T10:00:00Z');

function meetActOne(s: GameSnapshot): GameSnapshot {
  s.village.energy_tier = 2;
  s.village.garden_area_m2 = 520;
  s.village.track_condition_pct = 75;
  s.village.gite_open = true;
  const building = s.structures.find((st) => st.kind === 'building')!;
  building.status = 'operational';
  building.beds_capacity = 20;
  return s;
}

describe('Objectifs d\'Acte', () => {
  it('chaque Acte a sa liste, avec une récompense à chaque étape', () => {
    for (const act of [1, 2, 3]) expect(actGoalsOf(act).length).toBeGreaterThanOrEqual(4);
    for (const g of C.ACT_GOALS) expect(describeReward(g.reward)).not.toBe('');
    expect(actGoalsOf(1).map((g) => g.id)).toEqual(['power_on', 'beds_20', 'garden_500', 'track_70', 'gite_open']);
  });

  it('au départ, rien n\'est coché', () => {
    const s = seedSnapshot();
    expect(checkActGoals(s, emptyEffects(), NOW)).toEqual([]);
    expect(actGoalProgress(s, 1).every((p) => !p.met)).toBe(true);
    expect(lifeOf(s.village).act_goals).toBeUndefined();
  });

  it('une étape atteinte se coche et verse sa récompense une seule fois', () => {
    const s = seedSnapshot();
    s.village.garden_area_m2 = 500;
    const debt = s.village.land_debt_eur;
    const wood = s.village.wood_stock;
    const fx = emptyEffects();
    expect(checkActGoals(s, fx, NOW)).toEqual(['garden_500']);
    expect(s.village.land_debt_eur).toBe(debt - 3000);
    expect(s.village.wood_stock).toBe(wood + 20);
    expect(lifeOf(s.village).act_goals?.garden_500).toBe(NOW.toISOString());
    expect(fx.events.some((e) => e.event_type === 'act_goal_done')).toBe(true);
    // Le potager rétrécit : l'étape reste cochée, sans nouvelle récompense
    s.village.garden_area_m2 = 300;
    expect(checkActGoals(s, emptyEffects(), NOW)).toEqual([]);
    expect(s.village.land_debt_eur).toBe(debt - 3000);
    expect(actGoalProgress(s, 1).find((p) => p.def.id === 'garden_500')?.met).toBe(true);
  });

  it('les étapes d\'un Acte suivant attendent que l\'Acte soit atteint', () => {
    const s = seedSnapshot();
    s.village.livestock_count = 12;
    expect(checkActGoals(s, emptyEffects(), NOW)).toEqual([]);
    s.village.act_number = 2;
    expect(checkActGoals(s, emptyEffects(), NOW)).toContain('herd_10');
  });

  it('liste complète : prime de fin d\'Acte', () => {
    const s = meetActOne(seedSnapshot());
    const debt = s.village.land_debt_eur;
    const fx = emptyEffects();
    const out = checkActGoals(s, fx, NOW);
    expect(out).toContain('act_1_complete');
    const rewards = actGoalsOf(1).reduce((a, g) => a + (g.reward.debt_eur ?? 0), 0) + (C.ACT_GOALS_COMPLETE_BONUS[1].debt_eur ?? 0);
    expect(s.village.land_debt_eur).toBe(debt - rewards);
    expect(lifeOf(s.village).act_goals_complete).toEqual([1]);
    expect(fx.events.some((e) => e.event_type === 'act_goals_complete')).toBe(true);
    expect(checkActGoals(s, emptyEffects(), NOW)).toEqual([]);
  });

  it('remise plafonnée à la dette restante, le reste va dans la caisse', () => {
    const s = seedSnapshot();
    s.village.land_debt_eur = 1000;
    s.village.gite_open = true;
    const cash = s.village.treasury_eur;
    checkActGoals(s, emptyEffects(), NOW);
    expect(s.village.land_debt_eur).toBe(0);
    expect(s.village.treasury_eur).toBe(cash + 5000);
  });

  it('la nuit coche les étapes et l\'autonomie suit la remise de dette', () => {
    const s = seedSnapshot();
    s.village.gite_open = true;
    s.village.last_tick_at = '2026-11-24T22:00:00Z';
    const out = applyElapsedTime(s, NOW);
    expect(lifeOf(out.snapshot.village).act_goals?.gite_open).toBeDefined();
    expect(out.snapshot.village.land_debt_eur).toBeLessThan(C.INITIAL_LAND_DEBT_EUR);
    expect(out.events.some((e) => e.event_type === 'act_goal_done')).toBe(true);
  });
});
