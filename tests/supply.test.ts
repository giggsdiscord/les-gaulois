/** Filières, péremption & stockage (V5.6) [GDD §5.8]. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  lifeOf,
  marketQuote,
  pantryAmount,
  performAction,
  planSupplyNight,
  spoilageActive,
  storageCaps,
  type GameSnapshot,
  type MapStructure,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const NOW = new Date('2026-11-26T10:00:00Z');
const SATURDAY = new Date('2026-11-28T10:00:00Z');
const ELY = playerId(1);
const LERME = playerId(2);

function withBuilt(s: GameSnapshot, variant: string, level = 1): GameSnapshot {
  const st: MapStructure = {
    id: `b0000000-0000-4000-8000-0000000001${String(s.structures.length % 100).padStart(2, '0')}`,
    code: `nb_${variant}`,
    kind: 'building',
    name: variant,
    status: 'operational',
    condition_pct: 100,
    progress_pct: 100,
    beds_capacity: 0,
    is_power_connected: true,
    plu_approved: true,
    eco_veto_active: false,
    owner_player_id: null,
    leak_alert: false,
    variant,
    upgrade_level: level,
  };
  s.structures.push(st);
  return s;
}

function night(s: GameSnapshot) {
  s.village.last_tick_at = '2026-11-25T20:00:00Z';
  return applyElapsedTime(s, new Date('2026-11-26T08:00:00Z'));
}

describe('Stockage', () => {
  it('le hangar relève les capacités selon son niveau', () => {
    const s = seedSnapshot();
    expect(storageCaps(s).wood_stock).toBe(C.STORAGE_BASE.wood_stock);
    expect(storageCaps(withBuilt(seedSnapshot(), 'shed')).wood_stock).toBe(Math.round(C.STORAGE_BASE.wood_stock * 1.5));
    expect(storageCaps(withBuilt(seedSnapshot(), 'shed', 3)).cheese_kg).toBe(Math.round(C.STORAGE_BASE.cheese_kg * 2.5));
  });

  it('le surplus au-delà de la capacité se perd la nuit (événement)', () => {
    const s = seedSnapshot({ wood_stock: 400 });
    const r = night(s);
    expect(r.snapshot.village.wood_stock).toBeLessThanOrEqual(C.STORAGE_BASE.wood_stock);
    expect(lifeOf(r.snapshot.village).supply_last?.overflow.wood_stock).toBeGreaterThan(0);
    expect(r.events.some((e) => e.event_type === 'storage_full')).toBe(true);
  });

  it('avec un hangar, le même stock est gardé', () => {
    const s = withBuilt(seedSnapshot({ wood_stock: 400 }), 'shed');
    const r = night(s);
    expect(lifeOf(r.snapshot.village).supply_last?.overflow.wood_stock ?? 0).toBe(0);
  });
});

describe('Péremption', () => {
  it('chaleur sans chambre froide : rations, tomates et prunes se gâtent', () => {
    const s = seedSnapshot({ real_temp_c: 32, tomatoes_stock: 100 });
    s.village.life = { pantry: { plums_kg: 40, cheese_kg: 10 } };
    expect(spoilageActive(s, 'autumn')).toBe(true);
    const plan = planSupplyNight(s, 'autumn');
    expect(plan.spoiled.tomatoes_stock).toBe(8);
    expect(plan.spoiled.plums_kg).toBeGreaterThan(0);
    expect(plan.spoiled.cheese_kg).toBeUndefined();
    const r = night(s);
    expect(r.events.some((e) => e.event_type === 'food_spoiled')).toBe(true);
    expect(pantryAmount(r.snapshot.village, 'cheese_kg')).toBe(10);
  });

  it('la chambre froide arrête le gâchis ; l\'été suffit sans chaleur', () => {
    const s = seedSnapshot({ real_temp_c: 15 });
    expect(spoilageActive(s, 'autumn')).toBe(false);
    expect(spoilageActive(s, 'summer')).toBe(true);
    expect(spoilageActive(withBuilt(s, 'cold_room'), 'summer')).toBe(false);
  });
});

describe('Filières', () => {
  it('la fromagerie affine du fromage chaque nuit avec au moins 2 bêtes', () => {
    const s = withBuilt(seedSnapshot({ livestock_count: 3 }), 'cheese_dairy', 2);
    const r = night(s);
    expect(pantryAmount(r.snapshot.village, 'cheese_kg')).toBe(C.CHEESE_DAIRY_KG * 1.5);
    expect(planSupplyNight(withBuilt(seedSnapshot({ livestock_count: 1 }), 'cheese_dairy'), 'autumn').cheese).toBe(0);
  });

  it('le verger donne des prunes l\'été et l\'automne', () => {
    expect(planSupplyNight(seedSnapshot(), 'summer').plums).toBe(C.PLUMS_PER_NIGHT.summer);
    expect(planSupplyNight(seedSnapshot(), 'winter').plums).toBe(0);
  });

  it('faire du fromage : lait consommé, fromage en réserve ; refusé sans troupeau', () => {
    const s = seedSnapshot({ livestock_count: 2 });
    const r = performAction(s, { action_code: 'make_cheese', actor_id: ELY }, NOW);
    expect(r.ok, r.error ?? '').toBe(true);
    expect(pantryAmount(r.snapshot.village, 'cheese_kg')).toBeGreaterThanOrEqual(C.CHEESE_MAKE_KG);
    expect(r.snapshot.village.food_rations).toBe(s.village.food_rations - C.CHEESE_MAKE_RATIONS);
    const ko = performAction(seedSnapshot({ livestock_count: 0 }), { action_code: 'make_cheese', actor_id: ELY }, NOW);
    expect(ko.ok).toBe(false);
  });

  it('distiller du ratafia : prunes et 15 € → bouteilles ; refusé sans prunes', () => {
    const s = seedSnapshot();
    s.village.life = { pantry: { plums_kg: 12 } };
    const r = performAction(s, { action_code: 'make_ratafia', actor_id: ELY }, NOW);
    expect(r.ok, r.error ?? '').toBe(true);
    expect(pantryAmount(r.snapshot.village, 'plums_kg')).toBe(2);
    expect(pantryAmount(r.snapshot.village, 'ratafia_bottles')).toBeGreaterThanOrEqual(C.RATAFIA_BOTTLES);
    expect(r.snapshot.village.treasury_eur).toBe(s.village.treasury_eur - C.RATAFIA_COST_EUR);
    const ko = performAction(seedSnapshot(), { action_code: 'make_ratafia', actor_id: ELY }, NOW);
    expect(ko.ok).toBe(false);
    expect(ko.error).toMatch(/prunes/);
  });

  it('fromage et ratafia se vendent au marché d\'Organyà', () => {
    const s = seedSnapshot();
    s.village.life = { pantry: { cheese_kg: 6, ratafia_bottles: 4 } };
    const q = marketQuote(s.village, 'cheese', 2, SATURDAY)!;
    expect(q.available).toBe(6);
    expect(q.units).toBe(4);
    const r = performAction(s, { action_code: 'market_sale', actor_id: LERME, catalog_item_id: 'cheese', quantity: 2 }, SATURDAY);
    expect(r.ok, r.error ?? '').toBe(true);
    expect(pantryAmount(r.snapshot.village, 'cheese_kg')).toBe(2);
    expect(r.snapshot.village.treasury_eur).toBeGreaterThan(s.village.treasury_eur);
    const ko = performAction(s, { action_code: 'market_sale', actor_id: LERME, catalog_item_id: 'ratafia', quantity: 3 }, SATURDAY);
    expect(ko.ok).toBe(false);
  });
});
