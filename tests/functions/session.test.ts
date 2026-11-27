import { describe, expect, it } from 'vitest';
import { targetSequence, type AgoraProposal } from '../../src/engine/index.ts';
import { diffRows } from '../../supabase/functions/_shared/core/changes.ts';
import { createGm } from '../../supabase/functions/_shared/core/gm/runner.ts';
import { GameSession, sanitizeActionInput } from '../../supabase/functions/_shared/core/session.ts';
import type { GameState } from '../../supabase/functions/_shared/core/types.ts';
import { makeMigrant, playerId, seedSnapshot, structureId } from '../fixtures.ts';

const ELY = playerId(1);
const LERME = playerId(2);
const TIPH = playerId(3);
const ALEX = playerId(4);

function state(overrides: Partial<GameState> = {}): GameState {
  return { snapshot: seedSnapshot(), proposals: [], duels: [], moves: [], targetResults: [], chat: [], recentEvents: [], ...overrides };
}

function session(s: GameState, iso: string): GameSession {
  const gs = new GameSession(s, { now: new Date(iso), gm: createGm(null, { seed: 'test' }) });
  gs.tick();
  return gs;
}

function proposal(overrides: Partial<AgoraProposal>): AgoraProposal {
  return {
    id: 'p1', week_number: 1, proposer_id: LERME, kind: 'initiative', title: 'Fonds souverain norvégien',
    detailed_explanation: 'Placer 10 % de la caisse dans un fonds intergénérationnel.', category: 'economy', payload: {},
    target_migrant_id: null, target_player_id: null, required_majority: 'simple', votes_yes: [], votes_no: [],
    status: 'open', vetoed_by: null, closes_at: '2026-11-29T10:00:00.000Z', ai_execution_summary: null,
    executed_at: null, closed_at: null, ...overrides,
  };
}

