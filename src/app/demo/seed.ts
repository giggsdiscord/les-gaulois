/**
 * Données initiales du mode démo — miroir de supabase/seed.sql (vérifié par tests/app/demoSeed.test.ts).
 */
import type { Player, VillageState } from '../engine.ts';
import type { Structure } from '../api/types.ts';

export const DEMO_VILLAGE_ID = '00000000-0000-4000-8000-000000000001';

export function demoVillage(nowIso: string): VillageState {
  return {
    id: DEMO_VILLAGE_ID, revision: 0, game_started_at: nowIso, game_day: 0, season_number: 1, act_number: 1, autonomy_pct: 5,
    treasury_eur: 50000, land_debt_eur: 295000, sovereign_fund_eur: 0, crypto_reserves_eur: 0, missed_loan_payments: 0,
    treasury_leak_eur: 0, andorra_hidden_capital_eur: 0, energy_cost_season_eur: 0,
    food_rations: 150, tomatoes_stock: 80, livestock_count: 0, wood_stock: 200, stone_stock: 50, iron_stock: 30, scrap_stock: 20,
    tools_stock: 10, tools_wear_pct: 20, tools_stolen_season: 0, medicine_stock: 10, fuel_stock_l: 0, housing_capacity: 12,
    track_condition_pct: 45, track_blocked_until: null, fleet_wear_pct: 30, energy_tier: 1, dam_progress_pct: 0, rd_progress_pct: 0,
    power_meters_installed: false, land_surveyed: false, machinery_bonus_until: null, machinery_bonus_pct: 0,
    water_capacity_l_day: 1500, water_network_condition_pct: 60, water_quality_pct: 70, septic_capacity_people: 8,
    septic_saturation_pct: 0, sabotage_pending: false, epidemic_incubation_days: 0, epidemic_until: null, garden_area_m2: 300,
    ecology_index_pct: 80, frog_family_protected: true, morale_pct: 75, spanish_fluency_pct: 15, admin_pressure_pct: 20,
    international_notoriety_pct: 0, eu_sympathy_pct: 30, perimeter_threat_pct: 10, customs_alert_pct: 10, carlage_injury_fee_eur: 50,
    homosexuality_rate_pct: 12, birth_rate_pct: 2.5, demographic_viability_pct: 70, low_viability_seasons: 0, seasons_without_birth: 0,
    birth_accumulator: 0, births_this_season: 0, children_welcomed_this_season: 0, new_adults_this_season: 0, demographic_decline: false,
    law_graduates: 0, family_allowance_season: 0, alcohol_consumption_pct: 15, drug_prevalence_pct: 0, addiction_level_pct: 5,
    insecurity_pct: 5, insecurity_offset: 0, security_reduction_pct: 0, brunel_reduction_pct: 0, left_wing_ideology_pct: 25,
    cultural_friction_pct: 5, productivity_modifier_pct: 100, collectivization_active: false, high_left_seasons: 0, faction_active: false,
    strike_until: null, black_market_active: false, rationing_active: false, prohibition_alcohol: false, prohibition_drugs: false,
    prohibition_tomatoes: false, mass_held_this_season: false, mediations_this_season: 0, tomato_throw_season: 0, penance_required: false,
    smuggling_runs_this_season: 0, bor_concert_season: -10, last_putsch_season: 0, gite_open: false, crypto_mining_active: false,
    deterrence_level: 0, independence_proclaimed: false, real_weather_summary: 'Ensoleillé, 14°C (Lleida)', real_temp_c: 14,
    real_temp_min_c: 6, real_precip_mm: 0, real_snow_cm: 0, real_news_headline: 'Arrivée des sept fondateurs au hameau',
    constitution_text: '', is_defeated: false, defeat_reason: null, last_tick_at: nowIso,
  };
}

export type DemoPlayer = Player & {
  avatar_emoji: string;
  avatar_color: string;
  must_change_pin: boolean;
  last_seen_at: string | null;
};

