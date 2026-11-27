/**
 * Types du moteur déterministe — miroir des tables Supabase (GDD V3.8 §7.1).
 * Les noms de champs restent en snake_case pour coller aux lignes PostgREST.
 * Horodatages : chaînes ISO 8601. Montants : euros (2 décimales). Jauges : 0-100 (2 décimales).
 */

export type ISODate = string;

export type RoleCode =
  | 'mayor_agri'
  | 'treasurer_physio'
  | 'civil_eng'
  | 'water_eng'
  | 'smith_diplo'
  | 'druid'
  | 'priest_apoth'
  | 'defense_sec'
  | 'transport_customs'
  | 'legal_media';

export type Portfolio = 'defense' | 'interior' | 'customs' | 'chancery' | 'media';
export type InjuryType = 'muscular' | 'infectious' | 'psychological';
export type PlayerStatus = 'active' | 'forced_labor' | 'banished' | 'executed';
export type ActNumber = 1 | 2 | 3;
export type CalendarSeason = 'winter' | 'spring' | 'summer' | 'autumn';

export interface VillageState {
  id: string;
  revision: number;
  game_started_at: ISODate;
  game_day: number;
  season_number: number;
  act_number: ActNumber;
  autonomy_pct: number;

  treasury_eur: number;
  land_debt_eur: number;
  sovereign_fund_eur: number;
  crypto_reserves_eur: number;
  missed_loan_payments: number;
  treasury_leak_eur: number;
  andorra_hidden_capital_eur: number;
  energy_cost_season_eur: number;

  food_rations: number;
  tomatoes_stock: number;
  livestock_count: number;
  wood_stock: number;
  stone_stock: number;
  iron_stock: number;
  scrap_stock: number;
  tools_stock: number;
  tools_wear_pct: number;
  tools_stolen_season: number;
  medicine_stock: number;
  fuel_stock_l: number;
  housing_capacity: number;
  track_condition_pct: number;
  track_blocked_until: ISODate | null;
  fleet_wear_pct: number;
  energy_tier: number;
  dam_progress_pct: number;
  rd_progress_pct: number;
  power_meters_installed: boolean;
  land_surveyed: boolean;
  machinery_bonus_until: ISODate | null;
  machinery_bonus_pct: number;
  water_capacity_l_day: number;
  water_network_condition_pct: number;
  water_quality_pct: number;
  septic_capacity_people: number;
  septic_saturation_pct: number;
  sabotage_pending: boolean;
  epidemic_incubation_days: number;
  epidemic_until: ISODate | null;
  garden_area_m2: number;
  ecology_index_pct: number;
  frog_family_protected: boolean;

  morale_pct: number;
  spanish_fluency_pct: number;
  admin_pressure_pct: number;
  international_notoriety_pct: number;
  eu_sympathy_pct: number;
  perimeter_threat_pct: number;
  customs_alert_pct: number;
  carlage_injury_fee_eur: number;

  homosexuality_rate_pct: number;
  birth_rate_pct: number;
  demographic_viability_pct: number;
  low_viability_seasons: number;
  seasons_without_birth: number;
  birth_accumulator: number;
  births_this_season: number;
  children_welcomed_this_season: number;
  new_adults_this_season: number;
  demographic_decline: boolean;
  law_graduates: number;
  family_allowance_season: number;

  alcohol_consumption_pct: number;
  drug_prevalence_pct: number;
  addiction_level_pct: number;
  insecurity_pct: number;
  insecurity_offset: number;
  security_reduction_pct: number;
  brunel_reduction_pct: number;

  left_wing_ideology_pct: number;
  cultural_friction_pct: number;
  productivity_modifier_pct: number;
  collectivization_active: boolean;
  high_left_seasons: number;
  faction_active: boolean;
  strike_until: ISODate | null;
  black_market_active: boolean;
  rationing_active: boolean;
  prohibition_alcohol: boolean;
  prohibition_drugs: boolean;
  prohibition_tomatoes: boolean;

  mass_held_this_season: boolean;
  mediations_this_season: number;
  tomato_throw_season: number;
  penance_required: boolean;
  smuggling_runs_this_season: number;
  bor_concert_season: number;
  last_putsch_season: number;

  gite_open: boolean;
  crypto_mining_active: boolean;
  deterrence_level: number;
  independence_proclaimed: boolean;

  real_weather_summary: string;
  real_temp_c: number;
  real_temp_min_c: number;
  real_precip_mm: number;
  real_snow_cm: number;
  real_news_headline: string | null;
  constitution_text: string;
  is_defeated: boolean;
  defeat_reason: string | null;
  last_tick_at: ISODate;
  /** Vie du village (V4.8+, colonne JSONB `life`) : absent tant que la migration n'est pas appliquée. */
  life?: VillageLife;
}

