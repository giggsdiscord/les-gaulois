/** Fonds souverain en Bourse vu par l'interface (V6.2). */
import { describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { applyMarketQuotes, performAction } from '../../src/engine/index.ts';
import { buyEstimate, fundView, sparkPoints } from '../../src/app/lib/funds.ts';
import { incomeChoices } from '../../src/app/lib/income.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';
import { playerId, seedSnapshot } from '../fixtures.ts';

const NOW = new Date('2026-11-25T10:00:00Z');

function snap(fund = 2000) {
  const s = seedSnapshot();
  s.village.sovereign_fund_eur = fund;
  applyMarketQuotes(s, { world: { price: 100, prev: 98, date: '2026-11-24', history: [95, 98, 100] } }, '2026-11-25');
  return s;
}

describe('fundView', () => {
  it('sans cours : rien à placer, pas de démo', () => {
    const s = seedSnapshot();
    const view = fundView(s.village, NOW);
    expect(view.noQuotes).toBe(true);
    expect(view.rows).toHaveLength(6);
  });

  it('positions, plus-value latente et variation du jour', () => {
    const r = performAction(snap(), { action_code: 'buy_etf', actor_id: playerId(2), params: { etf: 'world' }, amount_eur: 1000 }, NOW);
    expect(r.ok).toBe(true);
    applyMarketQuotes(r.snapshot, { world: { price: 110, date: '2026-11-25' } }, '2026-11-26');
    const view = fundView(r.snapshot.village, NOW);
    const world = view.rows.find((x) => x.def.id === 'world')!;
    expect(world.changePct).toBe(10);
    expect(world.value).toBeCloseTo(1097.8, 1);
    expect(world.gain).toBeCloseTo(97.8, 1);
    expect(view.total).toBeCloseTo(1000 + 1097.8, 1);
    expect(view.valueHistory.at(-1)?.value).toBeCloseTo(1097.8, 1);
    expect(view.asOf).toBe('2026-11-25');
  });

  it('sélecteur générique : ETF sans cours bloqués, vente seulement des positions', () => {
    const data = { village: snap().village, structures: [] };
    const buy = incomeChoices('buy_etf', data)!;
    expect(buy.options.find((o) => o.id === 'world')?.blocked).toBeNull();
    expect(buy.options.find((o) => o.id === 'cac40')?.blocked).toMatch(/Pas encore de cours/);
    expect(incomeChoices('sell_etf', data)!.options).toHaveLength(0);
  });

  it('courbe et estimation', () => {
    expect(sparkPoints([1], 100, 20)).toBe('');
    expect(sparkPoints([1, 3, 2], 100, 20)).toBe('0,20 50,0 100,10');
    expect(buyEstimate(100, 1000)).toEqual({ fee: 2, shares: 9.98 });
  });
});

describe('Priorité « placer le fonds »', () => {
  it('apparaît quand des liquidités dorment et que les cours sont connus (démo)', async () => {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, String(v)), removeItem: (k: string) => void map.delete(k), clear: () => map.clear(), key: () => null, length: 0 });
    const api = new DemoApi();
    api.setToken(await api.login(demoPlayerId(2), '0000'));
    await api.action({ action_code: 'transfer_sovereign_fund', amount_eur: 800 });
    const data = await api.loadAll();
    const item = priorityPlan(data, api.now()).items.find((i) => i.key === 'etf:invest');
    expect(item).toBeDefined();
    expect(item!.short.length).toBeLessThanOrEqual(70);
    vi.unstubAllGlobals();
  });
});
