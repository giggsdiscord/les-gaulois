-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Installation complète (généré par npm run sql:bundle)
-- Migrations : 20261126000100_v38_schema.sql, 20261127000100_engine_commit.sql, 20261128000100_target_trial.sql + seed.sql
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». Ne pas modifier à la main.
-- ============================================================================

-- >>> migrations/20261126000100_v38_schema.sql
-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Schéma PostgreSQL / Supabase complet (GDD V3.8)
-- ----------------------------------------------------------------------------
-- Base : GDD V3.7 §7.1 (schéma fourni) + consolidation technique V3.8 :
--   * PIN haché (bcrypt) dans une table séparée, jamais lisible avec la clé anon
--   * sessions par jeton (en-tête HTTP x-player-token) → RLS par joueur / rôle
--   * vues publiques (village, joueurs, migrants) masquant les indicateurs cachés
--   * tables d'appui : bâtisses & réseaux de la carte, grand livre, verrous,
--     tentations, auscultations, unions, Constitution, Gazette, journal d'événements
--   * restauration de sauvegarde robuste (upsert colonne par colonne, FK différées)
-- Toutes les écritures « moteur » passent par les Edge Functions (service_role) ;
-- les écritures légères (chat, votes, propositions, coups de Carlage) par RPC.
-- Évolutivité : uniquement des migrations ADDITIVES (ALTER TABLE ... ADD COLUMN).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 0. Fonctions utilitaires génériques
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 1. ÉTAT GLOBAL DU VILLAGE (singleton)
-- ============================================================================
CREATE TABLE village_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton),
  revision BIGINT NOT NULL DEFAULT 0,                      -- concurrence optimiste du moteur
  game_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  game_day INT NOT NULL DEFAULT 0 CHECK (game_day >= 0),
  season_number INT NOT NULL DEFAULT 1 CHECK (season_number >= 1), -- saison de jeu = 7 jours réels (lundi→dimanche)
  act_number INT NOT NULL DEFAULT 1 CHECK (act_number BETWEEN 1 AND 3),
  autonomy_pct INT NOT NULL DEFAULT 5 CHECK (autonomy_pct BETWEEN 0 AND 100),

  -- Finances & Fonds souverain
  treasury_eur NUMERIC(12,2) NOT NULL DEFAULT 50000.00,
  land_debt_eur NUMERIC(12,2) NOT NULL DEFAULT 295000.00 CHECK (land_debt_eur >= 0),
  sovereign_fund_eur NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (sovereign_fund_eur >= 0),
  crypto_reserves_eur NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (crypto_reserves_eur >= 0),
  missed_loan_payments INT NOT NULL DEFAULT 0 CHECK (missed_loan_payments >= 0),
  energy_cost_season_eur NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (energy_cost_season_eur >= 0), -- à refacturer au prorata
  treasury_leak_eur NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (treasury_leak_eur >= 0),          -- caché (audit M. Lerme)
  andorra_hidden_capital_eur NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (andorra_hidden_capital_eur >= 0), -- caché

  -- Stocks & Infrastructures
  food_rations NUMERIC(10,2) NOT NULL DEFAULT 150.00 CHECK (food_rations >= 0),
  tomatoes_stock INT NOT NULL DEFAULT 80 CHECK (tomatoes_stock >= 0),
  livestock_count INT NOT NULL DEFAULT 0 CHECK (livestock_count >= 0),
  wood_stock INT NOT NULL DEFAULT 200 CHECK (wood_stock >= 0),
  stone_stock INT NOT NULL DEFAULT 50 CHECK (stone_stock >= 0),
  iron_stock INT NOT NULL DEFAULT 30 CHECK (iron_stock >= 0),
  scrap_stock INT NOT NULL DEFAULT 20 CHECK (scrap_stock >= 0),                 -- caché (Julio)
  tools_stock INT NOT NULL DEFAULT 10 CHECK (tools_stock >= 0),
  tools_wear_pct NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (tools_wear_pct BETWEEN 0 AND 100), -- caché (Julio)
  tools_stolen_season INT NOT NULL DEFAULT 0 CHECK (tools_stolen_season >= 0),   -- caché (Julio)
  medicine_stock INT NOT NULL DEFAULT 10 CHECK (medicine_stock >= 0),
  fuel_stock_l INT NOT NULL DEFAULT 0 CHECK (fuel_stock_l >= 0),
  housing_capacity INT NOT NULL DEFAULT 12 CHECK (housing_capacity >= 0),
  track_condition_pct NUMERIC(5,2) NOT NULL DEFAULT 45 CHECK (track_condition_pct BETWEEN 0 AND 100),
  track_blocked_until TIMESTAMPTZ DEFAULT NULL,                                 -- embourbement 24 h
  fleet_wear_pct NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (fleet_wear_pct BETWEEN 0 AND 100), -- caché (Douanes)
  energy_tier INT NOT NULL DEFAULT 1 CHECK (energy_tier BETWEEN 1 AND 5),
  dam_progress_pct INT NOT NULL DEFAULT 0 CHECK (dam_progress_pct BETWEEN 0 AND 100),
  rd_progress_pct INT NOT NULL DEFAULT 0 CHECK (rd_progress_pct BETWEEN 0 AND 100), -- caché (Tanguy)
  power_meters_installed BOOLEAN NOT NULL DEFAULT FALSE,
  land_surveyed BOOLEAN NOT NULL DEFAULT FALSE,                    -- cartographie d'Alex (prérequis barrage)
  machinery_bonus_until TIMESTAMPTZ DEFAULT NULL,                  -- location d'engins Loxam / Kiloutou
  machinery_bonus_pct INT NOT NULL DEFAULT 0 CHECK (machinery_bonus_pct BETWEEN 0 AND 100),
  water_capacity_l_day INT NOT NULL DEFAULT 1500 CHECK (water_capacity_l_day >= 0),
  water_network_condition_pct NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (water_network_condition_pct BETWEEN 0 AND 100),
  water_quality_pct NUMERIC(5,2) NOT NULL DEFAULT 70 CHECK (water_quality_pct BETWEEN 0 AND 100), -- caché (Tanguy)
  septic_capacity_people INT NOT NULL DEFAULT 8 CHECK (septic_capacity_people >= 0),
  septic_saturation_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (septic_saturation_pct BETWEEN 0 AND 300), -- caché (Alex)
  sabotage_pending BOOLEAN NOT NULL DEFAULT FALSE,                                -- caché (Alex)
  epidemic_incubation_days INT NOT NULL DEFAULT 0 CHECK (epidemic_incubation_days >= 0), -- caché (Tanguy)
  epidemic_until TIMESTAMPTZ DEFAULT NULL,
  garden_area_m2 INT NOT NULL DEFAULT 300 CHECK (garden_area_m2 >= 0),
  ecology_index_pct NUMERIC(5,2) NOT NULL DEFAULT 80 CHECK (ecology_index_pct BETWEEN 0 AND 100), -- caché (Ely)
  frog_family_protected BOOLEAN NOT NULL DEFAULT TRUE,

  -- Cohésion, Moral & Diplomatie
  morale_pct NUMERIC(5,2) NOT NULL DEFAULT 75 CHECK (morale_pct BETWEEN 0 AND 100),
  spanish_fluency_pct NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (spanish_fluency_pct BETWEEN 0 AND 100),
  admin_pressure_pct NUMERIC(5,2) NOT NULL DEFAULT 20 CHECK (admin_pressure_pct BETWEEN 0 AND 100),
  international_notoriety_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (international_notoriety_pct BETWEEN 0 AND 100),
  eu_sympathy_pct NUMERIC(5,2) NOT NULL DEFAULT 30 CHECK (eu_sympathy_pct BETWEEN 0 AND 100), -- caché (Médias)
  perimeter_threat_pct NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (perimeter_threat_pct BETWEEN 0 AND 100), -- caché (Défense)
  customs_alert_pct NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (customs_alert_pct BETWEEN 0 AND 100), -- caché (Douanes)
  carlage_injury_fee_eur NUMERIC(8,2) NOT NULL DEFAULT 50.00 CHECK (carlage_injury_fee_eur >= 0),

  -- Démographie & Natalité (V3.1)
  homosexuality_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 12 CHECK (homosexuality_rate_pct BETWEEN 0 AND 100),
  birth_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 2.50 CHECK (birth_rate_pct >= 0),
  demographic_viability_pct NUMERIC(5,2) NOT NULL DEFAULT 70 CHECK (demographic_viability_pct BETWEEN 0 AND 100),
  low_viability_seasons INT NOT NULL DEFAULT 0 CHECK (low_viability_seasons >= 0),
  seasons_without_birth INT NOT NULL DEFAULT 0 CHECK (seasons_without_birth >= 0),
  birth_accumulator NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (birth_accumulator >= 0),
  births_this_season INT NOT NULL DEFAULT 0 CHECK (births_this_season >= 0),
  children_welcomed_this_season INT NOT NULL DEFAULT 0 CHECK (children_welcomed_this_season >= 0),
  new_adults_this_season INT NOT NULL DEFAULT 0 CHECK (new_adults_this_season >= 0),
  demographic_decline BOOLEAN NOT NULL DEFAULT FALSE,
  law_graduates INT NOT NULL DEFAULT 0 CHECK (law_graduates >= 0),
  family_allowance_season INT NOT NULL DEFAULT 0,

  -- Alcool, Stupéfiants & Insécurité (V3.2)
  alcohol_consumption_pct NUMERIC(5,2) NOT NULL DEFAULT 15 CHECK (alcohol_consumption_pct BETWEEN 0 AND 100),
  drug_prevalence_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (drug_prevalence_pct BETWEEN 0 AND 100),   -- caché (Tanguy)
  addiction_level_pct NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK (addiction_level_pct BETWEEN 0 AND 100),   -- caché (Brunel)
  insecurity_pct NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK (insecurity_pct BETWEEN 0 AND 100),
  insecurity_offset NUMERIC(6,2) NOT NULL DEFAULT 0,               -- part événementielle (IA) qui s'amortit
  security_reduction_pct NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (security_reduction_pct >= 0),
  brunel_reduction_pct NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (brunel_reduction_pct >= 0),

  -- Spectre Idéologique & Productivité (V3.3 - V3.4)
  left_wing_ideology_pct NUMERIC(5,2) NOT NULL DEFAULT 25 CHECK (left_wing_ideology_pct BETWEEN 0 AND 100),
  cultural_friction_pct NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK (cultural_friction_pct BETWEEN 0 AND 100),
  productivity_modifier_pct INT NOT NULL DEFAULT 100 CHECK (productivity_modifier_pct BETWEEN 15 AND 150),
  collectivization_active BOOLEAN NOT NULL DEFAULT FALSE,
  high_left_seasons INT NOT NULL DEFAULT 0 CHECK (high_left_seasons >= 0),
  faction_active BOOLEAN NOT NULL DEFAULT FALSE,                    -- caché (Intérieur)
  strike_until TIMESTAMPTZ DEFAULT NULL,
  black_market_active BOOLEAN NOT NULL DEFAULT FALSE,               -- caché (Intérieur)
  rationing_active BOOLEAN NOT NULL DEFAULT FALSE,
  prohibition_alcohol BOOLEAN NOT NULL DEFAULT FALSE,
  prohibition_drugs BOOLEAN NOT NULL DEFAULT FALSE,
  prohibition_tomatoes BOOLEAN NOT NULL DEFAULT FALSE,

  -- Rituels hebdomadaires (remis à zéro à chaque saison)
  mass_held_this_season BOOLEAN NOT NULL DEFAULT FALSE,
  mediations_this_season INT NOT NULL DEFAULT 0 CHECK (mediations_this_season >= 0),
  tomato_throw_season INT NOT NULL DEFAULT 0,
  penance_required BOOLEAN NOT NULL DEFAULT FALSE,
  smuggling_runs_this_season INT NOT NULL DEFAULT 0 CHECK (smuggling_runs_this_season >= 0),
  bor_concert_season INT NOT NULL DEFAULT -10,
  last_putsch_season INT NOT NULL DEFAULT 0,

  -- Économie parallèle, Gîte, Minage & Souveraineté (Acte III)
  gite_open BOOLEAN NOT NULL DEFAULT FALSE,
  crypto_mining_active BOOLEAN NOT NULL DEFAULT FALSE,
  deterrence_level INT NOT NULL DEFAULT 0 CHECK (deterrence_level BETWEEN 0 AND 5),
  independence_proclaimed BOOLEAN NOT NULL DEFAULT FALSE,

  -- Monde réel & Horodatage
  real_weather_summary TEXT NOT NULL DEFAULT 'Ensoleillé, 14°C (Lleida)',
  real_temp_c NUMERIC(4,1) NOT NULL DEFAULT 14.0,
  real_temp_min_c NUMERIC(4,1) NOT NULL DEFAULT 6.0,
  real_precip_mm NUMERIC(6,1) NOT NULL DEFAULT 0.0 CHECK (real_precip_mm >= 0),
  real_snow_cm NUMERIC(6,1) NOT NULL DEFAULT 0.0 CHECK (real_snow_cm >= 0),
  real_news_headline TEXT DEFAULT NULL,
  constitution_text TEXT NOT NULL DEFAULT '',
  is_defeated BOOLEAN NOT NULL DEFAULT FALSE,
  defeat_reason TEXT DEFAULT NULL,
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_village_state_updated BEFORE UPDATE ON village_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 2. JOUEURS (7 Fondateurs + 3 Places évolutives) — Connexion par Code PIN (V3.5)
-- ============================================================================
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number INT NOT NULL UNIQUE CHECK (slot_number BETWEEN 1 AND 10),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  character_name TEXT NOT NULL CHECK (char_length(character_name) BETWEEN 1 AND 40),
  role_code TEXT UNIQUE NOT NULL CHECK (role_code IN (
    'mayor_agri', 'treasurer_physio', 'civil_eng', 'water_eng', 'smith_diplo',
    'druid', 'priest_apoth', 'defense_sec', 'transport_customs', 'legal_media')),
  role_title TEXT NOT NULL,
  avatar_emoji TEXT NOT NULL DEFAULT '🧑',
  avatar_color TEXT NOT NULL DEFAULT '#8b5a2b',
  is_founder BOOLEAN NOT NULL DEFAULT FALSE,
  is_active_slot BOOLEAN NOT NULL DEFAULT TRUE,   -- places 8 à 10 inactives tant qu'aucun ami ne les occupe
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,        -- accès au panneau de sauvegardes / restauration
  must_change_pin BOOLEAN NOT NULL DEFAULT TRUE,
  ministerial_portfolios TEXT[] NOT NULL DEFAULT '{}'
    CHECK (ministerial_portfolios <@ ARRAY['defense','interior','customs','chancery','media']::TEXT[]),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','forced_labor','banished','executed')),

  -- Santé & Points d'Action
  action_points INT NOT NULL DEFAULT 3 CHECK (action_points BETWEEN 0 AND 3),
  health_pct INT NOT NULL DEFAULT 100 CHECK (health_pct BETWEEN 0 AND 100),
  mental_health_pct INT NOT NULL DEFAULT 80 CHECK (mental_health_pct BETWEEN 0 AND 100),
  fatigue_pct INT NOT NULL DEFAULT 0 CHECK (fatigue_pct BETWEEN 0 AND 100),
  morale_pct INT NOT NULL DEFAULT 75 CHECK (morale_pct BETWEEN 0 AND 100),
  injury_type TEXT DEFAULT NULL CHECK (injury_type IN ('muscular','infectious','psychological')),
  injury_since TIMESTAMPTZ DEFAULT NULL,
  strapping_until TIMESTAMPTZ DEFAULT NULL,       -- strapping préventif posé par M. Lerme
  addiction_level_pct NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK (addiction_level_pct BETWEEN 0 AND 100),
  temptation_guilt_pct INT NOT NULL DEFAULT 0 CHECK (temptation_guilt_pct BETWEEN 0 AND 100),
  pending_ap_penalty INT NOT NULL DEFAULT 0 CHECK (pending_ap_penalty BETWEEN 0 AND 3),

  -- Patrimoine privé & Énergie (V3.4)
  private_wealth_eur NUMERIC(12,2) NOT NULL DEFAULT 2000.00 CHECK (private_wealth_eur >= 0),
  power_kwh_used NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (power_kwh_used >= 0),
  skill_xp INT NOT NULL DEFAULT 0 CHECK (skill_xp >= 0),
  veto_tokens INT NOT NULL DEFAULT 0 CHECK (veto_tokens BETWEEN 0 AND 1),
  spouse_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  is_detained_until TIMESTAMPTZ DEFAULT NULL,     -- cachot / garde à vue (isolement)
  forced_labor_until TIMESTAMPTZ DEFAULT NULL,
  delegated_to UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  delegation_until TIMESTAMPTZ DEFAULT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (spouse_id IS NULL OR spouse_id <> id),
  CHECK (delegated_to IS NULL OR delegated_to <> id)
);

