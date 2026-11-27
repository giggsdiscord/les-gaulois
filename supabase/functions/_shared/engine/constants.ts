// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/constants.ts
/**
 * Constantes d'équilibrage du moteur — GDD V3.8, Annexe A.
 * Les valeurs citées explicitement par le GDD sont marquées [GDD §x] ; les autres sont
 * des précisions d'implémentation V3.8 (modifiables ici, puis documentées dans docs/GDD.md).
 */
import type { CalendarSeason, Portfolio, RoleCode, SpecialtyCode } from './types.ts';

export const TIMEZONE = 'Europe/Madrid';
/** Nombre maximal de jours rattrapés en un seul appel à applyElapsedTime. */
export const MAX_CATCH_UP_DAYS = 120;
export const AGORA_HOUR_LOCAL = 11; // dimanche 11:00 [GDD §1.2 « dimanche matin »]

// ---------------------------------------------------------------------------
// Points d'Action & Santé [GDD §1.2, §3.1]
// ---------------------------------------------------------------------------
export const AP_FULL = 3;
export const AP_REDUCED = 1;
export const AP_HEALTH_THRESHOLD = 60;
export const AP_MENTAL_THRESHOLD = 40;
export const ADDICTION_WITHDRAWAL_THRESHOLD = 50; // [GDD §3.3]
export const WITHDRAWAL_MENTAL_LOSS = 10; // [GDD §3.3]
export const TEMPTATION_AP_PENALTY = 2; // [GDD §6.2]
export const TEMPTATION_MORALE_BONUS = 20; // [GDD §6.2]
/** Derniers dilemmes d'un joueur dont la situation n'est pas reproposée (V4.5). */
export const TEMPTATION_NO_REPEAT_WINDOW = 24; // [GDD §6.2]
/** Les thèmes des N derniers dilemmes d'un joueur sont évités au tirage suivant (V4.5). */
export const TEMPTATION_THEME_COOLDOWN = 3; // [GDD §6.2]
/** Profondeur de l'historique relu pour éviter les répétitions (jours, V4.5). */
export const TEMPTATION_HISTORY_DAYS = 120; // [GDD §6.2]
export const NIGHT_FATIGUE_RECOVERY = 35;
export const FORCED_LABOR_DAILY_FATIGUE = 20;
export const STRAPPING_DAYS = 3;
export const DETENTION_HOURS = 24; // cachot [GDD §2.2]
export const POLICE_CUSTODY_HOURS = 24;

// ---------------------------------------------------------------------------
// Logistique & piste [GDD §3.1]
// ---------------------------------------------------------------------------
export const TRACK_SURCHARGE_THRESHOLD = 40;
export const TRACK_SURCHARGE_PCT = 40;
export const TRACK_MIRE_RISK_PCT = 30;
export const TRACK_MIRE_HOURS = 24;
export const TRACK_WEAR_RAIN = 1;
export const TRACK_WEAR_SNOW = 2;
export const TRACK_WEAR_CONVOY = 3;
export const RAIN_THRESHOLD_MM = 2;

// ---------------------------------------------------------------------------
// Hydraulique & assainissement [GDD §3.1]
// ---------------------------------------------------------------------------
export const WATER_L_PER_PERSON = 150;
export const WATER_FAILURE_CONDITION = 40;
export const WATER_L_PER_LIVESTOCK = 8;
/** Besoin d'irrigation du potager en L/m²/jour selon la saison calendaire. */
export const GARDEN_WATER_L_PER_M2: Record<CalendarSeason, number> = {
  winter: 0.5,
  spring: 3,
  summer: 6,
  autumn: 2,
};
export const PIPE_RUPTURE_RISK_PCT = 25; // risque quotidien si sous-dimensionné ou condition < 40 %
export const SEPTIC_OVERFLOW_THRESHOLD = 100;
export const EPIDEMIC_INCUBATION_DAYS = 3;
export const EPIDEMIC_DURATION_DAYS = 5;
export const EPIDEMIC_INFECTION_RISK_PCT = 15;

// ---------------------------------------------------------------------------
// Énergie (5 paliers) [GDD §3.1]
// ---------------------------------------------------------------------------
export interface EnergyTierSpec {
  label: string;
  kwhPerPersonDay: number;
  dailyFixedCostEur: number;
  costPerKwhEur: number;
  fuelLitresPerKwh: number;
  ecologyPerDay: number;
}
export const ENERGY_TIERS: Record<number, EnergyTierSpec> = {
  1: { label: 'Bougies', kwhPerPersonDay: 0, dailyFixedCostEur: 4, costPerKwhEur: 0, fuelLitresPerKwh: 0, ecologyPerDay: 0 },
  2: { label: 'Groupe électrogène', kwhPerPersonDay: 2.5, dailyFixedCostEur: 0, costPerKwhEur: 0, fuelLitresPerKwh: 0.35, ecologyPerDay: -0.3 },
  3: { label: 'Réseau aérien', kwhPerPersonDay: 4, dailyFixedCostEur: 1.5, costPerKwhEur: 0.22, fuelLitresPerKwh: 0, ecologyPerDay: 0 },
  4: { label: 'Barrage & Solaire', kwhPerPersonDay: 5, dailyFixedCostEur: 2, costPerKwhEur: 0.02, fuelLitresPerKwh: 0, ecologyPerDay: 0.05 },
  5: { label: 'Micro-réacteur nucléaire', kwhPerPersonDay: 6, dailyFixedCostEur: 5, costPerKwhEur: 0.01, fuelLitresPerKwh: 0, ecologyPerDay: 0 },
};
export const FUEL_PRICE_EUR_PER_L = 1.6;
/** Production autonome (kWh/jour) des installations opérationnelles. */
export const PRODUCTION_KWH_DAY = { dam: 400, solar: 150, reactor: 2000 } as const;
export const BUILDING_KWH_DAY = 6; // consommation par bâtisse raccordée
export const MINING_KWH_DAY = 250;
export const MINING_EUR_PER_KWH = 0.06;

