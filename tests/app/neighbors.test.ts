/** Relations avec les voisins vues par l'interface (V5.8) : carte, priorités, démo, blocages. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { actionBlockReason, situationFor } from '../../src/app/lib/actionHints.ts';
import { neighborsView } from '../../src/app/lib/neighbors.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { getAction, lifeOf } from '../../src/engine/index.ts';

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

async function demo(): Promise<DemoApi> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(2), '0000'));
  await api.loadAll();
  return api;
}

describe('Voisins (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('avant la première nuit : trois jauges à 50, pas de demande, coup de main grisé', async () => {
    const api = await demo();
    const data = await api.loadAll();
    const view = neighborsView(data, api.now());
    expect(view.gauges.map((g) => [g.def.id, g.value])).toEqual([
      ['organya', 50],
      ['ayuntamiento', 50],
      ['mossos', 50],
    ]);
    expect(view.mission).toBeNull();
    expect(actionBlockReason(getAction('help_neighbors')!, situationFor(data, null, api.now()))).toMatch(/ne demandent rien/);
  });

  it('après une nuit : une demande, une priorité, et chaque coup de main avance la barre', async () => {
    const api = await demo();
    await api.advanceTime(24);
    let data = await api.loadAll();
    let view = neighborsView(data, api.now());
    expect(view.mission).not.toBeNull();
    const m = view.mission!;
    // Réserves suffisantes pour toute demande
    expect(m.blocked).toBeNull();
    const item = priorityPlan(data, api.now()).items.find((i) => i.key === 'neighbors');
    expect(item?.short.length).toBeLessThanOrEqual(70);
    const r = await api.action({ action_code: 'help_neighbors' });
    expect(r.ok).toBe(true);
    data = await api.loadAll();
    view = neighborsView(data, api.now());
    if (m.steps === 1) {
      expect(view.mission).toBeNull();
      expect(lifeOf(data.village).neighbor_last?.outcome).toBe('done');
      expect(view.gauges.find((g) => g.def.id === m.from.id)!.value).toBeGreaterThan(50);
    } else {
      expect(view.mission!.done).toBe(1);
      expect(view.mission!.helpers[0]!.count).toBe(1);
    }
  });
});