-- PIN à 4 chiffres haché (bcrypt) — jamais exposé à la clé anon (V3.8)
CREATE TABLE player_pins (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jetons de session (mémorisés dans le localStorage, envoyés en en-tête x-player-token)
CREATE TABLE player_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '120 days'),
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_player_sessions_player ON player_sessions(player_id);

-- ============================================================================
-- 3. CARTE DU HAMEAU : BÂTISSES, RÉSEAUX & ÉQUIPEMENTS (V3.8)
-- ============================================================================
CREATE TABLE map_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN (
    'building','church','forge','school','jail','gite','water_source','pipe','septic_tank',
    'power_line','generator','dam','solar','mining_farm','garden','livestock_pen','track',
    'watchtower','gate','square','river','forest','lab','border_post')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ruin' CHECK (status IN (
    'ruin','cleared','in_progress','awaiting_power','operational','damaged','demolished','planned')),
  condition_pct INT NOT NULL DEFAULT 30 CHECK (condition_pct BETWEEN 0 AND 100),
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  beds_capacity INT NOT NULL DEFAULT 0 CHECK (beds_capacity >= 0),   -- lits PLU une fois livrée
  is_power_connected BOOLEAN NOT NULL DEFAULT FALSE,
  plu_approved BOOLEAN NOT NULL DEFAULT FALSE,
  eco_veto_active BOOLEAN NOT NULL DEFAULT FALSE,
  owner_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  x NUMERIC(7,2) NOT NULL DEFAULT 0,          -- coordonnées SVG (viewBox 1000 x 700)
  y NUMERIC(7,2) NOT NULL DEFAULT 0,
  width NUMERIC(7,2) NOT NULL DEFAULT 40,
  height NUMERIC(7,2) NOT NULL DEFAULT 30,
  path_points JSONB DEFAULT NULL,             -- polylignes : piste, rivière, canalisations, lignes électriques
  leak_alert BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_map_structures_updated BEFORE UPDATE ON map_structures
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 4. MIGRANTS, RÉSIDENTS, ENFANTS, UNIONS & FACTIONS (V3.1 - V3.4)
-- ============================================================================
CREATE TABLE village_migrants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  age INT NOT NULL CHECK (age BETWEEN 18 AND 80),
  origin TEXT NOT NULL,
  religion TEXT NOT NULL,  -- 'Catholique', 'Musulmane', 'Orthodoxe', 'Athée/Laïque', 'Évangélique', etc.
  political_leaning TEXT NOT NULL CHECK (political_leaning IN (
    'Droite conservatrice','Droite libérale','Centre','Gauche sociale','Extrême gauche / Collectiviste')),
  left_wing_score INT NOT NULL DEFAULT 30 CHECK (left_wing_score BETWEEN 0 AND 100), -- caché (Brunel)
  physical_strength INT NOT NULL CHECK (physical_strength BETWEEN 1 AND 100),
  specialty_code TEXT NOT NULL CHECK (specialty_code IN (
    'mason','carpenter','welder','farmer','mechanic','electrician','shepherd','unskilled')),
  specialty_level INT NOT NULL DEFAULT 1 CHECK (specialty_level BETWEEN 1 AND 5),
  children_count INT NOT NULL DEFAULT 0 CHECK (children_count BETWEEN 0 AND 5),
  spanish_speaker BOOLEAN NOT NULL DEFAULT FALSE,
  value_proposition TEXT NOT NULL,
  hidden_risk_note TEXT DEFAULT NULL,           -- caché, révélé par auscultation
  pathology_note TEXT DEFAULT NULL,             -- caché (dépisté par Tanguy)
  back_fragility BOOLEAN NOT NULL DEFAULT FALSE,-- caché (ausculté par M. Lerme)
  addiction_level_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (addiction_level_pct BETWEEN 0 AND 100), -- caché
  health_pct INT NOT NULL DEFAULT 90 CHECK (health_pct BETWEEN 0 AND 100),
  injury_type TEXT DEFAULT NULL CHECK (injury_type IN ('muscular','infectious','psychological')),

  -- Statut juridique, loyauté & discipline
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN (
    'candidate','accepted','rejected','forced_labor','expelled','executed','departed')),
  is_naturalized BOOLEAN NOT NULL DEFAULT FALSE,
  patron_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  loyalty_scores JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {"mayor_agri": 65, "treasurer_physio": 40, ...} caché (Brunel)
  faction_type TEXT NOT NULL DEFAULT 'loyalist' CHECK (faction_type IN (
    'loyalist','union_agitator','black_market','devout')),              -- caché (Intérieur)
  assigned_pole TEXT DEFAULT NULL CHECK (assigned_pole IN (
    'mayor_agri','treasurer_physio','civil_eng','water_eng','smith_diplo','druid','priest_apoth',
    'defense_sec','transport_customs','legal_media')),
  private_employer_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  private_wage_eur_week NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (private_wage_eur_week >= 0),
  forced_labor_until TIMESTAMPTZ DEFAULT NULL,
  is_detained_until TIMESTAMPTZ DEFAULT NULL,
  admission_proposal_id UUID DEFAULT NULL,      -- FK ajoutée après agora_proposals (référence circulaire)
  generated_by TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','fallback','manual')),
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX idx_migrants_status ON village_migrants(status);

CREATE TABLE village_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  age_years INT NOT NULL DEFAULT 0 CHECK (age_years BETWEEN 0 AND 30),
  parent_summary TEXT NOT NULL,
  parent_migrant_id UUID REFERENCES village_migrants(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  parent_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  born_in_village BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'child' CHECK (status IN ('child','apprentice','law_student','graduated','lawyer','departed')),
  education_track TEXT NOT NULL DEFAULT 'village_school' CHECK (education_track IN (
    'village_school','apprentice_forge','apprentice_masonry','apprentice_lab','lleida_law_studies')),
  mentor_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  track_started_season INT DEFAULT NULL,
  graduated_pole TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unions officielles célébrées par Brunel (joueurs et/ou résidents)
CREATE TABLE unions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_a_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  partner_a_migrant_id UUID REFERENCES village_migrants(id) DEFERRABLE INITIALLY IMMEDIATE,
  partner_b_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  partner_b_migrant_id UUID REFERENCES village_migrants(id) DEFERRABLE INITIALLY IMMEDIATE,
  celebrated_by UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  celebrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK ((partner_a_player_id IS NULL) <> (partner_a_migrant_id IS NULL)),
  CHECK ((partner_b_player_id IS NULL) <> (partner_b_migrant_id IS NULL))
);

-- Auscultations préalables des candidats (M. Lerme : physique ; Tanguy : médical ; Brunel : psychologique)
CREATE TABLE migrant_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migrant_id UUID NOT NULL REFERENCES village_migrants(id) ON DELETE CASCADE DEFERRABLE INITIALLY IMMEDIATE,
  screened_by UUID NOT NULL REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  screening_type TEXT NOT NULL CHECK (screening_type IN ('physical','medical','psychological')),
  findings JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (migrant_id, screened_by, screening_type)
);
CREATE INDEX idx_screenings_screener ON migrant_screenings(screened_by);