// ---------------------------------------------------------------------------
// Potager, élevage, outils [GDD §3.1, §5.3]
// ---------------------------------------------------------------------------
export const GARDEN_BASE_RATIONS_PER_100M2 = 1.2;
export const SEASON_HARVEST_COEFF: Record<CalendarSeason, number> = {
  winter: 0.15,
  spring: 0.8,
  summer: 1.0,
  autumn: 0.6,
};
export const TOMATO_SHARE: Record<CalendarSeason, number> = { winter: 0, spring: 0.05, summer: 0.35, autumn: 0.2 };
export const TOMATO_KG_PER_RATION = 10;
export const LIVESTOCK_FERTILIZER_THRESHOLD = 6;
export const LIVESTOCK_FERTILIZER_BONUS = 0.2; // +20 % sur le potager [GDD §5.3]
export const LIVESTOCK_RATIONS_PER_HEAD_DAY = 0.25;
export const LIVESTOCK_PEN_CAPACITY = 40;
export const LIVESTOCK_PRICE_EUR = 140;
export const RATIONS_ADULT_DAY = 1;
export const RATIONS_CHILD_DAY = 0.6;
export const RATIONING_FACTOR = 0.8;
export const TOMATO_THROW_TOMATOES = 20;
export const TOMATO_THROW_RATIONS = 5;
export const TOMATO_THROW_MORALE = 15; // [GDD §3.1]
export const TOOLS_WEAR_PER_WORKER_DAY = 0.4;
export const TOOLS_MALUS = 35; // [GDD §3.1]
export const IRON_PER_TOOL = 3;

// ---------------------------------------------------------------------------
// Productivité globale [GDD §3.3 formule 1]
// ---------------------------------------------------------------------------
export const PRODUCTIVITY_MIN = 15;
export const PRODUCTIVITY_MAX = 150;
export const ALCOHOL_PRODUCTIVITY_FACTOR = 0.4;
export const ALCOHOL_PRODUCTIVITY_FREE = 20;
export const DRUG_PRODUCTIVITY_FACTOR = 0.6;
export const DRUG_PRODUCTIVITY_FREE = 5;
export const COLLECTIVISM_FACTOR = 1.1; // [GDD §4.1]
export const COLLECTIVISM_FREE = 40;
export const COLLECTIVISM_VOTED_MALUS = 15;
export const REQUIRED_WORKERS_BY_ACT: Record<number, number> = { 1: 10, 2: 16, 3: 22 };
export const UNDERSTAFF_TOLERANCE = 0.1;
export const UNDERSTAFF_MIN_MALUS = 15; // [GDD §4.4 : -15 % à -40 %]
export const UNDERSTAFF_MAX_MALUS = 40;
export const OVERPOP_MALUS_BASE = 10;
export const OVERPOP_MALUS_SLOPE = 50;
export const OVERPOP_MALUS_MAX = 35;
export const SPECIALTY_BONUS_PER_LEVEL = 1.5;
export const GRADUATE_GLOBAL_BONUS = 3;
export const APPRENTICE_GLOBAL_BONUS = 1;
export const SPECIALTY_BONUS_CAP = 35;
export const PRIVATE_EMPLOYMENT_BASE_BONUS = 10; // [GDD §5.1 : +10 % à +20 %]
export const PRIVATE_EMPLOYMENT_STEP = 2.5;
export const PRIVATE_EMPLOYMENT_MAX_BONUS = 20;
export const POLE_SPECIALTY_BONUS_MIN = 10; // [GDD §4.2 : +10 % à +35 %]
export const POLE_SPECIALTY_BONUS_MAX = 35;
export const POLE_GRADUATE_BONUS = 15; // [GDD §3.2 apprentis +15 %]
export const STRIKE_POLE_FACTOR = 0.5; // grève : productivité divisée par deux [GDD §4.3]

/** Pôle dont un spécialiste accélère les chantiers. */
export const SPECIALTY_POLE: Record<SpecialtyCode, RoleCode | null> = {
  mason: 'civil_eng',
  carpenter: 'civil_eng',
  electrician: 'civil_eng',
  mechanic: 'water_eng',
  welder: 'smith_diplo',
  farmer: 'mayor_agri',
  shepherd: 'mayor_agri',
  unskilled: null,
};

