/**
 * Mini-jeu du Carlage 2×2 [GDD §6.1] — résolution déterministe d'une manche simultanée.
 * Grille de 4 carreaux (TL, TR, BL, BR), départ en diagonale, 100 points d'équilibre,
 * 5 manches de 10 s maximum. Sortie du carré = défaite immédiate ; équilibre à 0 = chute.
 *
 * Matrice de résolution V3.8 (x contre y) :
 *  - Pousser / Pousser      : épreuve de force ; écart de puissance ≥ 25 → le plus faible sort, sinon −20 chacun
 *  - Pousser / Pivoter      : poussée dans le vide, x −30 ; y se déplace (−5)
 *  - Pousser / Ancrer       : recul divisé par deux (y −15) et contre-poussée (x −20)
 *  - Pousser / Épaule       : si y glisse (35 %) → y −30 et sort ; sinon l'épaule double la projection → x sort
 *  - Pivoter / Pivoter      : chacun se déplace (−5) ; même carreau visé → collision, −10 chacun
 *  - Pivoter / Ancrer       : x se déplace (−5), y récupère +10
 *  - Pivoter / Épaule       : épaule dans le vide, y −30 (−60 s'il glisse)
 *  - Ancrer / Ancrer        : +10 chacun
 *  - Ancrer / Épaule        : si y glisse → y −30 ; sinon double projection ÷ 2 = projection simple → x sort
 *  - Épaule / Épaule        : un seul glisse → il est projeté ; les deux → −30 chacun ; aucun → −40 chacun
 *  - Absence de coup (délai dépassé) : le combattant reste planté, sans défense.
 */
import * as C from './constants.ts';
import { alcoholTier } from './formulas.ts';
import { clamp } from './math.ts';
import type { Rng } from './rng.ts';
import type { Migrant, Player, VillageState } from './types.ts';

export type Cell = 'TL' | 'TR' | 'BL' | 'BR';
export type CarlageMove = 'push' | 'pivot' | 'anchor' | 'shoulder';
export type Side = 'a' | 'b';

export interface MoveInput {
  move: CarlageMove | null;
  pivotTarget?: Cell | null;
}

export interface FighterStats {
  /** Facteur de puissance (≈ 0,5 à 1,3). */
  strength: number;
  /** Sous l'emprise de l'alcool ou de drogues. */
  impaired: boolean;
}

export interface RoundLog {
  round: number;
  a_move: CarlageMove | 'none';
  b_move: CarlageMove | 'none';
  a_pivot: Cell | null;
  b_pivot: Cell | null;
  a_slip: boolean;
  b_slip: boolean;
  a_delta: number;
  b_delta: number;
  ring_out: Side | null;
  narrative: string;
}

export interface DuelState {
  round: number;
  a_pos: Cell;
  b_pos: Cell;
  a_balance: number;
  b_balance: number;
  defender_side: Side;
  finished: boolean;
  winner_side: Side | null;
  shocks: { a: boolean; b: boolean };
  log: RoundLog[];
}

const ADJACENT: Record<Cell, readonly Cell[]> = {
  TL: ['TR', 'BL'],
  TR: ['TL', 'BR'],
  BL: ['TL', 'BR'],
  BR: ['TR', 'BL'],
};

export function adjacentCells(cell: Cell): readonly Cell[] {
  return ADJACENT[cell];
}

export function newDuelState(defenderSide: Side = 'a'): DuelState {
  return {
    round: 1,
    a_pos: 'TL',
    b_pos: 'BR',
    a_balance: C.CARLAGE_START_BALANCE,
    b_balance: C.CARLAGE_START_BALANCE,
    defender_side: defenderSide,
    finished: false,
    winner_side: null,
    shocks: { a: false, b: false },
    log: [],
  };
}

export function playerFighterStats(p: Player, v: VillageState): FighterStats {
  return {
    strength: clamp(0.6 + (p.health_pct / 100) * 0.6 - p.fatigue_pct / 250, 0.4, 1.3),
    impaired: p.addiction_level_pct > C.ADDICTION_WITHDRAWAL_THRESHOLD || (alcoholTier(v.alcohol_consumption_pct) >= 3 && p.addiction_level_pct > 20),
  };
}

export function migrantFighterStats(m: Migrant): FighterStats {
  return {
    strength: clamp(0.5 + (m.physical_strength / 100) * 0.8, 0.4, 1.3),
    impaired: m.addiction_level_pct > C.ADDICTION_WITHDRAWAL_THRESHOLD,
  };
}

type Mv = CarlageMove | 'none';

interface PairOutcome {
  dx: number;
  dy: number;
  ringX: boolean;
  ringY: boolean;
  moveX: boolean;
  moveY: boolean;
  collision: boolean;
}

