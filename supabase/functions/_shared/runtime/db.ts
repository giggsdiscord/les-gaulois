/**
 * Accès Supabase en service_role : chargement de l'état complet et écriture atomique
 * via la RPC engine_commit (concurrence optimiste sur village_state.revision).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AgoraProposal,
  Child,
  ConstitutionArticle,
  GameSnapshot,
  MapStructure,
  Migrant,
  PendingApproval,
  Player,
  Temptation,
  Union,
  VillageState,
} from '../engine/index.ts';
import { constants } from '../engine/index.ts';
import type { CarlageDuelRow, CarlageMoveRow, CommitPayload, GameState, RecentEvent, TargetResultRow, TemptationHistoryRow } from '../core/types.ts';
import type { FunctionEnv } from './env.ts';

export type Db = SupabaseClient;

export class RevisionConflict extends Error {
  constructor() {
    super('revision_conflict');
    this.name = 'RevisionConflict';
  }
}

export function createDb(env: FunctionEnv): Db {
  return createClient(env.supabaseUrl, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

function must<T>(result: QueryResult<T>, label: string): T {
  if (result.error) throw new Error(`${label} : ${result.error.message}`);
  if (result.data === null) throw new Error(`${label} : aucune donnée`);
  return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LoadOptions {
  /** Relit aussi l'historique des dilemmes (nuit, envoi par l'administrateur) : évite les répétitions. */
  temptationHistory?: boolean;
}

/** Dilemmes des TEMPTATION_HISTORY_DAYS derniers jours, tous statuts, du plus récent au plus ancien. */
async function loadTemptationHistory(db: Db, now: Date): Promise<TemptationHistoryRow[]> {
  const since = new Date(now.getTime() - constants.TEMPTATION_HISTORY_DAYS * 86_400_000).toISOString();
  const res = await db
    .from('temptations')
    .select('id, player_id, category, title, prompt_text, created_at')
    .gt('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);
  return must(res, 'temptations (historique)') as TemptationHistoryRow[];
}

export async function loadGameState(db: Db, now: Date, options: LoadOptions = {}): Promise<GameState> {
  const iso = (msAgo: number) => `"${new Date(now.getTime() - msAgo).toISOString()}"`;
  const day = 86_400_000;
  const [village, players, migrants, children, structures, unions, approvals, temptations, constitution, proposals, duels, chat, events] =
    await Promise.all([
      db.from('village_state').select('*').limit(1).single(),
      db.from('players').select('*').order('slot_number'),
      db.from('village_migrants').select('*').in('status', ['candidate', 'accepted', 'forced_labor']),
      db.from('village_children').select('*').neq('status', 'departed'),
      db.from('map_structures').select('*'),
      db.from('unions').select('*').eq('is_active', true),
      db.from('pending_approvals').select('*').in('status', ['pending', 'approved']),
      db.from('temptations').select('*').or(`choice.eq.pending,and(choice.eq.yielded,published.eq.false),and(confessed.eq.true,confessed_at.gt.${iso(60 * day)})`),
      db.from('constitution_articles').select('*').order('article_number'),
      db.from('agora_proposals').select('*').or(`status.eq.open,and(status.eq.passed,executed_at.is.null),and(status.eq.vetoed,closed_at.gt.${iso(7 * day)})`),
      db.from('carlage_duels').select('*').eq('status', 'active'),
      db.from('tavern_messages').select('sender_id, content, created_at').neq('channel', 'whisper').order('created_at', { ascending: false }).limit(25),
      db.from('game_events').select('event_type, title, body, created_at').eq('visibility', 'public').gt('created_at', new Date(now.getTime() - 26 * 3_600_000).toISOString()).order('created_at').limit(100),
    ]);

  const duelRows = must(duels, 'carlage_duels') as CarlageDuelRow[];
  let moves: CarlageMoveRow[] = [];
  let targetResults: TargetResultRow[] = [];
  if (duelRows.length > 0) {
    const ids = duelRows.map((d) => d.id);
    const [m, r] = await Promise.all([
      db.from('carlage_moves').select('*').in('duel_id', ids),
      db.from('target_trial_results').select('*').in('duel_id', ids),
    ]);
    moves = must(m, 'carlage_moves') as CarlageMoveRow[];
    targetResults = must(r, 'target_trial_results') as TargetResultRow[];
  }
  const playerRows = must(players, 'players') as Player[];
  const names = new Map(playerRows.map((p) => [p.id, p.display_name]));
  const chatRows = must(chat, 'tavern_messages') as { sender_id: string | null; content: string; created_at: string }[];

  const snapshot: GameSnapshot = {
    village: must(village, 'village_state') as VillageState,
    players: playerRows,
    migrants: must(migrants, 'village_migrants') as Migrant[],
    children: must(children, 'village_children') as Child[],
    structures: must(structures, 'map_structures') as MapStructure[],
    unions: must(unions, 'unions') as Union[],
    approvals: must(approvals, 'pending_approvals') as PendingApproval[],
    temptations: must(temptations, 'temptations') as Temptation[],
    constitution: must(constitution, 'constitution_articles') as ConstitutionArticle[],
  };
  return {
    snapshot,
    proposals: must(proposals, 'agora_proposals') as AgoraProposal[],
    duels: duelRows,
    moves,
    targetResults,
    chat: chatRows
      .reverse()
      .map((m) => ({ sender: m.sender_id ? names.get(m.sender_id) ?? 'Inconnu' : 'Système', content: m.content, created_at: m.created_at })),
    recentEvents: must(events, 'game_events') as RecentEvent[],
    ...(options.temptationHistory ? { recentTemptations: await loadTemptationHistory(db, now) } : {}),
  };
}

export async function commitChanges(db: Db, expectedRevision: number, payload: CommitPayload): Promise<number> {
  const { data, error } = await db.rpc('engine_commit', { p_expected_revision: expectedRevision, p_changes: payload });
  if (error) {
    if (error.code === '40001' || /revision_conflict/.test(error.message)) throw new RevisionConflict();
    throw new Error(`engine_commit : ${error.message}`);
  }
  return Number(data);
}

/** Joueur correspondant au jeton de session (en-tête x-player-token), ou null. */
export async function playerIdFromToken(db: Db, token: string | null): Promise<string | null> {
  if (!token || !UUID.test(token)) return null;
  const { data, error } = await db.rpc('session_player', { p_token: token });
  if (error) throw new Error(`session_player : ${error.message}`);
  return typeof data === 'string' ? data : null;
}

export async function isAdmin(db: Db, playerId: string): Promise<boolean> {
  const { data, error } = await db.from('players').select('is_admin').eq('id', playerId).single();
  if (error) throw new Error(`players : ${error.message}`);
  return (data as { is_admin: boolean } | null)?.is_admin === true;
}

export async function callRpc(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn} : ${error.message}`);
  return data;
}

export async function recentAiCalls(db: Db, limit = 20): Promise<unknown[]> {
  const { data, error } = await db.from('ai_calls').select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(`ai_calls : ${error.message}`);
  return data ?? [];
}