// ---------------------------------------------------------------------------
// Insécurité [GDD §3.3 formule 2]
// ---------------------------------------------------------------------------
export const INSECURITY_BASE_TENSIONS = 5;
export const INSECURITY_FACTION_TENSIONS = 10;
export const INSECURITY_STRIKE_TENSIONS = 8;
export const INSECURITY_OVERPOP_SLOPE = 40;
export const INSECURITY_FRICTION_FREE = 20;
export const INSECURITY_FRICTION_FACTOR = 0.5;
export const ALCOHOL_INSECURITY_FACTOR = 0.35;
export const ALCOHOL_INSECURITY_FREE = 30;
export const DRUG_INSECURITY_FACTOR = 0.8;
export const DRUG_INSECURITY_FREE = 5;
export const BLACK_MARKET_INSECURITY = 10;
export const BLACK_MARKET_RUIN_FACTOR = 1;
export const BLACK_MARKET_RUIN_CAP = 8;
export const INTERIOR_PORTFOLIO_REDUCTION = 8;
export const WATCHTOWER_REDUCTION = 3;
export const INSECURITY_OFFSET_DECAY = 0.9;
export const SECURITY_REDUCTION_DECAY = 1;
export const BRUNEL_REDUCTION_DECAY = 0.5;

/** Paliers d'exposition alcool / drogues [GDD §3.3 tableau]. */
export const ALCOHOL_TIERS = [20, 45, 70] as const;
export const DRUG_TIERS = [5, 25, 55] as const;

// ---------------------------------------------------------------------------
// Idéologie & friction [GDD §4]
// ---------------------------------------------------------------------------
export const FOUNDER_LEFT_SCORE = 25;
export const LEFT_DRIFT_RATE = 0.03;
export const FACTION_LEFT_THRESHOLD = 45;
export const FACTION_FRICTION_THRESHOLD = 50;
export const COLLECTIVIST_SHORTAGE_THRESHOLD = 55;
export const COLLECTIVIST_HARVEST_MALUS = 0.25;
export const COLLECTIVIST_CAPITAL_FLIGHT_DAY = 0.02;
export const SOVIET_COLLAPSE_THRESHOLD = 75;
export const SOVIET_COLLAPSE_SEASONS = 2;
export const STRIKE_DAILY_RISK_PCT = 8;
export const STRIKE_DAYS = 3;
export const SABOTAGE_DAILY_RISK_PCT = 4;
export const SABOTAGE_PIPE_DAMAGE = 20;
export const COLLECTIVIZATION_EVAPORATION = 0.4; // [GDD §5.1]
export const LEFT_SCORE_BY_LEANING: Record<string, number> = {
  'Droite conservatrice': 10,
  'Droite libérale': 20,
  Centre: 40,
  'Gauche sociale': 65,
  'Extrême gauche / Collectiviste': 90,
};
/**
 * Distance culturelle aux traditions locales (0-1) [GDD §4.2 « Religion / Culte »].
 * Donnée de jeu modifiable ; la médiation de Brunel et la maîtrise de l'espagnol l'atténuent.
 */
export const RELIGION_DISTANCE: Record<string, number> = {
  catholique: 0.1,
  'athée/laïque': 0.2,
  protestante: 0.4,
  orthodoxe: 0.4,
  évangélique: 0.5,
  juive: 0.5,
  bouddhiste: 0.6,
  musulmane: 0.9,
};
export const DEFAULT_RELIGION_DISTANCE = 0.6;
export const INTEGRATION_PERIOD_DAYS = 28;
export const INTEGRATION_BASE_CAPACITY = 3;
export const FRICTION_RISE_FACTOR = 1.5;
export const FRICTION_DECAY = 0.5;
export const FRICTION_FLOOR = 5;
export const MASS_BASE_MORALE = 12; // [GDD §2.1]
export const PENANCE_EXTRA_MORALE = 6;

// ---------------------------------------------------------------------------
// Démographie [GDD §3.2]
// ---------------------------------------------------------------------------
export const FERTILE_AGE_MIN = 18;
export const FERTILE_AGE_MAX = 45;
export const MARRIAGE_NATALITY_BONUS = 0.2; // [GDD §3.2]
export const FAMILY_ALLOWANCE_BONUS = 0.1;
export const VIABILITY_PER_BIRTH = 8; // [GDD §3.2]
export const VIABILITY_PER_CHILD_WELCOMED = 4; // [GDD §3.2, §4.2]
export const VIABILITY_AGING_BASE = 1;
export const VIABILITY_AGING_SENIOR_FACTOR = 3;
export const HOMO_MALUS_FREE = 10;
export const HOMO_MALUS_FACTOR = 0.25;
export const HOMO_DECLINE_THRESHOLD = 45; // [GDD §3.2]
export const HOMO_ISOLATION_RISE = 0.5;
export const HOMO_FESTIVE_RISE = 0.5;
export const SEASONS_WITHOUT_BIRTH_DECLINE = 2;
export const EXTINCTION_SEASONS = 2; // [GDD §3.2]
export const CHILD_YEARS_PER_SEASON = 1;
export const APPRENTICE_MIN_AGE = 12;
export const APPRENTICE_GRADUATION_AGE = 16;
export const APPRENTICE_MIN_SEASONS = 3;
export const LAW_STUDIES_COST_EUR = 2500; // [GDD §3.2]
export const LAW_STUDIES_SEASONS = 3;
export const LAW_ADMIN_PRESSURE_REDUCTION = 15; // [GDD §3.2]
export const ADULT_AGE = 18;

