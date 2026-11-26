/**
 * Épreuve de la cible (V4.0) — alternative en différé au Carlage 2×2.
 * 5 cibles apparaissent l'une après l'autre dans une arène carrée ; chaque joueur tape le plus
 * près possible du centre et le plus vite possible. Les deux adversaires reçoivent exactement la
 * même séquence (tirée de l'identifiant du duel) et jouent chacun quand ils veulent avant l'échéance.
 * Score par cible (sur 100) = 50 % précision + 50 % rapidité ; faux départ ou cible manquée = 0.
 * Le meilleur total l'emporte ; égalité au profit du statu quo.
 */
import * as C from './constants.ts';
import { clamp } from './math.ts';
import { createRng } from './rng.ts';

export interface TargetSpec {
  index: number;
  /** Centre de la cible, en fraction du côté de l'arène (0-1). */
  x: number;
  y: number;
  radius: number;
  /** Attente avant l'apparition (ms). */
  delay_ms: number;
}

export interface TargetTap {
  index: number;
  /** Position du tap en fraction du côté de l'arène (0-1). */
  x: number;
  y: number;
  /** Temps entre l'apparition de la cible et le tap (ms) ; négatif = tap avant l'apparition. */
  reaction_ms: number;
}

export type TargetFoul = 'false_start' | 'too_late' | 'missing' | null;

export interface TargetScoreLine {
  index: number;
  distance: number;
  reaction_ms: number | null;
  distance_points: number;
  speed_points: number;
  points: number;
  foul: TargetFoul;
}

export interface TargetTrialScore {
  total: number;
  lines: TargetScoreLine[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Séquence déterministe des cibles d'un duel (identique pour les deux joueurs). */
export function targetSequence(duelId: string): TargetSpec[] {
  const rng = createRng(`target-trial:${duelId}`);
  const margin = C.TARGET_RADIUS + 0.05;
  return Array.from({ length: C.TARGET_COUNT }, (_, index) => ({
    index,
    x: round3(rng.float(margin, 1 - margin)),
    y: round3(rng.float(margin, 1 - margin)),
    radius: C.TARGET_RADIUS,
    delay_ms: rng.int(C.TARGET_DELAY_MIN_MS, C.TARGET_DELAY_MAX_MS),
  }));
}

/** Valide les taps envoyés par un client (5 au plus, un par cible, valeurs bornées). */
export function sanitizeTaps(raw: unknown): TargetTap[] | null {
  if (!Array.isArray(raw) || raw.length > C.TARGET_COUNT) return null;
  const taps: TargetTap[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') return null;
    const r = item as Record<string, unknown>;
    const index = Number(r.index);
    const x = Number(r.x);
    const y = Number(r.y);
    const reaction = Number(r.reaction_ms);
    if (![index, x, y, reaction].every(Number.isFinite)) return null;
    if (!Number.isInteger(index) || index < 0 || index >= C.TARGET_COUNT) return null;
    if (taps.some((t) => t.index === index)) return null;
    taps.push({ index, x: clamp(x, -0.5, 1.5), y: clamp(y, -0.5, 1.5), reaction_ms: Math.round(clamp(reaction, -60_000, 60_000)) });
  }
  return taps;
}

export function scoreTargetTrial(duelId: string, taps: readonly TargetTap[]): TargetTrialScore {
  const lines = targetSequence(duelId).map((target): TargetScoreLine => {
    const tap = taps.find((t) => t.index === target.index);
    if (!tap) return { index: target.index, distance: 1, reaction_ms: null, distance_points: 0, speed_points: 0, points: 0, foul: 'missing' };
    const distance = round3(Math.hypot(tap.x - target.x, tap.y - target.y));
    const base = { index: target.index, distance, reaction_ms: tap.reaction_ms };
    if (tap.reaction_ms < C.TARGET_FALSE_START_MS) return { ...base, distance_points: 0, speed_points: 0, points: 0, foul: 'false_start' };
    if (tap.reaction_ms > C.TARGET_TIMEOUT_MS) return { ...base, distance_points: 0, speed_points: 0, points: 0, foul: 'too_late' };
    const distancePoints = 100 * clamp(1 - distance / C.TARGET_ZERO_DISTANCE, 0, 1);
    const speedPoints =
      100 * clamp(1 - (tap.reaction_ms - C.TARGET_BEST_REACTION_MS) / (C.TARGET_ZERO_SPEED_MS - C.TARGET_BEST_REACTION_MS), 0, 1);
    return {
      ...base,
      distance_points: Math.round(distancePoints),
      speed_points: Math.round(speedPoints),
      points: Math.round(C.TARGET_DISTANCE_WEIGHT * distancePoints + C.TARGET_SPEED_WEIGHT * speedPoints),
      foul: null,
    };
  });
  return { total: lines.reduce((acc, l) => acc + l.points, 0), lines };
}

/** Taps plausibles et déterministes d'un adversaire PNJ (meneur de putsch). */
export function npcTargetTaps(duelId: string): TargetTap[] {
  const rng = createRng(`target-npc:${duelId}`);
  return targetSequence(duelId).map((t) => {
    const angle = rng.float(0, Math.PI * 2);
    const dist = rng.float(0.01, 0.12);
    return {
      index: t.index,
      x: round3(t.x + Math.cos(angle) * dist),
      y: round3(t.y + Math.sin(angle) * dist),
      reaction_ms: rng.int(260, 650),
    };
  });
}

/** Vainqueur d'une épreuve (égalité : camp du statu quo). */
export function targetWinner(scoreA: number, scoreB: number, defenderSide: 'a' | 'b'): 'a' | 'b' {
  if (scoreA === scoreB) return defenderSide;
  return scoreA > scoreB ? 'a' : 'b';
}
