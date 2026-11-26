-- ============================================================================
-- V4.8 → V5.x — Vie du village : marché, bois & chauffage, travail des résidents,
-- chantier collectif, objectifs d'Acte, ambitions secrètes, nouveaux bâtiments…
-- Migration ADDITIVE unique pour toute la série (aucun DROP, aucun renommage) :
--   * village_state.life        : état « vie du village » (compteurs hebdomadaires du
--                                 marché et des coupes, chantier de la semaine, objectifs,
--                                 relations avec les voisins, fêtes, frise…) — public ;
--   * village_migrants.work_post : poste de travail d'un résident (potager, forêt…) ;
--   * village_migrants.traits    : personnalité et humeur d'un résident ;
--   * players.ambition           : ambition secrète d'un joueur (jamais dans players_public ;
--                                  lisible par son seul titulaire via get_my_player) ;
--   * map_structures.variant     : type fin d'un nouveau bâtiment (four, fromagerie…) — la
--                                  contrainte CHECK sur kind reste inchangée ;
--   * map_structures.upgrade_level : niveau d'amélioration d'un bâtiment.
-- Le moteur crée lui-même les nouveaux ouvrages le moment venu (engine_commit insère les
-- lignes manquantes). engine_commit ignore les colonnes inconnues : le code reste compatible
-- tant que cette migration n'est pas appliquée, mais les nouveautés ne seraient pas gardées.
-- À exécuter SEULE dans le SQL Editor de Supabase (jamais setup_complete.sql).
-- ============================================================================

ALTER TABLE village_state ADD COLUMN IF NOT EXISTS life JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE village_migrants ADD COLUMN IF NOT EXISTS work_post TEXT DEFAULT NULL;
ALTER TABLE village_migrants ADD COLUMN IF NOT EXISTS traits JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE players ADD COLUMN IF NOT EXISTS ambition JSONB DEFAULT NULL;
ALTER TABLE map_structures ADD COLUMN IF NOT EXISTS variant TEXT DEFAULT NULL;
ALTER TABLE map_structures ADD COLUMN IF NOT EXISTS upgrade_level INT NOT NULL DEFAULT 1 CHECK (upgrade_level BETWEEN 1 AND 5);

-- Vues publiques : mêmes colonnes, nouvelles colonnes ajoutées à la fin (les droits sont conservés)
CREATE OR REPLACE VIEW village_public_state AS
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
       updated_at, life
FROM village_state;

CREATE OR REPLACE VIEW migrants_public AS
SELECT id, full_name, age, origin, religion, political_leaning, physical_strength, specialty_code,
       specialty_level, children_count, spanish_speaker, value_proposition, health_pct, injury_type,
       status, is_naturalized, patron_player_id, assigned_pole, private_employer_id, private_wage_eur_week,
       forced_labor_until, is_detained_until, admission_proposal_id, generated_by, arrived_at, decided_at,
       work_post, traits
FROM village_migrants;