// ---------------------------------------------------------------------------
// Économie & finances [GDD §5]
// ---------------------------------------------------------------------------
export const INITIAL_LAND_DEBT_EUR = 295000;
export const LOAN_ANNUAL_RATE = 0.025;
export const LOAN_WEEKLY_INSTALLMENT_EUR = 360;
export const BUDGET_LOCK_THRESHOLD_EUR = 500; // [GDD §2.1]
export const SMUGGLING_PROFIT_MIN = 1500; // [GDD §5.2]
export const SMUGGLING_PROFIT_MAX = 6000;
export const SMUGGLING_RISK_MIN = 25;
export const SMUGGLING_RISK_MAX = 45;
export const GITE_REVENUE_MIN = 800; // [GDD §5.3]
export const GITE_REVENUE_MAX = 2500;
export const TREASURY_LEAK_DAILY = 0.002;
export const PRIVATE_WORK_BASE_EUR = 90;

// ---------------------------------------------------------------------------
// Carlage 2x2 [GDD §6.1]
// ---------------------------------------------------------------------------
export const CARLAGE_ROUNDS = 5;
export const CARLAGE_ROUND_SECONDS = 10;
export const CARLAGE_START_BALANCE = 100;
export const CARLAGE_VOID_PENALTY = 30;
export const CARLAGE_SLIP_RISK_PCT = 35;
export const CARLAGE_INJURY_RISK_PCT = 40;
export const CARLAGE_INJURY_RISK_DRUNK_PCT = 65;
export const CARLAGE_CLASH_DAMAGE = 20;
export const CARLAGE_CLASH_DECISIVE_GAP = 25;
export const CARLAGE_ANCHOR_RECOIL = 15;
export const CARLAGE_COUNTER_PUSH = 20;
export const CARLAGE_PIVOT_EFFORT = 5;
export const CARLAGE_COLLISION = 10;
export const CARLAGE_ANCHOR_RECOVERY = 10;
export const CARLAGE_DOUBLE_SHOULDER = 40;
export const CARLAGE_VIOLENT_SHOCK = 30;

// ---------------------------------------------------------------------------
// Épreuve de la cible (duel en différé, V4.0)
// ---------------------------------------------------------------------------
export const TARGET_COUNT = 5;
/** Rayon d'une cible (fraction du côté de l'arène carrée). */
export const TARGET_RADIUS = 0.07;
/** Délai d'apparition de chaque cible (ms), tiré au hasard pour empêcher l'anticipation. */
export const TARGET_DELAY_MIN_MS = 800;
export const TARGET_DELAY_MAX_MS = 2500;
/** Tap plus rapide que ce seuil : faux départ (0 point). */
export const TARGET_FALSE_START_MS = 120;
/** Réaction à ce temps ou moins : 100 % des points de rapidité. */
export const TARGET_BEST_REACTION_MS = 200;
/** Réaction à ce temps : 0 point de rapidité. */
export const TARGET_ZERO_SPEED_MS = 2000;
/** Au-delà : cible manquée (0 point). */
export const TARGET_TIMEOUT_MS = 3000;
/** Distance (fraction du côté) à partir de laquelle la précision ne rapporte plus rien. */
export const TARGET_ZERO_DISTANCE = 0.3;
/** Poids de la précision et de la rapidité (sur 100 points par cible). */
export const TARGET_DISTANCE_WEIGHT = 0.5;
export const TARGET_SPEED_WEIGHT = 0.5;
/** Délai pour jouer une épreuve lancée en différé. */
export const TARGET_TRIAL_HOURS = 24;
/** Putsch : la Présidente joue l'épreuve jusqu'à l'ouverture de l'Agora + 6 h (17:00). */
export const PUTSCH_TRIAL_HOURS_AFTER_AGORA = 6;

// ---------------------------------------------------------------------------
// Rôles, portefeuilles & déblocages [GDD §2]
// ---------------------------------------------------------------------------
export const FOUNDER_ROLES: readonly RoleCode[] = [
  'mayor_agri',
  'treasurer_physio',
  'civil_eng',
  'water_eng',
  'smith_diplo',
  'druid',
  'priest_apoth',
];
export const VETO_ROLES: readonly RoleCode[] = ['mayor_agri', 'treasurer_physio', 'civil_eng'];
export const PORTFOLIO_UNLOCK_ACT: Record<Portfolio, 1 | 2 | 3> = {
  defense: 2,
  interior: 2,
  customs: 2,
  chancery: 3,
  media: 3,
};
export const PRESIDENT_ROLE: RoleCode = 'mayor_agri';
export const ACT_THRESHOLDS = { act2: 35, act3: 85 } as const; // [GDD §1.3]
export const DELEGATION_BUDGET_CAP_EUR = 2000;