/**
 * État « vie du village » (V4.8+) stocké en JSONB : compteurs hebdomadaires, nouveaux stocks,
 * chantier collectif, objectifs, relations… Toutes les clés sont facultatives (lecture via lifeOf()).
 */
export interface VillageLife {
  /** Ventes au marché pendant la saison (semaine) en cours, en unités, par produit. */
  market_sold?: Record<string, number>;
  /** Coupes de bois pendant la saison en cours. */
  wood_cuts?: number;
  /** Nuits de froid d'affilée sans assez de bois pour chauffer. */
  cold_streak?: number;
  /** Bois brûlé pour le chauffage la nuit dernière. */
  heating_last?: number;
  /** Coupes de bois interdites par Ely jusqu'au lundi suivant (V4.9) ; null = forêt ouverte. */
  forest_ban?: ForestBan | null;
  /** Ce que les résidents ont produit la nuit dernière (V4.9). */
  work_last?: ResidentWorkTotals;
  /** Chantier collectif de la semaine en cours (V5.0). */
  collective?: CollectiveProject | null;
  /** Projets soumis au vote pour la semaine suivante (le premier est celui que le hameau propose). */
  collective_candidates?: string[];
  /** Votes pour le chantier de la semaine suivante : joueur → projet. */
  collective_votes?: Record<string, string>;
  /** Bilan du chantier de la semaine précédente. */
  collective_last?: CollectiveProject | null;
  /** Objectifs d'Acte cochés (V5.1) : identifiant → date ; une étape cochée le reste. */
  act_goals?: Record<string, ISODate>;
  /** Actes dont toute la liste est cochée (récompense de fin de liste versée). */
  act_goals_complete?: number[];
}

/** Chantier collectif de la semaine (V5.0) : tout le monde y met des PA. */
export interface CollectiveProject {
  id: string;
  started_at: ISODate;
  goal: number;
  points: number;
  /** Points apportés par joueur. */
  contributions: Record<string, number>;
  completed_at: ISODate | null;
  /** Achevé avant dimanche : bonus appliqué. */
  early: boolean;
}

/** Droit de regard d'Ely sur les coupes de bois (V4.9). */
export interface ForestBan {
  by: string;
  reason: string;
  since: ISODate;
}

/** Production d'une nuit de travail des résidents (V4.9). */
export interface ResidentWorkTotals {
  /** Résidents au travail / résidents avec un poste mais inactifs / résidents sans poste. */
  workers: number;
  idle: number;
  unassigned: number;
  rations: number;
  tomatoes: number;
  wood: number;
  /** Points d'avancement de chantier et de réparation. */
  build: number;
  repair: number;
  stone_used: number;
  tools_wear: number;
  iron: number;
  scrap_used: number;
  water: number;
  track: number;
  ecology: number;
}

export interface Player {
  id: string;
  slot_number: number;
  display_name: string;
  character_name: string;
  role_code: RoleCode;
  role_title: string;
  is_founder: boolean;
  is_active_slot: boolean;
  is_admin: boolean;
  ministerial_portfolios: Portfolio[];
  status: PlayerStatus;
  action_points: number;
  health_pct: number;
  mental_health_pct: number;
  fatigue_pct: number;
  morale_pct: number;
  injury_type: InjuryType | null;
  injury_since: ISODate | null;
  strapping_until: ISODate | null;
  addiction_level_pct: number;
  temptation_guilt_pct: number;
  pending_ap_penalty: number;
  private_wealth_eur: number;
  power_kwh_used: number;
  skill_xp: number;
  veto_tokens: number;
  spouse_id: string | null;
  is_detained_until: ISODate | null;
  forced_labor_until: ISODate | null;
  delegated_to: string | null;
  delegation_until: ISODate | null;
  /** Ambition secrète (V5.2, colonne JSONB `ambition`) : visible par son seul titulaire. */
  ambition?: Record<string, unknown> | null;
}

export type MigrantStatus =
  | 'candidate'
  | 'accepted'
  | 'rejected'
  | 'forced_labor'
  | 'expelled'
  | 'executed'
  | 'departed';

export type PoliticalLeaning =
  | 'Droite conservatrice'
  | 'Droite libérale'
  | 'Centre'
  | 'Gauche sociale'
  | 'Extrême gauche / Collectiviste';

export type SpecialtyCode =
  | 'mason'
  | 'carpenter'
  | 'welder'
  | 'farmer'
  | 'mechanic'
  | 'electrician'
  | 'shepherd'
  | 'unskilled';

export type FactionType = 'loyalist' | 'union_agitator' | 'black_market' | 'devout';

