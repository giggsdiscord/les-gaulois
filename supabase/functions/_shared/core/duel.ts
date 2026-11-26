/**
 * Orchestration des duels de Carlage 2×2 [GDD §6.1] autour du moteur (carlage.ts) :
 * conversion ligne SQL ↔ état du moteur, échéances, champions, blessures post-duel.
 */
import {
  canFightCarlage,
  migrantFighterStats,
  newDuelState,
  playerFighterStats,
  type DuelState,
  type FighterStats,
  type GameSnapshot,
  type MoveInput,
  type Player,
  type Side,
} from '../engine/index.ts';
import type { CarlageDuelRow, CarlageMoveRow } from './types.ts';

/** Délai pour rejoindre l'arène avant la 1re manche (les deux joueurs doivent être en ligne). */
export const JOIN_WINDOW_SECONDS = 120;
export const ROUND_SECONDS = 10;
/** Pause de révélation des coups entre deux manches. */
export const REVEAL_SECONDS = 3;
/** Délai de grâce réseau après l'échéance d'une manche. */
export const GRACE_SECONDS = 2;
/** Au-delà, un duel est considéré abandonné et résolu d'office par la maintenance. */
export const ABANDON_SECONDS = 60;

export interface NewDuelInput {
  id: string;
  context: CarlageDuelRow['context'];
  mode: CarlageDuelRow['mode'];
  proposalId: string | null;
  playerAId: string;
  playerBId: string | null;
  opponentMigrantId: string | null;
  defenderSide: Side;
  firstDeadline: Date;
  now: Date;
}

export function newDuelRow(input: NewDuelInput): CarlageDuelRow {
  const state = newDuelState(input.defenderSide);
  return {
    id: input.id,
    proposal_id: input.proposalId,
    context: input.context,
    mode: input.mode,
    player_a_id: input.playerAId,
    player_b_id: input.playerBId,
    opponent_migrant_id: input.opponentMigrantId,
    defender_side: input.defenderSide,
    current_round: 1,
    round_deadline_at: input.firstDeadline.toISOString(),
    player_a_pos: state.a_pos,
    player_b_pos: state.b_pos,
    player_a_balance: state.a_balance,
    player_b_balance: state.b_balance,
    player_a_move: null,
    player_b_move: null,
    round_log: [],
    winner_side: null,
    winner_id: null,
    injuries_json: null,
    result_json: null,
    status: 'active',
    created_at: input.now.toISOString(),
    finished_at: null,
  };
}

export function rowToDuelState(row: CarlageDuelRow): DuelState {
  const shocks = { a: false, b: false };
  for (const log of row.round_log) {
    if (log.a_slip || log.ring_out === 'a' || log.a_delta <= -30) shocks.a = true;
    if (log.b_slip || log.ring_out === 'b' || log.b_delta <= -30) shocks.b = true;
  }
  return {
    round: row.current_round,
    a_pos: row.player_a_pos,
    b_pos: row.player_b_pos,
    a_balance: row.player_a_balance,
    b_balance: row.player_b_balance,
    defender_side: row.defender_side,
    finished: row.status !== 'active',
    winner_side: row.winner_side,
    shocks,
    log: row.round_log,
  };
}

/** Recopie l'état du moteur dans la ligne SQL (coups révélés, prochaine échéance). */
export function applyDuelState(row: CarlageDuelRow, state: DuelState, now: Date): CarlageDuelRow {
  const last = state.log[state.log.length - 1];
  const next: CarlageDuelRow = {
    ...row,
    current_round: Math.min(5, state.round),
    player_a_pos: state.a_pos,
    player_b_pos: state.b_pos,
    player_a_balance: Math.round(state.a_balance),
    player_b_balance: Math.round(state.b_balance),
    player_a_move: last ? last.a_move : row.player_a_move,
    player_b_move: last ? last.b_move : row.player_b_move,
    round_log: state.log,
    round_deadline_at: new Date(now.getTime() + (REVEAL_SECONDS + ROUND_SECONDS) * 1000).toISOString(),
  };
  if (state.finished) {
    next.status = 'finished';
    next.winner_side = state.winner_side;
    next.winner_id = state.winner_side === 'a' ? row.player_a_id : state.winner_side === 'b' ? row.player_b_id : null;
    next.finished_at = now.toISOString();
  }
  return next;
}

export function movesForRound(moves: readonly CarlageMoveRow[], duelId: string, round: number): { a: MoveInput | null; b: MoveInput | null } {
  const pick = (side: Side): MoveInput | null => {
    const m = moves.find((x) => x.duel_id === duelId && x.round === round && x.side === side);
    return m ? { move: m.move, pivotTarget: m.pivot_target } : null;
  };
  return { a: pick('a'), b: pick('b') };
}

export function isRoundDue(row: CarlageDuelRow, now: Date): boolean {
  return now.getTime() >= new Date(row.round_deadline_at).getTime() + GRACE_SECONDS * 1000;
}

export function isAbandoned(row: CarlageDuelRow, now: Date): boolean {
  return now.getTime() >= new Date(row.round_deadline_at).getTime() + ABANDON_SECONDS * 1000;
}

export function fighterStats(s: GameSnapshot, row: CarlageDuelRow): { a: FighterStats; b: FighterStats } {
  const playerA = s.players.find((p) => p.id === row.player_a_id);
  const playerB = s.players.find((p) => p.id === row.player_b_id);
  const npc = s.migrants.find((m) => m.id === row.opponent_migrant_id);
  const neutral: FighterStats = { strength: 1, impaired: false };
  return {
    a: playerA ? playerFighterStats(playerA, s.village) : neutral,
    b: playerB ? playerFighterStats(playerB, s.village) : npc ? migrantFighterStats(npc) : neutral,
  };
}

/** Champion le plus en forme (santé + mentale), à défaut d'un combattant apte. */
export function pickChampion(s: GameSnapshot, now: Date, excludeIds: readonly string[]): Player | undefined {
  return s.players
    .filter((p) => !excludeIds.includes(p.id) && canFightCarlage(p, now))
    .sort((x, y) => y.health_pct + y.mental_health_pct - (x.health_pct + x.mental_health_pct) || x.slot_number - y.slot_number)[0];
}
