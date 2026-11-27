/** Objectifs d'Acte vus par l'interface (V5.1) : liste à cocher, lien avec les priorités, démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import type { GameData } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { actGoalsView, goalForPriority } from '../../src/app/lib/actGoals.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';

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

const withVillage = (data: GameData, patch: Partial<GameData['village']>): GameData => ({ ...data, village: { ...data.village, ...patch } });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('Objectifs d\'Acte (interface)', () => {
  it('au départ : liste de l\'Acte I, rien de coché, prochaine étape la plus avancée', async () => {
    const api = await demo();
    const data = await api.loadAll();
    const view = actGoalsView(data);
    expect(view.act).toBe(1);
    expect(view.total).toBe(5);
    expect(view.done).toBe(0);
    expect(view.goals.find((g) => g.id === 'beds_20')?.progress).toBe('12 / 20 lits');
    expect(view.next).not.toBeNull();
    expect(view.bonus).toMatch(/emprunt/);
  });

  it('une étape atteinte apparaît atteinte, puis cochée une fois écrite par le moteur', async () => {
    const api = await demo();
    const data = withVillage(await api.loadAll(), { garden_area_m2: 520 });
    const line = actGoalsView(data).goals.find((g) => g.id === 'garden_500')!;
    expect(line.met).toBe(true);
    expect(line.done).toBe(false);
    const done = withVillage(data, { life: { act_goals: { garden_500: '2026-11-25T10:00:00Z' } } });
    expect(actGoalsView(done).goals.find((g) => g.id === 'garden_500')!.done).toBe(true);
    expect(actGoalsView(done).done).toBe(1);
  });

  it('« À faire en priorité » signale les priorités qui cochent un objectif', async () => {
    const api = await demo();
    const data = await api.loadAll();
    const plan = priorityPlan(data, api.now());
    expect(plan.goals.total).toBe(5);
    const gen = plan.items.find((i) => i.key === 'generator')!;
    expect(gen.goal).toMatch(/Électricité/);
    expect(gen.steps.some((s) => s.includes('Objectif de l\'Acte'))).toBe(true);
    expect(goalForPriority(plan.goals, 'renovate:abc')?.id).toBe('beds_20');
    expect(goalForPriority(plan.goals, 'morale')).toBeNull();
  });

  it('démo : une action coche l\'étape atteinte et verse la remise d\'emprunt', async () => {
    await demo(); // crée la partie de démo dans le stockage
    const key ='les-gaulois-demo-v4';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.state.snapshot.village.gite_open = true;
    localStorage.setItem(key, JSON.stringify(state));
    const fresh = new DemoApi();
    fresh.setToken(await fresh.login(demoPlayerId(2), '0000'));
    const r = await fresh.action({ action_code: 'spanish_lesson' });
    expect(r.ok).toBe(true);
    const data = await fresh.loadAll();
    expect(data.village.life?.act_goals?.gite_open).toBeDefined();
    expect(data.village.land_debt_eur).toBeLessThan(295000);
    expect(actGoalsView(data).goals.find((g) => g.id === 'gite_open')!.done).toBe(true);
  });
});
