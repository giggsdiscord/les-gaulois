/** « À faire en priorité » et réserves expliquées (V4.6) : ce qui fait avancer le hameau, et pourquoi. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG, getAction } from '../../src/app/engine.ts';
import { DemoApi } from '../../src/app/api/demo.ts';
import type { GameData } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { categoryOf } from '../../src/app/lib/actionCategories.ts';
import { priorityPlan, type PriorityPlan } from '../../src/app/lib/priorities.ts';
import { reserveReport } from '../../src/app/lib/reserves.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

async function load(slot: number): Promise<{ data: GameData; now: Date }> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(slot), '0000'));
  // Une action réelle fait écrire au moteur les grandeurs dérivées (autonomie, productivité)
  await api.action({ action_code: 'spanish_lesson' });
  return { data: await api.loadAll(), now: api.now() };
}

function withVillage(data: GameData, patch: Partial<GameData['village']>): GameData {
  return { ...data, village: { ...data.village, ...patch } };
}

const keys = (plan: PriorityPlan) => plan.items.map((i) => i.key);

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('À faire en priorité', () => {
  it('au départ : l\'électricité d\'abord, expliquée, avec qui peut agir et les verrous', async () => {
    const { data, now } = await load(2); // Guillem, trésorier
    const plan = priorityPlan(data, now);
    expect(plan.act).toBe(1);
    expect(plan.nextAct).toEqual({ act: 2, at: 35 });
    const total = plan.pillars.reduce((n, p) => n + p.value, 0);
    expect(Math.abs(total - data.village.autonomy_pct)).toBeLessThanOrEqual(1);
    expect(plan.pillars.map((p) => p.max)).toEqual([25, 15, 20, 20, 10, 10]);

    const gen = plan.items.find((i) => i.key === 'generator');
    expect(gen).toBeDefined();
    expect(keys(plan).slice(0, 3)).toContain('generator');
    expect(gen!.why).toMatch(/bougie/);
    expect(gen!.who).toBe('Tiphaine ou Alex');
    expect(gen!.mine).toBe(false);
    expect(gen!.steps.join(' ')).toMatch(/c'est vous \(trésorier\) qui validez/);
    expect(gen!.preset?.target_structure_id).toBe(data.structures.find((s) => s.code === 'grup_electrogen')?.id);
  });

  it('dit « vous » à la personne qui peut agir', async () => {
    const { data, now } = await load(3); // Tiphaine, architecte
    const gen = priorityPlan(data, now).items.find((i) => i.key === 'generator')!;
    expect(gen.mine).toBe(true);
    expect(gen.who).toBe('vous ou Alex');
    expect(gen.steps.join(' ')).toMatch(/Guillem \(trésorier\) doit valider/);
    expect(gen.steps.join(' ')).toMatch(/vous-même \(architecte\)/);
  });

  it('suit l\'avancement : groupe installé → raccorder les bâtisses, puis la ligne aérienne', async () => {
    const { data, now } = await load(3);
    const mas = data.structures.find((s) => s.code === 'mas_era')!;
    const next = {
      ...withVillage(data, { energy_tier: 2, fuel_stock_l: 100 }),
      structures: data.structures.map((s) => (s.id === mas.id ? { ...s, status: 'awaiting_power' as const, progress_pct: 100 } : s)),
    };
    const plan = priorityPlan(next, now);
    expect(keys(plan)).not.toContain('generator');
    const connect = plan.items.find((i) => i.key === `connect:${mas.id}`)!;
    expect(connect.urgent).toBe(true);
    expect(connect.why).toMatch(/gîte ne peut pas ouvrir/);
    expect(connect.preset?.target_structure_id).toBe(mas.id);
    expect(keys(plan)).toContain('power_line');
    expect(keys(plan)).toContain('meters');
    expect(keys(plan).indexOf(`connect:${mas.id}`)).toBeLessThan(keys(plan).indexOf('power_line'));
    // Pression administrative ≥ 60 % : la ligne aérienne est bloquée, il faut d'abord calmer l'administration
    const blocked = priorityPlan(withVillage(next, { admin_pressure_pct: 65 }), now);
    expect(blocked.items.find((i) => i.key === 'admin')?.urgent).toBe(true);
  });

  it('fait passer les urgences devant : vivres, outils, échéances impayées', async () => {
    const { data, now } = await load(5);
    const plan = priorityPlan(withVillage(data, { food_rations: 5, tools_stock: 0, missed_loan_payments: 2 }), now);
    expect(keys(plan).slice(0, 4)).toEqual(['food_stock', 'food_buy', 'tools', 'treasury']);
    expect(plan.items.find((i) => i.key === 'food_stock')?.why).toMatch(/moins d'un jour/);
    expect(plan.items.find((i) => i.key === 'treasury')?.urgent).toBe(true);
    const scores = plan.items.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('chaque priorité est complète et jouable depuis le menu d\'actions', async () => {
    for (const slot of [1, 2, 3, 4, 5, 6, 7]) {
      const { data, now } = await load(slot);
      const tough = withVillage(data, { food_rations: 3, tools_stock: 1, missed_loan_payments: 1, morale_pct: 20, track_condition_pct: 20, admin_pressure_pct: 50, water_network_condition_pct: 30 });
      for (const item of priorityPlan(tough, now).items) {
        expect(item.short.length, item.key).toBeGreaterThan(10);
        expect(item.short.length, item.key).toBeLessThanOrEqual(70);
        expect(item.why.length, item.key).toBeGreaterThan(30);
        expect(`${item.title} ${item.why} ${item.steps.join(' ')} ${item.who}`, item.key).not.toMatch(/undefined|NaN|\[object/);
        if (item.actionCode) {
          expect(getAction(item.actionCode), item.key).toBeDefined();
          expect(categoryOf(item.actionCode), item.key).toBeDefined();
        }
        if (item.preset?.catalog_item_id) expect(CATALOG.some((c) => c.id === item.preset?.catalog_item_id)).toBe(true);
      }
    }
  });
});

describe('Réserves du hameau', () => {
  it('donne le rythme quotidien et la durée des rations, comme le moteur', async () => {
    const { data, now } = await load(2);
    const lines = reserveReport(data, now);
    expect(lines.map((l) => l.key)).toEqual(['food', 'tomatoes', 'livestock', 'wood', 'stone', 'iron', 'tools', 'medicine', 'fuel']);
    const food = lines.find((l) => l.key === 'food')!;
    expect(food.perDay).toBeLessThan(0); // 7 fondateurs mangent plus que le potager d'automne ne produit
    expect(food.daysLeft).toBe(Math.floor(data.village.food_rations / -food.perDay!));
    expect(food.daily[0]).toMatch(/7 adultes × 1 = −7 par jour/);
    expect(food.sources.map((s) => s.actionCode)).toContain('fish_hunt');
    // Gasoil inutile tant que le groupe n'est pas installé, puis consommé chaque jour
    expect(lines.find((l) => l.key === 'fuel')?.rate).toBe('pas encore utile');
    const fuel = reserveReport(withVillage(data, { energy_tier: 2, fuel_stock_l: 50 }), now).find((l) => l.key === 'fuel')!;
    expect(fuel.perDay).toBeLessThan(0);
    expect(fuel.daysLeft).toBe(Math.floor(50 / -fuel.perDay!));
  });

  it('explique à quoi sert chaque réserve et comment s\'en procurer', async () => {
    const { data, now } = await load(5); // Julio
    for (const line of reserveReport(withVillage(data, { wood_stock: 3, tools_stock: 2 }), now)) {
      expect(line.daily.length, line.key).toBeGreaterThan(0);
      expect(line.uses.length, line.key).toBeGreaterThan(0);
      expect(line.sources.length, line.key).toBeGreaterThan(0);
      expect(`${line.rate} ${line.daily.join(' ')} ${line.uses.join(' ')}`, line.key).not.toMatch(/undefined|NaN/);
      for (const src of line.sources) {
        if (src.actionCode) expect(getAction(src.actionCode), src.label).toBeDefined();
        if (src.preset?.catalog_item_id) expect(CATALOG.some((c) => c.id === src.preset?.catalog_item_id), src.label).toBe(true);
      }
    }
    const lines = reserveReport(withVillage(data, { wood_stock: 3, tools_stock: 2 }), now);
    expect(lines.find((l) => l.key === 'wood')).toMatchObject({ low: true, rate: '0 séance' });
    const tools = lines.find((l) => l.key === 'tools')!;
    expect(tools.low).toBe(true);
    expect(tools.sources.find((s) => s.actionCode === 'forge_tools')?.mine).toBe(true);
    expect(lines.find((l) => l.key === 'livestock')?.rate).toBe('enclos à bâtir');
  });
});
