/** Vie du village (V4.8) : marché d'Organyà, coupes de bois, chauffage d'hiver, conserves. */
import { describe, expect, it } from 'vitest';
import { applyElapsedTime, constants as C, heatingNeed, lifeOf, marketQuote, performAction } from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const SATURDAY = new Date('2026-11-28T10:00:00Z');
const ELY = playerId(1);
const LERME = playerId(2);
const JULIO = playerId(5);

describe('Marché d\'Organyà', () => {
  it('vend des tomates pour la caisse, moins cher en semaine que le samedi', () => {
    const s = seedSnapshot({ tomatoes_stock: 100, spanish_fluency_pct: 50 });
    const week = marketQuote(s.village, 'tomatoes', 2, WEDNESDAY)!;
    const sat = marketQuote(s.village, 'tomatoes', 2, SATURDAY)!;
    expect(week.units).toBe(20);
    expect(sat.unitPrice).toBeGreaterThan(week.unitPrice);
    expect(sat.unitPrice / week.unitPrice).toBeCloseTo(1 + C.MARKET_SATURDAY_BONUS, 1);

    const out = performAction(s, { action_code: 'market_sale', actor_id: LERME, catalog_item_id: 'tomatoes', quantity: 2 }, SATURDAY);
    expect(out.status).toBe('done');
    const v = out.snapshot.village;
    expect(v.tomatoes_stock).toBe(80);
    expect(v.treasury_eur).toBeCloseTo(s.village.treasury_eur + sat.total, 2);
    expect(lifeOf(v).market_sold?.tomatoes).toBe(20);
    expect(out.ledger.some((l) => l.category === 'market' && l.amount_eur === sat.total)).toBe(true);
  });

  it('sature au fil de la semaine et refuse au-delà du plafond', () => {
    const s = seedSnapshot({ wood_stock: 500 });
    const first = marketQuote(s.village, 'wood', 1, WEDNESDAY)!;
    s.village.life = { market_sold: { wood: 50 } };
    const late = marketQuote(s.village, 'wood', 1, WEDNESDAY)!;
    expect(late.unitPrice).toBeLessThan(first.unitPrice);
    expect(late.remaining).toBe(10);
    const refused = performAction(s, { action_code: 'market_sale', actor_id: ELY, catalog_item_id: 'wood', quantity: 3 }, WEDNESDAY);
    expect(refused.status).toBe('refused');
    expect(refused.error).toMatch(/n'en prendra plus que 10/);
  });

  it('refuse de vendre ce que le village n\'a pas', () => {
    const out = performAction(seedSnapshot({ tomatoes_stock: 5 }), { action_code: 'market_sale', actor_id: ELY, catalog_item_id: 'tomatoes', quantity: 1 }, WEDNESDAY);
    expect(out.status).toBe('refused');
    expect(out.error).toMatch(/Réserve insuffisante/);
  });

  it('remet les compteurs à zéro chaque lundi', () => {
    const s = seedSnapshot();
    s.village.life = { market_sold: { tomatoes: 120 }, wood_cuts: 12 };
    s.village.last_tick_at = '2026-11-29T20:00:00Z'; // dimanche soir
    const out = applyElapsedTime(s, new Date('2026-11-30T08:00:00Z'));
    expect(lifeOf(out.snapshot.village).market_sold).toEqual({});
    expect(lifeOf(out.snapshot.village).wood_cuts).toBe(0);
  });
});

describe('Bois de chauffage', () => {
  it('couper du bois remplit la réserve, au-delà de 10 coupes la forêt souffre', () => {
    const s = seedSnapshot({ wood_stock: 0 });
    const out = performAction(s, { action_code: 'cut_wood', actor_id: JULIO }, WEDNESDAY);
    expect(out.status).toBe('done');
    expect(out.snapshot.village.wood_stock).toBeGreaterThan(0);
    expect(lifeOf(out.snapshot.village).wood_cuts).toBe(1);
    const tired = seedSnapshot({ wood_stock: 0 });
    tired.village.life = { wood_cuts: C.WOOD_CUT_SUSTAINABLE };
    const over = performAction(tired, { action_code: 'cut_wood', actor_id: JULIO }, WEDNESDAY);
    expect(over.snapshot.village.ecology_index_pct).toBeLessThan(tired.village.ecology_index_pct);
  });

  it('chauffe selon la température minimale réelle et le nombre de bâtisses habitées', () => {
    expect(heatingNeed(seedSnapshot({ real_temp_min_c: 12 })).wood).toBe(0);
    expect(heatingNeed(seedSnapshot({ real_temp_min_c: 7 })).wood).toBe(2); // 2 bâtisses × 1
    expect(heatingNeed(seedSnapshot({ real_temp_min_c: 3 })).wood).toBe(4);
    expect(heatingNeed(seedSnapshot({ real_temp_min_c: -4 })).wood).toBe(6);
    expect(heatingNeed(seedSnapshot({ real_temp_min_c: -4, energy_tier: 4 })).wood).toBe(3);
  });

  it('chaque nuit froide brûle du bois ; sans bois, le moral et la santé baissent', () => {
    const warm = seedSnapshot({ real_temp_min_c: -2, wood_stock: 20, last_tick_at: '2026-11-25T20:00:00Z' });
    const night = applyElapsedTime(warm, new Date('2026-11-26T08:00:00Z'));
    expect(night.snapshot.village.wood_stock).toBe(14);
    expect(lifeOf(night.snapshot.village).cold_streak).toBe(0);

    const cold = seedSnapshot({ real_temp_min_c: -2, wood_stock: 1, last_tick_at: '2026-11-25T20:00:00Z' });
    const frozen = applyElapsedTime(cold, new Date('2026-11-26T08:00:00Z'));
    expect(frozen.snapshot.village.wood_stock).toBe(0);
    expect(lifeOf(frozen.snapshot.village).cold_streak).toBe(1);
    expect(frozen.events.some((e) => e.event_type === 'cold_night')).toBe(true);
    expect(frozen.snapshot.village.morale_pct).toBeLessThan(night.snapshot.village.morale_pct);
  });
});

describe('Conserves', () => {
  it('transforme 10 kg de tomates en rations pour l\'hiver', () => {
    const s = seedSnapshot({ tomatoes_stock: 25, food_rations: 10 });
    const out = performAction(s, { action_code: 'make_preserves', actor_id: ELY }, WEDNESDAY);
    expect(out.status).toBe('done');
    expect(out.snapshot.village.tomatoes_stock).toBe(15);
    expect(out.snapshot.village.food_rations).toBeGreaterThan(10);
    expect(out.snapshot.village.treasury_eur).toBe(s.village.treasury_eur - C.PRESERVES_JARS_EUR);
    expect(performAction(seedSnapshot({ tomatoes_stock: 4 }), { action_code: 'make_preserves', actor_id: ELY }, WEDNESDAY).status).toBe('refused');
  });
});
