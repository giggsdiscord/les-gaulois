/**
 * Contrat d'accès aux données de l'interface. Deux implémentations :
 *  - SupabaseApi : vues publiques, RPC et Edge Functions (production) ;
 *  - DemoApi : le même moteur et la même session que les Edge Functions, exécutés dans le
 *    navigateur avec stockage local (mode démo sans configuration).
 */
import type {
  AgoraProposal,
  Child,
  ConstitutionArticle,
  MapStructure,
  Migrant,
  PendingApproval,
  Temptation,
  TargetTap,
  Union,
  VillageState,
} from '../engine.ts';
import type { CarlageDuelRow, CarlageMoveRow, GazetteSection, TargetResultRow } from '../../../supabase/functions/_shared/core/types.ts';

/** Colonnes de village_state masquées par la vue publique (indicateurs cachés). */
export const HIDDEN_VILLAGE_KEYS = [
  'singleton', 'treasury_leak_eur', 'andorra_hidden_capital_eur', 'energy_cost_season_eur', 'scrap_stock', 'tools_wear_pct',
  'tools_stolen_season', 'fleet_wear_pct', 'rd_progress_pct', 'land_surveyed', 'machinery_bonus_until', 'machinery_bonus_pct',
  'water_quality_pct', 'septic_saturation_pct', 'sabotage_pending', 'epidemic_incubation_days', 'ecology_index_pct',
  'eu_sympathy_pct', 'perimeter_threat_pct', 'customs_alert_pct', 'birth_accumulator', 'children_welcomed_this_season',
  'new_adults_this_season', 'family_allowance_season', 'drug_prevalence_pct', 'addiction_level_pct', 'insecurity_offset',
  'security_reduction_pct', 'brunel_reduction_pct', 'high_left_seasons', 'faction_active', 'black_market_active',
  'mediations_this_season', 'tomato_throw_season', 'smuggling_runs_this_season', 'bor_concert_season', 'last_putsch_season',
] as const;
export type PublicVillage = Omit<VillageState, (typeof HIDDEN_VILLAGE_KEYS)[number]>;

export interface PublicPlayer {
  id: string;
  slot_number: number;
  display_name: string;
  character_name: string;
  role_code: string;
  role_title: string;
  avatar_emoji: string;
  avatar_color: string;
  is_founder: boolean;
  is_active_slot: boolean;
  is_admin: boolean;
  ministerial_portfolios: string[];
  status: 'active' | 'forced_labor' | 'banished' | 'executed';
  action_points: number;
  health_pct: number;
  fatigue_pct: number;
  injury_type: string | null;
  veto_tokens: number;
  spouse_id: string | null;
  is_detained_until: string | null;
  forced_labor_until: string | null;
  delegated_to: string | null;
  delegation_until: string | null;
  skill_xp: number;
  last_seen_at: string | null;
}

export interface MyPlayer extends PublicPlayer {
  mental_health_pct: number;
  morale_pct: number;
  addiction_level_pct: number;
  temptation_guilt_pct: number;
  pending_ap_penalty: number;
  private_wealth_eur: number;
  power_kwh_used: number;
  strapping_until: string | null;
  injury_since: string | null;
  must_change_pin: boolean;
}

export const HIDDEN_MIGRANT_KEYS = ['left_wing_score', 'hidden_risk_note', 'pathology_note', 'back_fragility', 'addiction_level_pct', 'loyalty_scores', 'faction_type'] as const;
export type PublicMigrant = Omit<Migrant, (typeof HIDDEN_MIGRANT_KEYS)[number]>;

export interface Structure extends MapStructure {
  x: number;
  y: number;
  width: number;
  height: number;
  path_points: number[][] | null;
  notes: string | null;
}

export type Proposal = AgoraProposal & { created_at: string; effects_json?: unknown };

export interface TavernMessage {
  id: string;
  channel: 'village_square' | 'agora_hall' | 'whisper';
  sender_id: string | null;
  recipient_ids: string[] | null;
  content: string;
  is_system_event: boolean;
  created_at: string;
}

export interface GazetteEdition {
  id: string;
  edition_date: string;
  headline: string;
  body_markdown: string;
  sections: GazetteSection[];
  generated_by: string;
  created_at: string;
}

export interface GameEventRow {
  id: string;
  event_type: string;
  visibility: 'public' | 'private' | 'role';
  player_id: string | null;
  role_code: string | null;
  title: string;
  body: string;
  data: Record<string, unknown>;
  game_day: number;
  created_at: string;
}

export interface LedgerRow {
  id: string;
  account: string;
  player_id: string | null;
  amount_eur: number;
  label: string;
  category: string;
  supplier: string | null;
  created_at: string;
}

export interface PrivateLedger {
  wealth: { player_id: string; display_name: string; private_wealth_eur: number; power_kwh_used: number }[];
  entries: LedgerRow[];
}

export interface HiddenIndicator {
  role_code: string;
  payload: Record<string, unknown>;
  computed_at: string;
}

export interface ScreeningRow {
  id: string;
  migrant_id: string;
  screened_by: string;
  screening_type: string;
  findings: Record<string, unknown>;
  created_at: string;
}