function resolvePair(
  x: Mv, y: Mv, slipX: boolean, slipY: boolean, powerX: number, powerY: number,
  sameTarget: boolean,
): PairOutcome {
  const o: PairOutcome = { dx: 0, dy: 0, ringX: false, ringY: false, moveX: false, moveY: false, collision: false };
  const key = `${x}|${y}`;
  switch (key) {
    case 'push|push':
      if (Math.abs(powerX - powerY) >= C.CARLAGE_CLASH_DECISIVE_GAP) {
        if (powerX > powerY) o.ringY = true;
        else o.ringX = true;
      } else {
        o.dx = -C.CARLAGE_CLASH_DAMAGE;
        o.dy = -C.CARLAGE_CLASH_DAMAGE;
      }
      break;
    case 'push|pivot':
      o.dx = -C.CARLAGE_VOID_PENALTY;
      o.dy = -C.CARLAGE_PIVOT_EFFORT;
      o.moveY = true;
      break;
    case 'push|anchor':
      o.dy = -C.CARLAGE_ANCHOR_RECOIL;
      o.dx = -C.CARLAGE_COUNTER_PUSH;
      break;
    case 'push|shoulder':
      if (slipY) {
        o.dy = -C.CARLAGE_VOID_PENALTY;
        o.ringY = true;
      } else {
        o.ringX = true;
      }
      break;
    case 'push|none':
      o.ringY = true;
      break;
    case 'pivot|pivot':
      if (sameTarget) {
        o.collision = true;
        o.dx = -C.CARLAGE_COLLISION;
        o.dy = -C.CARLAGE_COLLISION;
      } else {
        o.moveX = true;
        o.moveY = true;
        o.dx = -C.CARLAGE_PIVOT_EFFORT;
        o.dy = -C.CARLAGE_PIVOT_EFFORT;
      }
      break;
    case 'pivot|anchor':
      o.moveX = true;
      o.dx = -C.CARLAGE_PIVOT_EFFORT;
      o.dy = C.CARLAGE_ANCHOR_RECOVERY;
      break;
    case 'pivot|shoulder':
      o.moveX = true;
      o.dx = -C.CARLAGE_PIVOT_EFFORT;
      o.dy = -C.CARLAGE_VOID_PENALTY - (slipY ? C.CARLAGE_VOID_PENALTY : 0);
      break;
    case 'pivot|none':
      o.moveX = true;
      o.dx = -C.CARLAGE_PIVOT_EFFORT;
      break;
    case 'anchor|anchor':
      o.dx = C.CARLAGE_ANCHOR_RECOVERY;
      o.dy = C.CARLAGE_ANCHOR_RECOVERY;
      break;
    case 'anchor|shoulder':
      if (slipY) o.dy = -C.CARLAGE_VOID_PENALTY;
      else o.ringX = true;
      break;
    case 'anchor|none':
      o.dx = C.CARLAGE_ANCHOR_RECOVERY;
      break;
    case 'shoulder|shoulder':
      if (slipX && !slipY) o.ringX = true;
      else if (slipY && !slipX) o.ringY = true;
      else if (slipX && slipY) {
        o.dx = -C.CARLAGE_VOID_PENALTY;
        o.dy = -C.CARLAGE_VOID_PENALTY;
      } else {
        o.dx = -C.CARLAGE_DOUBLE_SHOULDER;
        o.dy = -C.CARLAGE_DOUBLE_SHOULDER;
      }
      break;
    case 'shoulder|none':
      if (slipX) o.dx = -C.CARLAGE_VOID_PENALTY;
      else o.ringY = true;
      break;
    case 'none|none':
      break;
    default: {
      // Cas symétriques : on inverse les rôles
      const r = resolvePair(y, x, slipY, slipX, powerY, powerX, sameTarget);
      return { dx: r.dy, dy: r.dx, ringX: r.ringY, ringY: r.ringX, moveX: r.moveY, moveY: r.moveX, collision: r.collision };
    }
  }
  return o;
}

const MOVE_LABEL: Record<Mv, string> = {
  push: 'pousse',
  pivot: 'pivote',
  anchor: 's\'ancre',
  shoulder: 'charge à l\'épaule',
  none: 'reste figé',
};

function normalize(input: MoveInput, own: Cell, other: Cell): { move: Mv; target: Cell | null } {
  if (!input.move) return { move: 'none', target: null };
  if (input.move === 'pivot') {
    const t = input.pivotTarget ?? null;
    if (!t || t === other || !ADJACENT[own].includes(t)) return { move: 'none', target: null };
    return { move: 'pivot', target: t };
  }
  return { move: input.move, target: null };
}