// ---------------------------------------------------------------------------
// Vie du village — marché, bois & chauffage, conserves [GDD §5.5, V4.8]
// ---------------------------------------------------------------------------
export interface MarketItem {
  id: string;
  label: string;
  /** Unité vendue et taille d'un lot (quantité choisie = nombre de lots). */
  unit: string;
  lot: number;
  /** Prix de base d'une unité (€). */
  price_eur: number;
  /** Unités achetées au plus par le marché sur une saison (semaine) : au-delà, il est saturé. */
  weekly_cap: number;
  /** Réserve du village d'où part la marchandise. */
  stock: 'tomatoes_stock' | 'wood_stock' | 'food_rations';
}
export const MARKET_ITEMS: readonly MarketItem[] = [
  { id: 'tomatoes', label: 'Tomates du potager', unit: 'kg', lot: 10, price_eur: 3, weekly_cap: 150, stock: 'tomatoes_stock' }, // [GDD §5.5]
  { id: 'wood', label: 'Bois de chauffage', unit: 'stère', lot: 5, price_eur: 7, weekly_cap: 60, stock: 'wood_stock' }, // [GDD §5.5]
  { id: 'rations', label: 'Conserves & légumes', unit: 'ration', lot: 5, price_eur: 4, weekly_cap: 60, stock: 'food_rations' }, // [GDD §5.5]
];
/** Jour de marché à Organyà : le samedi, prix +30 %. */
export const MARKET_SATURDAY_BONUS = 0.3; // [GDD §5.5]
/** Les prix baissent à mesure que la semaine sature le marché (jusqu'à −50 %). */
export const MARKET_SATURATION_DROP = 0.5; // [GDD §5.5]
/** Effet de la maîtrise de l'espagnol sur les prix : ×0,85 à 0 %, ×1,15 à 100 %. */
export const MARKET_LANGUAGE_MIN = 0.85;
export const MARKET_LANGUAGE_MAX = 1.15;

export const WOOD_CUT_BASE = 8; // [GDD §5.5] stères par séance (× productivité)
/** Coupes soutenables par saison : au-delà, la forêt souffre et les agents rurals s'en mêlent. */
export const WOOD_CUT_SUSTAINABLE = 10; // [GDD §5.5]
export const WOOD_OVERCUT_ECOLOGY = 2;
export const WOOD_OVERCUT_ADMIN = 3;
export const WOOD_OVERCUT_RISK_PCT = 35;

/** Chauffage : bois brûlé chaque nuit par bâtisse habitée, selon la température minimale réelle. */
export const HEATING_BANDS: readonly { below_c: number; wood_per_building: number }[] = [
  { below_c: 0, wood_per_building: 3 },
  { below_c: 5, wood_per_building: 2 },
  { below_c: 10, wood_per_building: 1 },
]; // [GDD §5.5]
export const HEATING_COLD_MORALE = 2; // [GDD §5.5] moral perdu par nuit sans chauffage
export const HEATING_COLD_HEALTH = 1; // santé perdue par fondateur par nuit sans chauffage

export const PRESERVES_TOMATOES_KG = 10; // [GDD §5.5]
export const PRESERVES_RATIONS = 8; // [GDD §5.5]
export const PRESERVES_JARS_EUR = 12;

