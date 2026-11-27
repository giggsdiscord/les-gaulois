/**
 * Élections vivantes des portefeuilles [GDD §2.2, V5.3] : tant qu'une place à temps plein (8 à 10)
 * est vacante, ses portefeuilles débloqués sont mis en jeu un à un — candidatures avec programme,
 * débat à la Taverne, vote, puis mandat de quelques semaines. État dans `village_state.life`.
 */
import { addDaysToKey, dayKey } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { gauge } from './math.ts';
import { activePlayers, findPlayer } from './population.ts';
import type { Election, EngineEffects, GameSnapshot, Mandate, Player, Portfolio, VillageState } from './types.ts';
import { portfolioUnlocked } from './permissions.ts';

export type ElectionPhase = 'candidacy' | 'vote' | 'counting';

/** Élection en cours (null s'il n'y en a pas). */
export function currentElection(v: Pick<VillageState, 'life'>): Election | null {
  return lifeOf(v).election ?? null;
}

/** Dernier jour de candidature et dernier jour de vote d'une élection. */
export function electionSchedule(e: Pick<Election, 'opened_day'>): { candidacyEnd: string; voteStart: string; voteEnd: string } {
  const voteStart = addDaysToKey(e.opened_day, C.ELECTION_CANDIDACY_DAYS);
  return { candidacyEnd: addDaysToKey(voteStart, -1), voteStart, voteEnd: addDaysToKey(voteStart, C.ELECTION_VOTE_DAYS - 1) };
}

/** Phase selon le jour local : candidatures, vote, puis dépouillement la nuit suivante. */
export function electionPhase(e: Pick<Election, 'opened_day'>, now: Date): ElectionPhase {
  const today = dayKey(now);
  const { voteStart, voteEnd } = electionSchedule(e);
  if (today < voteStart) return 'candidacy';
  if (today <= voteEnd) return 'vote';
  return 'counting';
}