export interface SnapshotInfo {
  id: string;
  snapshot_date: string;
  trigger_type: string;
  label: string;
  size_bytes: number;
  created_at: string;
  days_ago: number;
}

export type DuelRow = CarlageDuelRow;
export type MoveRow = CarlageMoveRow;
export type TargetResult = TargetResultRow;

export interface GameData {
  me: MyPlayer;
  village: PublicVillage;
  players: PublicPlayer[];
  migrants: PublicMigrant[];
  children: Child[];
  structures: Structure[];
  unions: Union[];
  proposals: Proposal[];
  constitution: ConstitutionArticle[];
  approvals: PendingApproval[];
  duels: DuelRow[];
  moves: MoveRow[];
  targetResults: TargetResult[];
  gazette: GazetteEdition[];
  events: GameEventRow[];
  ledger: LedgerRow[];
  privateLedger: PrivateLedger;
  hidden: HiddenIndicator[];
  screenings: ScreeningRow[];
  temptations: Temptation[];
}

export interface LoginCard {
  id: string;
  slot_number: number;
  display_name: string;
  character_name: string;
  role_title: string;
  avatar_emoji: string;
  avatar_color: string;
  is_active_slot: boolean;
}

export interface OpResponse {
  ok: boolean;
  error?: string;
  narrative?: string;
  headline?: string | null;
  status?: string;
  [key: string]: unknown;
}

export interface ActionInput {
  action_code: string;
  on_behalf_of_id?: string | null;
  target_player_id?: string | null;
  target_migrant_id?: string | null;
  target_child_id?: string | null;
  target_structure_id?: string | null;
  quantity?: number | null;
  amount_eur?: number | null;
  catalog_item_id?: string | null;
  params?: Record<string, unknown>;
  free_text?: string | null;
}

export type MotionKind =
  | 'tribunal' | 'naturalization' | 'migrant_admission' | 'collectivization' | 'decollectivization'
  | 'prohibition' | 'rationing' | 'ministry_election' | 'constitution_article' | 'independence';

export type DuelMode = 'carlage' | 'target';
export type ChangeListener = (table: string) => void;

export interface GameApi {
  readonly mode: 'supabase' | 'demo';
  /** Horloge du jeu (le mode démo peut avancer le temps). */
  now(): Date;
  setToken(token: string | null): void;

  listLoginCards(): Promise<LoginCard[]>;
  /** Jeton de session, ou null si le PIN est erroné. */
  login(playerId: string, pin: string): Promise<string | null>;
  logout(): Promise<void>;
  setPin(oldPin: string, newPin: string): Promise<void>;

  loadAll(): Promise<GameData>;
  loadTavern(channel: TavernMessage['channel']): Promise<TavernMessage[]>;
  subscribe(listener: ChangeListener): () => void;

  // Moteur (Edge Function game-engine / gm-ai-action)
  tick(): Promise<OpResponse>;
  action(input: ActionInput): Promise<OpResponse>;
  freeAction(text: string, onBehalfOf?: string | null): Promise<OpResponse>;
  decideApproval(approvalId: string, approve: boolean, reason?: string | null): Promise<OpResponse>;
  respondTemptation(temptationId: string, yieldToIt: boolean): Promise<OpResponse>;
  challengeDuel(input: { proposalId?: string | null; targetPlayerId?: string | null; championPlayerId?: string | null; mode: DuelMode }): Promise<OpResponse>;
  resolveDuel(duelId: string): Promise<OpResponse>;
  repressPutsch(duelId: string): Promise<OpResponse>;

  // RPC légères
  postMessage(channel: TavernMessage['channel'], content: string, recipients?: string[]): Promise<void>;
  submitProposal(title: string, explanation: string, category: string): Promise<void>;
  submitMotion(kind: MotionKind, title: string, explanation: string, payload: Record<string, unknown>): Promise<void>;
  vote(proposalId: string, yes: boolean): Promise<void>;
  veto(proposalId: string): Promise<void>;
  submitMove(duelId: string, move: string, pivotTarget?: string | null): Promise<{ both_submitted: boolean }>;
  submitTargetTaps(duelId: string, taps: TargetTap[]): Promise<{ both_submitted: boolean }>;
  setDelegation(delegateId: string | null, until: string | null): Promise<void>;
  editConstitution(articleNumber: number, title: string, body: string): Promise<void>;

  // Administration
  listSnapshots(): Promise<SnapshotInfo[]>;
  createSnapshot(label?: string | null): Promise<void>;
  restoreSnapshot(snapshotId: string): Promise<void>;
  exportState(): Promise<unknown>;
  importState(json: unknown, label?: string | null): Promise<void>;
  configureSlot(playerId: string, displayName: string | null, characterName: string | null, pin: string | null, active: boolean): Promise<void>;
  aiStatus(): Promise<Record<string, unknown>>;
  runWorldSync(mode: 'nightly' | 'maintenance'): Promise<OpResponse>;
  generateMigrants(count: number): Promise<OpResponse>;
  regenerateGazette(): Promise<OpResponse>;
  sendTemptation(playerId: string): Promise<OpResponse>;

  // Mode démo uniquement
  advanceTime?(hours: number): Promise<OpResponse>;
  resetDemo?(): Promise<void>;
}
