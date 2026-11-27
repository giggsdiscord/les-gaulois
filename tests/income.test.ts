/** Plus d'argent & production automatique (V6.1) : installations, commandes régulières, services payants. */
import { describe, expect, it } from 'vitest';
import {
  closeIncomeWeek,
  constants as C,
  lifeOf,
  neighborGauge,
  performAction,
  planIncomeNight,
  processIncome,
  weeklyCharges,
  type EngineEffects,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const ELY = playerId(1);
const emptyFx = (): EngineEffects => ({ events: [], ledger: [], screenings: [], approvals: [], triggers: [] }) as unknown as EngineEffects;
const act = (s: GameSnapshot, code: string, params: Record<string, unknown>, actor = ELY) => performAction(s, { action_code: code, actor_id: actor, params }, WEDNESDAY);

function withLife(patch: Record<string, unknown>, s: GameSnapshot = seedSnapshot()): GameSnapshot {
  s.village.life = { ...(s.village.life ?? {}), ...patch };
  return s;
}

describe('Installations', () => {
  it('installer paie le prix et enregistre l’installation', () => {
    const s = seedSnapshot();
    const before = s.village.treasury_eur;
    const r = act(s, 'setup_install', { install: 'roadside_stall' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe('done');
    expect(r.snapshot.village.treasury_eur).toBe(before - 180);
    expect(lifeOf(r.snapshot.village).installs?.roadside_stall?.paused).toBeFalsy();
    expect(r.events.some((e) => e.event_type === 'install_started')).toBe(true);
    // Une seconde fois : refusé
    const again = act(r.snapshot, 'setup_install', { install: 'roadside_stall' });
    expect(again.ok).toBe(false);
  });

  it('conditions : tournée du pain sans four, revente sans électricité, réservation sans gîte', () => {
    const s = seedSnapshot();
    s.village.energy_tier = 1;
    s.village.gite_open = false;
    s.village.act_number = 2;
    expect(act(s, 'setup_install', { install: 'bread_round' }).error).toMatch(/four à pain/);
    expect(act(s, 'setup_install', { install: 'power_resale' }).error).toMatch(/palier 2/);
    expect(act(s, 'setup_install', { install: 'gite_booking' }).error).toMatch(/gîte/);
  });

  it('la nuit : étal, bûcheron et revente produisent seuls', () => {
    const s = withLife({ installs: { roadside_stall: { since: '2026-11-20', by: ELY }, wood_contract: { since: '2026-11-20', by: ELY }, power_resale: { since: '2026-11-20', by: ELY } } });
    s.village.tomatoes_stock = 30;
    s.village.energy_tier = 3;
    const wood = s.village.wood_stock;
    const cash = s.village.treasury_eur;
    const fx = emptyFx();
    processIncome(s, fx, 'summer', '2026-11-25');
    expect(s.village.tomatoes_stock).toBe(25);
    expect(s.village.wood_stock).toBe(wood + C.WOOD_CONTRACT_STERES);
    // 5 × 2,4 + 4 × 2 × 1,5
    expect(s.village.treasury_eur).toBe(cash + 12 + 12);
    expect(lifeOf(s.village).income_last?.eur).toBe(24);
    expect(fx.ledger.filter((l) => l.category === 'income')).toHaveLength(2);
  });

  it('l’étal se rabat sur les rations sans jamais entamer la réserve, moitié moins l’hiver', () => {
    const s = withLife({ installs: { roadside_stall: { since: '2026-11-20', by: ELY } } });
    s.village.tomatoes_stock = 0;
    s.village.food_rations = C.INCOME_RATIONS_FLOOR + 5;
    expect(planIncomeNight(s, 'winter').lines[0]).toMatchObject({ eur: C.STALL_RATION_EUR, goods: '−1 ration' });
    s.village.food_rations = C.INCOME_RATIONS_FLOOR;
    expect(planIncomeNight(s, 'summer').lines[0]!.idle).toMatch(/étal vide/);
  });

  it('forêt fermée : le bûcheron ne coupe pas', () => {
    const s = withLife({ installs: { wood_contract: { since: '2026-11-20', by: ELY } }, forest_ban: { by: ELY, reason: 'repos de la forêt', since: '2026-11-24T10:00:00Z' } });
    expect(planIncomeNight(s, 'autumn').wood).toBe(0);
  });

  it('lundi : charges prélevées ; caisse vide → suspendue, relance au prix d’une semaine', () => {
    const s = withLife({ installs: { roadside_stall: { since: '2026-11-20', by: ELY }, wood_contract: { since: '2026-11-20', by: ELY } } });
    expect(weeklyCharges(s.village)).toBe(60);
    s.village.treasury_eur = 50;
    const fx = emptyFx();
    closeIncomeWeek(s, fx);
    // Étal payé (15), bûcheron impayé (45 > 35)
    expect(s.village.treasury_eur).toBe(35);
    expect(lifeOf(s.village).installs?.wood_contract?.paused).toBe(true);
    expect(fx.events.some((e) => e.event_type === 'install_suspended')).toBe(true);
    expect(planIncomeNight(s, 'autumn').wood).toBe(0);
    s.village.treasury_eur = 500;
    const r = act(s, 'setup_install', { install: 'wood_contract' });
    expect(r.ok).toBe(true);
    expect(r.snapshot.village.treasury_eur).toBe(500 - 45);
    expect(lifeOf(r.snapshot.village).installs?.wood_contract?.paused).toBeFalsy();
  });

  it('par Acte : paysan d’abord, modernisation à l’Acte 2, micro-État à l’Acte 3', () => {
    expect(new Set(C.AUTO_INSTALLS.map((d) => d.act))).toEqual(new Set([1, 2, 3]));
    const s = seedSnapshot();
    s.village.act_number = 1;
    s.village.energy_tier = 5;
    expect(act(s, 'setup_install', { install: 'track_toll' }).error).toMatch(/Acte 2/);
    expect(act(s, 'setup_install', { install: 'nuclear_export' }).error).toMatch(/Acte 3/);
    s.village.act_number = 3;
    expect(act(s, 'setup_install', { install: 'nuclear_export' }).ok).toBe(true);
  });

  it('Acte 3 : réacteur, garde et timbres rapportent ; la garde améliore la relation avec la mairie', () => {
    const since = { since: '2026-11-20', by: ELY };
    const s = withLife({ installs: { nuclear_export: since, army_protection: since, collector_stamps: since, livestock_produce: since } });
    s.village.energy_tier = 5;
    s.village.perimeter_threat_pct = 20;
    s.village.international_notoriety_pct = 50;
    s.village.livestock_count = 4;
    const g = neighborGauge(s.village, 'ayuntamiento');
    const cash = s.village.treasury_eur;
    processIncome(s, emptyFx(), 'autumn', '2026-11-25');
    // 1,5 × 4 + 90 + 40 + (10 + 15)
    expect(s.village.treasury_eur).toBe(cash + 6 + 90 + 40 + 25);
    expect(neighborGauge(s.village, 'ayuntamiento')).toBe(g + C.ARMY_PROTECTION_GAUGE);
    s.village.perimeter_threat_pct = 60;
    expect(planIncomeNight(s, 'autumn').lines.find((l) => l.id === 'army_protection')?.idle).toMatch(/Menace/);
  });

  it('arrêter une installation la retire', () => {
    const s = withLife({ installs: { roadside_stall: { since: '2026-11-20', by: ELY } } });
    const r = act(s, 'stop_install', { install: 'roadside_stall' });
    expect(r.ok).toBe(true);
    expect(lifeOf(r.snapshot.village).installs?.roadside_stall).toBeUndefined();
  });
});

describe('Commandes régulières', () => {
  it('signer, livrer chaque nuit, plafond de commandes', () => {
    const s = seedSnapshot();
    s.village.wood_stock = 10;
    let r = act(s, 'sign_order', { order: 'bakery_wood' });
    expect(r.ok).toBe(true);
    r = act(r.snapshot, 'sign_order', { order: 'inn_rations' });
    expect(r.ok).toBe(true);
    expect(act(r.snapshot, 'sign_order', { order: 'deli_cheese' }).error).toMatch(/Déjà 2 commandes/);
    const t = r.snapshot;
    t.village.food_rations = 50;
    const cash = t.village.treasury_eur;
    processIncome(t, emptyFx(), 'autumn', '2026-11-25');
    expect(t.village.wood_stock).toBe(8);
    expect(t.village.food_rations).toBe(47);
    expect(t.village.treasury_eur).toBe(cash + 18 + 15);
    expect(lifeOf(t.village).orders?.bakery_wood).toMatchObject({ delivered: 1, missed: 0, earned_eur: 18 });
  });

  it('deux livraisons manquées : le client rompt et la relation baisse', () => {
    const s = withLife({ orders: { deli_cheese: { since: '2026-11-24', by: ELY, delivered: 0, missed: 0, earned_eur: 0 } } });
    const g = neighborGauge(s.village, 'organya');
    const fx = emptyFx();
    processIncome(s, fx, 'autumn', '2026-11-25');
    expect(lifeOf(s.village).orders?.deli_cheese?.missed).toBe(1);
    processIncome(s, fx, 'autumn', '2026-11-26');
    expect(lifeOf(s.village).orders?.deli_cheese).toBeUndefined();
    expect(neighborGauge(s.village, 'organya')).toBe(g - 2 * C.ORDER_MISS_GAUGE - C.ORDER_BREAK_GAUGE);
    expect(fx.events.some((e) => e.event_type === 'order_broken')).toBe(true);
  });

  it('lundi : commande sans faute → relation +1, commandes et services remis à zéro', () => {
    const s = withLife({ orders: { inn_rations: { since: '2026-11-24', by: ELY, delivered: 5, missed: 0, earned_eur: 75 } }, services_week: { repairs: 3 } });
    const g = neighborGauge(s.village, 'organya');
    closeIncomeWeek(s, emptyFx());
    expect(neighborGauge(s.village, 'organya')).toBe(g + C.ORDER_KEPT_GAUGE);
    expect(lifeOf(s.village).orders).toEqual({});
    expect(lifeOf(s.village).services_week).toEqual({});
  });
});

describe('Services payants', () => {
  it('payé comptant, plafonné par semaine', () => {
    let s = seedSnapshot();
    s.village.gite_open = true;
    const cash = s.village.treasury_eur;
    const r = act(s, 'paid_service', { service: 'guided_walk' });
    expect(r.ok).toBe(true);
    expect(r.snapshot.village.treasury_eur).toBe(cash + 25 + C.SERVICE_WALK_GITE_BONUS);
    s = withLife({ services_week: { lessons: 3 } });
    expect(act(s, 'paid_service', { service: 'lessons' }).error).toMatch(/déjà 3 fois/);
    expect(act(s, 'paid_service', { service: 'nope' }).error).toMatch(/inconnu/);
  });
});
