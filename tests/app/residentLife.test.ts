/** Personnalité des résidents vue par l'interface (V5.7) : fiche, priorité, encouragement en démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import type { GameData } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';
import { lastStory, residentPersona, sulkingResidents } from '../../src/app/lib/residentLife.ts';
import { constants as C } from '../../src/engine/index.ts';
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

async function demoWithResidents(): Promise<{ api: DemoApi; data: GameData }> {
  const first = new DemoApi();
  const token = await first.login(GUILLEM, '0000');
  first.setToken(token);
  await first.loadAll();
  const raw = JSON.parse(localStorage.getItem('les-gaulois-demo-v4')!);
  raw.state.snapshot.migrants.push(
    makeMigrant('res-a', { full_name: 'Nour Benali', work_post: 'garden', traits: { temper: 'grumpy', mood: 18, mood_delta: -6, mood_reason: 'la faim', friend_id: 'res-b' } }),
    makeMigrant('res-b', { full_name: 'Aina Puig', work_post: 'garden', traits: { temper: 'joker', mood: 82, friend_id: 'res-a' } }),
  );
  raw.state.snapshot.village.life = { ...(raw.state.snapshot.village.life ?? {}), story_last: { day: '2026-11-24', migrant_id: 'res-a', title: 'Mauvaise passe', text: 'Nour boude.' } };
  localStorage.setItem('les-gaulois-demo-v4', JSON.stringify(raw));
  const api = new DemoApi();
  api.setToken(token);
  return { api, data: await api.loadAll() };
}

describe('Personnalité des résidents (interface)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('fiche : caractère, humeur, effet sur le rendement, ami ; histoire et priorité', async () => {
    const { api, data } = await demoWithResidents();
    const now = api.now();
    const a = data.migrants.find((m) => m.id === 'res-a')!;
    const p = residentPersona(a, data.migrants, now);
    expect(p.temper.label).toBe('Ronchon');
    expect(p.level).toBe('sulk');
    expect(p.yieldText).toBe('−15 %');
    expect(p.friend).toBe('Aina');
    expect(p.lastDelta).toBe(-6);
    expect(residentPersona(data.migrants.find((m) => m.id === 'res-b')!, data.migrants, now).yieldText).toBe('+10 %');
    expect(sulkingResidents(data.migrants).map((m) => m.id)).toEqual(['res-a']);
    expect(lastStory(data)?.text).toBe('Nour boude.');
    const item = priorityPlan(data, now).items.find((i) => i.key === 'mood:res-a');
    expect(item?.actionCode).toBe('cheer_resident');
    expect(item!.short.length).toBeLessThanOrEqual(70);
  });

  it('encourager en démo : +15 d’humeur, puis bouton « déjà encouragé »', async () => {
    const { api } = await demoWithResidents();
    const r = await api.action({ action_code: 'cheer_resident', target_migrant_id: 'res-a' });
    expect(r.ok).toBe(true);
    const data = await api.loadAll();
    const a = data.migrants.find((m) => m.id === 'res-a')!;
    const p = residentPersona(a, data.migrants, api.now());
    expect(p.mood).toBe(18 + C.CHEER_MOOD);
    expect(p.cheeredToday).toBe(true);
  });
});
