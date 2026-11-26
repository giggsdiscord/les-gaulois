/**
 * Test de fumée du mode démo : la même GameSession que les Edge Functions, exécutée « dans le navigateur »
 * avec un stockage local simulé, et les règles d'accès (RLS) émulées.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import { HIDDEN_VILLAGE_KEYS } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { targetSequence } from '../../src/engine/index.ts';

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
const JULIO = demoPlayerId(5);
const TANGUY = demoPlayerId(6);

async function as(api: DemoApi, playerId: string): Promise<string> {
  const token = await api.login(playerId, '0000');
  expect(token).not.toBeNull();
  api.setToken(token);
  return token!;
}

describe('DemoApi', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('connexion par PIN et vue publique sans indicateurs cachés', async () => {
    const api = new DemoApi();
    const cards = await api.listLoginCards();
    expect(cards.map((c) => c.display_name)).toContain('Guillem');
    expect(await api.login(GUILLEM, '1234')).toBeNull();
    await as(api, GUILLEM);
    const data = await api.loadAll();
    expect(data.me.display_name).toBe('Guillem');
    for (const key of HIDDEN_VILLAGE_KEYS) expect(Object.keys(data.village)).not.toContain(key);
    expect(data.structures.length).toBeGreaterThan(25);
  });

  it('initiative hebdomadaire unique et vote nominatif', async () => {
    const api = new DemoApi();
    await as(api, GUILLEM);
    await api.submitProposal('Fonds souverain pyrénéen', 'Placer chaque mois 10 % de la caisse commune dans un fonds souverain géré par M. Lerme pour le barrage.', 'economy');
    await expect(api.submitProposal('Deuxième idée', 'x'.repeat(90), 'economy')).rejects.toThrow();
    const p = (await api.loadAll()).proposals.find((x) => x.kind === 'initiative');
    expect(p?.status).toBe('open');
    await api.vote(p!.id, true);
    await as(api, JULIO);
    await api.vote(p!.id, false);
    const after = (await api.loadAll()).proposals.find((x) => x.id === p!.id)!;
    expect(after.votes_yes).toEqual([GUILLEM]);
    expect(after.votes_no).toEqual([JULIO]);
  });

  it('épreuve de la cible à deux joueurs, résultats cachés tant que le duel est en cours', async () => {
    const api = new DemoApi();
    await as(api, GUILLEM);
    const r = await api.challengeDuel({ targetPlayerId: JULIO, mode: 'target' });
    const duelId = String(r.duel_id);
    const seq = targetSequence(duelId);
    const precise = seq.map((t) => ({ index: t.index, x: t.x, y: t.y, reaction_ms: 300 }));
    expect((await api.submitTargetTaps(duelId, precise)).both_submitted).toBe(false);
    await expect(api.submitTargetTaps(duelId, precise)).rejects.toThrow(/déjà joué/);

    await as(api, JULIO);
    expect((await api.loadAll()).targetResults.filter((x) => x.duel_id === duelId)).toHaveLength(0);
    const sloppy = seq.map((t) => ({ index: t.index, x: t.x + 0.08, y: t.y, reaction_ms: 900 }));
    expect((await api.submitTargetTaps(duelId, sloppy)).both_submitted).toBe(true);
    await api.resolveDuel(duelId);
    const data = await api.loadAll();
    const duel = data.duels.find((d) => d.id === duelId)!;
    expect(duel.status).toBe('finished');
    expect(duel.winner_id).toBe(GUILLEM);
    expect(data.targetResults.filter((x) => x.duel_id === duelId)).toHaveLength(2);
    await expect(api.submitMove(duelId, 'push')).rejects.toThrow();
  });

  it('chuchotements visibles des seuls destinataires', async () => {
    const api = new DemoApi();
    await as(api, GUILLEM);
    await api.postMessage('whisper', 'Rendez-vous au lavoir à minuit.', [JULIO]);
    await as(api, JULIO);
    expect((await api.loadTavern('whisper')).map((m) => m.content)).toContain('Rendez-vous au lavoir à minuit.');
    await as(api, TANGUY);
    expect(await api.loadTavern('whisper')).toHaveLength(0);
  });

  it("outils d'administration réservés à Guillem, partie persistée dans le stockage local", async () => {
    const api = new DemoApi();
    const token = await as(api, JULIO);
    await expect(api.listSnapshots()).rejects.toThrow(/administrateur/);
    await as(api, GUILLEM);
    await api.createSnapshot('Avant test');
    expect((await api.listSnapshots()).map((s) => s.label)).toContain('Avant test');

    const reopened = new DemoApi();
    reopened.setToken(token);
    expect((await reopened.loadAll()).me.id).toBe(JULIO);
  });
});
