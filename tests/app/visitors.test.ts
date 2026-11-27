/** Visiteurs imprévus vus par l'interface (V5.9) : carte, priorité, démo, blocages. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { actionBlockReason, situationFor } from '../../src/app/lib/actionHints.ts';
import { visitorsView } from '../../src/app/lib/visitors.ts';
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

describe('Visiteurs (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('avant la première nuit : personne, réponse grisée', async () => {
    const api = await demo();
    const data = await api.loadAll();
    expect(visitorsView(data, api.now()).visit).toBeNull();
    expect(actionBlockReason(getAction('answer_visitor')!, situationFor(data, null, api.now()))).toMatch(/Aucun visiteur/);
  });

  it('un visiteur finit par arriver : priorité, réponse, visite close', async () => {
    const api = await demo();
    let data = await api.loadAll();
    let view = visitorsView(data, api.now());
    for (let i = 0; i < 20 && !(view.visit && !view.visit.blocked); i++) {
      await api.advanceTime(24);
      data = await api.loadAll();
      view = visitorsView(data, api.now());
    }
    const m = view.visit!;
    expect(m).not.toBeNull();
    expect(m.blocked).toBeNull();
    const item = priorityPlan(data, api.now()).items.find((i) => i.key === 'visitor');
    expect(item?.short.length).toBeLessThanOrEqual(70);
    const choice = m.choices.find((c) => !c.blocked)!;
    const r = await api.action({ action_code: 'answer_visitor', params: { choice: choice.def.id } });
    expect(r.ok).toBe(true);
    data = await api.loadAll();
    expect(visitorsView(data, api.now()).visit).toBeNull();
    expect(lifeOf(data.village).visitor_last).toMatchObject({ id: m.def.id, choice: choice.def.id });
    expect(visitorsView(data, api.now()).last).toContain(m.def.title);
  });
});
