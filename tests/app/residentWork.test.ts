/** Travail des résidents vu par l'interface (V4.9) : aperçu, choix de poste, priorités, démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { actionBlockReason } from '../../src/app/lib/actionHints.ts';
import { getAction } from '../../src/engine/index.ts';
import type { GameData } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';
import { reserveReport } from '../../src/app/lib/reserves.ts';
import { postChoices, residentWorkView, totalsParts } from '../../src/app/lib/residentWork.ts';
import { makeMigrant } from '../fixtures.ts';

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

const GUILLEM = demoPlayerId(2);

/** Partie démo avec deux résidents (un maçon sans poste, une bergère au potager). */
async function demoWithResidents(): Promise<{ api: DemoApi; data: GameData }> {
  const first = new DemoApi();
  const token = await first.login(GUILLEM, '0000');
  first.setToken(token);
  await first.loadAll();
  const raw = JSON.parse(localStorage.getItem('les-gaulois-demo-v4')!);
  raw.state.snapshot.migrants.push(
    makeMigrant('res-mason', { full_name: 'Nour Benali', specialty_code: 'mason', specialty_level: 3, work_post: null }),
    makeMigrant('res-shepherd', { full_name: 'Aina Puig', specialty_code: 'shepherd', specialty_level: 2, work_post: 'garden' }),
  );
  localStorage.setItem('les-gaulois-demo-v4', JSON.stringify(raw));
  const api = new DemoApi();
  api.setToken(token);
  return { api, data: await api.loadAll() };
}

describe('Travail des résidents (interface)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('aperçu de la nuit, résident sans poste signalé dans les priorités', async () => {
    const { api, data } = await demoWithResidents();
    const now = api.now();
    const view = residentWorkView(data, now);
    expect(view.workforce.map((m) => m.full_name)).toEqual(['Nour Benali', 'Aina Puig']);
    expect(view.lines['res-mason']!.note).toBe('Sans poste');
    expect(view.tonight.unassigned).toBe(1);
    const plan = priorityPlan(data, now);
    const item = plan.items.find((i) => i.key === 'residents_idle');
    expect(item?.route).toEqual({ name: 'agora', param: 'immigration' });
    // Les rations des résidents au potager apparaissent dans les Réserves
    const food = reserveReport(data, now).find((l) => l.key === 'food')!;
    expect(food.sources.some((s) => s.actionCode === 'assign_work_post')).toBe(true);
  });

  it('propose d\'abord les postes de sa spécialité', () => {
    const choices = postChoices(makeMigrant('x', { specialty_code: 'mason', specialty_level: 2 }));
    expect(choices[0]!.post.code).toBe('construction');
    expect(choices[0]!.skill).toBe(1.5);
    expect(choices[0]!.suggested).toBe(true);
    expect(choices.at(-1)!.skill).toBe(1);
  });

  it('affecte un poste par la démo ; la nuit suivante, la production est mémorisée', async () => {
    const { api } = await demoWithResidents();
    const r = await api.action({ action_code: 'assign_work_post', target_migrant_id: 'res-mason', params: { post: 'construction' } });
    expect(r.ok).toBe(true);
    let data = await api.loadAll();
    expect(data.migrants.find((m) => m.id === 'res-mason')!.work_post).toBe('construction');
    await api.advanceTime(24);
    data = await api.loadAll();
    const last = residentWorkView(data, api.now()).lastNight;
    expect(last).not.toBeNull();
    expect(totalsParts(last!).length).toBeGreaterThan(0);
  });
});

describe('Raisons de blocage de la forêt (V4.9)', () => {
  const base = {
    holder: { id: 'p1', display_name: 'Ely', action_points: 3, status: 'active' as const, role_code: 'mayor_agri' as const },
    actorBlocked: null,
    viaDelegation: false,
    defeated: false,
    now: new Date('2026-11-25T10:00:00Z'),
  };
  it('coupe et nouvelle interdiction bloquées pendant l\'interdiction ; levée bloquée sinon', () => {
    expect(actionBlockReason(getAction('cut_wood')!, { ...base, forestBanned: true })).toMatch(/interdites par Ely/);
    expect(actionBlockReason(getAction('forest_ban')!, { ...base, forestBanned: true })).toMatch(/interdites/);
    expect(actionBlockReason(getAction('lift_forest_ban')!, { ...base, forestBanned: false })).toMatch(/ouverte/);
    expect(actionBlockReason(getAction('lift_forest_ban')!, { ...base, forestBanned: true })).toBeNull();
    expect(actionBlockReason(getAction('cut_wood')!, { ...base, forestBanned: false })).toBeNull();
  });
});
