/** Revenus automatiques vus par l'interface (V6.1) : carte, choix du formulaire, priorités, démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { actionBlockReason, situationFor } from '../../src/app/lib/actionHints.ts';
import { defaultChoice, incomeChoices, incomeView } from '../../src/app/lib/income.ts';
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

describe('Revenus automatiques (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('au départ : installations de l’Acte 1 possibles, Actes 2–3 verrouillés, priorité de première installation', async () => {
    const api = await demo();
    const data = await api.loadAll();
    const view = incomeView(data, api.now());
    expect(view.installs.find((i) => i.def.id === 'roadside_stall')?.blocked).toBeNull();
    expect(view.installs.find((i) => i.def.id === 'nuclear_export')?.blocked).toMatch(/Acte 3/);
    expect(view.weeklyEur).toBe(0);
    const ch = incomeChoices('setup_install', data)!;
    expect(ch.param).toBe('install');
    expect(ch.options.find((o) => o.id === defaultChoice(ch))?.blocked).toBeNull();
    expect(actionBlockReason(getAction('stop_install')!, situationFor(data, null, api.now()))).toMatch(/Aucune installation/);
    const item = priorityPlan(data, api.now()).items.find((i) => i.key === 'income:start');
    expect(item?.short.length).toBeLessThanOrEqual(70);
  });

  it('installer, signer, rendre un service, puis une nuit : recettes et bilan', async () => {
    const api = await demo();
    expect((await api.action({ action_code: 'setup_install', params: { install: 'roadside_stall' } })).ok).toBe(true);
    expect((await api.action({ action_code: 'sign_order', params: { order: 'bakery_wood' } })).ok).toBe(true);
    expect((await api.action({ action_code: 'paid_service', params: { service: 'lessons' } })).ok).toBe(true);
    let data = await api.loadAll();
    let view = incomeView(data, api.now());
    expect(view.installs.find((i) => i.def.id === 'roadside_stall')?.state).toBe('on');
    expect(view.orders.find((o) => o.def.id === 'bakery_wood')?.active).not.toBeNull();
    expect(view.services.find((s) => s.def.id === 'lessons')?.done).toBe(1);
    expect(priorityPlan(data, api.now()).items.some((i) => i.key === 'income:start')).toBe(false);
    await api.advanceTime(24);
    data = await api.loadAll();
    view = incomeView(data, api.now());
    expect(lifeOf(data.village).income_last?.lines.length).toBeGreaterThan(0);
    expect(view.last).not.toBeNull();
  });
});