const ROSTER: [number, string, string, Player['role_code'], string, string, string, boolean, string[]][] = [
  [1, 'Ely', 'Pit', 'mayor_agri', 'Maire, Agriculture & Écologie', '🌿', '#4d7c0f', true, []],
  [2, 'Guillem', 'M. Lerme', 'treasurer_physio', 'Trésorier & Kinésithérapeute', '💶', '#b45309', true, []],
  [3, 'Tiphaine', 'Tiph', 'civil_eng', 'Architecte, Génie Civil, PLU & Énergie', '📐', '#1d4ed8', true, []],
  [4, 'Alex', 'Alex Joly', 'water_eng', 'Ingénieur Polyvalent (Hydraulique, Réseaux & Génie Technique)', '💧', '#0e7490', true, []],
  [5, 'Julio', 'Julou', 'smith_diplo', 'Forgeron, Subsistance & Co-diplomate', '⚒️', '#57534e', true, []],
  [6, 'Tanguy', 'Tango', 'druid', 'Médecin-Druide & Scientifique Polyvalent (R&D, Chimie & Physique)', '🧪', '#7e22ce', true, []],
  [7, 'Guillaume B.', 'Brunel', 'priest_apoth', 'Médecin-Apothicaire, Psychiatre-Psychologue & Prêtre', '✝️', '#991b1b', true, []],
  [8, 'Place 8', 'À pourvoir', 'defense_sec', 'Sécurité & Défense (Extérieure + Intérieure)', '🛡️', '#374151', false, ['defense', 'interior']],
  [9, 'Place 9', 'À pourvoir', 'transport_customs', 'Transports, Piste & Douanes', '🚚', '#374151', false, ['customs']],
  [10, 'Place 10', 'À pourvoir', 'legal_media', 'Chancellerie, Droit & Médias', '📰', '#374151', false, ['chancery', 'media']],
];

export function demoPlayerId(slot: number): string {
  return `10000000-0000-4000-8000-0000000000${String(slot).padStart(2, '0')}`;
}

export function demoPlayers(): DemoPlayer[] {
  return ROSTER.map(([slot, display, character, role, title, emoji, color, founder, portfolios]) => ({
    id: demoPlayerId(slot),
    slot_number: slot,
    display_name: display,
    character_name: character,
    role_code: role,
    role_title: title,
    avatar_emoji: emoji,
    avatar_color: color,
    is_founder: founder,
    is_active_slot: founder,
    is_admin: slot === 2,
    must_change_pin: false,
    ministerial_portfolios: portfolios as Player['ministerial_portfolios'],
    status: 'active',
    action_points: 3,
    health_pct: 100,
    mental_health_pct: 80,
    fatigue_pct: 0,
    morale_pct: 75,
    injury_type: null,
    injury_since: null,
    strapping_until: null,
    addiction_level_pct: 5,
    temptation_guilt_pct: 0,
    pending_ap_penalty: 0,
    private_wealth_eur: 2000,
    power_kwh_used: 0,
    skill_xp: 0,
    veto_tokens: ['mayor_agri', 'treasurer_physio', 'civil_eng'].includes(role) ? 1 : 0,
    spouse_id: null,
    is_detained_until: null,
    forced_labor_until: null,
    delegated_to: null,
    delegation_until: null,
    last_seen_at: null,
  }));
}

type S = [string, Structure['kind'], string, Structure['status'], number, number, number, boolean, boolean, number, number, number, number, number[][] | null, string | null];

