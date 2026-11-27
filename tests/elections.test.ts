/** Élections vivantes des portefeuilles (V5.3) : ouverture, candidatures, débat, vote, dépouillement, mandat. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  electionDue,
  electionPhase,
  lifeOf,
  performAction,
  tallyElection,
  type Election,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

// Ouverture le mercredi 25/11 : candidatures 25-27, vote 28-29, dépouillement la nuit du 29 au 30.
const OPENED = '2026-11-25';
const THURSDAY = new Date('2026-11-26T10:00:00Z');
const SATURDAY = new Date('2026-11-28T10:00:00Z');
const ELY = playerId(1);
const LERME = playerId(2);
const TIPH = playerId(3);
const ALEX = playerId(4);

function actII(): GameSnapshot {
  return seedSnapshot({ act_number: 2 });
}

function withElection(extra: Partial<Election> = {}, s: GameSnapshot = actII()): GameSnapshot {
  s.village.life = { ...(s.village.life ?? {}), election: { portfolio: 'defense', opened_day: OPENED, candidates: [], debate: [], votes: {}, ...extra } };
  return s;
}

const act = (s: GameSnapshot, actor: string, code: string, params: Record<string, unknown>, now: Date) =>
  performAction(s, { action_code: code, actor_id: actor, params }, now);

const PROGRAM = 'Des rondes chaque nuit et une herse neuve sur la piste.';

describe('Ouverture', () => {
  it('rien à l\'Acte I ; à l\'Acte II la Défense d\'abord, puis les autres portefeuilles vacants', () => {
    expect(electionDue(seedSnapshot(), OPENED)).toBeNull();
    const s = actII();
    expect(electionDue(s, OPENED)).toBe('defense');
    s.village.life = { mandates: { defense: { player_id: ELY, since: '2026-11-01T00:00:00Z', until_day: '2026-12-20', program: null } } };
    expect(electionDue(s, OPENED)).toBe('interior');
  });

  it('une place 8 occupée tient Défense et Intérieur : on passe aux Douanes', () => {
    const s = actII();
    s.players.find((p) => p.slot_number === 8)!.is_active_slot = true;
    expect(electionDue(s, OPENED)).toBe('customs');
  });

  it('mandat expiré ou titulaire parti : nouvelle élection', () => {
    const s = actII();
    s.village.life = { mandates: { defense: { player_id: ELY, since: '2026-10-01T00:00:00Z', until_day: OPENED, program: null } } };
    expect(electionDue(s, OPENED)).toBe('defense');
    s.village.life.mandates!.defense!.until_day = '2026-12-20';
    s.players.find((p) => p.id === ELY)!.status = 'banished';
    expect(electionDue(s, OPENED)).toBe('defense');
  });

  it('la nuit ouvre l\'élection et l\'annonce', () => {
    const s = actII();
    s.village.last_tick_at = '2026-11-24T20:00:00Z';
    const out = applyElapsedTime(s, new Date('2026-11-25T08:00:00Z'));
    const e = lifeOf(out.snapshot.village).election!;
    expect(e.portfolio).toBe('defense');
    expect(e.opened_day).toBe(OPENED);
    expect(out.events.some((ev) => ev.event_type === 'election_opened')).toBe(true);
  });
});

describe('Candidatures et débat', () => {
  it('candidature avec programme pendant la phase, refus ensuite', () => {
    const s = withElection();
    expect(act(s, ELY, 'run_for_office', { program: 'trop court' }, THURSDAY).status).toBe('refused');
    const ok = act(s, ELY, 'run_for_office', { program: PROGRAM }, THURSDAY);
    expect(ok.status).toBe('done');
    expect(ok.ap_spent).toBe(1);
    expect(lifeOf(ok.snapshot.village).election!.candidates[0]!.program).toBe(PROGRAM);
    expect(act(ok.snapshot, ELY, 'run_for_office', { program: PROGRAM }, THURSDAY).status).toBe('refused');
    expect(act(s, LERME, 'run_for_office', { program: PROGRAM }, SATURDAY).status).toBe('refused');
  });

  it('débat : candidats seulement, une fois par jour, la 1re du jour anime la place', () => {
    const s = withElection({ candidates: [{ player_id: ELY, program: PROGRAM, at: '2026-11-25T09:00:00Z' }] });
    expect(act(s, LERME, 'campaign_speech', { text: 'Je ne suis pas candidat.' }, THURSDAY).status).toBe('refused');
    const a = act(s, ELY, 'campaign_speech', { text: 'Votez pour la sécurité !' }, THURSDAY);
    expect(a.status).toBe('done');
    expect(a.snapshot.village.morale_pct).toBe(s.village.morale_pct + C.ELECTION_SPEECH_MORALE);
    expect(act(a.snapshot, ELY, 'campaign_speech', { text: 'Encore une fois, votez !' }, THURSDAY).status).toBe('refused');
  });
});

describe('Vote et dépouillement', () => {
  const two = (): GameSnapshot =>
    withElection({
      candidates: [
        { player_id: ELY, program: PROGRAM, at: '2026-11-25T09:00:00Z' },
        { player_id: TIPH, program: 'Un mirador par ruine, des clôtures partout.', at: '2026-11-25T10:00:00Z' },
      ],
    });

  it('vote seulement pendant la phase de vote, jamais pour soi', () => {
    const s = two();
    expect(electionPhase(lifeOf(s.village).election!, THURSDAY)).toBe('candidacy');
    expect(act(s, LERME, 'vote_election', { candidate: ELY }, THURSDAY).status).toBe('refused');
    expect(act(s, ELY, 'vote_election', { candidate: ELY }, SATURDAY).status).toBe('refused');
    const v = act(s, LERME, 'vote_election', { candidate: TIPH }, SATURDAY);
    expect(v.status).toBe('done');
    expect(v.ap_spent).toBe(0);
    expect(lifeOf(v.snapshot.village).election!.votes[LERME]).toBe(TIPH);
  });

  it('égalité : le plus présent au débat l\'emporte, sinon la candidature la plus ancienne', () => {
    const e = lifeOf(two().village).election!;
    expect(tallyElection({ ...e, votes: { [LERME]: ELY, [ALEX]: TIPH } }).winner).toBe(ELY);
    expect(tallyElection({ ...e, votes: { [LERME]: ELY, [ALEX]: TIPH }, debate: [{ player_id: TIPH, text: 'x', at: '' }] }).winner).toBe(TIPH);
    expect(tallyElection({ ...e, votes: { [LERME]: TIPH } }).winner).toBe(TIPH);
  });

  it('la nuit après le vote : portefeuille, mandat, XP, moral si forte participation', () => {
    const s = two();
    const votes: Record<string, string> = { [LERME]: TIPH, [ALEX]: TIPH, [playerId(5)]: TIPH, [TIPH]: ELY };
    lifeOf(s.village).election!.votes = votes;
    s.village.last_tick_at = '2026-11-29T20:00:00Z';
    const xp = s.players.find((p) => p.id === TIPH)!.skill_xp;
    const out = applyElapsedTime(s, new Date('2026-11-30T08:00:00Z'));
    const life = lifeOf(out.snapshot.village);
    const tiph = out.snapshot.players.find((p) => p.id === TIPH)!;
    expect(tiph.ministerial_portfolios).toContain('defense');
    expect(tiph.skill_xp).toBeGreaterThanOrEqual(xp + C.ELECTION_WINNER_XP);
    expect(life.mandates?.defense?.player_id).toBe(TIPH);
    expect(life.election_last?.counts[TIPH]).toBe(3);
    expect(out.events.some((ev) => ev.event_type === 'election_result')).toBe(true);
    // La suivante (Intérieur) s'ouvre aussitôt
    expect(life.election?.portfolio).toBe('interior');
    // La place 8 vacante garde ses portefeuilles « de fonction » (inactive)
    expect(out.snapshot.players.find((p) => p.slot_number === 8)!.ministerial_portfolios).toContain('defense');
  });

  it('pas avant la fin du vote ; sans candidat : report d\'une semaine', () => {
    const s = withElection();
    s.village.last_tick_at = '2026-11-27T20:00:00Z';
    const mid = applyElapsedTime(s, new Date('2026-11-28T08:00:00Z'));
    expect(lifeOf(mid.snapshot.village).election?.portfolio).toBe('defense');
    const s2 = withElection();
    s2.village.last_tick_at = '2026-11-29T20:00:00Z';
    const out = applyElapsedTime(s2, new Date('2026-11-30T08:00:00Z'));
    const life = lifeOf(out.snapshot.village);
    expect(life.mandates?.defense?.player_id).toBeNull();
    expect(out.events.some((ev) => ev.event_type === 'election_void')).toBe(true);
    expect(life.election?.portfolio).toBe('interior');
  });

  it('une motion ministry_election vaut mandat et annule l\'élection du même portefeuille', async () => {
    const { executeProposal, createRng, emptyEffects } = await import('../src/engine/index.ts');
    const s = withElection();
    const proposal = {
      id: 'p1', week_number: 1, proposer_id: LERME, kind: 'ministry_election', title: 'Élection', detailed_explanation: 'Alex à la Défense.', category: 'politics',
      payload: { portfolio: 'defense' }, target_migrant_id: null, target_player_id: ALEX, required_majority: 'simple', votes_yes: [], votes_no: [],
      status: 'passed', vetoed_by: null, closes_at: '2026-11-22T10:00:00Z', ai_execution_summary: null, executed_at: null, closed_at: '2026-11-22T10:00:00Z',
    } as never;
    executeProposal(s, emptyEffects(), createRng('x'), proposal, THURSDAY);
    const life = lifeOf(s.village);
    expect(life.election).toBeNull();
    expect(life.mandates?.defense?.player_id).toBe(ALEX);
    expect(s.players.find((p) => p.id === ALEX)!.ministerial_portfolios).toContain('defense');
  });
});