// ---------------------------------------------------------------------------
// Travail des résidents [GDD §4.7, V4.9]
// ---------------------------------------------------------------------------
export type WorkPostCode = 'garden' | 'forest' | 'construction' | 'forge' | 'pasture' | 'water' | 'track';
export interface WorkPost {
  code: WorkPostCode;
  label: string;
  icon: string;
  /** Complément de lieu : « au potager », « en forêt »… */
  place: string;
  /** Spécialités qui y travaillent avec un bonus de niveau. */
  specialties: readonly SpecialtyCode[];
  /** Ce que le poste produit chaque nuit (texte d'aide). */
  summary: string;
}
export const WORK_POSTS: readonly WorkPost[] = [
  { code: 'garden', place: 'au potager', label: 'Potager', icon: '🥕', specialties: ['farmer'], summary: 'Rations et tomates selon la saison et l\'arrosage ; un jardinier par 100 m² de potager.' },
  { code: 'forest', place: 'en forêt', label: 'Forêt', icon: '🪓', specialties: ['carpenter'], summary: 'Bois de chauffage (compte dans les coupes de la semaine) ; entretien de la forêt si Ely interdit les coupes.' },
  { code: 'construction', place: 'sur le chantier', label: 'Chantier', icon: '🧱', specialties: ['mason', 'carpenter', 'electrician'], summary: 'Fait avancer le chantier de bâtisse le plus avancé (1 pierre par nuit), sinon répare une bâtisse abîmée.' },
  { code: 'forge', place: 'à la forge', label: 'Forge', icon: '⚒️', specialties: ['welder', 'mechanic'], summary: 'Répare l\'usure des outils, puis recycle la ferraille en fer ; forge en service requise.' },
  { code: 'pasture', place: 'au pâturage', label: 'Pâturage', icon: '🐑', specialties: ['shepherd', 'farmer'], summary: 'Lait et fromage frais : rations selon le cheptel (un berger pour 10 bêtes).' },
  { code: 'water', place: 'sur le réseau d\'eau', label: 'Réseau d\'eau', icon: '🚰', specialties: ['mechanic', 'welder'], summary: 'Entretient les conduites : état du réseau en hausse.' },
  { code: 'track', place: 'sur la piste', label: 'Piste', icon: '🛤️', specialties: ['mason', 'mechanic'], summary: 'Bouche les ornières : état de la piste en hausse.' },
]; // [GDD §4.7]
/** Bonus d'un spécialiste au poste de sa spécialité : +25 % par niveau (niveau 1 → ×1,25, niveau 5 → ×2,25). */
export const RESIDENT_SKILL_BONUS_PER_LEVEL = 0.25; // [GDD §4.7]
/** En dessous de cette santé, un résident se repose au lieu de travailler. */
export const RESIDENT_MIN_HEALTH = 30;
/** Grève : les résidents travaillent à moitié. */
export const RESIDENT_STRIKE_FACTOR = 0.5;
export const RESIDENT_GARDEN_RATIONS = 1.5; // [GDD §4.7] rations par nuit × coefficient de saison
export const RESIDENT_GARDEN_M2_PER_WORKER = 100;
export const RESIDENT_FOREST_WOOD = 2; // [GDD §4.7] stères par nuit
/** Une nuit de bûcheronnage d'un résident compte pour un quart de coupe (8 stères = 1 coupe). */
export const RESIDENT_FOREST_CUT_SHARE = 0.25;
/** Coupes interdites : le bûcheron entretient la forêt (écologie + par nuit). */
export const RESIDENT_FOREST_CARE_ECOLOGY = 0.2;
/** Au-delà des coupes soutenables, chaque bûcheron abîme la forêt (écologie − par nuit). */
export const RESIDENT_OVERCUT_ECOLOGY = 0.5;
export const RESIDENT_BUILD_POINTS = 2; // [GDD §4.7] % d'avancement par nuit
export const RESIDENT_BUILD_STONE = 1;
export const RESIDENT_REPAIR_POINTS = 3;
export const RESIDENT_FORGE_WEAR = 10; // [GDD §4.7] usure des outils réparée par nuit
export const RESIDENT_FORGE_SCRAP = 2; // ferrailles recyclées en 1 fer quand les outils sont neufs
export const RESIDENT_PASTURE_HEADS = 10;
export const RESIDENT_PASTURE_RATIONS_PER_HEAD = 0.08; // [GDD §4.7]
export const RESIDENT_WATER_POINTS = 2; // [GDD §4.7] % d'état du réseau par nuit
export const RESIDENT_TRACK_POINTS = 1; // [GDD §4.7] % d'état de la piste par nuit
/** Motif minimal de l'interdiction des coupes par Ely. */
export const FOREST_BAN_REASON_MIN = 10;

// ---------------------------------------------------------------------------
// Chantier collectif de la semaine [GDD §5.5, V5.0]
// ---------------------------------------------------------------------------
export type CollectiveProjectId = 'woodpile' | 'track_day' | 'water_works' | 'garden_extension' | 'site_rush' | 'village_feast';
export interface CollectiveProjectDef {
  id: CollectiveProjectId;
  label: string;
  icon: string;
  /** Métier qui y travaille deux fois plus vite (2 points par PA au lieu d'un). */
  pole: RoleCode;
  /** Effet à l'achèvement (texte d'aide ; valeurs ci-dessous). */
  summary: string;
}
export const COLLECTIVE_PROJECTS: readonly CollectiveProjectDef[] = [
  { id: 'woodpile', label: 'Grande corvée de bois', icon: '🪵', pole: 'smith_diplo', summary: '+40 stères de bois pour l\'hiver.' },
  { id: 'track_day', label: 'Journée de la piste', icon: '🛤️', pole: 'transport_customs', summary: 'État de la piste +15 %.' },
  { id: 'water_works', label: 'Curage des canaux', icon: '🚰', pole: 'water_eng', summary: 'Réseau d\'eau +15 %, qualité de l\'eau +5 %.' },
  { id: 'garden_extension', label: 'Agrandir le potager', icon: '🥕', pole: 'mayor_agri', summary: '+40 m² de potager.' },
  { id: 'site_rush', label: 'Coup de main au chantier', icon: '🧱', pole: 'civil_eng', summary: 'Le chantier de bâtisse le plus avancé gagne +20 %.' },
  { id: 'village_feast', label: 'Préparer la fête du hameau', icon: '🎉', pole: 'druid', summary: 'Moral du hameau +6 %.' },
]; // [GDD §5.5]
export const COLLECTIVE_WOOD = 40; // [GDD §5.5]
export const COLLECTIVE_TRACK = 15; // [GDD §5.5]
export const COLLECTIVE_WATER_NETWORK = 15; // [GDD §5.5]
export const COLLECTIVE_WATER_QUALITY = 5;
export const COLLECTIVE_GARDEN_M2 = 40; // [GDD §5.5]
export const COLLECTIVE_SITE_PROGRESS = 20; // [GDD §5.5]
export const COLLECTIVE_FEAST_MORALE = 6; // [GDD §5.5]
/** Objectif = points par fondateur actif × nombre de fondateurs actifs (minimum ci-dessous). */
export const COLLECTIVE_POINTS_PER_PLAYER = 2; // [GDD §5.5]
export const COLLECTIVE_MIN_GOAL = 6;
/** Points par PA : 1, ou 2 pour le métier du projet. */
export const COLLECTIVE_POLE_POINTS = 2; // [GDD §5.5]
/** Fini avant dimanche : effet multiplié et moral en plus. */
export const COLLECTIVE_EARLY_FACTOR = 1.5; // [GDD §5.5]
export const COLLECTIVE_EARLY_MORALE = 3; // [GDD §5.5]
/** Chantier inachevé le lundi : moral perdu. */
export const COLLECTIVE_FAIL_MORALE = 2; // [GDD §5.5]
/** Projets proposés au vote pour la semaine suivante. */
export const COLLECTIVE_CANDIDATES = 3;

