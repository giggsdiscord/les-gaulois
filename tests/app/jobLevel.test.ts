/** Niveaux de métier, mission du jour et binômes vus par l'interface (V5.2), en démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import type { GameData } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { jobView, perkText } from '../../src/app/lib/jobLevel.ts';
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

async function demo(slot: number): Promise<DemoApi> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(slot), '0000'));
  await api.loadAll();
  return api;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('Niveau & mission du jour (interface)', () => {
  it('niveau 1 au départ, mission du jour proposée et reliée aux priorités', async () => {
    const api = await demo(5);
    const data = await api.loadAll();
    const view = jobView(data, api.now());
    expect(view.progress.level).toBe(1);
    expect(view.nextPerk).toMatch(/\+10 %/);
    expect(view.mission).not.toBeNull();
    expect(view.mission!.done).toBe(false);
    const plan = priorityPlan(data, api.now());
    const item = plan.items.find((i) => i.key === `mission:${view.mission!.def.code}`);
    expect(item).toBeDefined();
    expect(item!.who).toBe('vous');
    expect(item!.mine).toBe(true);
  });

  it('texte des bonus : fournée double pour Julio au niveau 4', () => {
    expect(perkText(1, 'civil_eng')).toMatch(/Rendement normal/);
    expect(perkText(3, 'civil_eng')).toMatch(/\+20 %/);
    expect(perkText(4, 'smith_diplo')).toMatch(/fournée double/);
    expect(perkText(4, 'civil_eng')).not.toMatch(/fournée/);
  });

  it('mission faite : cochée, et retirée des priorités', async () => {
    const api = await demo(5);
    const data = await api.loadAll();
    const today = jobView(data, api.now()).mission!;
    const done: GameData = { ...data, village: { ...data.village, life: { ...(data.village.life ?? {}), missions_done: { [data.me.id]: { day: dayOf(api.now()), code: today.def.code } } } } };
    expect(jobView(done, api.now()).mission!.done).toBe(true);
    expect(priorityPlan(done, api.now()).items.some((i) => i.key === `mission:${today.def.code}`)).toBe(false);
  });

  it('binôme : Ely négocie, Julio voit l\'invitation à négocier aussi', async () => {
    const ely = await demo(1);
    const r = await ely.action({ action_code: 'negotiate_spain_andorra' });
    expect(r.ok).toBe(true);
    const julio = new DemoApi();
    julio.setToken(await julio.login(demoPlayerId(5), '0000'));
    const data = await julio.loadAll();
    const duo = jobView(data, julio.now()).duos.find((d) => d.group.id === 'negotiation');
    expect(duo).toBeDefined();
    expect(duo!.partners).toEqual(['Ely']);
    expect(duo!.formed).toBe(false);
    expect(duo!.action).not.toBeNull();
    const r2 = await julio.action({ action_code: duo!.action!.code });
    expect(r2.ok).toBe(true);
    expect(r2.narrative).toContain('Binôme avec Ely');
    const after = jobView(await julio.loadAll(), julio.now()).duos.find((d) => d.group.id === 'negotiation');
    expect(after!.formed).toBe(true);
  });
});

function dayOf(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return p;
}