-- ============================================================================
-- 5. AGORA : INITIATIVES HEBDOMADAIRES, MOTIONS, TRIBUNAL PUBLIC (V3.6)
-- ============================================================================
CREATE TABLE agora_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INT NOT NULL CHECK (week_number >= 1),
  proposer_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE, -- NULL = motion du Maître du Jeu
  kind TEXT NOT NULL DEFAULT 'initiative' CHECK (kind IN (
    'initiative','migrant_admission','naturalization','tribunal','collectivization','decollectivization',
    'prohibition','rationing','ministry_election','constitution_article','independence')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),   -- Ex: "Création d'un Fonds Souverain Norvégien"
  detailed_explanation TEXT NOT NULL CHECK (char_length(detailed_explanation) BETWEEN 1 AND 8000),
  category TEXT NOT NULL DEFAULT 'economy' CHECK (category IN (
    'economy','justice','immigration','infrastructure','constitution','society','energy','security')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_migrant_id UUID REFERENCES village_migrants(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  target_player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  required_majority TEXT NOT NULL DEFAULT 'simple' CHECK (required_majority IN ('simple','two_thirds')),
  votes_yes UUID[] NOT NULL DEFAULT '{}',
  votes_no UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','passed','rejected','vetoed','cancelled')),
  vetoed_by UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  ai_execution_summary TEXT DEFAULT NULL,
  effects_json JSONB DEFAULT NULL,
  executed_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX idx_agora_open ON agora_proposals(status, closes_at);
CREATE INDEX idx_agora_week ON agora_proposals(week_number);
-- 1 initiative législative par joueur et par semaine
CREATE UNIQUE INDEX uq_agora_one_initiative_per_week
  ON agora_proposals(proposer_id, week_number) WHERE kind = 'initiative';

ALTER TABLE village_migrants
  ADD CONSTRAINT fk_migrant_admission_proposal FOREIGN KEY (admission_proposal_id)
  REFERENCES agora_proposals(id) DEFERRABLE INITIALLY IMMEDIATE;

-- Éditeur collaboratif de la Constitution (Acte III)
CREATE TABLE constitution_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number INT NOT NULL UNIQUE CHECK (article_number >= 1),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 6000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','adopted','repealed')),
  author_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  last_editor_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  proposal_id UUID REFERENCES agora_proposals(id) DEFERRABLE INITIALLY IMMEDIATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_constitution_updated BEFORE UPDATE ON constitution_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 6. MESSAGERIE TEMPS RÉEL (« LA TAVERNE ») & CARLAGE 2x2
-- ============================================================================
CREATE TABLE tavern_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'village_square' CHECK (channel IN ('village_square','agora_hall','whisper')),
  sender_id UUID REFERENCES players(id) ON DELETE SET NULL,
  recipient_ids UUID[] DEFAULT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  is_system_event BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (channel <> 'whisper' OR (recipient_ids IS NOT NULL AND cardinality(recipient_ids) BETWEEN 1 AND 9))
);
CREATE INDEX idx_tavern_channel_time ON tavern_messages(channel, created_at DESC);
CREATE INDEX idx_tavern_recipients ON tavern_messages USING GIN (recipient_ids);

CREATE TABLE carlage_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES agora_proposals(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  context TEXT NOT NULL DEFAULT 'friendly' CHECK (context IN ('veto','putsch','tribunal','friendly')),
  player_a_id UUID NOT NULL REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  player_b_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,          -- NULL si adversaire PNJ
  opponent_migrant_id UUID REFERENCES village_migrants(id) DEFERRABLE INITIALLY IMMEDIATE, -- meneur PNJ (putsch)
  defender_side TEXT NOT NULL DEFAULT 'a' CHECK (defender_side IN ('a','b')),       -- camp du statu quo (égalité)
  current_round INT NOT NULL DEFAULT 1 CHECK (current_round BETWEEN 1 AND 5),
  round_deadline_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 seconds'),
  player_a_pos TEXT NOT NULL DEFAULT 'TL' CHECK (player_a_pos IN ('TL','TR','BL','BR')),
  player_b_pos TEXT NOT NULL DEFAULT 'BR' CHECK (player_b_pos IN ('TL','TR','BL','BR')),
  player_a_balance INT NOT NULL DEFAULT 100 CHECK (player_a_balance BETWEEN 0 AND 100),
  player_b_balance INT NOT NULL DEFAULT 100 CHECK (player_b_balance BETWEEN 0 AND 100),
  player_a_move TEXT DEFAULT NULL,       -- derniers coups RÉVÉLÉS (manche résolue)
  player_b_move TEXT DEFAULT NULL,
  round_log JSONB NOT NULL DEFAULT '[]'::jsonb,
  winner_side TEXT DEFAULT NULL CHECK (winner_side IN ('a','b')),
  winner_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  injuries_json JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ DEFAULT NULL,
  CHECK ((player_b_id IS NULL) <> (opponent_migrant_id IS NULL)),
  CHECK (player_a_pos <> player_b_pos)
);
CREATE INDEX idx_carlage_status ON carlage_duels(status);

-- Coups secrets de la manche en cours (révélés après résolution)
CREATE TABLE carlage_moves (
  duel_id UUID NOT NULL REFERENCES carlage_duels(id) ON DELETE CASCADE,
  round INT NOT NULL CHECK (round BETWEEN 1 AND 5),
  side TEXT NOT NULL CHECK (side IN ('a','b')),
  player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  move TEXT NOT NULL CHECK (move IN ('push','pivot','anchor','shoulder')),
  pivot_target TEXT DEFAULT NULL CHECK (pivot_target IN ('TL','TR','BL','BR')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (duel_id, round, side),
  CHECK (move <> 'pivot' OR pivot_target IS NOT NULL)
);

-- ============================================================================
-- 7. ÉCONOMIE : GRAND LIVRE, VERROUS RÉGLEMENTAIRES & TENTATIONS
-- ============================================================================
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account TEXT NOT NULL CHECK (account IN ('treasury','sovereign_fund','crypto','land_debt','private')),
  player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  amount_eur NUMERIC(12,2) NOT NULL,
  label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'misc',
  supplier TEXT DEFAULT NULL,
  approval_id UUID DEFAULT NULL,
  created_by UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  game_day INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (account <> 'private' OR player_id IS NOT NULL)
);
CREATE INDEX idx_ledger_player_time ON ledger_entries(player_id, created_at DESC);
CREATE INDEX idx_ledger_account_time ON ledger_entries(account, created_at DESC);

-- Verrous : budget > 500 € (M. Lerme), PLU (Tiphaine), veto écologique (Ely)
CREATE TABLE pending_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('budget','plu','eco_veto')),
  required_role TEXT NOT NULL CHECK (required_role IN ('treasurer_physio','civil_eng','mayor_agri')),
  requested_by UUID NOT NULL REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  structure_id UUID REFERENCES map_structures(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  amount_eur NUMERIC(12,2) DEFAULT NULL,
  action_code TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,   -- action différée, rejouée par le moteur à l'approbation
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','executed')),
  decided_by UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE DEFAULT NULL,
  decided_at TIMESTAMPTZ DEFAULT NULL,
  reason TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_approvals_status ON pending_approvals(status, required_role);

CREATE TABLE temptations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  category TEXT NOT NULL CHECK (category IN ('festive','sentimental','ideological_financial')),
  title TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  yield_effects JSONB NOT NULL DEFAULT '{}'::jsonb,
  resist_effects JSONB NOT NULL DEFAULT '{}'::jsonb,
  choice TEXT NOT NULL DEFAULT 'pending' CHECK (choice IN ('pending','yielded','resisted','expired')),
  confessed BOOLEAN NOT NULL DEFAULT FALSE,
  confessed_at TIMESTAMPTZ DEFAULT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  generated_by TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','fallback')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ DEFAULT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '36 hours')
);
CREATE INDEX idx_temptations_player ON temptations(player_id, choice);

-- ============================================================================
-- 8. INDICATEURS CACHÉS, GAZETTE, JOURNAL D'ÉVÉNEMENTS & APPELS IA
-- ============================================================================
-- Calculés par le moteur (Edge Function) ; lisibles uniquement via get_my_hidden_indicators()
CREATE TABLE role_hidden_indicators (
  role_code TEXT PRIMARY KEY,   -- 'mayor_agri', ..., ou 'portfolio:defense', 'portfolio:interior', ...
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gazette_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_date DATE NOT NULL UNIQUE,
  headline TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by TEXT NOT NULL DEFAULT 'ai' CHECK (generated_by IN ('ai','fallback','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE game_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private','role')),
  player_id UUID DEFAULT NULL,
  role_code TEXT DEFAULT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  game_day INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_game_events_time ON game_events(created_at DESC);

CREATE TABLE ai_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_kind TEXT NOT NULL,
  player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  used_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  model TEXT DEFAULT NULL,
  input_tokens INT DEFAULT NULL,
  output_tokens INT DEFAULT NULL,
  latency_ms INT DEFAULT NULL,
  error TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. SAUVEGARDES QUOTIDIENNES MULTI-JOURS & RESTAURATION EN 1 CLIC (V3.7)
-- ============================================================================
CREATE TABLE daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  trigger_type TEXT NOT NULL DEFAULT 'auto_midnight' CHECK (trigger_type IN (
    'auto_midnight','pre_agora','manual','pre_restore','import')),
  label TEXT NOT NULL,
  full_state_json JSONB NOT NULL, -- Export intégral (tables de jeu + chat + gazette), sans PIN ni sessions
  size_bytes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_daily_snapshots_date ON daily_snapshots(snapshot_date DESC);

-- ============================================================================
-- 10. IDENTITÉ DU JOUEUR COURANT (jeton de session → joueur)
-- ============================================================================
-- Vrai si l'appel provient d'une connexion de confiance (service_role des Edge Functions,
-- éditeur SQL, pg_cron) et non d'un client anonyme.
CREATE OR REPLACE FUNCTION is_trusted_caller() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role'
      OR session_user NOT IN ('authenticator', 'anon', 'authenticated');
$$;

CREATE OR REPLACE FUNCTION current_player_id() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_headers text;
  v_raw text;
  v_id uuid;
BEGIN
  v_headers := nullif(current_setting('request.headers', true), '');
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;
  v_raw := v_headers::json->>'x-player-token';
  IF v_raw IS NULL OR v_raw !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  SELECT s.player_id INTO v_id
  FROM player_sessions s
  WHERE s.token = v_raw::uuid AND NOT s.revoked AND s.expires_at > now();
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION current_player_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role_code FROM players WHERE id = current_player_id();
$$;

-- Renvoie le joueur connecté ou lève une erreur ; p_require_free = pas au cachot / ni banni / ni exécuté
CREATE OR REPLACE FUNCTION _require_player(p_require_free boolean DEFAULT true) RETURNS players
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  SELECT * INTO v_me FROM players WHERE id = current_player_id();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session invalide ou expirée : reconnectez-vous avec votre code PIN.' USING ERRCODE = '28000';
  END IF;
  IF NOT v_me.is_active_slot THEN
    RAISE EXCEPTION 'Cette place n''est pas encore attribuée.' USING ERRCODE = '42501';
  END IF;
  IF p_require_free THEN
    IF v_me.status IN ('banished','executed') THEN
      RAISE EXCEPTION 'Vous n''appartenez plus au hameau (%).', v_me.status USING ERRCODE = '42501';
    END IF;
    IF v_me.is_detained_until IS NOT NULL AND v_me.is_detained_until > now() THEN
      RAISE EXCEPTION 'Vous êtes à l''isolement au cachot jusqu''à %.',
        to_char(v_me.is_detained_until AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI') USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN v_me;
END;
$$;

CREATE OR REPLACE FUNCTION _require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_trusted_caller() THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = current_player_id() AND is_admin) THEN
    RAISE EXCEPTION 'Action réservée à l''administrateur du village.' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Prochaine séance de l'Agora : dimanche 11:00 heure de Madrid
CREATE OR REPLACE FUNCTION next_agora_session(p_from timestamptz DEFAULT now()) RETURNS timestamptz
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT date_trunc('week', p_from AT TIME ZONE 'Europe/Madrid') + INTERVAL '6 days 11 hours' AS sunday_local,
           p_from AT TIME ZONE 'Europe/Madrid' AS now_local
  )
  SELECT (CASE WHEN sunday_local <= now_local THEN sunday_local + INTERVAL '7 days' ELSE sunday_local END)
         AT TIME ZONE 'Europe/Madrid'
  FROM base;
$$;

-- Numéro de semaine de jeu correspondant à une séance d'Agora
CREATE OR REPLACE FUNCTION agora_week_for(p_closes_at timestamptz) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.season_number
         + ((date_trunc('week', p_closes_at AT TIME ZONE 'Europe/Madrid')::date
             - date_trunc('week', now() AT TIME ZONE 'Europe/Madrid')::date) / 7)::int
  FROM village_state v LIMIT 1;
$$;

-- ============================================================================
-- 11. VUES PUBLIQUES (indicateurs cachés exclus)
-- ============================================================================
CREATE VIEW village_public_state AS
SELECT id, revision, game_started_at, game_day, season_number, act_number, autonomy_pct,
       treasury_eur, land_debt_eur, sovereign_fund_eur, crypto_reserves_eur, missed_loan_payments,
       food_rations, tomatoes_stock, livestock_count, wood_stock, stone_stock, iron_stock, tools_stock,
       medicine_stock, fuel_stock_l, housing_capacity, track_condition_pct, track_blocked_until,
       energy_tier, dam_progress_pct, power_meters_installed, water_capacity_l_day,
       water_network_condition_pct, septic_capacity_people, epidemic_until, garden_area_m2,
       frog_family_protected, morale_pct, spanish_fluency_pct, admin_pressure_pct,
       international_notoriety_pct, carlage_injury_fee_eur, homosexuality_rate_pct, birth_rate_pct,
       demographic_viability_pct, low_viability_seasons, seasons_without_birth, births_this_season,
       demographic_decline, law_graduates, alcohol_consumption_pct, insecurity_pct,
       left_wing_ideology_pct, cultural_friction_pct, productivity_modifier_pct, collectivization_active,
       strike_until, rationing_active, prohibition_alcohol, prohibition_drugs, prohibition_tomatoes,
       mass_held_this_season, penance_required, gite_open, crypto_mining_active, deterrence_level,
       independence_proclaimed, real_weather_summary, real_temp_c, real_temp_min_c, real_precip_mm,
       real_snow_cm, real_news_headline, constitution_text, is_defeated, defeat_reason, last_tick_at,
       updated_at
FROM village_state;

CREATE VIEW players_public AS
SELECT id, slot_number, display_name, character_name, role_code, role_title, avatar_emoji, avatar_color,
       is_founder, is_active_slot, is_admin, ministerial_portfolios, status, action_points, health_pct,
       fatigue_pct, injury_type, veto_tokens, spouse_id, is_detained_until, forced_labor_until,
       delegated_to, delegation_until, skill_xp, last_seen_at
FROM players;

CREATE VIEW migrants_public AS
SELECT id, full_name, age, origin, religion, political_leaning, physical_strength, specialty_code,
       specialty_level, children_count, spanish_speaker, value_proposition, health_pct, injury_type,
       status, is_naturalized, patron_player_id, assigned_pole, private_employer_id, private_wage_eur_week,
       forced_labor_until, is_detained_until, admission_proposal_id, generated_by, arrived_at, decided_at
FROM village_migrants;

