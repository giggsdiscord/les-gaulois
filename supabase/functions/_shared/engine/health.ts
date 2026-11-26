// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/health.ts
/**
 * Santé tricéphale, Points d'Action, blessures & addictions individuelles [GDD §3.1, §3.3].
 * PA_jour = 3 si santé ≥ 60, santé mentale ≥ 40, aucune blessure active et sobriété suffisante ;
 * sinon PA_jour = 1 et duel de Carlage interdit.
 */
import * as C from './constants.ts';
import { isAfter } from './calendar.ts';
import { alcoholTier, drugTier, exposureTier } from './formulas.ts';
import { clamp, gauge } from './math.ts';
import type { Rng } from './rng.ts';
import type { InjuryType, Migrant, Player, VillageState } from './types.ts';

export function isDetained(p: { is_detained_until: string | null }, now: Date): boolean {
  return isAfter(p.is_detained_until, now);
}

export function isInCommunity(p: Player): boolean {
  return p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor');
}

/** Libre d'agir : membre du hameau et pas à l'isolement. */
export function isFree(p: Player, now: Date): boolean {
  return isInCommunity(p) && !isDetained(p, now);
}

export function meetsApConditions(p: Player): boolean {
  return (
    p.health_pct >= C.AP_HEALTH_THRESHOLD &&
    p.mental_health_pct >= C.AP_MENTAL_THRESHOLD &&
    p.injury_type === null &&
    p.addiction_level_pct <= C.ADDICTION_WITHDRAWAL_THRESHOLD
  );
}

export function canFightCarlage(p: Player, now: Date): boolean {
  return isFree(p, now) && meetsApConditions(p);
}

export function isInWithdrawal(subject: { addiction_level_pct: number }): boolean {
  return subject.addiction_level_pct > C.ADDICTION_WITHDRAWAL_THRESHOLD;
}

/** PA régénérés la nuit. */
export function computeDailyAp(p: Player, v: VillageState, rng: Rng, now: Date): number {
  if (!isInCommunity(p) || isDetained(p, now)) return 0;
  let ap = meetsApConditions(p) ? C.AP_FULL : C.AP_REDUCED;
  if (isInWithdrawal(p)) ap -= 1; // manque quotidien [GDD §3.3]
  ap -= p.pending_ap_penalty; // lendemain de tentation [GDD §6.2]
  // Palier 2+ : risque de perte d'1 PA le lendemain pour les consommateurs réguliers [GDD §3.3]
  if (exposureTier(v) >= 2 && p.addiction_level_pct >= 20 && !isInWithdrawal(p) && rng.chance(25)) ap -= 1;
  return clamp(ap, 0, C.AP_FULL);
}

export interface InjuryRiskSubject {
  fatigue_pct?: number;
  addiction_level_pct: number;
  strapping_until?: string | null;
  back_fragility?: boolean;
}

/** Risque (%) de blessure musculo-squelettique lors d'un effort physique (indicateur caché de M. Lerme). */
export function injuryRiskPct(subject: InjuryRiskSubject, v: VillageState, now: Date): number {
  let risk = 4 + (subject.fatigue_pct ?? 0) * 0.15 + (isInWithdrawal(subject) ? 6 : 0);
  const tier = exposureTier(v);
  if (tier === 2) risk *= 1.15; // +15 % de risque de blessure [GDD §3.3 palier 2]
  if (tier >= 3) risk *= 1.3;
  if (isAfter(subject.strapping_until ?? null, now)) risk *= 0.5;
  if (subject.back_fragility) risk *= 1.5;
  return Math.round(clamp(risk, 0, 60) * 100) / 100;
}

export function applyInjury(target: Player | Migrant, type: InjuryType, now: Date): void {
  target.injury_type = type;
  if ('injury_since' in target) target.injury_since = now.toISOString();
}

export function healInjury(target: Player | Migrant, healthBonus: number): void {
  target.injury_type = null;
  if ('injury_since' in target) target.injury_since = null;
  target.health_pct = Math.round(clamp(target.health_pct + healthBonus, 0, 100));
}

/** Dérive quotidienne de l'addiction individuelle selon l'exposition du village. */
export function addictionDrift(addiction: number, v: VillageState): number {
  const a = alcoholTier(v.alcohol_consumption_pct);
  const d = drugTier(v.drug_prevalence_pct);
  let delta = 0;
  if (a === 2) delta += 0.5;
  if (a >= 3) delta += 1;
  if (d === 2) delta += 0.8;
  if (d >= 3) delta += 1.5;
  if (delta === 0) delta = -0.5;
  return gauge(addiction + delta);
}
