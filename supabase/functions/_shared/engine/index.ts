// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/index.ts
/**
 * Moteur déterministe « Les Gaulois & Micro-État » — API publique (GDD V3.8).
 * Aucune dépendance externe : importable tel quel par React (Vite) et par les Edge Functions (Deno).
 */
export * from './types.ts';
export * as constants from './constants.ts';
export { createRng, type Rng } from './rng.ts';
export * from './calendar.ts';
export * from './math.ts';
export * from './population.ts';
export * from './formulas.ts';
export * from './health.ts';
export * from './effects.ts';
export { applyElapsedTime, refreshDerived, type TickResult } from './simulation.ts';
export * from './demography.ts';
export * from './society.ts';
export * from './catalog.ts';
export * from './permissions.ts';
export * from './locks.ts';
export * from './migrants.ts';
export { ACTIONS, ActionError, actionsAvailableTo, dailyMission, getAction, performAction, type ActionDef, type PerformOptions, type TargetKind } from './actions.ts';
export * from './justice.ts';
export * from './agora.ts';
export * from './carlage.ts';
export * from './targetTrial.ts';
export * from './temptations.ts';
export * from './life.ts';
export * from './work.ts';
export * from './buildings.ts';
export * from './upkeep.ts';
export * from './supply.ts';
export * from './personality.ts';
export * from './neighbors.ts';
export * from './visitors.ts';
export * from './chronicle.ts';
export * from './income.ts';
export * from './funds.ts';
export * from './collective.ts';
export * from './goals.ts';
export * from './skills.ts';
export * from './elections.ts';
export * from './aiDeltas.ts';
export * from './hiddenIndicators.ts';
