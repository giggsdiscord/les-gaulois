/**
 * Fil des événements de la Gazette (V4.4) : les duels (défis lancés, vainqueurs) sont rangés à part
 * pour laisser les faits de jeu en vue. Les conséquences d'un duel (veto renversé, putsch réussi…)
 * restent des faits de jeu. Pur (aucun DOM) : testé dans tests/app/events.test.ts.
 */
import type { GameEventRow } from '../api/types.ts';

export const DUEL_EVENT_TYPES: readonly string[] = ['carlage_started', 'carlage_result'];

/** Faits qui changent le cours de la partie : mis en relief dans le fil. */
export const MAJOR_EVENT_TYPES: readonly string[] = [
  'defeat', 'act_changed', 'independence', 'putsch_attempt', 'putsch_success', 'putsch_failed', 'putsch_repressed',
  'veto_upheld', 'veto_overturned', 'sentence_execution', 'sentence_expulsion', 'sentence_forced_labor',
  'epidemic', 'famine', 'mutiny', 'strike', 'faction_formed', 'scandal', 'sabotage', 'energy_tier', 'loan_missed',
  'initiative_executed', 'structure_completed',
];

export function isDuelEvent(e: Pick<GameEventRow, 'event_type'>): boolean {
  return DUEL_EVENT_TYPES.includes(e.event_type);
}

export function isMajorEvent(e: Pick<GameEventRow, 'event_type'>): boolean {
  return MAJOR_EVENT_TYPES.includes(e.event_type);
}

/** Événements publics séparés en faits de jeu et duels, chacun limité aux `limit` plus récents. */
export function splitPublicEvents<T extends Pick<GameEventRow, 'event_type' | 'visibility'>>(events: readonly T[], limit = 30): { facts: T[]; duels: T[] } {
  const publicEvents = events.filter((e) => e.visibility === 'public');
  return {
    facts: publicEvents.filter((e) => !isDuelEvent(e)).slice(0, limit),
    duels: publicEvents.filter(isDuelEvent).slice(0, limit),
  };
}