export interface Migrant {
  id: string;
  full_name: string;
  age: number;
  origin: string;
  religion: string;
  political_leaning: PoliticalLeaning;
  left_wing_score: number;
  physical_strength: number;
  specialty_code: SpecialtyCode;
  specialty_level: number;
  children_count: number;
  spanish_speaker: boolean;
  value_proposition: string;
  hidden_risk_note: string | null;
  pathology_note: string | null;
  back_fragility: boolean;
  addiction_level_pct: number;
  health_pct: number;
  injury_type: InjuryType | null;
  status: MigrantStatus;
  is_naturalized: boolean;
  patron_player_id: string | null;
  loyalty_scores: Partial<Record<RoleCode, number>>;
  faction_type: FactionType;
  assigned_pole: RoleCode | null;
  private_employer_id: string | null;
  private_wage_eur_week: number;
  forced_labor_until: ISODate | null;
  is_detained_until: ISODate | null;
  admission_proposal_id: string | null;
  generated_by: 'ai' | 'fallback' | 'manual';
  arrived_at: ISODate;
  decided_at: ISODate | null;
  /** Poste de travail d'un résident (V4.9, code de `WORK_POSTS`) : null = sans affectation. */
  work_post?: string | null;
  /** Personnalité et humeur d'un résident (V5.x, JSONB). */
  traits?: Record<string, unknown>;
}

export type ChildStatus = 'child' | 'apprentice' | 'law_student' | 'graduated' | 'lawyer' | 'departed';
export type EducationTrack =
  | 'village_school'
  | 'apprentice_forge'
  | 'apprentice_masonry'
  | 'apprentice_lab'
  | 'lleida_law_studies';

export interface Child {
  id: string;
  full_name: string;
  age_years: number;
  parent_summary: string;
  parent_migrant_id: string | null;
  parent_player_id: string | null;
  born_in_village: boolean;
  status: ChildStatus;
  education_track: EducationTrack;
  mentor_player_id: string | null;
  track_started_season: number | null;
  graduated_pole: RoleCode | null;
  created_at: ISODate;
}

export type StructureKind =
  | 'building' | 'church' | 'forge' | 'school' | 'jail' | 'gite' | 'water_source' | 'pipe'
  | 'septic_tank' | 'power_line' | 'generator' | 'dam' | 'solar' | 'mining_farm' | 'garden'
  | 'livestock_pen' | 'track' | 'watchtower' | 'gate' | 'square' | 'river' | 'forest' | 'lab'
  | 'border_post';

export type StructureStatus =
  | 'ruin' | 'cleared' | 'in_progress' | 'awaiting_power' | 'operational' | 'damaged' | 'demolished' | 'planned';

export interface MapStructure {
  id: string;
  code: string;
  kind: StructureKind;
  name: string;
  status: StructureStatus;
  condition_pct: number;
  progress_pct: number;
  beds_capacity: number;
  is_power_connected: boolean;
  plu_approved: boolean;
  eco_veto_active: boolean;
  owner_player_id: string | null;
  leak_alert: boolean;
  /** Type fin d'un nouveau bâtiment (V5.x : four, fromagerie…), null pour les ouvrages d'origine. */
  variant?: string | null;
  /** Niveau d'amélioration (1 à 5). */
  upgrade_level?: number;
}

export interface Union {
  id: string;
  partner_a_player_id: string | null;
  partner_a_migrant_id: string | null;
  partner_b_player_id: string | null;
  partner_b_migrant_id: string | null;
  celebrated_by: string | null;
  celebrated_at: ISODate;
  is_active: boolean;
}

export type ApprovalKind = 'budget' | 'plu' | 'eco_veto';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'executed';

export interface PendingApproval {
  id: string;
  kind: ApprovalKind;
  required_role: 'treasurer_physio' | 'civil_eng' | 'mayor_agri';
  requested_by: string;
  structure_id: string | null;
  amount_eur: number | null;
  action_code: string;
  payload: ActionRequest;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: ISODate | null;
  reason: string | null;
  created_at: ISODate;
}

export type TemptationCategory = 'festive' | 'sentimental' | 'ideological_financial';

export interface TemptationEffects {
  morale_pct?: number;
  alcohol_consumption_pct?: number;
  drug_prevalence_pct?: number;
  homosexuality_rate_pct?: number;
  treasury_eur?: number;
  private_wealth_eur?: number;
  addiction_level_pct?: number;
  left_wing_ideology_pct?: number;
  admin_pressure_pct?: number;
  international_notoriety_pct?: number;
}

