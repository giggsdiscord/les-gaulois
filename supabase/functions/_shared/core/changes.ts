/**
 * Calcul de la charge utile d'engine_commit : seules les lignes modifiées ou créées sont
 * envoyées (comparaison JSON), plus les écritures append-only accumulées pendant la requête.
 */
import type { EngineEffects } from '../engine/index.ts';
import type {
  AiCallDraft,
  CommitPayload,
  GameState,
  GazetteDraft,
  HiddenIndicatorRow,
  TavernDraft,
} from './types.ts';

/** Grandeurs recalculées à chaque appel : leur seule variation ne justifie pas une écriture. */
const DERIVED_VILLAGE_KEYS = new Set([
  'last_tick_at',
  'productivity_modifier_pct',
  'insecurity_pct',
  'autonomy_pct',
  'housing_capacity',
]);

export function diffRows<T>(before: readonly T[], after: readonly T[], key: (row: T) => string): T[] {
  const previous = new Map(before.map((row) => [key(row), JSON.stringify(row)]));
  return after.filter((row) => previous.get(key(row)) !== JSON.stringify(row));
}

const byId = (row: { id: string }) => row.id;

export interface CommitExtras {
  fx: EngineEffects;
  tavern: TavernDraft[];
  gazette: GazetteDraft[];
  aiCalls: AiCallDraft[];
  hidden: HiddenIndicatorRow[];
}

export function buildCommitPayload(initial: GameState, current: GameState, extras: CommitExtras): CommitPayload {
  const b = initial.snapshot;
  const a = current.snapshot;
  const payload: CommitPayload = {
    village_state: a.village as unknown as Record<string, unknown>,
    players: diffRows(b.players, a.players, byId),
    village_migrants: diffRows(b.migrants, a.migrants, byId),
    village_children: diffRows(b.children, a.children, byId),
    map_structures: diffRows(b.structures, a.structures, byId),
    unions: diffRows(b.unions, a.unions, byId),
    pending_approvals: diffRows(b.approvals, a.approvals, byId),
    temptations: diffRows(b.temptations, a.temptations, byId),
    constitution_articles: diffRows(b.constitution, a.constitution, byId),
    agora_proposals: diffRows(initial.proposals, current.proposals, byId),
    carlage_duels: diffRows(initial.duels, current.duels, byId),
    role_hidden_indicators: extras.hidden,
    gazette_editions: extras.gazette,
    game_events: extras.fx.events,
    ledger_entries: extras.fx.ledger,
    migrant_screenings: extras.fx.screenings,
    tavern_messages: extras.tavern,
    ai_calls: extras.aiCalls,
  };
  // Allège la charge utile : on retire les listes vides
  for (const [k, v] of Object.entries(payload)) {
    if (Array.isArray(v) && v.length === 0) delete (payload as Record<string, unknown>)[k];
  }
  return payload;
}

/** Vrai si rien de significatif n'a changé (aucune écriture nécessaire). */
export function isTrivialChange(initial: GameState, current: GameState, extras: CommitExtras): boolean {
  const payload = buildCommitPayload(initial, current, { ...extras, hidden: [] });
  const { village_state: _village, ...rest } = payload;
  if (Object.keys(rest).length > 0) return false;
  const before = initial.snapshot.village as unknown as Record<string, unknown>;
  const after = current.snapshot.village as unknown as Record<string, unknown>;
  for (const key of Object.keys(after)) {
    if (DERIVED_VILLAGE_KEYS.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return false;
  }
  return true;
}
