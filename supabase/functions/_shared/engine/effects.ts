// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/effects.ts
/** Accumulateur des effets de bord produits par le moteur (événements, écritures, déclencheurs). */
import type {
  EngineEffects,
  EngineEvent,
  EngineTrigger,
  GameSnapshot,
  LedgerDraft,
} from './types.ts';

export function emptyEffects(): EngineEffects {
  return { events: [], ledger: [], screenings: [], approvals: [], triggers: [] };
}

export function mergeEffects(target: EngineEffects, source: EngineEffects): EngineEffects {
  target.events.push(...source.events);
  target.ledger.push(...source.ledger);
  target.screenings.push(...source.screenings);
  target.approvals.push(...source.approvals);
  target.triggers.push(...source.triggers);
  return target;
}

export function pushEvent(
  fx: EngineEffects,
  s: GameSnapshot,
  e: Omit<EngineEvent, 'game_day' | 'visibility'> & { visibility?: EngineEvent['visibility'] },
): void {
  fx.events.push({ visibility: 'public', data: {}, ...e, game_day: s.village.game_day });
}

export function pushLedger(fx: EngineEffects, s: GameSnapshot, entry: Omit<LedgerDraft, 'game_day'>): void {
  if (entry.amount_eur === 0) return;
  fx.ledger.push({ ...entry, amount_eur: Math.round(entry.amount_eur * 100) / 100, game_day: s.village.game_day });
}

export function pushTrigger(fx: EngineEffects, t: EngineTrigger): void {
  fx.triggers.push(t);
}
