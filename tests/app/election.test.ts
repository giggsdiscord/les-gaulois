/** Élection vivante vue par l'interface (V5.3) : carte, priorités, démo, blocages. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { actionBlockReason } from '../../src/app/lib/actionHints.ts';
import { categoryOf } from '../../src/app/lib/actionCategories.ts';
import { electionView, shortDay } from '../../src/app/lib/election.ts';
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

async function demoActII(): Promise<DemoApi> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(2), '0000'));
  await api.loadAll();
  (api as unknown as { store: { state: { snapshot: { village: { act_number: number } } } } }).store.state.snapshot.village.act_number = 2;
  return api;
}

const PROGRAM = 'Une caisse saine et des rondes nocturnes sur la piste.';

describe('Élection vivante (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('Acte II : ouverture, candidature, priorités, vote, dépouillement et mandat', async () => {
    const api = await demoActII();
    await api.advanceTime(24);
    let data = await api.loadAll();
    let view = electionView(data, api.now());
    expect(view.portfolio).toBe('defense');
    expect(view.phase).toBe('candidacy');
    expect(view.canStand).toBe(true);
    expect(priorityPlan(data, api.now()).items.some((i) => i.key === 'election:stand')).toBe(true);

    const r = await api.action({ action_code: 'run_for_office', params: { program: PROGRAM } });
    expect(r.ok).toBe(true);
    data = await api.loadAll();
    view = electionView(data, api.now());
    expect(view.amCandidate).toBe(true);
    expect(view.canSpeak).toBe(true);
    const s = await api.action({ action_code: 'campaign_speech', params: { text: 'Votez pour une Défense sobre !' } });
    expect(s.ok).toBe(true);

    // Un second candidat (Ely), puis la phase de vote
    const ely = demoPlayerId(1);
    const store = (api as unknown as { store: { state: { snapshot: { village: Parameters<typeof lifeOf>[0] } } } }).store;
    lifeOf(store.state.snapshot.village).election!.candidates.push({ player_id: ely, program: 'Des clôtures partout et des miradors.', at: api.now().toISOString() });
    await api.advanceTime(72);
    data = await api.loadAll();
    view = electionView(data, api.now());
    expect(view.phase).toBe('vote');
    expect(view.canVote).toBe(true);
    expect(priorityPlan(data, api.now()).items.some((i) => i.key === 'election:vote')).toBe(true);
    const v = await api.action({ action_code: 'vote_election', params: { candidate: ely } });
    expect(v.ok).toBe(true);
    data = await api.loadAll();
    expect(electionView(data, api.now()).myVote).toBe(ely);

    await api.advanceTime(48);
    data = await api.loadAll();
    const life = lifeOf(data.village);
    expect(life.mandates?.defense?.player_id).toBe(ely);
    expect(data.players.find((p) => p.id === ely)!.ministerial_portfolios).toContain('defense');
    view = electionView(data, api.now());
    expect(view.lastText).toMatch(/élu/);
    expect(view.mandates[0]!.portfolio).toBe('defense');
  });
});

describe('Classement, jours et blocages', () => {
  it('les trois actions sont dans « Vie du village »', () => {
    for (const code of ['run_for_office', 'campaign_speech', 'vote_election']) expect(categoryOf(code)?.id).toBe('village');
  });

  it('jour court en français', () => {
    expect(shortDay('2026-11-26')).toBe('jeu. 26/11');
  });

  const base = {
    holder: { id: 'p1', display_name: 'Ely', action_points: 3, status: 'active' as const, role_code: 'mayor_agri' as const },
    actorBlocked: null,
    viaDelegation: false,
    defeated: false,
    now: new Date('2026-11-25T10:00:00Z'),
  };
  it('raisons de blocage selon la phase', () => {
    const closed = { open: false, canStand: false, canSpeak: false, canVote: false, phase: null };
    expect(actionBlockReason(getAction('run_for_office')!, { ...base, election: closed })).toMatch(/Aucune élection/);
    const cand = { open: true, canStand: true, canSpeak: false, canVote: false, phase: 'candidacy' };
    expect(actionBlockReason(getAction('run_for_office')!, { ...base, election: cand })).toBeNull();
    expect(actionBlockReason(getAction('vote_election')!, { ...base, election: cand })).toMatch(/après les candidatures/);
    expect(actionBlockReason(getAction('campaign_speech')!, { ...base, election: cand })).toMatch(/candidats/);
  });
});
