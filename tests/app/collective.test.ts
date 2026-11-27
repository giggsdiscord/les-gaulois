/** Chantier collectif de la semaine vu par l'interface (V5.0) : carte, priorités, démo, blocages. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { actionBlockReason } from '../../src/app/lib/actionHints.ts';
import { collectiveView } from '../../src/app/lib/collective.ts';
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

describe('Chantier collectif (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('avant la première nuit : pas de chantier, contribution grisée', async () => {
    const api = await demo();
    const data = await api.loadAll();
    const view = collectiveView(data, api.now());
    expect(view.project).toBeNull();
    expect(view.status).toMatch(/cette nuit/);
  });

  it('une nuit plus tard : chantier ouvert, contribution et vote par la démo', async () => {
    const api = await demo();
    await api.advanceTime(24);
    let data = await api.loadAll();
    let view = collectiveView(data, api.now());
    expect(view.def).not.toBeNull();
    expect(view.candidates.length).toBeGreaterThan(0);
    expect(view.candidates[0]!.proposed).toBe(true);
    // Carte « À faire en priorité »
    expect(priorityPlan(data, api.now()).items.some((i) => i.key === 'collective')).toBe(true);

    const r = await api.action({ action_code: 'contribute_collective' });
    expect(r.ok).toBe(true);
    data = await api.loadAll();
    view = collectiveView(data, api.now());
    expect(view.project!.points).toBe(view.myPoints);
    expect(view.contributors[0]!.id).toBe(data.me.id);

    const choice = view.candidates.at(-1)!.def.id;
    const v = await api.action({ action_code: 'vote_collective_project', params: { project: choice } });
    expect(v.ok).toBe(true);
    data = await api.loadAll();
    view = collectiveView(data, api.now());
    expect(view.candidates.find((c) => c.def.id === choice)!.mine).toBe(true);
    expect(lifeOf(data.village).collective_votes?.[data.me.id]).toBe(choice);
  });
});

describe('Raisons de blocage du chantier collectif', () => {
  const base = {
    holder: { id: 'p1', display_name: 'Ely', action_points: 3, status: 'active' as const, role_code: 'mayor_agri' as const },
    actorBlocked: null,
    viaDelegation: false,
    defeated: false,
    now: new Date('2026-11-25T10:00:00Z'),
  };
  it('contribution impossible sans chantier ou une fois achevé ; vote sans candidat', () => {
    const def = getAction('contribute_collective')!;
    expect(actionBlockReason(def, { ...base, collective: 'none' })).toMatch(/cette nuit/);
    expect(actionBlockReason(def, { ...base, collective: 'done' })).toMatch(/achevé/);
    expect(actionBlockReason(def, { ...base, collective: 'open' })).toBeNull();
    expect(actionBlockReason(getAction('vote_collective_project')!, { ...base, collectiveVotable: false })).toMatch(/Aucun projet/);
  });
});
