/**
 * Élection vivante d'un portefeuille vue par l'interface (V5.3) : phase, calendrier, candidats et
 * programmes, débat de la Taverne, mon bulletin, mandats en cours. Le vote est secret jusqu'au
 * dépouillement : on n'affiche que le nombre de votants.
 * Pur (aucun DOM) : testé dans tests/app/election.test.ts.
 */
import {
  constants as C,
  dayKey,
  electionPhase,
  electionSchedule,
  lifeOf,
  type Election,
  type ElectionPhase,
  type ElectionResult,
  type Portfolio,
} from '../engine.ts';
import type { GameData } from '../api/types.ts';

export interface ElectionCandidateView {
  id: string;
  name: string;
  emoji: string;
  color: string;
  program: string;
  speeches: number;
  mine: boolean;
  /** Mon bulletin va à ce candidat. */
  myChoice: boolean;
}

export interface ElectionView {
  election: Election | null;
  portfolio: Portfolio | null;
  title: string;
  phase: ElectionPhase | null;
  /** Phrase d'état (phase et échéance). */
  status: string;
  /** Dernier jour de la phase en cours (candidatures ou vote). */
  lastDay: boolean;
  candidates: ElectionCandidateView[];
  debate: { id: string; name: string; emoji: string; text: string; at: string; mine: boolean }[];
  amCandidate: boolean;
  canStand: boolean;
  /** Candidat et pas encore intervenu aujourd'hui. */
  canSpeak: boolean;
  canVote: boolean;
  myVote: string | null;
  voters: number;
  electors: number;
  last: ElectionResult | null;
  lastText: string | null;
  mandates: { portfolio: Portfolio; title: string; holder: string | null; untilDay: string }[];
}

/** 'YYYY-MM-DD' → « jeu. 26/11 ». */
export function shortDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return `${['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][wd]} ${d}/${m}`;
}

export function electionView(data: Pick<GameData, 'village' | 'players' | 'me'>, now: Date): ElectionView {
  const life = lifeOf(data.village);
  const e = life.election ?? null;
  const me = data.me;
  const pl = (id: string) => data.players.find((p) => p.id === id);
  const electors = data.players.filter((p) => p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor')).length;
  const phase = e ? electionPhase(e, now) : null;
  const today = dayKey(now);
  const myVote = e?.votes[me.id] ?? null;
  const candidates: ElectionCandidateView[] = (e?.candidates ?? []).map((c) => {
    const p = pl(c.player_id);
    return {
      id: c.player_id,
      name: p?.display_name ?? '?',
      emoji: p?.avatar_emoji ?? '🙂',
      color: p?.avatar_color ?? '#78716c',
      program: c.program,
      speeches: e!.debate.filter((d) => d.player_id === c.player_id).length,
      mine: c.player_id === me.id,
      myChoice: myVote === c.player_id,
    };
  });
  const amCandidate = candidates.some((c) => c.mine);
  const playing = me.is_active_slot && (me.status === 'active' || me.status === 'forced_labor') && !data.village.is_defeated;
  let status = '';
  let lastDay = false;
  if (e && phase) {
    const s = electionSchedule(e);
    lastDay = (phase === 'candidacy' && today === s.candidacyEnd) || (phase === 'vote' && today === s.voteEnd);
    if (phase === 'candidacy') status = `Candidatures jusqu'au ${shortDay(s.candidacyEnd)} au soir, puis vote jusqu'au ${shortDay(s.voteEnd)}.`;
    else if (phase === 'vote') status = candidates.length === 0 ? 'Aucun candidat : le portefeuille restera vacant une semaine.' : `Vote ouvert jusqu'au ${shortDay(s.voteEnd)} au soir ; dépouillement dans la nuit.`;
    else status = 'Dépouillement cette nuit.';
  }
  const last = life.election_last ?? null;
  let lastText: string | null = null;
  if (last) {
    const t = C.PORTFOLIO_TITLE[last.portfolio];
    const w = last.winner_id ? pl(last.winner_id)?.display_name ?? '?' : null;
    lastText = w ? `${t} : ${w} élu·e (${last.counts[last.winner_id!] ?? 0} voix, ${last.voters}/${last.electors} votants).` : `${t} : aucun candidat, élection reportée.`;
  }
  const mandates = C.ELECTION_ORDER.flatMap((p) => {
    const m = life.mandates?.[p];
    return m && m.player_id ? [{ portfolio: p, title: C.PORTFOLIO_TITLE[p], holder: pl(m.player_id)?.display_name ?? null, untilDay: m.until_day }] : [];
  });
  return {
    election: e,
    portfolio: e?.portfolio ?? null,
    title: e ? C.PORTFOLIO_TITLE[e.portfolio] : '',
    phase,
    status,
    lastDay,
    candidates,
    debate: (e?.debate ?? [])
      .map((d) => ({ id: d.player_id, name: pl(d.player_id)?.display_name ?? '?', emoji: pl(d.player_id)?.avatar_emoji ?? '🙂', text: d.text, at: d.at, mine: d.player_id === me.id }))
      .reverse(),
    amCandidate,
    canStand: !!e && playing && phase === 'candidacy' && !amCandidate && !me.ministerial_portfolios.includes(e.portfolio),
    canSpeak: !!e && playing && amCandidate && phase !== 'counting' && !e.debate.some((d) => d.player_id === me.id && dayKey(new Date(d.at)) === today),
    canVote: !!e && playing && phase === 'vote' && candidates.some((c) => !c.mine),
    myVote,
    voters: Object.keys(e?.votes ?? {}).length,
    electors,
    last,
    lastText,
    mandates,
  };
}
