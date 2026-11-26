/**
 * Implémentation Supabase : clé publique (anon / publishable) + jeton de session dans l'en-tête
 * x-player-token. Lecture par vues publiques et RPC (RLS), écriture par RPC et Edge Functions.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { TargetTap } from '../engine.ts';
import type {
  ActionInput,
  ChangeListener,
  DuelMode,
  GameApi,
  GameData,
  LoginCard,
  MotionKind,
  MyPlayer,
  OpResponse,
  PrivateLedger,
  SnapshotInfo,
  TavernMessage,
} from './types.ts';

const REALTIME_TABLES = [
  'tavern_messages', 'agora_proposals', 'carlage_duels', 'carlage_moves', 'target_trial_results',
  'game_events', 'map_structures', 'gazette_editions', 'pending_approvals',
];

interface PgResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function must<T>(res: PgResult<T>, label: string): T {
  if (res.error) throw new Error(res.error.message || `Erreur de lecture (${label})`);
  return (res.data ?? ([] as unknown)) as T;
}

export class SupabaseApi implements GameApi {
  readonly mode = 'supabase' as const;
  private token: string | null = null;
  private client: SupabaseClient;

  constructor(private readonly url: string, private readonly anonKey: string) {
    this.client = this.makeClient();
  }

  private makeClient(): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: this.token ? { 'x-player-token': this.token } : {} },
    });
  }

  now(): Date {
    return new Date();
  }

  setToken(token: string | null): void {
    this.token = token;
    this.client = this.makeClient();
  }

  private async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  private async invoke(fn: string, body: Record<string, unknown>): Promise<OpResponse> {
    const { data, error } = await this.client.functions.invoke(fn, {
      body,
      headers: this.token ? { 'x-player-token': this.token } : {},
    });
    if (error) {
      const context = (error as { context?: Response }).context;
      if (context && typeof context.json === 'function') {
        try {
          const payload = (await context.json()) as OpResponse;
          if (payload?.error) throw new Error(payload.error);
        } catch (e) {
          if (e instanceof Error && e.message) throw e;
        }
      }
      throw new Error(error.message || 'Le moteur ne répond pas.');
    }
    const response = data as OpResponse;
    if (response && response.ok === false && response.error) throw new Error(response.error);
    return response;
  }

  async listLoginCards(): Promise<LoginCard[]> {
    return must(
      await this.client
        .from('players_public')
        .select('id, slot_number, display_name, character_name, role_title, avatar_emoji, avatar_color, is_active_slot')
        .order('slot_number'),
      'joueurs',
    ) as LoginCard[];
  }

  async login(playerId: string, pin: string): Promise<string | null> {
    const result = await this.rpc<{ session_token: string } | null>('verify_player_pin', { p_player_id: playerId, p_pin: pin });
    return result?.session_token ?? null;
  }

  async logout(): Promise<void> {
    if (this.token) await this.rpc('logout_session').catch(() => undefined);
    this.setToken(null);
  }

  async setPin(oldPin: string, newPin: string): Promise<void> {
    await this.rpc('set_player_pin', { p_old_pin: oldPin, p_new_pin: newPin });
  }

  async loadAll(): Promise<GameData> {
    const c = this.client;
    const since = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
    const [me, village, players, migrants, children, structures, unions, proposals, constitution, approvals, duels, moves, targetResults, gazette, events, ledger, privateLedger, hidden, screenings, temptations] =
      await Promise.all([
        this.rpc<MyPlayer>('get_my_player'),
        c.from('village_public_state').select('*').limit(1).single(),
        c.from('players_public').select('*').order('slot_number'),
        c.from('migrants_public').select('*').in('status', ['candidate', 'accepted', 'forced_labor']).order('arrived_at'),
        c.from('village_children').select('*').neq('status', 'departed').order('created_at'),
        c.from('map_structures').select('*'),
        c.from('unions').select('*').eq('is_active', true),
        c.from('agora_proposals').select('*').gte('created_at', since(35)).order('created_at', { ascending: false }),
        c.from('constitution_articles').select('*').order('article_number'),
        c.from('pending_approvals').select('*').order('created_at', { ascending: false }).limit(40),
        c.from('carlage_duels').select('*').or(`status.eq.active,finished_at.gt."${since(2)}"`).order('created_at', { ascending: false }),
        c.from('carlage_moves').select('*').order('submitted_at', { ascending: false }).limit(200),
        c.from('target_trial_results').select('*').order('submitted_at', { ascending: false }).limit(100),
        c.from('gazette_editions').select('*').order('edition_date', { ascending: false }).limit(14),
        c.from('game_events').select('*').order('created_at', { ascending: false }).limit(80),
        c.from('ledger_entries').select('*').neq('account', 'private').order('created_at', { ascending: false }).limit(120),
        this.rpc<PrivateLedger>('get_private_ledger'),
        this.rpc<GameData['hidden']>('get_my_hidden_indicators'),
        this.rpc<GameData['screenings']>('get_my_screenings'),
        c.from('temptations').select('*').order('created_at', { ascending: false }).limit(20),
      ]);
    return {
      me,
      village: must(village, 'village') as GameData['village'],
      players: must(players, 'joueurs') as GameData['players'],
      migrants: must(migrants, 'migrants') as GameData['migrants'],
      children: must(children, 'enfants') as GameData['children'],
      structures: must(structures, 'carte') as GameData['structures'],
      unions: must(unions, 'unions') as GameData['unions'],
      proposals: must(proposals, 'Agora') as GameData['proposals'],
      constitution: must(constitution, 'Constitution') as GameData['constitution'],
      approvals: must(approvals, 'validations') as GameData['approvals'],
      duels: must(duels, 'duels') as GameData['duels'],
      moves: must(moves, 'coups') as GameData['moves'],
      targetResults: must(targetResults, 'épreuves') as GameData['targetResults'],
      gazette: must(gazette, 'Gazette') as GameData['gazette'],
      events: must(events, 'événements') as GameData['events'],
      ledger: must(ledger, 'grand livre') as GameData['ledger'],
      privateLedger,
      hidden: hidden ?? [],
      screenings: screenings ?? [],
      temptations: must(temptations, 'tentations') as GameData['temptations'],
    };
  }

  async loadTavern(channel: TavernMessage['channel']): Promise<TavernMessage[]> {
    const rows = must(
      await this.client.from('tavern_messages').select('*').eq('channel', channel).order('created_at', { ascending: false }).limit(120),
      'Taverne',
    ) as TavernMessage[];
    return rows.reverse();
  }

  subscribe(listener: ChangeListener): () => void {
    let channel = this.client.channel(`gaulois-${Math.random().toString(36).slice(2)}`);
    for (const table of REALTIME_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => listener(table));
    }
    channel.subscribe();
    return () => {
      void this.client.removeChannel(channel);
    };
  }

  tick(): Promise<OpResponse> {
    return this.invoke('game-engine', { op: 'tick' });
  }
  action(input: ActionInput): Promise<OpResponse> {
    return this.invoke('game-engine', { op: 'action', action: input });
  }
  freeAction(text: string, onBehalfOf?: string | null): Promise<OpResponse> {
    return this.invoke('gm-ai-action', { op: 'free_action', text, on_behalf_of_id: onBehalfOf ?? null });
  }
  decideApproval(approvalId: string, approve: boolean, reason?: string | null): Promise<OpResponse> {
    return this.invoke('game-engine', { op: 'decide_approval', approval_id: approvalId, approve, reason: reason ?? null });
  }
  respondTemptation(temptationId: string, yieldToIt: boolean): Promise<OpResponse> {
    return this.invoke('game-engine', { op: 'respond_temptation', temptation_id: temptationId, yield: yieldToIt });
  }
  challengeDuel(input: { proposalId?: string | null; targetPlayerId?: string | null; championPlayerId?: string | null; mode: DuelMode }): Promise<OpResponse> {
    return this.invoke('game-engine', {
      op: 'carlage_challenge',
      proposal_id: input.proposalId ?? null,
      target_player_id: input.targetPlayerId ?? null,
      champion_player_id: input.championPlayerId ?? null,
      mode: input.mode,
    });
  }
  resolveDuel(duelId: string): Promise<OpResponse> {
    return this.invoke('game-engine', { op: 'carlage_resolve', duel_id: duelId });
  }
  repressPutsch(duelId: string): Promise<OpResponse> {
    return this.invoke('game-engine', { op: 'putsch_repress', duel_id: duelId });
  }

  async postMessage(channel: TavernMessage['channel'], content: string, recipients?: string[]): Promise<void> {
    await this.rpc('post_tavern_message', { p_channel: channel, p_content: content, p_recipient_ids: recipients && recipients.length > 0 ? recipients : null });
  }
  async submitProposal(title: string, explanation: string, category: string): Promise<void> {
    await this.rpc('submit_agora_proposal', { p_title: title, p_detailed_explanation: explanation, p_category: category });
  }
  async submitMotion(kind: MotionKind, title: string, explanation: string, payload: Record<string, unknown>): Promise<void> {
    await this.rpc('submit_agora_motion', { p_kind: kind, p_title: title, p_detailed_explanation: explanation, p_payload: payload });
  }
  async vote(proposalId: string, yes: boolean): Promise<void> {
    await this.rpc('cast_agora_vote', { p_proposal_id: proposalId, p_vote: yes });
  }
  async veto(proposalId: string): Promise<void> {
    await this.rpc('use_veto', { p_proposal_id: proposalId });
  }
  submitMove(duelId: string, move: string, pivotTarget?: string | null): Promise<{ both_submitted: boolean }> {
    return this.rpc('carlage_submit_move', { p_duel_id: duelId, p_move: move, p_pivot_target: pivotTarget ?? null });
  }
  submitTargetTaps(duelId: string, taps: TargetTap[]): Promise<{ both_submitted: boolean }> {
    return this.rpc('target_submit', { p_duel_id: duelId, p_taps: taps });
  }
  async setDelegation(delegateId: string | null, until: string | null): Promise<void> {
    await this.rpc('set_delegation', { p_delegate_id: delegateId, p_until: until });
  }
  async editConstitution(articleNumber: number, title: string, body: string): Promise<void> {
    await this.rpc('edit_constitution_article', { p_article_number: articleNumber, p_title: title, p_body: body });
  }

  listSnapshots(): Promise<SnapshotInfo[]> {
    return this.rpc('list_daily_snapshots');
  }
  async createSnapshot(label?: string | null): Promise<void> {
    await this.rpc('create_daily_snapshot', { p_trigger: 'manual', p_label: label ?? null });
  }
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const ok = await this.rpc<boolean>('restore_daily_snapshot', { p_snapshot_id: snapshotId });
    if (!ok) throw new Error('Sauvegarde introuvable.');
  }
  exportState(): Promise<unknown> {
    return this.rpc('export_full_state');
  }
  async importState(json: unknown, label?: string | null): Promise<void> {
    await this.rpc('import_full_state', { p_json: json, p_label: label ?? null });
  }
  async configureSlot(playerId: string, displayName: string | null, characterName: string | null, pin: string | null, active: boolean): Promise<void> {
    await this.rpc('admin_configure_slot', {
      p_player_id: playerId,
      p_display_name: displayName,
      p_character_name: characterName,
      p_new_pin: pin,
      p_active: active,
    });
  }
  aiStatus(): Promise<Record<string, unknown>> {
    return this.invoke('gm-ai-action', { op: 'status' });
  }
  runWorldSync(mode: 'nightly' | 'maintenance'): Promise<OpResponse> {
    return this.invoke('daily-world-sync', { mode });
  }
  generateMigrants(count: number): Promise<OpResponse> {
    return this.invoke('gm-ai-action', { op: 'generate_migrants', count });
  }
  regenerateGazette(): Promise<OpResponse> {
    return this.invoke('gm-ai-action', { op: 'regenerate_gazette' });
  }
  sendTemptation(playerId: string): Promise<OpResponse> {
    return this.invoke('gm-ai-action', { op: 'send_temptation', player_id: playerId });
  }
}
