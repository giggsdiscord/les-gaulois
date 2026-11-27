/** Bilan de la semaine & frise vus par l'interface (V6.0), en démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { chronicleView } from '../../src/app/lib/chronicle.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { lifeOf } from '../../src/engine/index.ts';

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

describe('Bilan & frise (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('une action me place au classement de la semaine', async () => {
    const api = await demo();
    expect(chronicleView(await api.loadAll()).live).toEqual([]);
    const r = await api.action({ action_code: 'cut_wood' });
    expect(r.ok).toBe(true);
    const view = chronicleView(await api.loadAll());
    expect(view.myRank).toBe(1);
    expect(view.live[0]).toMatchObject({ me: true, actions: 1, favorite: 'Couper du bois' });
    expect(view.scoring).toContain('par PA');
  });

  it('après le lundi : bilan publié, habitant de la semaine, classement remis à zéro', async () => {
    const api = await demo();
    await api.action({ action_code: 'cut_wood' });
    let data = await api.loadAll();
    for (let i = 0; i < 8 && !lifeOf(data.village).week_last; i++) {
      await api.advanceTime(24);
      data = await api.loadAll();
    }
    const view = chronicleView(data);
    expect(view.last).not.toBeNull();
    expect(view.last!.heroIsMe).toBe(true);
    expect(view.last!.podium[0]!.me).toBe(true);
    expect(view.records.length).toBeGreaterThan(0);
    expect(data.events.some((e) => e.title.startsWith('Bilan de la semaine : '))).toBe(true);
  });
});