// ---------------------------------------------------------------------------
// Objectifs d'Acte [GDD §1.3, V5.1] : une liste à cocher par Acte, une récompense par étape
// ---------------------------------------------------------------------------
export type ActGoalId =
  | 'power_on' | 'beds_20' | 'garden_500' | 'track_70' | 'gite_open'
  | 'green_power' | 'beds_30' | 'herd_10' | 'residents_5' | 'debt_25'
  | 'constitution' | 'deterrence_3' | 'debt_50' | 'independence';
export interface ActGoalReward {
  /** Part de l'emprunt foncier effacée par le prêteur, rassuré par les progrès. */
  debt_eur?: number;
  treasury_eur?: number;
  morale?: number;
  wood?: number;
  stone?: number;
  iron?: number;
}
export interface ActGoalDef {
  id: ActGoalId;
  act: 1 | 2 | 3;
  label: string;
  icon: string;
  /** Comment l'atteindre (texte d'aide). */
  hint: string;
  reward: ActGoalReward;
}
export const ACT_GOALS: readonly ActGoalDef[] = [
  { id: 'power_on', act: 1, label: 'Électricité au hameau', icon: '⚡', hint: 'Installer le groupe électrogène (palier d\'énergie 2).', reward: { debt_eur: 5000, morale: 3 } },
  { id: 'beds_20', act: 1, label: '20 lits livrés', icon: '🛏️', hint: 'Rénover des bâtisses jusqu\'à 20 lits en service.', reward: { debt_eur: 5000, stone: 20 } },
  { id: 'garden_500', act: 1, label: '500 m² de potager', icon: '🥕', hint: 'Agrandir le potager d\'Ely (chantier collectif, actions du potager).', reward: { debt_eur: 3000, wood: 20 } },
  { id: 'track_70', act: 1, label: 'Piste empierrée à 70 %', icon: '🛤️', hint: 'Empierrer la piste forestière (Alex, résidents à la piste).', reward: { debt_eur: 3000, iron: 10 } },
  { id: 'gite_open', act: 1, label: 'Gîte ouvert', icon: '🏡', hint: 'Rénover le Mas de l\'Era puis ouvrir le gîte.', reward: { debt_eur: 6000, morale: 4 } },
  { id: 'green_power', act: 2, label: 'Barrage ou champ solaire', icon: '🌞', hint: 'Atteindre le palier d\'énergie 4 (micro-barrage ou champ solaire).', reward: { debt_eur: 12000, morale: 4 } },
  { id: 'beds_30', act: 2, label: '30 lits livrés', icon: '🛏️', hint: 'Continuer les rénovations jusqu\'à 30 lits en service.', reward: { debt_eur: 10000, stone: 30 } },
  { id: 'herd_10', act: 2, label: 'Troupeau de 10 bêtes', icon: '🐑', hint: 'Construire la Cleda et acheter du bétail.', reward: { debt_eur: 8000, morale: 3 } },
  { id: 'residents_5', act: 2, label: '5 résidents au travail', icon: '👷', hint: 'Accueillir des résidents à l\'Agora et leur donner un poste.', reward: { debt_eur: 8000, wood: 30 } },
  { id: 'debt_25', act: 2, label: 'Un quart de l\'emprunt remboursé', icon: '💶', hint: 'Rembourser l\'emprunt foncier (échéances, remboursements anticipés).', reward: { treasury_eur: 3000, morale: 4 } },
  { id: 'constitution', act: 3, label: 'Constitution adoptée', icon: '📜', hint: 'Rédiger et voter un article de Constitution à l\'Agora.', reward: { debt_eur: 15000, morale: 4 } },
  { id: 'deterrence_3', act: 3, label: 'Dissuasion niveau 3', icon: '🛡️', hint: 'Mener la R&D de dissuasion (Tanguy).', reward: { debt_eur: 15000, iron: 20 } },
  { id: 'debt_50', act: 3, label: 'La moitié de l\'emprunt remboursée', icon: '💶', hint: 'Continuer à rembourser l\'emprunt foncier.', reward: { treasury_eur: 5000, morale: 4 } },
  { id: 'independence', act: 3, label: 'Indépendance proclamée', icon: '🏳️', hint: 'Proclamer l\'indépendance à l\'Agora (deux tiers des voix).', reward: { debt_eur: 20000, morale: 6 } },
]; // [GDD §1.3]
/** Récompense quand toute la liste d'un Acte est cochée. */
export const ACT_GOALS_COMPLETE_BONUS: Record<1 | 2 | 3, ActGoalReward> = {
  1: { debt_eur: 10000, morale: 5 },
  2: { debt_eur: 20000, morale: 5 },
  3: { debt_eur: 30000, morale: 8 },
}; // [GDD §1.3]
export const ACT_GOAL_GARDEN_M2 = 500; // [GDD §1.3]
export const ACT_GOAL_TRACK_PCT = 70; // [GDD §1.3]
export const ACT_GOAL_HERD = 10; // [GDD §1.3]
export const ACT_GOAL_RESIDENTS = 5; // [GDD §1.3]
export const ACT_GOAL_DETERRENCE = 3; // [GDD §1.3]

