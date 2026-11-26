/**
 * Types partagés par les Edge Functions (lignes de base de données hors moteur, brouillons
 * d'écriture, charge utile d'engine_commit). Module pur : aucune dépendance Deno / npm.
 */
import type {
  AgoraProposal,
  CarlageMove,
  Cell,
  EngineEvent,
  GameSnapshot,
  LedgerDraft,
  RoundLog,
  ScreeningDraft,
  Side,
} from '../engine/index.ts';

export type DuelMode = 'carlage' | 'target';

export interface CarlageDuelRow {
  id: string;
  proposal_id: string | null;
  context: 'veto' | 'putsch' | 'tribunal' | 'friendly';
  /** Carlage 2×2 en direct, ou épreuve de la cible en différé (échéance = round_deadline_at). */
  mode: DuelMode;
  player_a_id: string;
  player_b_id: string | null;
  opponent_migrant_id: string | null;
  defender_side: Side;
  current_round: number;
  round_deadline_at: string;
  player_a_pos: Cell;
  player_b_pos: Cell;
  player_a_balance: number;
  player_b_balance: number;
  player_a_move: string | null;
  player_b_move: string | null;
  round_log: RoundLog[];
  winner_side: Side | null;
  winner_id: string | null;
  injuries_json: unknown;
  /** Résultat final : scores de l'épreuve de la cible ou équilibres du Carlage. */
  result_json: unknown;
  status: 'active' | 'finished' | 'cancelled';
  created_at: string;
  finished_at: string | null;
}

export interface CarlageMoveRow {
  duel_id: string;
  round: number;
  side: Side;
  player_id: string | null;
  move: CarlageMove;
  pivot_target: Cell | null;
}

export interface TargetResultRow {
  duel_id: string;
  side: Side;
  player_id: string | null;
  taps: unknown;
  submitted_at: string;
}

export interface ChatLine {
  sender: string;
  content: string;
  created_at: string;
}

export interface RecentEvent {
  event_type: string;
  title: string;
  body: string;
  created_at: string;
}

/** Tout ce qu'une Edge Function charge avant d'appliquer le moteur. */
export interface GameState {
  snapshot: GameSnapshot;
  /** Scrutins ouverts, décisions adoptées non exécutées, vetos récents. */
  proposals: AgoraProposal[];
  /** Duels de Carlage en cours. */
  duels: CarlageDuelRow[];
  /** Coups déposés dans les duels en cours. */
  moves: CarlageMoveRow[];
  /** Résultats déposés aux épreuves de la cible en cours. */
  targetResults: TargetResultRow[];
  /** 25 derniers messages publics de La Taverne (du plus ancien au plus récent). */
  chat: ChatLine[];
  /** Événements publics des dernières 26 heures (pour La Gazette). */
  recentEvents: RecentEvent[];
  /**
   * Dilemmes des derniers mois, tous statuts (V4.5) : chargés seulement pour proposer de
   * nouvelles tentations sans répéter les situations déjà reçues par un joueur.
   */
  recentTemptations?: TemptationHistoryRow[];
}

export interface TemptationHistoryRow {
  id: string;
  player_id: string;
  category: string;
  title: string;
  prompt_text: string | null;
  created_at: string;
}

export interface TavernDraft {
  channel: 'village_square' | 'agora_hall' | 'whisper';
  content: string;
  recipient_ids?: string[] | null;
}

export interface GazetteSection {
  title: string;
  items: string[];
}

export interface GazetteDraft {
  edition_date: string;
  headline: string;
  body_markdown: string;
  sections: GazetteSection[];
  generated_by: 'ai' | 'fallback';
}

export interface AiCallDraft {
  call_kind: string;
  player_id: string | null;
  used_fallback: boolean;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  error: string | null;
}

export interface HiddenIndicatorRow {
  role_code: string;
  payload: Record<string, unknown>;
  computed_at: string;
}

/** Charge utile de la RPC engine_commit (une transaction). */
export interface CommitPayload {
  village_state?: Record<string, unknown>;
  players?: object[];
  village_migrants?: object[];
  village_children?: object[];
  map_structures?: object[];
  unions?: object[];
  pending_approvals?: object[];
  temptations?: object[];
  constitution_articles?: object[];
  agora_proposals?: object[];
  carlage_duels?: object[];
  role_hidden_indicators?: HiddenIndicatorRow[];
  gazette_editions?: GazetteDraft[];
  game_events?: EngineEvent[];
  ledger_entries?: LedgerDraft[];
  migrant_screenings?: ScreeningDraft[];
  tavern_messages?: TavernDraft[];
  ai_calls?: AiCallDraft[];
}

export interface WeatherSnapshot {
  summary: string;
  temp_max_c: number;
  temp_min_c: number;
  precip_mm: number;
  snow_cm: number;
}