/** Résout une manche ; renvoie un nouvel état (l'entrée n'est pas modifiée). */
export function resolveRound(state: DuelState, a: MoveInput, b: MoveInput, stats: { a: FighterStats; b: FighterStats }, rng: Rng): DuelState {
  if (state.finished) return state;
  const next: DuelState = { ...state, shocks: { ...state.shocks }, log: [...state.log] };
  const na = normalize(a, state.a_pos, state.b_pos);
  const nb = normalize(b, state.b_pos, state.a_pos);
  const slipRisk = (impaired: boolean) => C.CARLAGE_SLIP_RISK_PCT * (impaired ? 1.3 : 1);
  const slipA = na.move === 'shoulder' && rng.chance(slipRisk(stats.a.impaired));
  const slipB = nb.move === 'shoulder' && rng.chance(slipRisk(stats.b.impaired));
  const powerA = state.a_balance * stats.a.strength;
  const powerB = state.b_balance * stats.b.strength;
  const sameTarget = na.target !== null && na.target === nb.target;
  const o = resolvePair(na.move, nb.move, slipA, slipB, powerA, powerB, sameTarget);

  next.a_balance = clamp(state.a_balance + o.dx, 0, 100);
  next.b_balance = clamp(state.b_balance + o.dy, 0, 100);
  if (o.moveX && na.target) next.a_pos = na.target;
  if (o.moveY && nb.target) next.b_pos = nb.target;
  if (next.a_pos === next.b_pos) {
    // Sécurité : jamais deux combattants sur le même carreau
    next.a_pos = state.a_pos;
    next.b_pos = state.b_pos;
  }

  next.shocks.a = next.shocks.a || slipA || o.ringX || o.dx <= -C.CARLAGE_VIOLENT_SHOCK;
  next.shocks.b = next.shocks.b || slipB || o.ringY || o.dy <= -C.CARLAGE_VIOLENT_SHOCK;

  const ringOut: Side | null = o.ringX ? 'a' : o.ringY ? 'b' : null;
  let narrative = `A ${MOVE_LABEL[na.move]}${slipA ? ' et glisse' : ''}, B ${MOVE_LABEL[nb.move]}${slipB ? ' et glisse' : ''}.`;
  if (o.collision) narrative += ' Collision au centre !';
  if (ringOut) narrative += ` ${ringOut.toUpperCase()} est projeté hors du carré !`;

  next.log.push({
    round: state.round,
    a_move: na.move,
    b_move: nb.move,
    a_pivot: na.target,
    b_pivot: nb.target,
    a_slip: slipA,
    b_slip: slipB,
    a_delta: next.a_balance - state.a_balance,
    b_delta: next.b_balance - state.b_balance,
    ring_out: ringOut,
    narrative,
  });

  if (ringOut) {
    next.finished = true;
    next.winner_side = ringOut === 'a' ? 'b' : 'a';
    return next;
  }
  if (next.a_balance <= 0 || next.b_balance <= 0) {
    next.finished = true;
    if (next.a_balance <= 0 && next.b_balance <= 0) next.winner_side = state.defender_side;
    else next.winner_side = next.a_balance <= 0 ? 'b' : 'a';
    return next;
  }
  if (state.round >= C.CARLAGE_ROUNDS) {
    next.finished = true;
    next.winner_side =
      next.a_balance === next.b_balance ? state.defender_side : next.a_balance > next.b_balance ? 'a' : 'b';
    return next;
  }
  next.round = state.round + 1;
  return next;
}

/** Coup d'un adversaire PNJ (meneur de putsch) : tirage pondéré déterministe. */
export function npcMove(state: DuelState, side: Side, rng: Rng): MoveInput {
  const own = side === 'a' ? state.a_pos : state.b_pos;
  const other = side === 'a' ? state.b_pos : state.a_pos;
  const move = rng.weighted<CarlageMove>([
    ['push', 30],
    ['anchor', 30],
    ['shoulder', 20],
    ['pivot', 20],
  ]);
  if (move === 'pivot') {
    const options = ADJACENT[own].filter((c) => c !== other);
    return { move: 'pivot', pivotTarget: rng.pick(options) };
  }
  return { move };
}

export interface CarlageInjury {
  side: Side;
  injured: boolean;
  risk_pct: number;
}

/** Après le duel : 40 % de risque d'entorse/lombalgie après choc ou glissade (65 % sous emprise). */
export function rollCarlageInjuries(state: DuelState, stats: { a: FighterStats; b: FighterStats }, rng: Rng): CarlageInjury[] {
  const out: CarlageInjury[] = [];
  for (const side of ['a', 'b'] as const) {
    if (!state.shocks[side]) continue;
    const risk = stats[side].impaired ? C.CARLAGE_INJURY_RISK_DRUNK_PCT : C.CARLAGE_INJURY_RISK_PCT;
    out.push({ side, injured: rng.chance(risk), risk_pct: risk });
  }
  return out;
}