/** Le portefeuille est-il tenu à temps plein par une place 8 à 10 occupée ? */
export function heldFullTime(s: Pick<GameSnapshot, 'players'>, portfolio: Portfolio): boolean {
  const role = C.FULL_TIME_ROLE_OF[portfolio];
  return s.players.some((p) => p.role_code === role && p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor'));
}

/** Titulaire élu (ou nommé par motion) d'un portefeuille, s'il joue encore. */
export function mandateHolder(s: GameSnapshot, portfolio: Portfolio): Player | undefined {
  const id = lifeOf(s.village).mandates?.[portfolio]?.player_id;
  const p = id ? findPlayer(s, id) : undefined;
  return p && activePlayers(s).includes(p) ? p : undefined;
}

/** Premier portefeuille à mettre en jeu ce jour-là, ou null. */
export function electionDue(s: GameSnapshot, day: string): Portfolio | null {
  const mandates = lifeOf(s.village).mandates ?? {};
  for (const portfolio of C.ELECTION_ORDER) {
    if (!portfolioUnlocked(s.village.act_number, portfolio)) continue;
    if (heldFullTime(s, portfolio)) continue;
    const m = mandates[portfolio];
    if (m && m.until_day > day && (m.player_id === null || mandateHolder(s, portfolio))) continue;
    return portfolio;
  }
  return null;
}

/** Les voix par candidat ; gagnant = plus de voix, puis plus de prises de parole, puis candidature la plus ancienne. */
export function tallyElection(e: Election): { winner: string | null; counts: Record<string, number>; voters: number } {
  const counts: Record<string, number> = Object.fromEntries(e.candidates.map((c) => [c.player_id, 0]));
  let voters = 0;
  for (const choice of Object.values(e.votes)) {
    if (choice in counts) {
      counts[choice] = (counts[choice] ?? 0) + 1;
      voters += 1;
    }
  }
  const speeches = (id: string) => e.debate.filter((d) => d.player_id === id).length;
  let winner: string | null = null;
  for (const c of e.candidates) {
    const id = c.player_id;
    if (winner === null) winner = id;
    else if ((counts[id] ?? 0) > (counts[winner] ?? 0) || ((counts[id] ?? 0) === (counts[winner] ?? 0) && speeches(id) > speeches(winner))) winner = id;
  }
  return { winner, counts, voters };
}

/** Confie un portefeuille (le retire aux autres non-titulaires à temps plein) et note le mandat. */
export function grantPortfolio(s: GameSnapshot, portfolio: Portfolio, winner: Player | undefined, now: Date, program: string | null): void {
  for (const player of s.players) {
    if (player.role_code === 'defense_sec' || player.role_code === 'transport_customs' || player.role_code === 'legal_media') continue;
    player.ministerial_portfolios = player.ministerial_portfolios.filter((x) => x !== portfolio);
  }
  if (winner && !winner.ministerial_portfolios.includes(portfolio)) winner.ministerial_portfolios = [...winner.ministerial_portfolios, portfolio];
  const life = ensureLife(s.village);
  const mandate: Mandate = { player_id: winner?.id ?? null, since: now.toISOString(), until_day: addDaysToKey(dayKey(now), 7 * C.ELECTION_MANDATE_WEEKS), program };
  life.mandates = { ...(life.mandates ?? {}), [portfolio]: mandate };
  if (life.election?.portfolio === portfolio) life.election = null;
}

/** Ouvre l'élection d'un portefeuille (jour local `day`). */
export function openElection(s: GameSnapshot, fx: EngineEffects, portfolio: Portfolio, day: string): Election {
  const e: Election = { portfolio, opened_day: day, candidates: [], debate: [], votes: {} };
  ensureLife(s.village).election = e;
  const { candidacyEnd, voteEnd } = electionSchedule(e);
  const fullTime = s.players.find((p) => p.role_code === C.FULL_TIME_ROLE_OF[portfolio]);
  pushEvent(fx, s, {
    event_type: 'election_opened',
    title: `Élection : ${C.PORTFOLIO_TITLE[portfolio]}`,
    body: `🗳️ ${fullTime ? `La place ${fullTime.slot_number} est vacante : ` : ''}le portefeuille est mis en jeu. Candidatures avec programme jusqu'au ${frDay(candidacyEnd)}, débat à la Taverne, vote jusqu'au ${frDay(voteEnd)}. Mandat de ${C.ELECTION_MANDATE_WEEKS} semaines.`,
    data: { portfolio, opened_day: day },
  });
  return e;
}

function frDay(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(d)}/${Number(m)}`;
}

/** Dépouille l'élection en cours : mandat au gagnant, ou report faute de candidat. */
export function closeElection(s: GameSnapshot, fx: EngineEffects, now: Date): void {
  const life = ensureLife(s.village);
  const e = life.election;
  if (!e) return;
  const title = C.PORTFOLIO_TITLE[e.portfolio];
  const electors = activePlayers(s).length;
  const active = new Set(activePlayers(s).map((p) => p.id));
  const live: Election = { ...e, candidates: e.candidates.filter((c) => active.has(c.player_id)) };
  const { winner, counts, voters } = tallyElection(live);
  const elected = winner ? findPlayer(s, winner) : undefined;
  if (!elected) {
    life.mandates = {
      ...(life.mandates ?? {}),
      [e.portfolio]: { player_id: null, since: now.toISOString(), until_day: addDaysToKey(dayKey(now), C.ELECTION_POSTPONE_DAYS), program: null },
    };
    pushEvent(fx, s, {
      event_type: 'election_void',
      title: `Élection sans candidat : ${title}`,
      body: `🗳️ Personne ne s'est présenté : le portefeuille reste vacant, nouvelle élection dans ${C.ELECTION_POSTPONE_DAYS} jours.`,
      data: { portfolio: e.portfolio },
    });
  } else {
    const program = live.candidates.find((c) => c.player_id === elected.id)?.program ?? null;
    grantPortfolio(s, e.portfolio, elected, now, program);
    elected.skill_xp += C.ELECTION_WINNER_XP;
    const turnout = electors > 0 ? voters / electors : 0;
    let extra = '';
    if (turnout >= C.ELECTION_TURNOUT_MIN) {
      s.village.morale_pct = gauge(s.village.morale_pct + C.ELECTION_TURNOUT_MORALE);
      extra = ` Belle participation : moral +${C.ELECTION_TURNOUT_MORALE} %.`;
    }
    const score = live.candidates.length > 1
      ? live.candidates.map((c) => `${findPlayer(s, c.player_id)?.display_name ?? '?'} ${counts[c.player_id] ?? 0}`).join(', ')
      : 'seul candidat';
    pushEvent(fx, s, {
      event_type: 'election_result',
      title: `${elected.display_name} élu·e : ${title}`,
      body: `🗳️ ${score} — ${voters}/${electors} votant(s). Mandat de ${C.ELECTION_MANDATE_WEEKS} semaines.${program ? ` Programme : « ${program} »` : ''}${extra}`,
      data: { portfolio: e.portfolio, winner_id: elected.id, counts, voters, electors },
    });
  }
  life.election_last = { portfolio: e.portfolio, closed_day: dayKey(now), winner_id: elected?.id ?? null, counts, voters, electors };
  life.election = null;
}