export interface Temptation {
  id: string;
  player_id: string;
  category: TemptationCategory;
  title: string;
  prompt_text: string;
  yield_effects: TemptationEffects;
  resist_effects: TemptationEffects;
  choice: 'pending' | 'yielded' | 'resisted' | 'expired';
  confessed: boolean;
  confessed_at: ISODate | null;
  published: boolean;
  generated_by: 'ai' | 'fallback';
  created_at: ISODate;
  responded_at: ISODate | null;
  expires_at: ISODate;
}

export type ProposalKind =
  | 'initiative' | 'migrant_admission' | 'naturalization' | 'tribunal' | 'collectivization'
  | 'decollectivization' | 'prohibition' | 'rationing' | 'ministry_election' | 'constitution_article'
  | 'independence';

export type ProposalStatus = 'open' | 'passed' | 'rejected' | 'vetoed' | 'cancelled';

export interface AgoraProposal {
  id: string;
  week_number: number;
  proposer_id: string | null;
  kind: ProposalKind;
  title: string;
  detailed_explanation: string;
  category: string;
  payload: Record<string, unknown>;
  target_migrant_id: string | null;
  target_player_id: string | null;
  required_majority: 'simple' | 'two_thirds';
  votes_yes: string[];
  votes_no: string[];
  status: ProposalStatus;
  vetoed_by: string | null;
  closes_at: ISODate;
  ai_execution_summary: string | null;
  executed_at: ISODate | null;
  closed_at: ISODate | null;
}

export interface ConstitutionArticle {
  id: string;
  article_number: number;
  title: string;
  body: string;
  status: 'draft' | 'proposed' | 'adopted' | 'repealed';
}

/** Instantané complet manipulé par le moteur (chargé par l'Edge Function en service_role). */
export interface GameSnapshot {
  village: VillageState;
  players: Player[];
  migrants: Migrant[];
  children: Child[];
  structures: MapStructure[];
  unions: Union[];
  approvals: PendingApproval[];
  temptations: Temptation[];
  constitution: ConstitutionArticle[];
}

// ---------------------------------------------------------------------------
// Sorties du moteur
// ---------------------------------------------------------------------------
export interface EngineEvent {
  event_type: string;
  visibility: 'public' | 'private' | 'role';
  player_id?: string | null;
  role_code?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  game_day: number;
}

export type LedgerAccount = 'treasury' | 'sovereign_fund' | 'crypto' | 'land_debt' | 'private';

export interface LedgerDraft {
  account: LedgerAccount;
  player_id?: string | null;
  amount_eur: number;
  label: string;
  category: string;
  supplier?: string | null;
  created_by?: string | null;
  approval_id?: string | null;
  game_day: number;
}

export interface ScreeningDraft {
  migrant_id: string;
  screened_by: string;
  screening_type: 'physical' | 'medical' | 'psychological';
  findings: Record<string, unknown>;
}

export interface ApprovalDraft {
  id: string;
  kind: ApprovalKind;
  required_role: 'treasurer_physio' | 'civil_eng' | 'mayor_agri';
  requested_by: string;
  structure_id: string | null;
  amount_eur: number | null;
  action_code: string;
  payload: ActionRequest;
}

export interface EngineEffects {
  events: EngineEvent[];
  ledger: LedgerDraft[];
  screenings: ScreeningDraft[];
  approvals: ApprovalDraft[];
  /** Coups de théâtre nécessitant une suite côté serveur (duel de putsch, Gazette, etc.). */
  triggers: EngineTrigger[];
}

export type EngineTrigger =
  | { type: 'putsch_attempt'; leader_migrant_id: string; president_player_id: string | null }
  | { type: 'scandal_published'; temptation_id: string; player_id: string }
  | { type: 'defeat'; reason: string }
  | { type: 'act_changed'; from: ActNumber; to: ActNumber }
  | { type: 'needs_ai'; reason: 'free_action' | 'initiative'; payload: Record<string, unknown> };

// ---------------------------------------------------------------------------
// Actions métiers
// ---------------------------------------------------------------------------
export interface ActionRequest {
  action_code: string;
  actor_id: string;
  /** Titulaire du poste quand l'acteur agit par délégation. */
  on_behalf_of_id?: string | null;
  target_player_id?: string | null;
  target_migrant_id?: string | null;
  target_child_id?: string | null;
  target_structure_id?: string | null;
  quantity?: number | null;
  amount_eur?: number | null;
  catalog_item_id?: string | null;
  /** Approbations déjà accordées (verrous budget / PLU) lors d'une ré-exécution différée. */
  approval_ids?: string[];
  params?: Record<string, unknown>;
  /** Texte de l'Action Libre IA. */
  free_text?: string | null;
}

export interface ActionOutcome extends EngineEffects {
  ok: boolean;
  status: 'done' | 'pending_approval' | 'refused';
  error: string | null;
  narrative: string;
  snapshot: GameSnapshot;
  ap_spent: number;
}