describe('Écriture : diff & changements triviaux', () => {
  it('diffRows ne garde que les lignes modifiées ou nouvelles', () => {
    expect(diffRows([{ id: 'a', v: 1 }, { id: 'b', v: 1 }], [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 0 }], (r) => r.id).map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('sans minuit franchi : rien à écrire', () => {
    expect(session(state(), '2026-11-23T15:00:00Z').isTrivial()).toBe(true);
  });

  it('un jour écoulé : village et joueurs écrits, indicateurs cachés recalculés', () => {
    const s = state();
    s.snapshot.players[0]!.action_points = 0;
    const gs = session(s, '2026-11-24T08:00:00Z');
    expect(gs.isTrivial()).toBe(false);
    const payload = gs.commitPayload();
    expect(payload.village_state?.game_day).toBe(1);
    expect(payload.players?.some((p) => (p as { id: string }).id === ELY)).toBe(true);
    expect(payload.role_hidden_indicators?.length).toBe(12);
  });
});

describe('Agora : clôture, veto puis exécution', () => {
  it('clôture le dimanche 11:00 puis exécute après 6 h avec le Maître du Jeu', async () => {
    const s = state({ proposals: [proposal({ votes_yes: [ELY, LERME, TIPH, ALEX], votes_no: [playerId(5)] })] });
    const atClose = session(s, '2026-11-29T10:05:00Z');
    await atClose.maintainAgora();
    expect(atClose.state.proposals[0]!.status).toBe('passed');
    expect(atClose.tavern.some((t) => t.content.includes('ADOPTÉ'))).toBe(true);

    const later = session({ ...atClose.state }, '2026-11-29T16:30:00Z');
    await later.maintainAgora();
    const p = later.state.proposals[0]!;
    expect(p.executed_at).not.toBeNull();
    expect(later.snapshot.village.sovereign_fund_eur).toBeGreaterThan(0);
    expect(later.aiCalls[0]).toMatchObject({ call_kind: 'initiative', used_fallback: true });
    expect(later.commitPayload().agora_proposals?.length).toBe(1);
  });

  it('admission votée : le candidat devient résident', async () => {
    const s = state();
    s.snapshot.migrants.push(makeMigrant('m1', { status: 'candidate' }));
    s.proposals.push(proposal({ kind: 'migrant_admission', target_migrant_id: 'm1', status: 'passed', closed_at: '2026-11-29T10:00:00Z', votes_yes: [ELY, LERME] }));
    const gs = session(s, '2026-11-29T16:30:00Z');
    await gs.maintainAgora();
    expect(gs.snapshot.migrants[0]!.status).toBe('accepted');
  });
});

describe('Actions via la session', () => {
  it('Action Libre IA : PA dépensé, récit du Maître du Jeu, événement privé', async () => {
    const gs = session(state(), '2026-11-25T10:00:00Z');
    const r = await gs.action(LERME, { action_code: 'free_ai_action', free_text: 'Je négocie une remise de groupe chez BigMat.' });
    expect(r.ok).toBe(true);
    expect(String(r.narrative)).toContain('remise');
    expect(gs.snapshot.players[1]!.action_points).toBe(2);
    expect(gs.visibleEvents(LERME).some((e) => e.event_type === 'free_action_result')).toBe(true);
    expect(gs.visibleEvents(ELY).some((e) => e.event_type === 'free_action_result')).toBe(false);
  });

  it('le client ne peut ni usurper l\'acteur ni injecter un groupe d\'approbation', () => {
    const req = sanitizeActionInput({ action_code: 'rest', actor_id: ELY, params: { approval_group: 'x', reason: 'ok' } }, ALEX);
    expect(req?.actor_id).toBe(ALEX);
    expect(req?.params).toEqual({ reason: 'ok' });
  });

  it('verrou PLU : demande puis accord de Tiphaine qui exécute le chantier', async () => {
    const s = state();
    const borda = structureId(s.snapshot, 'borda_alta');
    const gs = session(s, '2026-11-25T10:00:00Z');
    const r = await gs.action(ALEX, { action_code: 'renovate_building', target_structure_id: borda });
    expect(r.status).toBe('pending_approval');
    const approvalId = gs.snapshot.approvals[0]!.id;
    const d = gs.decideApproval(TIPH, approvalId, true, null);
    expect(d).toMatchObject({ ok: true, executed: true });
    expect(gs.snapshot.structures.find((x) => x.id === borda)!.progress_pct).toBeGreaterThan(0);
  });
});

describe('Carlage 2×2 via la session', () => {
  it('duel amical : création puis résolution quand les deux coups sont déposés', () => {
    const gs = session(state(), '2026-11-25T10:00:00Z');
    const c = gs.challengeDuel(ELY, { targetPlayerId: LERME });
    expect(c.ok).toBe(true);
    const duelId = String(c.duel_id);
    gs.state.moves.push(
      { duel_id: duelId, round: 1, side: 'a', player_id: ELY, move: 'push', pivot_target: null },
      { duel_id: duelId, round: 1, side: 'b', player_id: LERME, move: 'anchor', pivot_target: null },
    );
    const r = gs.resolveDuel(duelId);
    const duel = gs.state.duels[0]!;
    expect(r.ok).toBe(true);
    expect(duel.current_round).toBe(2);
    expect(duel.player_b_balance).toBe(85);
    expect(duel.player_a_move).toBe('push');
  });

  it('manche en attente tant que l\'adversaire n\'a pas joué', () => {
    const gs = session(state(), '2026-11-25T10:00:00Z');
    const duelId = String(gs.challengeDuel(ELY, { targetPlayerId: LERME }).duel_id);
    gs.state.moves.push({ duel_id: duelId, round: 1, side: 'a', player_id: ELY, move: 'push', pivot_target: null });
    gs.resolveDuel(duelId);
    expect(gs.state.duels[0]!.current_round).toBe(1);
  });

  it('veto contesté et renversé : la décision est rétablie et exécutée', () => {
    const s = state({
      proposals: [proposal({ kind: 'rationing', payload: { active: true }, status: 'vetoed', vetoed_by: ELY, closed_at: '2026-11-29T10:00:00Z' })],
    });
    const gs = session(s, '2026-11-29T11:00:00Z');
    const duelId = String(gs.challengeDuel(LERME, { proposalId: 'p1' }).duel_id);
    expect(gs.state.duels[0]).toMatchObject({ context: 'veto', player_a_id: LERME, player_b_id: ELY, defender_side: 'b' });
    gs.state.moves.push(
      { duel_id: duelId, round: 1, side: 'a', player_id: LERME, move: 'push', pivot_target: null },
    );
    const late = new GameSession(gs.state, { now: new Date('2026-11-29T11:05:00Z'), gm: createGm(null, { seed: 't' }) });
    late.resolveDuel(duelId);
    expect(late.state.duels[0]!.status).toBe('finished');
    expect(late.state.duels[0]!.winner_id).toBe(LERME);
    expect(late.state.proposals[0]!.status).toBe('passed');
    expect(late.snapshot.village.rationing_active).toBe(true);
  });

  it('putsch dominical : épreuve de la cible contre le meneur, perdue si la Présidente ne joue pas avant 17:00', () => {
    const s = state();
    s.snapshot.village = { ...s.snapshot.village, faction_active: true, insecurity_offset: 50, left_wing_ideology_pct: 70, cultural_friction_pct: 60 };
    s.snapshot.migrants.push(makeMigrant('leader', { left_wing_score: 95, faction_type: 'union_agitator' }));
    s.snapshot.village.last_tick_at = '2026-11-28T20:00:00Z';
    const gs = session(s, '2026-11-29T06:00:00Z'); // dimanche matin
    const duel = gs.state.duels.find((d) => d.context === 'putsch');
    expect(duel).toMatchObject({ mode: 'target', opponent_migrant_id: 'leader', player_a_id: ELY, round_deadline_at: '2026-11-29T16:00:00.000Z' });
    const before = new GameSession(gs.state, { now: new Date('2026-11-29T11:30:00Z'), gm: createGm(null, { seed: 't' }) });
    expect(before.expireDuels()).toBe(0);
    const after = new GameSession(gs.state, { now: new Date('2026-11-29T16:05:00Z'), gm: createGm(null, { seed: 't' }) });
    expect(after.expireDuels()).toBe(1);
    expect(after.state.duels[0]).toMatchObject({ status: 'finished', winner_side: 'b' });
    expect(after.snapshot.village.collectivization_active).toBe(true);
  });

  it('épreuve de la cible amicale : chacun joue, le meilleur score l\'emporte', () => {
    const gs = session(state(), '2026-11-25T10:00:00Z');
    const c = gs.challengeDuel(ELY, { targetPlayerId: LERME, mode: 'target' });
    expect(c).toMatchObject({ ok: true, mode: 'target' });
    const duelId = String(c.duel_id);
    expect(gs.state.duels[0]!.round_deadline_at).toBe('2026-11-26T10:00:00.000Z');
    const targets = targetSequence(duelId);
    const perfect = targets.map((t) => ({ index: t.index, x: t.x, y: t.y, reaction_ms: 250 }));
    const sloppy = targets.map((t) => ({ index: t.index, x: t.x + 0.1, y: t.y, reaction_ms: 900 }));
    gs.state.targetResults.push({ duel_id: duelId, side: 'a', player_id: ELY, taps: perfect, submitted_at: '2026-11-25T10:01:00Z' });
    gs.resolveDuel(duelId);
    expect(gs.state.duels[0]!.status).toBe('active');
    gs.state.targetResults.push({ duel_id: duelId, side: 'b', player_id: LERME, taps: sloppy, submitted_at: '2026-11-25T12:00:00Z' });
    gs.resolveDuel(duelId);
    const duel = gs.state.duels[0]!;
    expect(duel).toMatchObject({ status: 'finished', winner_side: 'a', winner_id: ELY });
    expect((duel.result_json as { a: { total: number } }).a.total).toBeGreaterThan(450);
    expect(gs.tavern.some((t) => t.content.includes('Épreuve de la cible'))).toBe(true);
  });

  it('épreuve de la cible : un joueur blessé peut défier (aucun effort physique)', () => {
    const s = state();
    s.snapshot.players[0]!.injury_type = 'muscular';
    const gs = session(s, '2026-11-25T10:00:00Z');
    expect(gs.challengeDuel(ELY, { targetPlayerId: LERME, mode: 'carlage' }).ok).toBe(false);
    expect(gs.challengeDuel(ELY, { targetPlayerId: LERME, mode: 'target' }).ok).toBe(true);
  });

  it('seul le pôle Défense / Intérieur peut réprimer un putsch', () => {
    const gs = session(state(), '2026-11-25T10:00:00Z');
    expect(gs.repressPutsch(ELY, 'x').ok).toBe(false);
  });
});

describe('Nuit : monde réel, Gazette, migrants, tentations', () => {
  it('produit une Gazette, des dossiers soumis à l\'Agora et des tentations privées', async () => {
    const gs = session(state(), '2026-11-27T23:10:00Z');
    gs.applyWorld({ summary: 'Neige, 1°C / -4°C (Alt Urgell)', temp_max_c: 1, temp_min_c: -4, precip_mm: 3, snow_cm: 5 }, ['Titre réel du jour']);
    expect(gs.snapshot.village.real_snow_cm).toBe(5);
    expect(gs.snapshot.village.life?.market_quotes).toBeUndefined();
    gs.applyWorld(null, [], { world: { price: 127.23, prev: 125.82, date: '2026-11-27', history: [125.82, 127.23] } });
    expect(gs.snapshot.village.life?.market_quotes?.world?.updated_day).toBe('2026-11-28');
    expect(gs.snapshot.village.real_snow_cm).toBe(5);
    const gazette = await gs.writeGazette('2026-11-28', []);
    expect(gazette.generated_by).toBe('fallback');
    const migrants = await gs.generateMigrants(2);
    expect(migrants).toHaveLength(2);
    expect(gs.state.proposals.filter((p) => p.kind === 'migrant_admission')).toHaveLength(2);
    const temptations = await gs.generateTemptations(100);
    expect(temptations).toHaveLength(7);
    const payload = gs.commitPayload();
    expect(payload.gazette_editions).toHaveLength(1);
    expect(payload.village_migrants).toHaveLength(2);
    expect(payload.temptations).toHaveLength(7);
    expect(payload.ai_calls?.length).toBe(1 + 2 + 7);
    expect(payload.tavern_messages?.some((t) => t.content.startsWith('📰'))).toBe(true);
  });

  it('la Gazette du lundi publie le bilan de la semaine (V6.0)', async () => {
    const st = state();
    st.snapshot.village.last_tick_at = '2026-11-29T12:00:00.000Z';
    st.snapshot.village.life = { week_stats: { since: '2026-11-23', players: { [ELY]: { actions: 4, ap: 5, missions: 1, helps: 1, duos: 0, codes: { cut_wood: 4 } } } } };
    const gs = session(st, '2026-11-29T23:10:00Z');
    const gazette = await gs.writeGazette('2026-11-30', []);
    const section = gazette.sections.find((x) => x.title === 'Bilan de la semaine');
    expect(section?.items[0]).toMatch(/habitant de la semaine$/);
    expect(section?.items[1]).toContain('4 actions et 5 PA');
  });
});
