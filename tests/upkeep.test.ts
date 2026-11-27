/** Niveaux & usure des bâtisses (V5.5) : usure nocturne, entretien, amélioration, isolation, production. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  heatingNeed,
  lifeOf,
  maintainBlocker,
  nextUpgrade,
  nightsBeforeDamage,
  performAction,
  planBuildingsNight,
  upgradeBlocker,
  upgradeGains,
  wearPerNight,
  wornStructures,
  type GameSnapshot,
  type MapStructure,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const NOW = new Date('2026-11-26T10:00:00Z');
const GUILLEM = playerId(2);
const TIPH = playerId(3);

const casa = (s: GameSnapshot) => s.structures.find((x) => x.code === 'casa_gran')!;

function night(s: GameSnapshot): GameSnapshot {
  s.village.last_tick_at = '2026-11-25T20:00:00Z';
  return applyElapsedTime(s, new Date('2026-11-26T08:00:00Z')).snapshot;
}

describe('Usure', () => {
  it('dépend de la saison, du gel et du niveau', () => {
    const st = { kind: 'building', status: 'operational', upgrade_level: 1 } as const;
    expect(wearPerNight(st, 'summer', 15)).toBe(0.25);
    expect(wearPerNight(st, 'winter', -3)).toBe(0.9);
    expect(wearPerNight({ ...st, upgrade_level: 3 }, 'winter', 5)).toBe(0.42);
    expect(wearPerNight({ ...st, status: 'damaged' }, 'winter', 5)).toBe(0);
    expect(wearPerNight({ ...st, kind: 'track' }, 'winter', 5)).toBe(0);
    expect(nightsBeforeDamage({ ...st, condition_pct: 50 }, 'autumn', 6)).toBe(50);
  });

  it('la part fractionnaire attend dans life.wear_acc, puis l\'état baisse d\'un point entier', () => {
    const s = seedSnapshot();
    casa(s).condition_pct = 80;
    s.village.life = { ...(s.village.life ?? {}), wear_acc: { [casa(s).id]: 0.8 } };
    const out = night(s);
    // 26/11 = automne, 6 °C : 0,8 + 0,4 = 1,2 → −1 point, reste 0,2
    expect(casa(out).condition_pct).toBe(79);
    expect(lifeOf(out.village).wear_acc?.[casa(out).id]).toBe(0.2);
  });

  it('sous le seuil, la bâtisse est endommagée : lits perdus et événement', () => {
    const s = seedSnapshot();
    casa(s).condition_pct = C.WEAR_DAMAGED_AT;
    s.village.life = { ...(s.village.life ?? {}), wear_acc: { [casa(s).id]: 0.9 } };
    const before = s.village.housing_capacity;
    const r = applyElapsedTime({ ...s, village: { ...s.village, last_tick_at: '2026-11-25T20:00:00Z' } }, new Date('2026-11-26T08:00:00Z'));
    expect(casa(r.snapshot).status).toBe('damaged');
    expect(r.events.some((e) => e.event_type === 'structure_worn_out')).toBe(true);
    expect(r.snapshot.village.housing_capacity).toBe(before - 6);
  });

  it('wornStructures liste les bâtisses sous le seuil, la plus abîmée d\'abord', () => {
    const s = seedSnapshot();
    casa(s).condition_pct = 45;
    expect(wornStructures(s).map((x) => x.code)).toContain('casa_gran');
    expect(wornStructures(s)[0]!.condition_pct).toBeLessThanOrEqual(45);
  });
});

describe('Entretien', () => {
  it('Tiphaine entretient la Casa Gran : pierre et fer consommés, état relevé', () => {
    const s = seedSnapshot();
    casa(s).condition_pct = 50;
    const r = performAction(s, { action_code: 'maintain_building', actor_id: TIPH, target_structure_id: casa(s).id }, NOW);
    expect(r.ok, r.error ?? '').toBe(true);
    expect(casa(r.snapshot).condition_pct).toBeGreaterThanOrEqual(70);
    expect(r.snapshot.village.stone_stock).toBe(s.village.stone_stock - C.MAINTAIN_STONE);
    expect(r.snapshot.village.iron_stock).toBe(s.village.iron_stock - C.MAINTAIN_IRON);
  });

  it('refusée sans fer, sur une bâtisse parfaite ou endommagée', () => {
    const s = seedSnapshot();
    const st = casa(s);
    st.condition_pct = 100;
    expect(maintainBlocker(st, s.village)).toMatch(/parfait état/);
    st.condition_pct = 60;
    expect(maintainBlocker(st, { ...s.village, iron_stock: 0 })).toMatch(/fer/);
    st.status = 'damaged';
    expect(maintainBlocker(st, s.village)).toMatch(/réparer/);
    s.village.iron_stock = 0;
    st.status = 'operational';
    const r = performAction(s, { action_code: 'maintain_building', actor_id: TIPH, target_structure_id: st.id }, NOW);
    expect(r.ok).toBe(false);
  });
});

describe('Amélioration par niveaux', () => {
  it('Guillem passe la Casa Gran au niveau 2 : +2 lits, matériaux et caisse débités', () => {
    const s = seedSnapshot();
    casa(s).condition_pct = 80;
    const step = nextUpgrade(casa(s))!;
    expect(step.level).toBe(2);
    expect(upgradeGains(casa(s)).join(' ')).toMatch(/\+2 lits.*isolation/);
    const r = performAction(s, { action_code: 'upgrade_building', actor_id: GUILLEM, target_structure_id: casa(s).id }, NOW);
    expect(r.ok, r.error ?? '').toBe(true);
    expect(casa(r.snapshot)).toMatchObject({ upgrade_level: 2, beds_capacity: 8 });
    expect(r.snapshot.village.treasury_eur).toBe(s.village.treasury_eur - step.price_eur);
    expect(r.snapshot.village.stone_stock).toBe(s.village.stone_stock - step.stone);
    expect(r.snapshot.village.housing_capacity).toBe(s.village.housing_capacity + 2);
    expect(r.events.some((e) => e.event_type === 'building_upgraded')).toBe(true);
  });

  it('refusée si l\'état est trop bas, au niveau maximal ou sur une forge', () => {
    const s = seedSnapshot();
    const st = casa(s);
    st.condition_pct = 40;
    expect(upgradeBlocker(st, s.village)).toMatch(/entretenez/);
    st.condition_pct = 90;
    st.upgrade_level = C.UPGRADE_MAX_LEVEL;
    expect(upgradeBlocker(st, s.village)).toMatch(/maximal/);
    const forge = s.structures.find((x) => x.kind === 'forge');
    if (forge) expect(upgradeBlocker(forge, s.village)).toMatch(/logements/);
    st.upgrade_level = 1;
    expect(upgradeBlocker(st, { ...s.village, iron_stock: 0 })).toMatch(/fer/);
  });

  it('l\'isolation réduit le bois de chauffage', () => {
    const s = seedSnapshot();
    s.village.real_temp_min_c = -5;
    const base = heatingNeed(s).wood;
    for (const st of s.structures) if (st.kind === 'building' && st.beds_capacity > 0) st.upgrade_level = 3;
    expect(heatingNeed(s).wood).toBe(Math.ceil(base / 2));
    expect(heatingNeed(s).wood).toBeLessThan(base);
  });

  it('un nouveau bâtiment de niveau 2 produit 50 % de plus', () => {
    const s = seedSnapshot();
    const hen: MapStructure = {
      id: 'b0000000-0000-4000-8000-000000000001', code: 'nb_henhouse', kind: 'building', name: 'Poulailler', status: 'operational',
      condition_pct: 100, progress_pct: 100, beds_capacity: 0, is_power_connected: false, plu_approved: true, eco_veto_active: false,
      owner_player_id: null, leak_alert: false, variant: 'henhouse', upgrade_level: 1,
    };
    s.structures.push(hen);
    expect(planBuildingsNight(s, 'autumn').rations).toBe(C.HENHOUSE_RATIONS);
    expect(upgradeGains(hen).join(' ')).toMatch(/production \+50 %/);
    hen.upgrade_level = 2;
    expect(planBuildingsNight(s, 'autumn').rations).toBe(C.HENHOUSE_RATIONS * 1.5);
  });
});