// ---------------------------------------------------------------------------
// Niveaux de métier, mission du jour & bonus à deux (V5.2) [GDD §2.3]
// ---------------------------------------------------------------------------
/** Expérience requise pour les niveaux 1 à 4 (une action à 1 PA rapporte 10 XP). */
export const SKILL_LEVEL_XP = [0, 150, 400, 800] as const; // [GDD §2.3]
/** Bonus de rendement dans son propre métier, par niveau (niveau 3 : +20 % sur les chantiers de Tiphaine). */
export const SKILL_LEVEL_BONUS = [0, 0.1, 0.2, 0.3] as const; // [GDD §2.3]
/** Niveau 4 de Julio : chaque fournée de la forge compte double. */
export const SKILL_FORGE_DOUBLE_LEVEL = 4; // [GDD §2.3]
/** Mission du jour : expérience et moral du village gagnés quand elle est faite. */
export const MISSION_XP_REWARD = 20; // [GDD §2.3]
export const MISSION_MORALE_REWARD = 1; // [GDD §2.3]
/** Actions conseillées chaque jour, par métier (tirage déterministe joueur + jour). */
export const MISSION_POOLS: Record<RoleCode, readonly string[]> = {
  mayor_agri: ['garden_tend', 'livestock_care', 'forest_patrol', 'make_preserves'],
  treasurer_physio: ['financial_audit', 'preventive_strapping', 'spanish_lesson'],
  civil_eng: ['plu_inspection', 'clear_rubble', 'contribute_collective'],
  water_eng: ['repair_pipes', 'track_maintenance', 'repair_machinery'],
  smith_diplo: ['forge_tools', 'fish_hunt', 'recycle_scrap', 'negotiate_spain_andorra'],
  druid: ['brew_remedies', 'analyze_water', 'rd_progress'],
  priest_apoth: ['mediation', 'therapy', 'brew_remedies', 'sunday_mass'],
  defense_sec: ['guard_rounds', 'repel_boars'],
  transport_customs: ['inspect_cargo', 'vehicle_maintenance', 'track_maintenance'],
  legal_media: ['editorial', 'counter_defamation'],
}; // [GDD §2.3]
/** Repli si le tirage tombe sur une action indisponible (dimanche, Acte). */
export const MISSION_FALLBACK = ['cut_wood', 'contribute_collective', 'spanish_lesson'] as const;
/** Bonus d'action à deux : rendement ×1,25, +15 points de chance en négociation, 10 XP à chacun. */
export const DUO_BONUS = 0.25; // [GDD §2.3]
export const DUO_NEGOTIATION_BONUS = 15; // [GDD §2.3]
export const DUO_XP = 10; // [GDD §2.3]
export interface DuoGroup {
  id: string;
  label: string;
  icon: string;
  codes: readonly string[];
}
/** Deux joueurs différents qui font une action du même groupe le même jour forment un binôme. */
export const DUO_GROUPS: readonly DuoGroup[] = [
  { id: 'negotiation', label: 'Négociation', icon: '🤝', codes: ['negotiate_spain_andorra', 'diplomacy_ayuntamiento'] },
  { id: 'care', label: 'Soins', icon: '🩺', codes: ['withdrawal_cure', 'therapy', 'brew_remedies'] },
  { id: 'building', label: 'Chantier', icon: '🧱', codes: ['renovate_building', 'clear_rubble', 'build_livestock_pen', 'build_solar', 'build_dam', 'build_watchtower'] },
  { id: 'land', label: 'Terre & forêt', icon: '🌾', codes: ['garden_tend', 'livestock_care', 'fish_hunt', 'cut_wood', 'make_preserves'] },
  { id: 'network', label: 'Réseaux', icon: '🔧', codes: ['lay_pipes', 'repair_pipes', 'track_maintenance', 'build_power_line'] },
  { id: 'forge', label: 'Forge', icon: '⚒️', codes: ['forge_tools', 'recycle_scrap'] },
]; // [GDD §2.3]
