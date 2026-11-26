// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/math.ts
/** Utilitaires numériques purs (aucune dépendance). */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Jauge 0-100 arrondie à 2 décimales. */
export function gauge(value: number, min = 0, max = 100): number {
  return round2(clamp(value, min, max));
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Montant en euros (centimes). */
export function money(value: number): number {
  return round2(value);
}

/** Stock entier non négatif. */
export function stock(value: number): number {
  return Math.max(0, Math.round(value));
}

export function sum(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function mean(values: readonly number[], fallback = 0): number {
  return values.length === 0 ? fallback : sum(values) / values.length;
}

/** Rapproche `current` de `target` d'une fraction `rate` (0-1). */
export function driftToward(current: number, target: number, rate: number): number {
  return current + (target - current) * rate;
}

/** Rapproche `current` de `target` d'au plus `step` unités. */
export function stepToward(current: number, target: number, step: number): number {
  if (current < target) return Math.min(target, current + step);
  if (current > target) return Math.max(target, current - step);
  return current;
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}