/** Chaque nuit : dépouille l'élection arrivée à terme, puis ouvre la suivante si un portefeuille est à pourvoir. */
export function processElections(s: GameSnapshot, fx: EngineEffects, endedKey: string, midnight: Date): void {
  const e = lifeOf(s.village).election;
  if (e) {
    if (endedKey < electionSchedule(e).voteEnd) return;
    closeElection(s, fx, midnight);
  }
  const day = addDaysToKey(endedKey, 1);
  const due = electionDue(s, day);
  if (due) openElection(s, fx, due, day);
}

// ---------------------------------------------------------------------------
// Gestes des joueurs (appelés par les actions)
// ---------------------------------------------------------------------------
function cleanText(raw: unknown): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, C.ELECTION_TEXT_MAX);
}

export function standForElection(s: GameSnapshot, player: Player, rawProgram: unknown, now: Date): Election {
  const e = currentElection(s.village);
  if (!e) throw new Error('Aucune élection en cours.');
  if (electionPhase(e, now) !== 'candidacy') throw new Error('Les candidatures sont closes : place au vote.');
  if (e.candidates.some((c) => c.player_id === player.id)) throw new Error('Vous êtes déjà candidat·e.');
  if (player.ministerial_portfolios.includes(e.portfolio)) throw new Error('Vous tenez déjà ce portefeuille.');
  const program = cleanText(rawProgram);
  if (program.length < C.ELECTION_PROGRAM_MIN) throw new Error(`Votre programme doit faire au moins ${C.ELECTION_PROGRAM_MIN} caractères.`);
  e.candidates = [...e.candidates, { player_id: player.id, program, at: now.toISOString() }];
  return e;
}

/** Prise de parole d'un candidat au débat (une par jour) ; renvoie true si c'est la première du jour au hameau. */
export function speakAtDebate(s: GameSnapshot, player: Player, rawText: unknown, now: Date): boolean {
  const e = currentElection(s.village);
  if (!e) throw new Error('Aucune élection en cours.');
  if (electionPhase(e, now) === 'counting') throw new Error('Le débat est clos : dépouillement cette nuit.');
  if (!e.candidates.some((c) => c.player_id === player.id)) throw new Error('Seuls les candidats prennent la parole au débat : présentez-vous d\'abord.');
  const today = dayKey(now);
  if (e.debate.some((d) => d.player_id === player.id && dayKey(new Date(d.at)) === today)) throw new Error('Vous avez déjà pris la parole aujourd\'hui.');
  const text = cleanText(rawText);
  if (text.length < C.ELECTION_SPEECH_MIN) throw new Error(`Votre intervention doit faire au moins ${C.ELECTION_SPEECH_MIN} caractères.`);
  const first = !e.debate.some((d) => dayKey(new Date(d.at)) === today);
  e.debate = [...e.debate, { player_id: player.id, text, at: now.toISOString() }];
  return first;
}

export function castElectionVote(s: GameSnapshot, player: Player, rawCandidate: unknown, now: Date): Player {
  const e = currentElection(s.village);
  if (!e) throw new Error('Aucune élection en cours.');
  if (electionPhase(e, now) !== 'vote') throw new Error(electionPhase(e, now) === 'candidacy' ? 'Le vote n\'est pas encore ouvert : candidatures en cours.' : 'Le vote est clos.');
  const id = String(rawCandidate ?? '').trim();
  if (!e.candidates.some((c) => c.player_id === id)) throw new Error('Ce joueur n\'est pas candidat.');
  if (id === player.id) throw new Error('On ne vote pas pour soi-même.');
  if (e.votes[player.id] === id) throw new Error('Vous avez déjà voté pour ce candidat.');
  const target = findPlayer(s, id);
  if (!target) throw new Error('Candidat introuvable.');
  e.votes = { ...e.votes, [player.id]: id };
  return target;
}