-- ============================================================================
-- 12. RPC : CONNEXION PAR PIN & SESSION
-- ============================================================================
-- Vérifie le PIN (4 chiffres) ; renvoie {session_token, player} ou NULL si PIN erroné.
-- 5 erreurs consécutives → verrouillage 5 minutes.
CREATE OR REPLACE FUNCTION verify_player_pin(p_player_id uuid, p_pin text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_pin player_pins;
  v_player players;
  v_token uuid;
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Le code PIN doit comporter exactement 4 chiffres.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_player FROM players WHERE id = p_player_id;
  IF NOT FOUND OR NOT v_player.is_active_slot THEN
    RAISE EXCEPTION 'Personnage inconnu ou place non attribuée.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_pin FROM player_pins WHERE player_id = p_player_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun PIN défini pour ce personnage.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RAISE EXCEPTION 'Trop de tentatives. Réessayez après %.',
      to_char(v_pin.locked_until AT TIME ZONE 'Europe/Madrid', 'HH24:MI') USING ERRCODE = '28000';
  END IF;
  IF v_pin.pin_hash <> crypt(p_pin, v_pin.pin_hash) THEN
    UPDATE player_pins
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + INTERVAL '5 minutes' ELSE NULL END,
           updated_at = now()
     WHERE player_id = p_player_id;
    RETURN NULL;  -- pas d'exception : le compteur d'échecs doit être conservé
  END IF;
  UPDATE player_pins SET failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE player_id = p_player_id;
  INSERT INTO player_sessions(player_id) VALUES (p_player_id) RETURNING token INTO v_token;
  UPDATE players SET last_seen_at = now() WHERE id = p_player_id RETURNING * INTO v_player;
  RETURN jsonb_build_object('session_token', v_token, 'player', to_jsonb(v_player));
END;
$$;

CREATE OR REPLACE FUNCTION logout_session() RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw text := nullif(current_setting('request.headers', true), '')::json->>'x-player-token';
BEGIN
  IF v_raw IS NULL OR v_raw !~* '^[0-9a-f-]{36}$' THEN
    RETURN FALSE;
  END IF;
  UPDATE player_sessions SET revoked = TRUE WHERE token = v_raw::uuid;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION get_my_player() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  RETURN to_jsonb(v_me);
END;
$$;

CREATE OR REPLACE FUNCTION set_player_pin(p_old_pin text, p_new_pin text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_me players;
  v_hash text;
BEGIN
  v_me := _require_player(false);
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Le nouveau PIN doit comporter exactement 4 chiffres.' USING ERRCODE = '22023';
  END IF;
  SELECT pin_hash INTO v_hash FROM player_pins WHERE player_id = v_me.id;
  IF v_hash IS NULL OR v_hash <> crypt(coalesce(p_old_pin, ''), v_hash) THEN
    RAISE EXCEPTION 'Ancien PIN incorrect.' USING ERRCODE = '28000';
  END IF;
  UPDATE player_pins SET pin_hash = crypt(p_new_pin, gen_salt('bf', 8)), updated_at = now() WHERE player_id = v_me.id;
  UPDATE players SET must_change_pin = FALSE WHERE id = v_me.id;
  RETURN TRUE;
END;
$$;

-- Administration : (ré)attribution d'une place 8-10 ou remise à zéro d'un PIN oublié
CREATE OR REPLACE FUNCTION admin_configure_slot(
  p_player_id uuid, p_display_name text, p_character_name text, p_new_pin text, p_active boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_player players;
BEGIN
  PERFORM _require_admin();
  IF p_new_pin IS NOT NULL AND p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN invalide (4 chiffres).' USING ERRCODE = '22023';
  END IF;
  UPDATE players
     SET display_name = coalesce(nullif(trim(p_display_name), ''), display_name),
         character_name = coalesce(nullif(trim(p_character_name), ''), character_name),
         is_active_slot = coalesce(p_active, is_active_slot),
         must_change_pin = CASE WHEN p_new_pin IS NOT NULL THEN TRUE ELSE must_change_pin END
   WHERE id = p_player_id
  RETURNING * INTO v_player;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Joueur introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF p_new_pin IS NOT NULL THEN
    INSERT INTO player_pins(player_id, pin_hash) VALUES (p_player_id, crypt(p_new_pin, gen_salt('bf', 8)))
    ON CONFLICT (player_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
    UPDATE player_sessions SET revoked = TRUE WHERE player_id = p_player_id;
  END IF;
  RETURN to_jsonb(v_player) - 'private_wealth_eur';
END;
$$;

-- ============================================================================
-- 13. RPC : LECTURES PRIVÉES (indicateurs cachés, auscultations, grand livre)
-- ============================================================================
-- Indicateurs de mon métier + de mes portefeuilles + de mon conjoint (partage entre époux)
CREATE OR REPLACE FUNCTION get_my_hidden_indicators() RETURNS SETOF role_hidden_indicators
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_spouse_role text;
BEGIN
  v_me := _require_player(false);
  IF v_me.spouse_id IS NOT NULL THEN
    SELECT role_code INTO v_spouse_role FROM players WHERE id = v_me.spouse_id;
  END IF;
  RETURN QUERY
    SELECT r.* FROM role_hidden_indicators r
    WHERE r.role_code = v_me.role_code
       OR r.role_code IN (SELECT 'portfolio:' || p FROM unnest(v_me.ministerial_portfolios) AS p)
       OR (v_spouse_role IS NOT NULL AND r.role_code = v_spouse_role);
END;
$$;

CREATE OR REPLACE FUNCTION get_my_screenings() RETURNS SETOF migrant_screenings
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  RETURN QUERY SELECT * FROM migrant_screenings WHERE screened_by = v_me.id ORDER BY created_at DESC;
END;
$$;

-- Grand livre privé : chacun voit le sien ; M. Lerme (Trésorier) voit tous les patrimoines.
CREATE OR REPLACE FUNCTION get_private_ledger() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_is_treasurer boolean;
BEGIN
  v_me := _require_player(false);
  v_is_treasurer := v_me.role_code = 'treasurer_physio';
  RETURN jsonb_build_object(
    'wealth', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'player_id', p.id, 'display_name', p.display_name,
               'private_wealth_eur', p.private_wealth_eur, 'power_kwh_used', p.power_kwh_used)
             ORDER BY p.slot_number), '[]'::jsonb)
      FROM players p WHERE v_is_treasurer OR p.id = v_me.id),
    'entries', (
      SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM ledger_entries
            WHERE account = 'private' AND (v_is_treasurer OR player_id = v_me.id)
            ORDER BY created_at DESC LIMIT 300) l)
  );
END;
$$;

-- ============================================================================
-- 14. RPC : LA TAVERNE
-- ============================================================================
CREATE OR REPLACE FUNCTION post_tavern_message(p_channel text, p_content text, p_recipient_ids uuid[] DEFAULT NULL)
RETURNS tavern_messages
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_row tavern_messages;
  v_unknown int;
BEGIN
  v_me := _require_player(true);  -- isolement au cachot = pas de prise de parole
  IF p_channel NOT IN ('village_square','agora_hall','whisper') THEN
    RAISE EXCEPTION 'Canal inconnu.' USING ERRCODE = '22023';
  END IF;
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 OR char_length(p_content) > 2000 THEN
    RAISE EXCEPTION 'Message vide ou trop long (2000 caractères max).' USING ERRCODE = '22023';
  END IF;
  IF p_channel = 'whisper' THEN
    IF p_recipient_ids IS NULL OR cardinality(p_recipient_ids) = 0 THEN
      RAISE EXCEPTION 'Un chuchotement doit avoir au moins un destinataire.' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_unknown FROM unnest(p_recipient_ids) r
      WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = r AND p.is_active_slot);
    IF v_unknown > 0 OR v_me.id = ANY(p_recipient_ids) THEN
      RAISE EXCEPTION 'Destinataires invalides.' USING ERRCODE = '22023';
    END IF;
  ELSE
    p_recipient_ids := NULL;
  END IF;
  INSERT INTO tavern_messages(channel, sender_id, recipient_ids, content)
  VALUES (p_channel, v_me.id, p_recipient_ids, trim(p_content))
  RETURNING * INTO v_row;
  UPDATE players SET last_seen_at = now() WHERE id = v_me.id;
  RETURN v_row;
END;
$$;

-- ============================================================================
-- 15. RPC : AGORA (initiatives, motions, votes nominatifs, veto)
-- ============================================================================
-- Initiative législative hebdomadaire (1 par joueur et par semaine, détail explicatif complet)
CREATE OR REPLACE FUNCTION submit_agora_proposal(p_title text, p_detailed_explanation text, p_category text DEFAULT 'economy')
RETURNS agora_proposals
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_closes timestamptz := next_agora_session(now());
  v_week int := agora_week_for(next_agora_session(now()));
  v_row agora_proposals;
BEGIN
  v_me := _require_player(true);
  IF char_length(trim(coalesce(p_title, ''))) < 5 THEN
    RAISE EXCEPTION 'Titre trop court (5 caractères minimum).' USING ERRCODE = '22023';
  END IF;
  IF char_length(trim(coalesce(p_detailed_explanation, ''))) < 80 THEN
    RAISE EXCEPTION 'Le détail explicatif doit être complet (80 caractères minimum : objectifs, financement, modalités).'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM agora_proposals WHERE proposer_id = v_me.id AND week_number = v_week AND kind = 'initiative') THEN
    RAISE EXCEPTION 'Vous avez déjà soumis votre initiative pour la séance du %.',
      to_char(v_closes AT TIME ZONE 'Europe/Madrid', 'DD/MM') USING ERRCODE = '23505';
  END IF;
  INSERT INTO agora_proposals(week_number, proposer_id, kind, title, detailed_explanation, category, closes_at)
  VALUES (v_week, v_me.id, 'initiative', trim(p_title), trim(p_detailed_explanation), coalesce(p_category, 'economy'), v_closes)
  RETURNING * INTO v_row;
  INSERT INTO tavern_messages(channel, sender_id, content, is_system_event)
  VALUES ('agora_hall', NULL, format('📜 Nouvelle initiative de %s : « %s » (vote jusqu''au %s).',
          v_me.display_name, v_row.title, to_char(v_closes AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI')), TRUE);
  RETURN v_row;
END;
$$;

-- Motions structurées (Tribunal Public, naturalisation, prohibition, ministères, Constitution...)
CREATE OR REPLACE FUNCTION submit_agora_motion(p_kind text, p_title text, p_detailed_explanation text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS agora_proposals
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_state village_state;
  v_closes timestamptz := next_agora_session(now());
  v_week int := agora_week_for(next_agora_session(now()));
  v_category text;
  v_majority text := 'simple';
  v_target_migrant uuid;
  v_target_player uuid;
  v_sentence text;
  v_days int;
  v_row agora_proposals;
BEGIN
  v_me := _require_player(true);
  SELECT * INTO v_state FROM village_state LIMIT 1;
  IF p_kind IN ('initiative') OR p_kind IS NULL THEN
    RAISE EXCEPTION 'Utilisez submit_agora_proposal pour les initiatives hebdomadaires.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM agora_proposals WHERE proposer_id = v_me.id AND status = 'open' AND kind <> 'initiative') >= 3 THEN
    RAISE EXCEPTION 'Maximum 3 motions ouvertes par joueur.' USING ERRCODE = '23505';
  END IF;
  p_payload := coalesce(p_payload, '{}'::jsonb);

  CASE p_kind
    WHEN 'tribunal' THEN
      v_category := 'justice';
      v_sentence := p_payload->>'sentence';
      IF v_sentence NOT IN ('forced_labor','expulsion','execution') THEN
        RAISE EXCEPTION 'Sentence inconnue (forced_labor, expulsion, execution).' USING ERRCODE = '22023';
      END IF;
      v_target_migrant := nullif(p_payload->>'target_migrant_id', '')::uuid;
      v_target_player := nullif(p_payload->>'target_player_id', '')::uuid;
      IF (v_target_migrant IS NULL) = (v_target_player IS NULL) THEN
        RAISE EXCEPTION 'Désignez exactement un accusé (résident ou joueur).' USING ERRCODE = '22023';
      END IF;
      IF v_target_player = v_me.id THEN
        RAISE EXCEPTION 'On ne s''accuse pas soi-même devant le Tribunal.' USING ERRCODE = '22023';
      END IF;
      IF v_target_migrant IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM village_migrants WHERE id = v_target_migrant AND status IN ('accepted','forced_labor')) THEN
        RAISE EXCEPTION 'Ce résident ne peut pas être jugé.' USING ERRCODE = '22023';
      END IF;
      IF v_target_player IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM players WHERE id = v_target_player AND status IN ('active','forced_labor') AND is_active_slot) THEN
        RAISE EXCEPTION 'Ce joueur ne peut pas être jugé.' USING ERRCODE = '22023';
      END IF;
      IF v_sentence = 'forced_labor' THEN
        v_days := coalesce((p_payload->>'days')::int, 3);
        IF v_days NOT BETWEEN 3 AND 7 THEN
          RAISE EXCEPTION 'Travaux forcés : durée de 3 à 7 jours.' USING ERRCODE = '22023';
        END IF;
        p_payload := p_payload || jsonb_build_object('days', v_days);
      END IF;
      IF v_sentence = 'execution' THEN
        v_majority := 'two_thirds';
      END IF;
    WHEN 'naturalization' THEN
      v_category := 'immigration';
      IF v_state.act_number < 3 THEN
        RAISE EXCEPTION 'La naturalisation n''est ouverte qu''à l''Acte III.' USING ERRCODE = '42501';
      END IF;
      v_target_migrant := nullif(p_payload->>'migrant_id', '')::uuid;
      IF NOT EXISTS (SELECT 1 FROM village_migrants WHERE id = v_target_migrant AND status = 'accepted' AND NOT is_naturalized) THEN
        RAISE EXCEPTION 'Résident introuvable ou déjà naturalisé.' USING ERRCODE = '22023';
      END IF;
    WHEN 'migrant_admission' THEN
      v_category := 'immigration';
      v_target_migrant := nullif(p_payload->>'migrant_id', '')::uuid;
      IF NOT EXISTS (SELECT 1 FROM village_migrants WHERE id = v_target_migrant AND status = 'candidate') THEN
        RAISE EXCEPTION 'Candidat introuvable.' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (SELECT 1 FROM agora_proposals WHERE target_migrant_id = v_target_migrant AND kind = 'migrant_admission' AND status = 'open') THEN
        RAISE EXCEPTION 'Ce dossier est déjà soumis au vote.' USING ERRCODE = '23505';
      END IF;
    WHEN 'collectivization', 'decollectivization' THEN
      v_category := 'economy';
    WHEN 'prohibition' THEN
      v_category := 'society';
      IF coalesce(p_payload->>'target', '') NOT IN ('alcohol','drugs','tomatoes') OR (p_payload->'active') IS NULL THEN
        RAISE EXCEPTION 'Prohibition : target (alcohol|drugs|tomatoes) et active (bool) requis.' USING ERRCODE = '22023';
      END IF;
    WHEN 'rationing' THEN
      v_category := 'society';
      IF (p_payload->'active') IS NULL THEN
        RAISE EXCEPTION 'Rationnement : active (bool) requis.' USING ERRCODE = '22023';
      END IF;
    WHEN 'ministry_election' THEN
      v_category := 'security';
      IF coalesce(p_payload->>'portfolio', '') NOT IN ('defense','interior','customs','chancery','media') THEN
        RAISE EXCEPTION 'Portefeuille inconnu.' USING ERRCODE = '22023';
      END IF;
      IF (p_payload->>'portfolio') IN ('defense','interior','customs') AND v_state.act_number < 2 THEN
        RAISE EXCEPTION 'Ce portefeuille se débloque à l''Acte II.' USING ERRCODE = '42501';
      END IF;
      IF (p_payload->>'portfolio') IN ('chancery','media') AND v_state.act_number < 3 THEN
        RAISE EXCEPTION 'Ce portefeuille se débloque à l''Acte III.' USING ERRCODE = '42501';
      END IF;
      v_target_player := nullif(p_payload->>'player_id', '')::uuid;
      IF NOT EXISTS (SELECT 1 FROM players WHERE id = v_target_player AND is_active_slot AND status IN ('active','forced_labor')) THEN
        RAISE EXCEPTION 'Candidat au ministère introuvable.' USING ERRCODE = '22023';
      END IF;
    WHEN 'constitution_article' THEN
      v_category := 'constitution';
      IF v_state.act_number < 3 THEN
        RAISE EXCEPTION 'La Constitution se rédige à l''Acte III.' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM constitution_articles WHERE article_number = (p_payload->>'article_number')::int AND status IN ('draft','proposed')) THEN
        RAISE EXCEPTION 'Article introuvable ou déjà adopté.' USING ERRCODE = '22023';
      END IF;
      UPDATE constitution_articles SET status = 'proposed' WHERE article_number = (p_payload->>'article_number')::int;
    WHEN 'independence' THEN
      v_category := 'constitution';
      IF v_state.act_number < 3 OR v_state.independence_proclaimed THEN
        RAISE EXCEPTION 'Proclamation impossible (Acte III requis, une seule fois).' USING ERRCODE = '42501';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM constitution_articles WHERE status = 'adopted') THEN
        RAISE EXCEPTION 'Adoptez au moins un article de Constitution avant de proclamer l''indépendance.' USING ERRCODE = '42501';
      END IF;
      v_majority := 'two_thirds';
    ELSE
      RAISE EXCEPTION 'Type de motion inconnu : %', p_kind USING ERRCODE = '22023';
  END CASE;

  IF char_length(trim(coalesce(p_title, ''))) < 3 OR char_length(trim(coalesce(p_detailed_explanation, ''))) < 10 THEN
    RAISE EXCEPTION 'Titre et motifs obligatoires.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO agora_proposals(week_number, proposer_id, kind, title, detailed_explanation, category, payload,
                              target_migrant_id, target_player_id, required_majority, closes_at)
  VALUES (v_week, v_me.id, p_kind, trim(p_title), trim(p_detailed_explanation), v_category, p_payload,
          v_target_migrant, v_target_player, v_majority, v_closes)
  RETURNING * INTO v_row;

  INSERT INTO tavern_messages(channel, sender_id, content, is_system_event)
  VALUES ('agora_hall', NULL, format('⚖️ Motion déposée par %s : « %s »%s.', v_me.display_name, v_row.title,
          CASE WHEN v_majority = 'two_thirds' THEN ' (majorité des deux tiers requise)' ELSE '' END), TRUE);
  RETURN v_row;