const STRUCTURES: S[] = [
  ['foret_nord', 'forest', 'Bosc de la Solana', 'operational', 100, 100, 0, false, true, 0, 0, 1000, 110, [[0, 0], [1000, 0], [1000, 70], [820, 110], [600, 90], [380, 110], [160, 80], [0, 120]], 'Forêt communale, risque de cultures clandestines'],
  ['foret_ouest', 'forest', "Bosc de l'Obaga", 'operational', 100, 100, 0, false, true, 0, 120, 120, 420, [[0, 120], [110, 160], [90, 300], [120, 420], [60, 520], [0, 540]], null],
  ['riu', 'river', 'Riu de la Vall', 'operational', 100, 100, 0, false, true, 640, 60, 340, 640, [[980, 60], [900, 160], [820, 260], [760, 380], [700, 520], [640, 700]], 'Débit réservé obligatoire pour les poissons de Julio'],
  ['piste', 'track', 'Pista forestal de Lleida', 'operational', 45, 100, 0, false, true, 0, 380, 430, 270, [[0, 650], [120, 610], [220, 560], [300, 500], [360, 440], [430, 390]], 'Accès unique non goudronné'],
  ['placa', 'square', 'Plaça del Poble', 'operational', 70, 100, 0, false, true, 430, 330, 70, 50, null, 'Agora du dimanche, Tribunal Public, pilori'],
  ['casa_gran', 'building', 'Casa Gran', 'operational', 55, 100, 6, false, true, 360, 250, 70, 45, null, 'Logement commun sommaire des fondateurs'],
  ['borda_pi', 'building', 'Borda del Pi', 'operational', 45, 100, 6, false, true, 520, 260, 60, 40, null, 'Grange aménagée en dortoir'],
  ['cal_ferrer', 'forge', 'Cal Ferrer (forge)', 'operational', 40, 100, 0, false, true, 300, 360, 50, 35, null, 'Forge rudimentaire de Julio'],
  ['esglesia', 'church', 'Església de Sant Climent', 'damaged', 35, 100, 0, false, true, 470, 170, 55, 60, null, 'Messe dominicale, mariages et confessions de Brunel'],
  ['font_bosc', 'water_source', 'Font del Bosc (captage)', 'operational', 60, 100, 0, false, true, 820, 200, 26, 26, null, "Captage d'eau potable"],
  ['conduite_principale', 'pipe', 'Conduite principale', 'operational', 60, 100, 0, false, true, 460, 200, 360, 120, [[820, 210], [700, 230], [560, 280], [460, 320]], "Réseau d'Alex ; alertes de fuite"],
  ['fossa_nord', 'septic_tank', 'Fossa sèptica nord', 'operational', 60, 100, 0, false, true, 380, 560, 40, 24, null, 'Capacité 8 personnes'],
  ['hort_ely', 'garden', "Hort d'Ely (potager)", 'operational', 70, 100, 0, false, true, 520, 440, 110, 70, null, 'Potager commun ; tomates stockées à part'],
  ['cal_mestre', 'school', 'Cal Mestre (salle de classe)', 'ruin', 20, 0, 0, false, false, 250, 260, 50, 35, null, 'École du hameau et apprentissage'],
  ['torre_vella', 'jail', 'Torre Vella (cachot)', 'ruin', 30, 0, 0, false, false, 560, 380, 34, 34, null, 'Isolement de 24 h'],
  ['mas_era', 'gite', "Mas de l'Era (futur gîte rural)", 'ruin', 25, 0, 8, false, false, 180, 180, 75, 45, null, 'Randonneurs pyrénéens et spectateurs des BOR'],
  ['borda_alta', 'building', 'Borda Alta', 'ruin', 25, 0, 6, false, false, 620, 180, 60, 40, null, null],
  ['cal_pastor', 'building', 'Cal Pastor', 'ruin', 20, 0, 4, false, false, 280, 120, 50, 35, null, null],
  ['casa_riu', 'building', 'Casa del Riu', 'ruin', 30, 0, 5, false, false, 660, 300, 55, 38, null, null],
  ['cabana_moli', 'building', 'Cabana del Molí', 'ruin', 15, 0, 3, false, false, 740, 420, 40, 30, null, 'En bord de rivière (zone humide, grenouilles)'],
  ['paller_nou', 'building', 'Paller Nou', 'ruin', 25, 0, 4, false, false, 420, 470, 50, 34, null, null],
  ['apotecaria', 'lab', 'Apotecària (laboratoire de Tango)', 'ruin', 25, 0, 0, false, false, 610, 470, 46, 32, null, 'Laboratoire, apothicairerie, R&D'],
  ['cleda', 'livestock_pen', 'Cleda (enclos brebis & cochons)', 'planned', 100, 0, 0, false, false, 150, 330, 90, 60, null, "Cheptel pastoral d'Ely et Julio"],
  ['grup_electrogen', 'generator', 'Grup electrogen', 'planned', 100, 0, 0, false, false, 330, 430, 30, 22, null, 'Palier énergétique 2'],
  ['linia_aeria', 'power_line', 'Línia aèria (réseau de Tiphaine)', 'planned', 100, 0, 0, false, false, 0, 120, 400, 180, [[0, 120], [150, 160], [300, 250], [400, 300]], 'Palier énergétique 3, compteurs individuels'],
  ['microcentral', 'dam', 'Microcentral del Riu (barrage)', 'planned', 100, 0, 0, false, false, 860, 130, 50, 30, null, 'Palier 4 ; veto écologique possible (famille de grenouilles)'],
  ['camp_solar', 'solar', 'Camp solar', 'planned', 100, 0, 0, false, false, 640, 560, 80, 50, null, 'Palier 4'],
  ['granja_calcul', 'mining_farm', 'Granja de càlcul (minage)', 'planned', 100, 0, 0, false, false, 760, 520, 50, 34, null, 'Acte III : surplus hydroélectrique'],
  ['mirador_pista', 'watchtower', 'Mirador de la Pista', 'planned', 100, 0, 0, false, false, 140, 560, 22, 22, null, 'Acte II : Défense'],
  ['barrera_pista', 'gate', 'Barrera de la Pista (herse)', 'planned', 100, 0, 0, false, false, 60, 625, 30, 14, null, 'Acte II : Défense'],
  ['duana', 'border_post', 'Duana de la Pista (poste-frontière)', 'planned', 100, 0, 0, false, false, 15, 590, 34, 24, null, 'Acte III : contrôle des passeports'],
];

export function demoStructures(): Structure[] {
  return STRUCTURES.map(([code, kind, name, status, condition, progress, beds, power, plu, x, y, width, height, path, notes], i) => ({
    id: `50000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    code,
    kind,
    name,
    status,
    condition_pct: condition,
    progress_pct: progress,
    beds_capacity: beds,
    is_power_connected: power,
    plu_approved: plu,
    eco_veto_active: false,
    owner_player_id: null,
    leak_alert: false,
    x,
    y,
    width,
    height,
    path_points: path,
    notes,
  }));
}

export const DEMO_STRUCTURE_CODES = STRUCTURES.map((s) => s[0]);
