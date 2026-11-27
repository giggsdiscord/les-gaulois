/** Fonds souverain placé sur les marchés réels (V6.2) : cours, achat / vente, valorisation, démo. */
import { describe, expect, it } from 'vitest';
import {
  applyMarketQuotes,
  constants as C,
  dayChangePct,
  etfFee,
  fundTotal,
  lifeOf,
  performAction,
  portfolioValue,
  quoteStale,
  sanitizeQuotes,
  simulateDemoQuotes,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const DAY = '2026-11-25';
const GUILLEM = playerId(2);
const ELY = playerId(1);
const act = (s: GameSnapshot, code: string, params: Record<string, unknown>, amount?: number | null, actor = GUILLEM) =>
  performAction(s, { action_code: code, actor_id: actor, params, amount_eur: amount ?? null }, WEDNESDAY);

function withQuotes(fund = 2000): GameSnapshot {
  const s = seedSnapshot();
  s.village.sovereign_fund_eur = fund;
  applyMarketQuotes(s, { world: { price: 100, prev: 98, date: '2026-11-24', history: [95, 98, 100] }, cac40: { price: 80, date: '2026-11-24' } }, '2026-11-24');
  return s;
}

describe('Cours de la nuit', () => {
  it('nettoie les cours reçus et ignore les valeurs invalides', () => {
    const q = sanitizeQuotes({ world: { price: 101.234, prev: 'x', date: '2026-11-24', history: [1, -2, 3] }, sp500: { price: -1, date: '2026-11-24' }, bidon: { price: 3, date: '2026-11-24' }, cac40: { price: 5, date: 'hier' } });
    expect(Object.keys(q)).toEqual(['world']);
    expect(q.world).toEqual({ price: 101.23, prev: null, date: '2026-11-24', history: [1, 3] });
    expect(sanitizeQuotes(null)).toEqual({});
  });

  it('garde le dernier cours connu si la source tombe, et prolonge l’historique', () => {
    const s = withQuotes();
    expect(applyMarketQuotes(s, {}, '2026-11-25')).toBe(0);
    expect(lifeOf(s.village).market_quotes?.world?.price).toBe(100);
    applyMarketQuotes(s, { world: { price: 103, date: '2026-11-25' } }, '2026-11-26');
    const q = lifeOf(s.village).market_quotes!.world!;
    expect(q.history).toEqual([95, 98, 100, 103]);
    expect(q.prev).toBe(100);
    expect(dayChangePct(q)).toBe(3);
    // Même séance relue : on remplace le dernier point, pas d'ajout
    applyMarketQuotes(s, { world: { price: 104, date: '2026-11-25' } }, '2026-11-27');
    expect(lifeOf(s.village).market_quotes!.world!.history).toEqual([95, 98, 100, 104]);
    expect(lifeOf(s.village).market_quotes!.world!.prev).toBe(100);
    expect(quoteStale(q, '2026-11-28')).toBe(false);
    expect(quoteStale(q, '2026-12-10')).toBe(true);
  });

  it('l’historique est plafonné', () => {
    const s = seedSnapshot();
    const history = Array.from({ length: 90 }, (_, i) => 50 + i);
    applyMarketQuotes(s, { sp500: { price: 140, date: '2026-11-24', history } }, '2026-11-24');
    expect(lifeOf(s.village).market_quotes!.sp500!.history.length).toBe(C.ETF_HISTORY_POINTS);
  });
});

describe('Achat et vente', () => {
  it('le trésorier achète : liquidités → parts, frais déduits', () => {
    const r = act(withQuotes(), 'buy_etf', { etf: 'world' }, 1000);
    expect(r.ok).toBe(true);
    const v = r.snapshot.village;
    expect(v.sovereign_fund_eur).toBe(1000);
    const pos = lifeOf(v).etf_positions!.world!;
    expect(etfFee(1000)).toBe(2);
    expect(pos.shares).toBe(9.98);
    expect(pos.cost_eur).toBe(1000);
    expect(portfolioValue(v)).toBe(998);
    expect(fundTotal(v)).toBe(1998);
    expect(r.events.some((e) => e.event_type === 'etf_trade')).toBe(true);
    expect(lifeOf(v).etf_value_history?.at(-1)).toEqual({ day: DAY, value: 998 });
  });

  it('refus : autre rôle, fonds insuffisant, ETF sans cours, ordre trop petit', () => {
    expect(act(withQuotes(), 'buy_etf', { etf: 'world' }, 500, ELY).ok).toBe(false);
    expect(act(withQuotes(100), 'buy_etf', { etf: 'world' }, 500).error).toMatch(/insuffisant/);
    expect(act(withQuotes(), 'buy_etf', { etf: 'nasdaq100' }, 500).error).toMatch(/Pas encore de cours/);
    expect(act(withQuotes(), 'buy_etf', { etf: 'world' }, 10).error).toMatch(/minimal/);
    expect(act(withQuotes(), 'sell_etf', { etf: 'world' }, null).error).toMatch(/ne détient pas/);
  });

  it('vente partielle puis totale : plus-value réalisée', () => {
    const s = act(withQuotes(), 'buy_etf', { etf: 'world' }, 1000).snapshot;
    applyMarketQuotes(s, { world: { price: 120, date: '2026-11-25' } }, DAY);
    const part = act(s, 'sell_etf', { etf: 'world' }, 600);
    expect(part.ok).toBe(true);
    const v1 = part.snapshot.village;
    expect(lifeOf(v1).etf_positions!.world!.shares).toBe(4.98);
    expect(v1.sovereign_fund_eur).toBeCloseTo(1000 + 600 - 1.2, 2);
    const all = act(part.snapshot, 'sell_etf', { etf: 'world' }, null);
    expect(all.ok).toBe(true);
    const v2 = all.snapshot.village;
    expect(lifeOf(v2).etf_positions?.world).toBeUndefined();
    // 9,98 parts × 120 = 1197,60 brut, moins 2 frais (1,20 + 1,20) — prix de revient 1000
    expect(lifeOf(v2).etf_realized_eur).toBeCloseTo(1197.6 - 2.4 - 1000, 1);
    expect(v2.sovereign_fund_eur).toBeCloseTo(1000 + 1197.6 - 2.4, 1);
  });
});

describe('Démo', () => {
  it('cours simulés déterministes, signalés démo, 60 jours d’historique au départ', () => {
    const s = seedSnapshot();
    const a = simulateDemoQuotes(s.village, DAY);
    const b = simulateDemoQuotes(s.village, DAY);
    expect(a).toEqual(b);
    expect(Object.keys(a).length).toBe(C.ETFS.length);
    applyMarketQuotes(s, a, DAY);
    const q = lifeOf(s.village).market_quotes!.world!;
    expect(q.demo).toBe(true);
    expect(q.history.length).toBe(C.ETF_HISTORY_POINTS);
    expect(q.price).toBe(C.ETFS[0]!.demo_price);
    // Même jour : rien de neuf ; lendemain : un pas de marche aléatoire raisonnable
    expect(simulateDemoQuotes(s.village, DAY)).toEqual({});
    const next = simulateDemoQuotes(s.village, '2026-11-26');
    expect(Math.abs(next.world!.price / q.price - 1)).toBeLessThan(0.06);
    expect(next.world!.prev).toBe(q.price);
  });
});
