/** Relations avec les voisins (V5.8) : jauges, demandes, échéance, effets. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  createRng,
  lifeOf,
  marketQuote,
  missionFits,
  neighborGauge,
  performAction,
  pickNeighborMission,
  planBlocker,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const ELY = playerId(1);
const LERME = playerId(2);

function withMission(id: string, s: GameSnapshot = seedSnapshot(), due = '2026-11-26'): GameSnapshot {
  s.village.life = { ...(s.village.life ?? {}), neighbor_mission: { id, opened_day: '2026-11-25', due_day: due, done_steps: 0, helpers: {} } };
  return s;
}
const help = (s: GameSnapshot, actor: string, now = WEDNESDAY) => performAction(s, { action_code: 'help_neighbors', actor_id: actor }, now);

describe('Jauges', () => {
  it('50 par défaut ; prix du marché ±10 % selon Organyà', () => {
    const s = seedSnapshot();
    expect(neighborGauge(s.village, 'mossos')).toBe(C.NEIGHBOR_DEFAULT);
    const base = marketQuote(s.village, 'tomatoes', 1, WEDNESDAY)!.unitPrice;
    s.village.life = { neighbors: { organya: 80 } };
    expect(marketQuote(s.village, 'tomatoes', 1, WEDNESDAY)!.unitPrice).toBeCloseTo(base * 1.1, 1);
    s.village.life = { neighbors: { organya: 20 } };
    expect(marketQuote(s.village, 'tomatoes', 1, WEDNESDAY)!.unitPrice).toBeCloseTo(base * 0.9, 1);
  });

  it('mairie fâchée : plus de permis de construire', () => {
    const s = seedSnapshot();
    s.village.life = { neighbors: { ayuntamiento: 10 } };
    expect(planBlocker(s, 'bakery', C.PARCELS[0]!.id)).toMatch(/permis/);
  });

  it('une vente au marché rapproche Organyà', () => {
    const s = seedSnapshot();
    s.village.tomatoes_stock = 100;
    const out = performAction(s, { action_code: 'market_sale', actor_id: LERME, catalog_item_id: 'tomatoes', quantity: 1 }, WEDNESDAY);
    expect(out.status).toBe('done');
    expect(neighborGauge(out.snapshot.village, 'organya')).toBe(C.NEIGHBOR_DEFAULT + C.NEIGHBOR_MARKET_SALE_GAIN);
  });

  it('la nuit : retour vers 50 et effets (mairie aimable, Mossos fâchés)', () => {
    const s = seedSnapshot();
    s.village.last_tick_at = WEDNESDAY.toISOString();
    s.village.life = { neighbors: { ayuntamiento: 90, mossos: 10 }, neighbor_next_day: '2099-01-01' };
    s.village.admin_pressure_pct = 40;
    s.village.customs_alert_pct = 30;
    const out = applyElapsedTime(s, new Date('2026-11-26T08:00:00Z'));
    const v = out.snapshot.village;
    expect(neighborGauge(v, 'ayuntamiento')).toBe(90 - C.NEIGHBOR_DRIFT);
    expect(neighborGauge(v, 'mossos')).toBe(10 + C.NEIGHBOR_DRIFT);
    expect(lifeOf(v).neighbor_mission ?? null).toBeNull();
  });
});

describe('Demandes des voisins', () => {
  it('sans demande, le coup de main est refusé', () => {
    expect(help(seedSnapshot(), ELY).status).toBe('refused');
  });

  it('les coups de main se cumulent ; la dernière remplit la demande (jauge, bonus, événement)', () => {
    let s = withMission('census');
    s.village.admin_pressure_pct = 30;
    const a = help(s, ELY);
    expect(a.status).toBe('done');
    expect(a.ap_spent).toBe(1);
    expect(lifeOf(a.snapshot.village).neighbor_mission!.done_steps).toBe(1);
    s = a.snapshot;
    const b = help(s, LERME);
    const v = b.snapshot.village;
    expect(lifeOf(v).neighbor_mission).toBeNull();
    expect(lifeOf(v).neighbor_last).toMatchObject({ id: 'census', outcome: 'done', delta: 12 });
    expect(neighborGauge(v, 'ayuntamiento')).toBe(62);
    expect(v.admin_pressure_pct).toBeLessThan(30);
    expect(b.events.some((e) => e.event_type === 'neighbor_mission_done' && e.title.startsWith('Voisins : '))).toBe(true);
  });

  it('le coût en ressources est payé, et refusé si la réserve manque', () => {
    const s = withMission('firewood_elders');
    s.village.wood_stock = 5;
    expect(help(s, ELY).status).toBe('refused');
    s.village.wood_stock = 50;
    const out = help(s, ELY);
    expect(out.status).toBe('done');
    expect(out.snapshot.village.wood_stock).toBe(40);
  });

  it('échéance passée : jauge −pénalité, puis nouvelle demande après une nuit de pause', () => {
    const s = withMission('patrol_report', seedSnapshot(), '2026-11-25');
    s.village.last_tick_at = WEDNESDAY.toISOString();
    const out = applyElapsedTime(s, new Date('2026-11-26T08:00:00Z'));
    const v = out.snapshot.village;
    expect(lifeOf(v).neighbor_last).toMatchObject({ id: 'patrol_report', outcome: 'failed' });
    expect(neighborGauge(v, 'mossos')).toBe(C.NEIGHBOR_DEFAULT - 6);
    expect(lifeOf(v).neighbor_mission).toBeNull();
    expect(out.events.some((e) => e.event_type === 'neighbor_mission_failed')).toBe(true);
    const later = applyElapsedTime(out.snapshot, new Date('2026-11-27T08:00:00Z'));
    const m = lifeOf(later.snapshot.village).neighbor_mission!;
    expect(m.opened_day).toBe('2026-11-27');
    expect(m.id).not.toBe('patrol_report');
  });

  it('tirage déterministe et de saison', () => {
    const s = seedSnapshot();
    const a = pickNeighborMission(s, 'winter', createRng('x'));
    const b = pickNeighborMission(s, 'winter', createRng('x'));
    expect(a?.id).toBe(b?.id);
    const snow = C.NEIGHBOR_MISSIONS.find((m) => m.id === 'snow_road')!;
    expect(missionFits(snow, 'summer', { real_snow_cm: 0, real_temp_min_c: 15 })).toBe(false);
    expect(missionFits(snow, 'winter', { real_snow_cm: 0, real_temp_min_c: 0 })).toBe(true);
    for (const m of C.NEIGHBOR_MISSIONS) expect(C.NEIGHBORS.some((n) => n.id === m.from)).toBe(true);
  });
});