END;
$$;

-- Vote nominatif OUI / NON (modifiable jusqu'à la clôture)
CREATE OR REPLACE FUNCTION cast_agora_vote(p_proposal_id uuid, p_vote boolean) RETURNS agora_proposals
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_prop agora_proposals;
BEGIN
  v_me := _require_player(true);
  IF p_vote IS NULL THEN
    RAISE EXCEPTION 'Vote OUI (true) ou NON (false) requis.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_prop FROM agora_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposition introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_prop.status <> 'open' OR v_prop.closes_at <= now() THEN
    RAISE EXCEPTION 'Le scrutin est clos.' USING ERRCODE = '42501';
  END IF;
  IF v_prop.target_player_id = v_me.id THEN
    RAISE EXCEPTION 'L''accusé ne vote pas sur son propre jugement.' USING ERRCODE = '42501';
  END IF;
  UPDATE agora_proposals
     SET votes_yes = array_remove(votes_yes, v_me.id) || CASE WHEN p_vote THEN ARRAY[v_me.id] ELSE '{}'::uuid[] END,
         votes_no  = array_remove(votes_no,  v_me.id) || CASE WHEN p_vote THEN '{}'::uuid[] ELSE ARRAY[v_me.id] END
   WHERE id = p_proposal_id
  RETURNING * INTO v_prop;
  RETURN v_prop;
END;
$$;

-- Veto institutionnel (Mairie, Trésorerie, Génie civil) : 1 jeton par saison, sur une décision adoptée non exécutée
CREATE OR REPLACE FUNCTION use_veto(p_proposal_id uuid) RETURNS agora_proposals
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_prop agora_proposals;
BEGIN
  v_me := _require_player(true);
  IF v_me.role_code NOT IN ('mayor_agri','treasurer_physio','civil_eng') THEN
    RAISE EXCEPTION 'Seuls les piliers institutionnels (Mairie, Trésorerie, Génie civil) disposent du veto.' USING ERRCODE = '42501';
  END IF;
  IF v_me.veto_tokens < 1 THEN
    RAISE EXCEPTION 'Jeton de veto déjà utilisé cette saison.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_prop FROM agora_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_prop.status <> 'passed' OR v_prop.executed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Seule une décision adoptée et non encore exécutée peut être frappée de veto.' USING ERRCODE = '42501';
  END IF;
  IF v_prop.closed_at IS NOT NULL AND v_prop.closed_at < now() - INTERVAL '6 hours' THEN
    RAISE EXCEPTION 'Délai de veto expiré (6 heures après la clôture).' USING ERRCODE = '42501';
  END IF;
  UPDATE players SET veto_tokens = veto_tokens - 1 WHERE id = v_me.id;
  UPDATE agora_proposals SET status = 'vetoed', vetoed_by = v_me.id WHERE id = p_proposal_id RETURNING * INTO v_prop;
  INSERT INTO tavern_messages(channel, sender_id, content, is_system_event)
  VALUES ('agora_hall', NULL, format('🛑 %s oppose son veto à « %s ». Le porteur peut contester au Carlage 2×2.',
          v_me.display_name, v_prop.title), TRUE);
  RETURN v_prop;
END;
$$;

-- ============================================================================
-- 16. RPC : CARLAGE (coup secret de la manche en cours)
-- ============================================================================
CREATE OR REPLACE FUNCTION carlage_submit_move(p_duel_id uuid, p_move text, p_pivot_target text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_duel carlage_duels;
  v_side text;
  v_pos text;
  v_other_pos text;
  v_count int;
BEGIN
  v_me := _require_player(false);
  SELECT * INTO v_duel FROM carlage_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.status <> 'active' THEN
    RAISE EXCEPTION 'Duel introuvable ou terminé.' USING ERRCODE = 'P0002';
  END IF;
  IF v_duel.player_a_id = v_me.id THEN
    v_side := 'a'; v_pos := v_duel.player_a_pos; v_other_pos := v_duel.player_b_pos;
  ELSIF v_duel.player_b_id = v_me.id THEN
    v_side := 'b'; v_pos := v_duel.player_b_pos; v_other_pos := v_duel.player_a_pos;
  ELSE
    RAISE EXCEPTION 'Vous n''êtes pas combattant de ce duel.' USING ERRCODE = '42501';
  END IF;
  IF now() > v_duel.round_deadline_at + INTERVAL '2 seconds' THEN
    RAISE EXCEPTION 'Trop tard pour cette manche.' USING ERRCODE = '42501';
  END IF;
  IF p_move NOT IN ('push','pivot','anchor','shoulder') THEN
    RAISE EXCEPTION 'Coup inconnu.' USING ERRCODE = '22023';
  END IF;
  IF p_move = 'pivot' THEN
    -- déplacement vers un carreau orthogonalement adjacent et libre
    IF p_pivot_target IS NULL OR p_pivot_target = v_other_pos OR NOT (
         (v_pos = 'TL' AND p_pivot_target IN ('TR','BL')) OR (v_pos = 'TR' AND p_pivot_target IN ('TL','BR'))
      OR (v_pos = 'BL' AND p_pivot_target IN ('TL','BR')) OR (v_pos = 'BR' AND p_pivot_target IN ('TR','BL'))) THEN
      RAISE EXCEPTION 'Pivot : carreau adjacent libre requis.' USING ERRCODE = '22023';
    END IF;
  ELSE
    p_pivot_target := NULL;
  END IF;
  INSERT INTO carlage_moves(duel_id, round, side, player_id, move, pivot_target)
  VALUES (p_duel_id, v_duel.current_round, v_side, v_me.id, p_move, p_pivot_target)
  ON CONFLICT (duel_id, round, side) DO NOTHING;
  SELECT count(*) INTO v_count FROM carlage_moves WHERE duel_id = p_duel_id AND round = v_duel.current_round;
  RETURN jsonb_build_object('round', v_duel.current_round, 'side', v_side,
                            'both_submitted', v_count >= 2 OR v_duel.opponent_migrant_id IS NOT NULL);
END;
$$;

-- ============================================================================
-- 17. RPC : DÉLÉGATION DE POSTE & CONSTITUTION
-- ============================================================================
-- Délégation temporaire (14 jours max) ; permissions restreintes appliquées par le moteur.
CREATE OR REPLACE FUNCTION set_delegation(p_delegate_id uuid, p_until timestamptz) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  IF p_delegate_id IS NULL THEN
    UPDATE players SET delegated_to = NULL, delegation_until = NULL WHERE id = v_me.id;
    RETURN jsonb_build_object('delegated_to', NULL);
  END IF;
  IF p_delegate_id = v_me.id OR NOT EXISTS (
    SELECT 1 FROM players WHERE id = p_delegate_id AND is_active_slot AND status = 'active') THEN
    RAISE EXCEPTION 'Délégataire invalide.' USING ERRCODE = '22023';
  END IF;
  IF p_until IS NULL OR p_until <= now() OR p_until > now() + INTERVAL '14 days' THEN
    RAISE EXCEPTION 'Durée de délégation : jusqu''à 14 jours.' USING ERRCODE = '22023';
  END IF;
  UPDATE players SET delegated_to = p_delegate_id, delegation_until = p_until WHERE id = v_me.id;
  INSERT INTO tavern_messages(channel, sender_id, content, is_system_event)
  SELECT 'village_square', NULL, format('🔑 %s délègue temporairement son poste à %s jusqu''au %s.',
         v_me.display_name, d.display_name, to_char(p_until AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI')), TRUE
  FROM players d WHERE d.id = p_delegate_id;
  RETURN jsonb_build_object('delegated_to', p_delegate_id, 'delegation_until', p_until);
END;
$$;

CREATE OR REPLACE FUNCTION edit_constitution_article(p_article_number int, p_title text, p_body text)
RETURNS constitution_articles
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_row constitution_articles;
BEGIN
  v_me := _require_player(true);
  IF (SELECT act_number FROM village_state LIMIT 1) < 3 THEN
    RAISE EXCEPTION 'La Constitution se rédige à l''Acte III.' USING ERRCODE = '42501';
  END IF;
  IF p_article_number IS NULL OR p_article_number < 1 THEN
    RAISE EXCEPTION 'Numéro d''article invalide.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM constitution_articles WHERE article_number = p_article_number FOR UPDATE;
  IF FOUND AND v_row.status IN ('adopted','proposed') THEN
    RAISE EXCEPTION 'Article % verrouillé (%) : amendez-le par une nouvelle motion.', p_article_number, v_row.status USING ERRCODE = '42501';
  END IF;
  INSERT INTO constitution_articles(article_number, title, body, status, author_id, last_editor_id)
  VALUES (p_article_number, trim(p_title), trim(p_body), 'draft', v_me.id, v_me.id)
  ON CONFLICT (article_number) DO UPDATE
    SET title = EXCLUDED.title, body = EXCLUDED.body, last_editor_id = v_me.id,
        status = CASE WHEN constitution_articles.status = 'repealed' THEN 'draft' ELSE constitution_articles.status END
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ============================================================================
-- 18. SAUVEGARDES : CRÉATION, LISTE, RESTAURATION, EXPORT / IMPORT JSON
-- ============================================================================
-- Tables restaurées (ordre parents → enfants) avec leur clé primaire.
CREATE OR REPLACE FUNCTION _snapshot_tables() RETURNS TABLE(table_name text, pk text, restorable boolean, delete_missing boolean)
LANGUAGE sql IMMUTABLE AS $$
  VALUES
    ('village_state','id', true, true),
    ('players','id', true, false),            -- les joueurs ne sont jamais supprimés par une restauration
    ('map_structures','id', true, true),
    ('village_migrants','id', true, true),
    ('village_children','id', true, true),
    ('agora_proposals','id', true, true),
    ('unions','id', true, true),
    ('constitution_articles','id', true, true),
    ('ledger_entries','id', true, true),
    ('pending_approvals','id', true, true),
    ('temptations','id', true, true),
    ('migrant_screenings','id', true, true),
    ('carlage_duels','id', true, true),
    ('role_hidden_indicators','role_code', true, true),
    ('tavern_messages','id', false, false),   -- exporté, non restauré (historique conservé)
    ('gazette_editions','id', false, false),
    ('game_events','id', false, false)
$$;

CREATE OR REPLACE FUNCTION _build_full_state_json() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb := jsonb_build_object('format', 'les-gaulois-snapshot', 'schema_version', '3.8', 'exported_at', now());
  v_t record;
  v_rows jsonb;
BEGIN
  FOR v_t IN SELECT * FROM _snapshot_tables() LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM public.%I t', v_t.table_name) INTO v_rows;
    v_result := v_result || jsonb_build_object(v_t.table_name, v_rows);
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION create_daily_snapshot(p_trigger text DEFAULT 'manual', p_label text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_json jsonb;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  PERFORM _require_admin();
  IF p_trigger NOT IN ('auto_midnight','pre_agora','manual','pre_restore','import') THEN
    RAISE EXCEPTION 'Déclencheur inconnu.' USING ERRCODE = '22023';
  END IF;
  IF p_trigger IN ('auto_midnight','pre_agora') THEN
    SELECT id INTO v_id FROM daily_snapshots WHERE snapshot_date = v_today AND trigger_type = p_trigger LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;  -- idempotent : une seule sauvegarde automatique par jour et par type
    END IF;
  END IF;
  v_json := _build_full_state_json();
  INSERT INTO daily_snapshots(snapshot_date, trigger_type, label, full_state_json, size_bytes)
  VALUES (v_today, p_trigger,
          coalesce(p_label, CASE p_trigger
            WHEN 'auto_midnight' THEN format('Sauvegarde automatique du %s', to_char(v_today, 'DD/MM/YYYY'))
            WHEN 'pre_agora' THEN format('Avant l''Agora du %s', to_char(v_today, 'DD/MM/YYYY'))
            WHEN 'pre_restore' THEN format('Avant restauration (%s)', to_char(now() AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI'))
            ELSE format('Sauvegarde manuelle (%s)', to_char(now() AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI')) END),
          v_json, octet_length(v_json::text))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION list_daily_snapshots() RETURNS TABLE(
  id uuid, snapshot_date date, trigger_type text, label text, size_bytes int, created_at timestamptz, days_ago int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _require_admin();
  RETURN QUERY
    SELECT s.id, s.snapshot_date, s.trigger_type, s.label, s.size_bytes, s.created_at,
           ((now() AT TIME ZONE 'Europe/Madrid')::date - s.snapshot_date)::int
    FROM daily_snapshots s ORDER BY s.created_at DESC;
END;
$$;

-- Supprime les sauvegardes au-delà de la fenêtre glissante (les manuelles et imports sont conservés)
CREATE OR REPLACE FUNCTION prune_daily_snapshots(p_keep_days int DEFAULT 30) RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  PERFORM _require_admin();
  DELETE FROM daily_snapshots
   WHERE trigger_type IN ('auto_midnight','pre_agora','pre_restore')
     AND created_at < now() - make_interval(days => greatest(p_keep_days, 1));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Restaure une table depuis un tableau JSON : met à jour les lignes existantes (colonnes présentes),
-- insère les manquantes (valeurs par défaut pour les colonnes ajoutées depuis), supprime les surnuméraires.
CREATE OR REPLACE FUNCTION _restore_table(p_table text, p_pk text, p_rows jsonb, p_delete_missing boolean)
RETURNS int
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row jsonb;
  v_cols text[];
  v_present text[];
  v_col_list text;
  v_sel_list text;
  v_exists boolean;
  v_n int := 0;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO v_cols
  FROM pg_attribute a
  WHERE a.attrelid = format('public.%I', p_table)::regclass AND a.attnum > 0 AND NOT a.attisdropped;

  IF p_delete_missing THEN
    EXECUTE format('DELETE FROM public.%1$I t WHERE NOT (t.%2$I::text IN (SELECT e->>%3$L FROM jsonb_array_elements($1) e))',
                   p_table, p_pk, p_pk) USING p_rows;
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT array_agg(k ORDER BY array_position(v_cols, k)) INTO v_present
    FROM jsonb_object_keys(v_row) k WHERE k = ANY(v_cols);
    IF v_present IS NULL OR NOT (p_pk = ANY(v_present)) THEN
      CONTINUE;
    END IF;
    SELECT string_agg(quote_ident(c), ', '), string_agg('r.' || quote_ident(c), ', ')
      INTO v_col_list, v_sel_list FROM unnest(v_present) c;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I::text = $1)', p_table, p_pk)
      INTO v_exists USING v_row->>p_pk;
    IF v_exists THEN
      EXECUTE format('UPDATE public.%1$I t SET (%2$s) = (SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1) r) WHERE t.%4$I::text = $2',
                     p_table, v_col_list, v_sel_list, p_pk) USING v_row, v_row->>p_pk;
    ELSE
      EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %3$s FROM jsonb_populate_record(NULL::public.%1$I, $1) r',
                     p_table, v_col_list, v_sel_list) USING v_row;
    END IF;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

-- Fonction RPC de restauration complète à une date antérieure (J-1, J-2, J-7...)
CREATE OR REPLACE FUNCTION restore_daily_snapshot(p_snapshot_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb;
  v_label text;
  v_t record;
  v_prev_revision bigint;
BEGIN
  PERFORM _require_admin();
  SELECT full_state_json, label INTO v_data, v_label FROM daily_snapshots WHERE id = p_snapshot_id;
  IF v_data IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT revision INTO v_prev_revision FROM village_state LIMIT 1;

  -- Filet de sécurité : la restauration elle-même est annulable
  PERFORM create_daily_snapshot('pre_restore', NULL);

  SET CONSTRAINTS ALL DEFERRED;
  FOR v_t IN SELECT * FROM _snapshot_tables() WHERE restorable LOOP
    PERFORM _restore_table(v_t.table_name, v_t.pk, v_data->v_t.table_name, v_t.delete_missing);
  END LOOP;
  -- les sessions des joueurs restent valides ; le moteur repart d'une révision supérieure
  UPDATE village_state SET revision = coalesce(v_prev_revision, 0) + 1, last_tick_at = now();
  UPDATE carlage_duels SET status = 'cancelled' WHERE status = 'active';

  INSERT INTO game_events(event_type, title, body, data)
  VALUES ('village_restored', 'Village restauré', format('Le hameau a été restauré : %s', v_label),
          jsonb_build_object('snapshot_id', p_snapshot_id));
  INSERT INTO tavern_messages(channel, sender_id, content, is_system_event)
  VALUES ('village_square', NULL, format('⏪ Le village a été restauré à l''état « %s ».', v_label), TRUE);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION export_full_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM _require_admin();
  RETURN _build_full_state_json();
END;
$$;

-- Import manuel d'un export JSON : stocké comme sauvegarde 'import' puis restauré
CREATE OR REPLACE FUNCTION import_full_state(p_json jsonb, p_label text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM _require_admin();
  IF p_json IS NULL OR coalesce(p_json->>'format', '') <> 'les-gaulois-snapshot' OR jsonb_typeof(p_json->'village_state') <> 'array' THEN
    RAISE EXCEPTION 'Fichier JSON invalide (format les-gaulois-snapshot attendu).' USING ERRCODE = '22023';
  END IF;
  INSERT INTO daily_snapshots(snapshot_date, trigger_type, label, full_state_json, size_bytes)
  VALUES ((now() AT TIME ZONE 'Europe/Madrid')::date, 'import',
          coalesce(p_label, format('Import JSON du %s', to_char(now() AT TIME ZONE 'Europe/Madrid', 'DD/MM HH24:MI'))),
          p_json, octet_length(p_json::text))
  RETURNING id INTO v_id;
  PERFORM restore_daily_snapshot(v_id);
  RETURN v_id;
END;
$$;

-- ============================================================================
-- 19. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE village_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE village_migrants ENABLE ROW LEVEL SECURITY;
ALTER TABLE village_children ENABLE ROW LEVEL SECURITY;
ALTER TABLE unions ENABLE ROW LEVEL SECURITY;
ALTER TABLE migrant_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE agora_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE constitution_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tavern_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE carlage_duels ENABLE ROW LEVEL SECURITY;
ALTER TABLE carlage_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE temptations ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_hidden_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE gazette_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Aucune politique (= accès refusé à anon/authenticated) sur : village_state, players, player_pins,
-- player_sessions, village_migrants, role_hidden_indicators, ai_calls, daily_snapshots.
-- Lecture publique via les vues et les RPC ; écriture via RPC et Edge Functions (service_role).

CREATE POLICY read_map ON map_structures FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_children ON village_children FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_unions ON unions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_proposals ON agora_proposals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_constitution ON constitution_articles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_gazette ON gazette_editions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_approvals ON pending_approvals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY read_duels ON carlage_duels FOR SELECT TO anon, authenticated USING (true);

-- Chuchotements : visibles uniquement par l'expéditeur et les destinataires
CREATE POLICY read_tavern ON tavern_messages FOR SELECT TO anon, authenticated
  USING (channel <> 'whisper'
         OR sender_id = (SELECT current_player_id())
         OR (SELECT current_player_id()) = ANY (coalesce(recipient_ids, '{}'::uuid[])));

-- Coups secrets : mon coup, ou les manches déjà résolues
CREATE POLICY read_carlage_moves ON carlage_moves FOR SELECT TO anon, authenticated
  USING (player_id = (SELECT current_player_id())
         OR EXISTS (SELECT 1 FROM carlage_duels d WHERE d.id = duel_id
                    AND (d.status <> 'active' OR d.current_round > carlage_moves.round)));

-- Événements : publics, privés (destinataire) ou de rôle
CREATE POLICY read_events ON game_events FOR SELECT TO anon, authenticated
  USING (visibility = 'public'
         OR (visibility = 'private' AND player_id = (SELECT current_player_id()))
         OR (visibility = 'role' AND role_code = (SELECT current_player_role())));

-- Tentations & Dérives : strictement privées
CREATE POLICY read_own_temptations ON temptations FOR SELECT TO anon, authenticated
  USING (player_id = (SELECT current_player_id()));

-- Grand livre : comptes publics pour tous ; comptes privés pour le titulaire et M. Lerme
CREATE POLICY read_ledger ON ledger_entries FOR SELECT TO anon, authenticated
  USING (account <> 'private'
         OR player_id = (SELECT current_player_id())
         OR (SELECT current_player_role()) = 'treasurer_physio');

-- Auscultations : visibles par l'auscultateur seul
CREATE POLICY read_own_screenings ON migrant_screenings FOR SELECT TO anon, authenticated
  USING (screened_by = (SELECT current_player_id()));

-- ============================================================================
-- 20. PRIVILÈGES
-- ============================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT SELECT ON map_structures, village_children, unions, agora_proposals, constitution_articles,
                gazette_editions, pending_approvals, carlage_duels, carlage_moves, tavern_messages,
                game_events, temptations, ledger_entries, migrant_screenings
  TO anon, authenticated;
GRANT SELECT ON village_public_state, players_public, migrants_public TO anon, authenticated;

GRANT EXECUTE ON FUNCTION
  current_player_id(), current_player_role(), next_agora_session(timestamptz),
  verify_player_pin(uuid, text), logout_session(), get_my_player(), set_player_pin(text, text),
  get_my_hidden_indicators(), get_my_screenings(), get_private_ledger(),
  post_tavern_message(text, text, uuid[]),
  submit_agora_proposal(text, text, text), submit_agora_motion(text, text, text, jsonb),
  cast_agora_vote(uuid, boolean), use_veto(uuid),
  carlage_submit_move(uuid, text, text),
  set_delegation(uuid, timestamptz), edit_constitution_article(int, text, text),
  admin_configure_slot(uuid, text, text, text, boolean),
  create_daily_snapshot(text, text), list_daily_snapshots(), prune_daily_snapshots(int),
  restore_daily_snapshot(uuid), export_full_state(), import_full_state(jsonb, text)
TO anon, authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ============================================================================
-- 21. SUPABASE REALTIME (chat, Agora, Carlage, événements, carte, Gazette)
-- ============================================================================
DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY['tavern_messages','agora_proposals','carlage_duels','carlage_moves',
                                   'game_events','map_structures','gazette_editions','pending_approvals'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;


-- >>> migrations/20261127000100_engine_commit.sql
-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Migration additive V3.9 : écriture atomique du moteur
-- ----------------------------------------------------------------------------
-- engine_commit() applique en UNE transaction tout ce qu'une Edge Function a calculé
-- avec le moteur déterministe : état du village, joueurs, migrants, enfants, carte,
-- unions, Agora, Constitution, verrous, tentations, duels, indicateurs cachés, Gazette,
-- puis les écritures « append-only » (événements, grand livre, auscultations, messages
-- système de La Taverne, journal des appels IA).
-- Concurrence optimiste : la révision attendue doit correspondre, sinon 40001
-- (« revision_conflict ») et l'Edge Function recharge puis recalcule.
-- Réservé au service_role (Edge Functions) — jamais exposé à la clé anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION engine_commit(p_expected_revision bigint, p_changes jsonb) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rev bigint;
  v_t record;
  v_row jsonb;
BEGIN
  IF NOT is_trusted_caller() THEN
    RAISE EXCEPTION 'engine_commit est réservé au moteur (service_role).' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Charge utile invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT revision INTO v_rev FROM village_state LIMIT 1 FOR UPDATE;
  IF v_rev IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'revision_conflict (attendue %, actuelle %)', p_expected_revision, v_rev USING ERRCODE = '40001';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  -- État du village (la révision et l'horodatage technique sont gérés ici)
  IF jsonb_typeof(p_changes->'village_state') = 'object' THEN
    PERFORM _restore_table('village_state', 'id',
      jsonb_build_array((p_changes->'village_state') - 'revision' - 'updated_at' - 'singleton'), false);
  END IF;

  -- Tables d'état : mise à jour des colonnes présentes / insertion des nouvelles lignes
  FOR v_t IN
    SELECT * FROM (VALUES
      ('players', 'id'), ('map_structures', 'id'), ('village_migrants', 'id'), ('village_children', 'id'),
      ('unions', 'id'), ('agora_proposals', 'id'), ('constitution_articles', 'id'), ('pending_approvals', 'id'),
      ('temptations', 'id'), ('carlage_duels', 'id'), ('role_hidden_indicators', 'role_code')
    ) AS t(tbl, pk)
  LOOP
    IF jsonb_typeof(p_changes->v_t.tbl) = 'array' THEN
      PERFORM _restore_table(v_t.tbl, v_t.pk, p_changes->v_t.tbl, false);
    END IF;
  END LOOP;

  -- La Gazette : une édition par jour (remplacée si régénérée)
  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_changes->'gazette_editions', '[]'::jsonb)) LOOP
    INSERT INTO gazette_editions(edition_date, headline, body_markdown, sections, generated_by)
    VALUES ((v_row->>'edition_date')::date, v_row->>'headline', v_row->>'body_markdown',
            coalesce(v_row->'sections', '[]'::jsonb), coalesce(v_row->>'generated_by', 'ai'))
    ON CONFLICT (edition_date) DO UPDATE
      SET headline = EXCLUDED.headline, body_markdown = EXCLUDED.body_markdown,
          sections = EXCLUDED.sections, generated_by = EXCLUDED.generated_by;
  END LOOP;

  -- Écritures append-only
  INSERT INTO game_events(event_type, visibility, player_id, role_code, title, body, data, game_day)
  SELECT x.event_type, coalesce(x.visibility, 'public'), x.player_id, x.role_code, x.title, coalesce(x.body, ''),
         coalesce(x.data, '{}'::jsonb), coalesce(x.game_day, 0)
  FROM jsonb_to_recordset(coalesce(p_changes->'game_events', '[]'::jsonb))
       AS x(event_type text, visibility text, player_id uuid, role_code text, title text, body text, data jsonb, game_day int);

  INSERT INTO ledger_entries(account, player_id, amount_eur, label, category, supplier, approval_id, created_by, game_day)
  SELECT x.account, x.player_id, x.amount_eur, x.label, coalesce(x.category, 'misc'), x.supplier, x.approval_id,
         x.created_by, coalesce(x.game_day, 0)
  FROM jsonb_to_recordset(coalesce(p_changes->'ledger_entries', '[]'::jsonb))
       AS x(account text, player_id uuid, amount_eur numeric, label text, category text, supplier text,
            approval_id uuid, created_by uuid, game_day int);

  INSERT INTO migrant_screenings(migrant_id, screened_by, screening_type, findings)
  SELECT x.migrant_id, x.screened_by, x.screening_type, coalesce(x.findings, '{}'::jsonb)
  FROM jsonb_to_recordset(coalesce(p_changes->'migrant_screenings', '[]'::jsonb))
       AS x(migrant_id uuid, screened_by uuid, screening_type text, findings jsonb)
  ON CONFLICT (migrant_id, screened_by, screening_type) DO UPDATE
    SET findings = EXCLUDED.findings, created_at = now();

  INSERT INTO tavern_messages(channel, sender_id, recipient_ids, content, is_system_event)
  SELECT coalesce(x.channel, 'village_square'), NULL, x.recipient_ids, left(x.content, 2000), TRUE
  FROM jsonb_to_recordset(coalesce(p_changes->'tavern_messages', '[]'::jsonb))
       AS x(channel text, recipient_ids uuid[], content text)
  WHERE x.content IS NOT NULL AND char_length(x.content) > 0;

  INSERT INTO ai_calls(call_kind, player_id, used_fallback, model, input_tokens, output_tokens, latency_ms, error)
  SELECT x.call_kind, x.player_id, coalesce(x.used_fallback, false), x.model, x.input_tokens, x.output_tokens,
         x.latency_ms, x.error
  FROM jsonb_to_recordset(coalesce(p_changes->'ai_calls', '[]'::jsonb))
       AS x(call_kind text, player_id uuid, used_fallback boolean, model text, input_tokens int,
            output_tokens int, latency_ms int, error text);

  UPDATE village_state SET revision = v_rev + 1;
  RETURN v_rev + 1;
END;
$$;

-- Identifie le joueur d'un jeton de session (usage serveur : Edge Functions)
CREATE OR REPLACE FUNCTION session_player(p_token uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.player_id FROM player_sessions s
  WHERE s.token = p_token AND NOT s.revoked AND s.expires_at > now();
$$;

REVOKE ALL ON FUNCTION engine_commit(bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION session_player(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION engine_commit(bigint, jsonb), session_player(uuid) TO service_role;

-- Les fonctions créées après la migration initiale reçoivent par défaut EXECUTE pour anon dans
-- Supabase : on retire explicitement ce droit sur les helpers internes éventuellement recréés.
REVOKE ALL ON FUNCTION _restore_table(text, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;


-- >>> migrations/20261128000100_target_trial.sql
-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Migration additive V4.0 : épreuve de la cible
-- ----------------------------------------------------------------------------
-- Les duels (veto contesté, putsch, duel amical) se jouent au choix du challenger :
--   * 'carlage' : Carlage 2×2 en direct (les deux joueurs en ligne, manches de 10 s) ;
--   * 'target'  : épreuve de la cible en différé (5 cibles, précision + rapidité),
--                 chaque joueur joue quand il veut avant l'échéance (round_deadline_at).
-- Les taps sont déposés par RPC ; le score est calculé par le moteur (Edge Function).
-- ============================================================================

ALTER TABLE carlage_duels
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'carlage' CHECK (mode IN ('carlage', 'target')),
  ADD COLUMN IF NOT EXISTS result_json JSONB DEFAULT NULL;   -- scores de la cible ou équilibres finaux

CREATE TABLE IF NOT EXISTS target_trial_results (
  duel_id UUID NOT NULL REFERENCES carlage_duels(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('a', 'b')),
  player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  taps JSONB NOT NULL CHECK (jsonb_typeof(taps) = 'array' AND jsonb_array_length(taps) <= 5),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (duel_id, side)
);

ALTER TABLE target_trial_results ENABLE ROW LEVEL SECURITY;

-- Résultats secrets tant que le duel n'est pas terminé (chacun voit le sien)
CREATE POLICY read_target_results ON target_trial_results FOR SELECT TO anon, authenticated
  USING (player_id = (SELECT current_player_id())
         OR EXISTS (SELECT 1 FROM carlage_duels d WHERE d.id = duel_id AND d.status <> 'active'));

REVOKE ALL ON target_trial_results FROM anon, authenticated;
GRANT SELECT ON target_trial_results TO anon, authenticated;
GRANT ALL ON target_trial_results TO service_role;

-- Dépôt des 5 taps d'un joueur (une seule fois, avant l'échéance)
CREATE OR REPLACE FUNCTION target_submit(p_duel_id uuid, p_taps jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_duel carlage_duels;
  v_side text;
  v_count int;
BEGIN
  v_me := _require_player(false);
  SELECT * INTO v_duel FROM carlage_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.status <> 'active' OR v_duel.mode <> 'target' THEN
    RAISE EXCEPTION 'Épreuve introuvable ou terminée.' USING ERRCODE = 'P0002';
  END IF;
  IF v_duel.player_a_id = v_me.id THEN
    v_side := 'a';
  ELSIF v_duel.player_b_id = v_me.id THEN
    v_side := 'b';
  ELSE
    RAISE EXCEPTION 'Vous ne participez pas à cette épreuve.' USING ERRCODE = '42501';
  END IF;
  IF now() > v_duel.round_deadline_at THEN
    RAISE EXCEPTION 'Trop tard : l''échéance de l''épreuve est passée.' USING ERRCODE = '42501';
  END IF;
  IF p_taps IS NULL OR jsonb_typeof(p_taps) <> 'array' OR jsonb_array_length(p_taps) > 5 THEN
    RAISE EXCEPTION 'Résultat invalide (5 taps au plus).' USING ERRCODE = '22023';
  END IF;
  INSERT INTO target_trial_results(duel_id, side, player_id, taps)
  VALUES (p_duel_id, v_side, v_me.id, p_taps)
  ON CONFLICT (duel_id, side) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vous avez déjà joué cette épreuve.' USING ERRCODE = '23505';
  END IF;
  SELECT count(*) INTO v_count FROM target_trial_results WHERE duel_id = p_duel_id;
  RETURN jsonb_build_object('side', v_side, 'both_submitted', v_count >= 2 OR v_duel.opponent_migrant_id IS NOT NULL);
END;
$$;

-- Le Carlage 2×2 refuse désormais les coups sur une épreuve de la cible
CREATE OR REPLACE FUNCTION carlage_submit_move(p_duel_id uuid, p_move text, p_pivot_target text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_duel carlage_duels;
  v_side text;
  v_pos text;
  v_other_pos text;
  v_count int;
BEGIN
  v_me := _require_player(false);
  SELECT * INTO v_duel FROM carlage_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.status <> 'active' THEN
    RAISE EXCEPTION 'Duel introuvable ou terminé.' USING ERRCODE = 'P0002';
  END IF;
  IF v_duel.mode <> 'carlage' THEN
    RAISE EXCEPTION 'Ce duel se joue à l''épreuve de la cible.' USING ERRCODE = '22023';
  END IF;
  IF v_duel.player_a_id = v_me.id THEN
    v_side := 'a'; v_pos := v_duel.player_a_pos; v_other_pos := v_duel.player_b_pos;
  ELSIF v_duel.player_b_id = v_me.id THEN
    v_side := 'b'; v_pos := v_duel.player_b_pos; v_other_pos := v_duel.player_a_pos;
  ELSE
    RAISE EXCEPTION 'Vous n''êtes pas combattant de ce duel.' USING ERRCODE = '42501';
  END IF;
  IF now() > v_duel.round_deadline_at + INTERVAL '2 seconds' THEN
    RAISE EXCEPTION 'Trop tard pour cette manche.' USING ERRCODE = '42501';
  END IF;
  IF p_move NOT IN ('push','pivot','anchor','shoulder') THEN
    RAISE EXCEPTION 'Coup inconnu.' USING ERRCODE = '22023';
  END IF;
  IF p_move = 'pivot' THEN
    IF p_pivot_target IS NULL OR p_pivot_target = v_other_pos OR NOT (
         (v_pos = 'TL' AND p_pivot_target IN ('TR','BL')) OR (v_pos = 'TR' AND p_pivot_target IN ('TL','BR'))
      OR (v_pos = 'BL' AND p_pivot_target IN ('TL','BR')) OR (v_pos = 'BR' AND p_pivot_target IN ('TR','BL'))) THEN
      RAISE EXCEPTION 'Pivot : carreau adjacent libre requis.' USING ERRCODE = '22023';
    END IF;
  ELSE
    p_pivot_target := NULL;
  END IF;
  INSERT INTO carlage_moves(duel_id, round, side, player_id, move, pivot_target)
  VALUES (p_duel_id, v_duel.current_round, v_side, v_me.id, p_move, p_pivot_target)
  ON CONFLICT (duel_id, round, side) DO NOTHING;
  SELECT count(*) INTO v_count FROM carlage_moves WHERE duel_id = p_duel_id AND round = v_duel.current_round;
  RETURN jsonb_build_object('round', v_duel.current_round, 'side', v_side,
                            'both_submitted', v_count >= 2 OR v_duel.opponent_migrant_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION target_submit(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION carlage_submit_move(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION target_submit(uuid, jsonb), carlage_submit_move(uuid, text, text) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'target_trial_results') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.target_trial_results;
  END IF;
END;
$$;


-- >>> seed.sql
-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Données initiales (GDD V3.8)
-- 7 fondateurs + 3 places évolutives, état initial du hameau (30 ha, Pyrénées de Lleida),
-- carte SVG (viewBox 1000 x 700), grand livre d'ouverture, Gazette n°0.
-- PIN initial de tous les personnages : 0000 (changement obligatoire à la 1re connexion).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. État global du village (valeurs par défaut du GDD §7.1)
-- ----------------------------------------------------------------------------
INSERT INTO village_state (id, real_weather_summary, real_news_headline)
VALUES ('00000000-0000-4000-8000-000000000001',
        'Ensoleillé, 14°C (Lleida)',
        'Arrivée des sept fondateurs au hameau');

-- ----------------------------------------------------------------------------
-- 2. Joueurs : 7 fondateurs + 3 places évolutives (inactives)
-- ----------------------------------------------------------------------------
INSERT INTO players (id, slot_number, display_name, character_name, role_code, role_title, avatar_emoji,
                     avatar_color, is_founder, is_active_slot, is_admin, veto_tokens, ministerial_portfolios)
VALUES
  ('10000000-0000-4000-8000-000000000001', 1, 'Ely', 'Pit', 'mayor_agri',
   'Maire, Agriculture & Écologie', '🌿', '#4d7c0f', TRUE, TRUE, FALSE, 1, '{}'),
  ('10000000-0000-4000-8000-000000000002', 2, 'Guillem', 'M. Lerme', 'treasurer_physio',
   'Trésorier & Kinésithérapeute', '💶', '#b45309', TRUE, TRUE, TRUE, 1, '{}'),
  ('10000000-0000-4000-8000-000000000003', 3, 'Tiphaine', 'Tiph', 'civil_eng',
   'Architecte, Génie Civil, PLU & Énergie', '📐', '#1d4ed8', TRUE, TRUE, FALSE, 1, '{}'),
  ('10000000-0000-4000-8000-000000000004', 4, 'Alex', 'Alex Joly', 'water_eng',
   'Ingénieur Polyvalent (Hydraulique, Réseaux & Génie Technique)', '💧', '#0e7490', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000005', 5, 'Julio', 'Julou', 'smith_diplo',
   'Forgeron, Subsistance & Co-diplomate', '⚒️', '#57534e', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000006', 6, 'Tanguy', 'Tango', 'druid',
   'Médecin-Druide & Scientifique Polyvalent (R&D, Chimie & Physique)', '🧪', '#7e22ce', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000007', 7, 'Guillaume B.', 'Brunel', 'priest_apoth',
   'Médecin-Apothicaire, Psychiatre-Psychologue & Prêtre', '✝️', '#991b1b', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000008', 8, 'Place 8', 'À pourvoir', 'defense_sec',
   'Sécurité & Défense (Extérieure + Intérieure)', '🛡️', '#374151', FALSE, FALSE, FALSE, 0, '{defense,interior}'),
  ('10000000-0000-4000-8000-000000000009', 9, 'Place 9', 'À pourvoir', 'transport_customs',
   'Transports, Piste & Douanes', '🚚', '#374151', FALSE, FALSE, FALSE, 0, '{customs}'),
  ('10000000-0000-4000-8000-000000000010', 10, 'Place 10', 'À pourvoir', 'legal_media',
   'Chancellerie, Droit & Médias', '📰', '#374151', FALSE, FALSE, FALSE, 0, '{chancery,media}');

INSERT INTO player_pins (player_id, pin_hash)
SELECT id, extensions.crypt('0000', extensions.gen_salt('bf', 8)) FROM players;

-- ----------------------------------------------------------------------------
-- 3. Carte du hameau (30 ha) — bâtisses, réseaux, équipements
-- ----------------------------------------------------------------------------
INSERT INTO map_structures (code, kind, name, status, condition_pct, progress_pct, beds_capacity,
                            is_power_connected, plu_approved, x, y, width, height, path_points, notes)
VALUES
  -- Paysage
  ('foret_nord', 'forest', 'Bosc de la Solana', 'operational', 100, 100, 0, FALSE, TRUE, 0, 0, 1000, 110,
   '[[0,0],[1000,0],[1000,70],[820,110],[600,90],[380,110],[160,80],[0,120]]', 'Forêt communale, risque de cultures clandestines'),
  ('foret_ouest', 'forest', 'Bosc de l''Obaga', 'operational', 100, 100, 0, FALSE, TRUE, 0, 120, 120, 420,
   '[[0,120],[110,160],[90,300],[120,420],[60,520],[0,540]]', NULL),
  ('riu', 'river', 'Riu de la Vall', 'operational', 100, 100, 0, FALSE, TRUE, 640, 60, 340, 640,
   '[[980,60],[900,160],[820,260],[760,380],[700,520],[640,700]]', 'Débit réservé obligatoire pour les poissons de Julio'),
  ('piste', 'track', 'Pista forestal de Lleida', 'operational', 45, 100, 0, FALSE, TRUE, 0, 380, 430, 270,
   '[[0,650],[120,610],[220,560],[300,500],[360,440],[430,390]]', 'Accès unique non goudronné ; état = track_condition_pct'),
  ('placa', 'square', 'Plaça del Poble', 'operational', 70, 100, 0, FALSE, TRUE, 430, 330, 70, 50, NULL,
   'Agora du dimanche, Tribunal Public, pilori'),
  -- Bâtisses habitables au départ (12 lits PLU)
  ('casa_gran', 'building', 'Casa Gran', 'operational', 55, 100, 6, FALSE, TRUE, 360, 250, 70, 45, NULL,
   'Logement commun sommaire des fondateurs'),
  ('borda_pi', 'building', 'Borda del Pi', 'operational', 45, 100, 6, FALSE, TRUE, 520, 260, 60, 40, NULL,
   'Grange aménagée en dortoir'),
  -- Équipements existants
  ('cal_ferrer', 'forge', 'Cal Ferrer (forge)', 'operational', 40, 100, 0, FALSE, TRUE, 300, 360, 50, 35, NULL,
   'Forge rudimentaire de Julio'),
  ('esglesia', 'church', 'Església de Sant Climent', 'damaged', 35, 100, 0, FALSE, TRUE, 470, 170, 55, 60, NULL,
   'Messe dominicale, mariages et confessions de Brunel'),
  ('font_bosc', 'water_source', 'Font del Bosc (captage)', 'operational', 60, 100, 0, FALSE, TRUE, 820, 200, 26, 26, NULL,
   'Captage d''eau potable'),
  ('conduite_principale', 'pipe', 'Conduite principale', 'operational', 60, 100, 0, FALSE, TRUE, 460, 200, 360, 120,
   '[[820,210],[700,230],[560,280],[460,320]]', 'Réseau d''Alex ; alertes de fuite'),
  ('fossa_nord', 'septic_tank', 'Fossa sèptica nord', 'operational', 60, 100, 0, FALSE, TRUE, 380, 560, 40, 24, NULL,
   'Capacité 8 personnes'),
  ('hort_ely', 'garden', 'Hort d''Ely (potager)', 'operational', 70, 100, 0, FALSE, TRUE, 520, 440, 110, 70, NULL,
   'Potager commun ; tomates stockées à part'),
  -- Ruines rénovables
  ('cal_mestre', 'school', 'Cal Mestre (salle de classe)', 'ruin', 20, 0, 0, FALSE, FALSE, 250, 260, 50, 35, NULL,
   'École du hameau et apprentissage'),
  ('torre_vella', 'jail', 'Torre Vella (cachot)', 'ruin', 30, 0, 0, FALSE, FALSE, 560, 380, 34, 34, NULL,
   'Isolement de 24 h'),
  ('mas_era', 'gite', 'Mas de l''Era (futur gîte rural)', 'ruin', 25, 0, 8, FALSE, FALSE, 180, 180, 75, 45, NULL,
   'Randonneurs pyrénéens et spectateurs des BOR'),
  ('borda_alta', 'building', 'Borda Alta', 'ruin', 25, 0, 6, FALSE, FALSE, 620, 180, 60, 40, NULL, NULL),
  ('cal_pastor', 'building', 'Cal Pastor', 'ruin', 20, 0, 4, FALSE, FALSE, 280, 120, 50, 35, NULL, NULL),
  ('casa_riu', 'building', 'Casa del Riu', 'ruin', 30, 0, 5, FALSE, FALSE, 660, 300, 55, 38, NULL, NULL),
  ('cabana_moli', 'building', 'Cabana del Molí', 'ruin', 15, 0, 3, FALSE, FALSE, 740, 420, 40, 30, NULL,
   'En bord de rivière (zone humide, grenouilles)'),
  ('paller_nou', 'building', 'Paller Nou', 'ruin', 25, 0, 4, FALSE, FALSE, 420, 470, 50, 34, NULL, NULL),
  ('apotecaria', 'lab', 'Apotecària (laboratoire de Tango)', 'ruin', 25, 0, 0, FALSE, FALSE, 610, 470, 46, 32, NULL,
   'Laboratoire, apothicairerie, R&D'),
  -- Projets planifiés (Actes I à III)
  ('cleda', 'livestock_pen', 'Cleda (enclos brebis & cochons)', 'planned', 100, 0, 0, FALSE, FALSE, 150, 330, 90, 60, NULL,
   'Cheptel pastoral d''Ely et Julio'),
  ('grup_electrogen', 'generator', 'Grup electrogen', 'planned', 100, 0, 0, FALSE, FALSE, 330, 430, 30, 22, NULL,
   'Palier énergétique 2'),
  ('linia_aeria', 'power_line', 'Línia aèria (réseau de Tiphaine)', 'planned', 100, 0, 0, FALSE, FALSE, 0, 120, 400, 180,
   '[[0,120],[150,160],[300,250],[400,300]]', 'Palier énergétique 3, compteurs individuels'),
  ('microcentral', 'dam', 'Microcentral del Riu (barrage)', 'planned', 100, 0, 0, FALSE, FALSE, 860, 130, 50, 30, NULL,
   'Palier 4 ; veto écologique possible (famille de grenouilles)'),
  ('camp_solar', 'solar', 'Camp solar', 'planned', 100, 0, 0, FALSE, FALSE, 640, 560, 80, 50, NULL, 'Palier 4'),
  ('granja_calcul', 'mining_farm', 'Granja de càlcul (minage)', 'planned', 100, 0, 0, FALSE, FALSE, 760, 520, 50, 34, NULL,
   'Acte III : surplus hydroélectrique'),
  ('mirador_pista', 'watchtower', 'Mirador de la Pista', 'planned', 100, 0, 0, FALSE, FALSE, 140, 560, 22, 22, NULL,
   'Acte II : Défense'),
  ('barrera_pista', 'gate', 'Barrera de la Pista (herse)', 'planned', 100, 0, 0, FALSE, FALSE, 60, 625, 30, 14, NULL,
   'Acte II : Défense'),
  ('duana', 'border_post', 'Duana de la Pista (poste-frontière)', 'planned', 100, 0, 0, FALSE, FALSE, 15, 590, 34, 24, NULL,
   'Acte III : contrôle des passeports');

-- ----------------------------------------------------------------------------
-- 4. Grand livre d'ouverture (M. Lerme)
-- ----------------------------------------------------------------------------
INSERT INTO ledger_entries (account, player_id, amount_eur, label, category)
VALUES
  ('treasury', NULL, 50000.00, 'Fonds de roulement initial (apports des fondateurs)', 'opening'),
  ('land_debt', NULL, 295000.00, 'Emprunt foncier — achat du hameau (30 ha, PLU 2013)', 'opening');

INSERT INTO ledger_entries (account, player_id, amount_eur, label, category)
SELECT 'private', id, 2000.00, 'Épargne personnelle d''ouverture', 'opening' FROM players WHERE is_founder;

-- ----------------------------------------------------------------------------
-- 5. Gazette n°0, événement de lancement & message de bienvenue
-- ----------------------------------------------------------------------------
INSERT INTO gazette_editions (edition_date, headline, body_markdown, generated_by)
VALUES ((now() AT TIME ZONE 'Europe/Madrid')::date,
        'Sept Français rachètent un hameau fantôme au-dessus de Lleida',
        E'**Pyrénées de Lleida** — L''Ayuntamiento confirme la vente d''un hameau abandonné de 30 hectares, '
        'à 18 km d''Andorre, pour 295 000 €. Ni eau courante ni électricité : une piste forestière, des ruines, '
        'un potager et une famille de grenouilles. Les nouveaux propriétaires annoncent « une simple rénovation ». '
        'Personne n''y croit.',
        'manual');

INSERT INTO game_events (event_type, title, body, data)
VALUES ('game_started', 'Fondation du hameau',
        'Les sept fondateurs prennent possession des ruines. Acte I : le Chantier des Ruines.',
        '{"act": 1}'::jsonb);

INSERT INTO tavern_messages (channel, sender_id, content, is_system_event)
VALUES ('village_square', NULL,
        '🏔️ Bienvenue au hameau ! Caisse commune : 50 000 €. Dette foncière : 295 000 €. Bon courage.', TRUE);

COMMIT;
