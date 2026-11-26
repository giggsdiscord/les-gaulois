/**
 * Formules mathématiques du GDD — fonctions pures avec décomposition détaillée
 * (affichée dans les indicateurs et testée unitairement).
 */
import * as C from './constants.ts';
import { clamp, round2 } from './math.ts';
import {
  adultChildren,
  countPopulation,
  countRuins,
  holdsPortfolio,
  presentChildren,
  residents,
} from './population.ts';
import type { CalendarSeason, GameSnapshot, RoleCode, VillageState } from './types.ts';

// ---------------------------------------------------------------------------
// Paliers d'exposition alcool / stupéfiants [GDD §3.3]
// ---------------------------------------------------------------------------
export type ExposureTier = 1 | 2 | 3 | 4;

export function alcoholTier(alcoholPct: number): ExposureTier {
  if (alcoholPct > C.ALCOHOL_TIERS[2]) return 4;
  if (alcoholPct > C.ALCOHOL_TIERS[1]) return 3;
  if (alcoholPct > C.ALCOHOL_TIERS[0]) return 2;
  return 1;
}

export function drugTier(drugPct: number): ExposureTier {
  if (drugPct > C.DRUG_TIERS[2]) return 4;
  if (drugPct > C.DRUG_TIERS[1]) return 3;
  if (drugPct > C.DRUG_TIERS[0]) return 2;
  return 1;
}

/** Palier global retenu = le pire des deux. */
export function exposureTier(v: Pick<VillageState, 'alcohol_consumption_pct' | 'drug_prevalence_pct'>): ExposureTier {
  return Math.max(alcoholTier(v.alcohol_consumption_pct), drugTier(v.drug_prevalence_pct)) as ExposureTier;
}

export function alcoholProductivityMalus(alcoholPct: number): number {
  return C.ALCOHOL_PRODUCTIVITY_FACTOR * Math.max(0, alcoholPct - C.ALCOHOL_PRODUCTIVITY_FREE);
}

export function drugProductivityMalus(drugPct: number): number {
  return C.DRUG_PRODUCTIVITY_FACTOR * Math.max(0, drugPct - C.DRUG_PRODUCTIVITY_FREE);
}

export function alcoholInsecurity(alcoholPct: number): number {
  return C.ALCOHOL_INSECURITY_FACTOR * Math.max(0, alcoholPct - C.ALCOHOL_INSECURITY_FREE);
}

export function drugInsecurity(drugPct: number): number {
  return C.DRUG_INSECURITY_FACTOR * Math.max(0, drugPct - C.DRUG_INSECURITY_FREE);
}

/** Malus collectiviste [GDD §4.1] = 1,10 × max(0, gauche − 40) + 15 si collectivisation votée. */
export function collectivismMalus(leftPct: number, collectivized: boolean): number {
  return C.COLLECTIVISM_FACTOR * Math.max(0, leftPct - C.COLLECTIVISM_FREE) + (collectivized ? C.COLLECTIVISM_VOTED_MALUS : 0);
}

// ---------------------------------------------------------------------------
// Productivité globale [GDD §3.3 formule 1] — bornée entre 15 % et 150 %
// ---------------------------------------------------------------------------
export interface ProductivityBreakdown {
  bonusSpecialties: number;
  bonusPrivateProperty: number;
  malusUnderstaffing: number;
  malusOverpopulation: number;
  malusTools: number;
  malusCollectivism: number;
  malusAlcohol: number;
  malusDrugs: number;
  raw: number;
  total: number;
}

export function understaffingMalus(workers: number, act: number): number {
  const required = C.REQUIRED_WORKERS_BY_ACT[act] ?? C.REQUIRED_WORKERS_BY_ACT[1]!;
  const deficit = Math.max(0, (required - workers) / required);
  if (deficit <= C.UNDERSTAFF_TOLERANCE) return 0;
  const span = C.UNDERSTAFF_MAX_MALUS - C.UNDERSTAFF_MIN_MALUS;
  return Math.min(C.UNDERSTAFF_MAX_MALUS, C.UNDERSTAFF_MIN_MALUS + ((deficit - C.UNDERSTAFF_TOLERANCE) / 0.5) * span);
}

/** Ratio de sur-occupation des lits PLU (0 si capacité respectée). */
export function overpopulationRatio(population: number, housing: number): number {
  if (population <= housing) return 0;
  return housing <= 0 ? 1 : (population - housing) / housing;
}

export function overpopulationMalus(ratio: number): number {
  if (ratio <= 0) return 0;
  return Math.min(C.OVERPOP_MALUS_MAX, C.OVERPOP_MALUS_BASE + C.OVERPOP_MALUS_SLOPE * ratio);
}

export function specialtiesBonus(s: GameSnapshot): number {
  const skilled = residents(s).filter((m) => m.specialty_code !== 'unskilled');
  const fromResidents = skilled.reduce((acc, m) => acc + m.specialty_level * C.SPECIALTY_BONUS_PER_LEVEL, 0);
  const graduates = adultChildren(s).filter((c) => c.status === 'graduated').length;
  const apprentices = presentChildren(s).filter((c) => c.status === 'apprentice').length;
  return Math.min(
    C.SPECIALTY_BONUS_CAP,
    fromResidents + graduates * C.GRADUATE_GLOBAL_BONUS + apprentices * C.APPRENTICE_GLOBAL_BONUS,
  );
}

export function privatePropertyBonus(s: GameSnapshot): number {
  if (s.village.collectivization_active) return 0;
  const employed = residents(s).filter((m) => m.private_employer_id !== null && m.private_wage_eur_week > 0).length;
  if (employed === 0) return 0;
  return Math.min(C.PRIVATE_EMPLOYMENT_MAX_BONUS, C.PRIVATE_EMPLOYMENT_BASE_BONUS + (employed - 1) * C.PRIVATE_EMPLOYMENT_STEP);
}

export function computeProductivity(s: GameSnapshot): ProductivityBreakdown {
  const v = s.village;
  const pop = countPopulation(s);
  const overRatio = overpopulationRatio(pop.total, v.housing_capacity);
  const b: Omit<ProductivityBreakdown, 'raw' | 'total'> = {
    bonusSpecialties: specialtiesBonus(s),
    bonusPrivateProperty: privatePropertyBonus(s),
    malusUnderstaffing: understaffingMalus(pop.workers, v.act_number),
    malusOverpopulation: overpopulationMalus(overRatio),
    malusTools: v.tools_stock < pop.workers ? C.TOOLS_MALUS : 0,
    malusCollectivism: collectivismMalus(v.left_wing_ideology_pct, v.collectivization_active),
    malusAlcohol: alcoholProductivityMalus(v.alcohol_consumption_pct),
    malusDrugs: drugProductivityMalus(v.drug_prevalence_pct),
  };
  const raw =
    100 +
    b.bonusSpecialties +
    b.bonusPrivateProperty -
    b.malusUnderstaffing -
    b.malusOverpopulation -
    b.malusTools -
    b.malusCollectivism -
    b.malusAlcohol -
    b.malusDrugs;
  return { ...b, raw: round2(raw), total: Math.round(clamp(raw, C.PRODUCTIVITY_MIN, C.PRODUCTIVITY_MAX)) };
}

/** Bonus de pôle (+10 % à +35 % par spécialiste, +15 % par apprenti diplômé) [GDD §3.2, §4.2]. */
export function poleBonusPct(s: GameSnapshot, pole: RoleCode): number {
  const best = residents(s)
    .filter((m) => C.SPECIALTY_POLE[m.specialty_code] === pole)
    .reduce((acc, m) => Math.max(acc, m.specialty_level), 0);
  const specialist =
    best === 0 ? 0 : C.POLE_SPECIALTY_BONUS_MIN + ((best - 1) / 4) * (C.POLE_SPECIALTY_BONUS_MAX - C.POLE_SPECIALTY_BONUS_MIN);
  const graduates = adultChildren(s).filter((c) => c.status === 'graduated' && c.graduated_pole === pole).length;
  return specialist + graduates * C.POLE_GRADUATE_BONUS;
}

/** Multiplicateur appliqué aux rendements d'un pôle (productivité × bonus de pôle × grève × engins loués). */
export function poleFactor(s: GameSnapshot, pole: RoleCode | null, now: Date): number {
  const v = s.village;
  let factor = v.productivity_modifier_pct / 100;
  if (pole) factor *= 1 + poleBonusPct(s, pole) / 100;
  const striking = v.strike_until !== null && new Date(v.strike_until).getTime() > now.getTime();
  if (striking && (pole === 'civil_eng' || pole === 'water_eng')) factor *= C.STRIKE_POLE_FACTOR;
  if (v.machinery_bonus_until && new Date(v.machinery_bonus_until).getTime() > now.getTime()) {
    factor *= 1 + v.machinery_bonus_pct / 100;
  }
  return factor;
}

// ---------------------------------------------------------------------------
// Insécurité [GDD §3.3 formule 2] — bornée entre 0 % et 100 %
// ---------------------------------------------------------------------------
export interface InsecurityBreakdown {
  baseTensions: number;
  overpopulation: number;
  culturalFriction: number;
  alcohol: number;
  drugs: number;
  blackMarket: number;
  reductionInteriorSecurity: number;
  reductionBrunel: number;
  eventOffset: number;
  total: number;
}

export function computeInsecurity(s: GameSnapshot, now: Date): InsecurityBreakdown {
  const v = s.village;
  const pop = countPopulation(s);
  const striking = v.strike_until !== null && new Date(v.strike_until).getTime() > now.getTime();
  const watchtowers = s.structures.filter((st) => (st.kind === 'watchtower' || st.kind === 'gate') && st.status === 'operational').length;
  const b = {
    baseTensions:
      C.INSECURITY_BASE_TENSIONS + (v.faction_active ? C.INSECURITY_FACTION_TENSIONS : 0) + (striking ? C.INSECURITY_STRIKE_TENSIONS : 0),
    overpopulation: C.INSECURITY_OVERPOP_SLOPE * overpopulationRatio(pop.total, v.housing_capacity),
    culturalFriction: C.INSECURITY_FRICTION_FACTOR * Math.max(0, v.cultural_friction_pct - C.INSECURITY_FRICTION_FREE),
    alcohol: alcoholInsecurity(v.alcohol_consumption_pct),
    drugs: drugInsecurity(v.drug_prevalence_pct),
    blackMarket: v.black_market_active
      ? C.BLACK_MARKET_INSECURITY + Math.min(C.BLACK_MARKET_RUIN_CAP, countRuins(s) * C.BLACK_MARKET_RUIN_FACTOR)
      : 0,
    reductionInteriorSecurity:
      (holdsPortfolio(s, 'interior') ? C.INTERIOR_PORTFOLIO_REDUCTION : 0) +
      watchtowers * C.WATCHTOWER_REDUCTION +
      v.security_reduction_pct,
    reductionBrunel: v.brunel_reduction_pct,
    eventOffset: v.insecurity_offset,
  };
  const raw =
    b.baseTensions +
    b.overpopulation +
    b.culturalFriction +
    b.alcohol +
    b.drugs +
    b.blackMarket -
    b.reductionInteriorSecurity -
    b.reductionBrunel +
    b.eventOffset;
  return { ...b, total: round2(clamp(raw, 0, 100)) };
}

// ---------------------------------------------------------------------------
// Hydraulique : D_eau = Npop × 150 L + Besoin_potager + Besoin_élevage [GDD §3.1]
// ---------------------------------------------------------------------------
export interface WaterBalance {
  demandPeople: number;
  demandGarden: number;
  demandLivestock: number;
  demandTotal: number;
  capacity: number;
  ratio: number;
  gardenSupplyRatio: number;
}

export function computeWaterBalance(s: GameSnapshot, season: CalendarSeason): WaterBalance {
  const v = s.village;
  const pop = countPopulation(s);
  const demandPeople = pop.total * C.WATER_L_PER_PERSON;
  const demandGarden = v.garden_area_m2 * C.GARDEN_WATER_L_PER_M2[season];
  const demandLivestock = v.livestock_count * C.WATER_L_PER_LIVESTOCK;
  const demandTotal = demandPeople + demandGarden + demandLivestock;
  const capacity = v.water_capacity_l_day * (0.5 + v.water_network_condition_pct / 200);
  // Les personnes et le bétail sont servis en priorité, le potager reçoit le reste
  const leftForGarden = Math.max(0, capacity - demandPeople - demandLivestock);
  return {
    demandPeople,
    demandGarden,
    demandLivestock,
    demandTotal,
    capacity: round2(capacity),
    ratio: demandTotal === 0 ? 1 : round2(capacity / demandTotal),
    gardenSupplyRatio: demandGarden === 0 ? 1 : round2(Math.min(1, leftForGarden / demandGarden)),
  };
}

export function septicSaturationPct(population: number, capacityPeople: number): number {
  if (capacityPeople <= 0) return population > 0 ? 300 : 0;
  return round2(clamp((population / capacityPeople) * 100, 0, 300));
}

// ---------------------------------------------------------------------------
// Potager : Récolte = Base × Coeff_saison × min(1, Eau_reçue / D_potager) × Productivité [GDD §3.1]
// ---------------------------------------------------------------------------
export interface HarvestResult {
  rations: number;
  tomatoesKg: number;
}

export function computeGardenHarvest(s: GameSnapshot, season: CalendarSeason, gardenSupplyRatio: number): HarvestResult {
  const v = s.village;
  const base = (v.garden_area_m2 / 100) * C.GARDEN_BASE_RATIONS_PER_100M2;
  let harvest = base * C.SEASON_HARVEST_COEFF[season] * Math.min(1, gardenSupplyRatio) * (v.productivity_modifier_pct / 100);
  if (v.livestock_count >= C.LIVESTOCK_FERTILIZER_THRESHOLD) harvest *= 1 + C.LIVESTOCK_FERTILIZER_BONUS;
  if (v.left_wing_ideology_pct > C.COLLECTIVIST_SHORTAGE_THRESHOLD) harvest *= 1 - C.COLLECTIVIST_HARVEST_MALUS;
  if (v.real_temp_min_c < 0 && season !== 'winter') harvest *= 0.6; // gel tardif
  const tomatoShare = C.TOMATO_SHARE[season];
  return {
    rations: round2(harvest * (1 - tomatoShare)),
    tomatoesKg: round2(harvest * tomatoShare * C.TOMATO_KG_PER_RATION),
  };
}

export function dailyFoodConsumption(s: GameSnapshot): number {
  const pop = countPopulation(s);
  const raw = pop.adults * C.RATIONS_ADULT_DAY + pop.children * C.RATIONS_CHILD_DAY;
  return round2(s.village.rationing_active ? raw * C.RATIONING_FACTOR : raw);
}

// ---------------------------------------------------------------------------
// Énergie : production, consommation, surplus [GDD §3.1]
// ---------------------------------------------------------------------------
export interface EnergyBalance {
  tier: number;
  productionKwh: number;
  consumptionKwh: number;
  surplusKwh: number;
  perPersonKwh: number;
}

export function computeEnergyBalance(s: GameSnapshot): EnergyBalance {
  const v = s.village;
  const tierSpec = C.ENERGY_TIERS[v.energy_tier] ?? C.ENERGY_TIERS[1]!;
  const pop = countPopulation(s);
  const connected = s.structures.filter((st) => st.is_power_connected && st.status === 'operational').length;
  const mining = v.crypto_mining_active ? C.MINING_KWH_DAY : 0;
  const consumption = pop.total * tierSpec.kwhPerPersonDay + connected * C.BUILDING_KWH_DAY;
  const op = (kind: string) => s.structures.some((st) => st.kind === kind && st.status === 'operational' && st.is_power_connected);
  let production = 0;
  if (op('dam')) production += C.PRODUCTION_KWH_DAY.dam;
  if (op('solar')) production += C.PRODUCTION_KWH_DAY.solar;
  if (v.energy_tier >= 5) production += C.PRODUCTION_KWH_DAY.reactor;
  const surplus = v.energy_tier >= 4 ? Math.max(0, production - consumption - mining) : 0;
  return {
    tier: v.energy_tier,
    productionKwh: production,
    consumptionKwh: round2(consumption + mining),
    surplusKwh: round2(surplus),
    perPersonKwh: tierSpec.kwhPerPersonDay,
  };
}

// ---------------------------------------------------------------------------
// Natalité saisonnière [GDD §3.2]
// Natalité_eff = Natalité_base × (1 − homo/100) × Coeff_mariages × Coeff_logement × Coeff_moral
// ---------------------------------------------------------------------------
export interface NatalityBreakdown {
  base: number;
  homosexualityFactor: number;
  coeffMarriages: number;
  coeffHousing: number;
  coeffMorale: number;
  effectiveRatePct: number;
  fertileAdults: number;
  expectedBirths: number;
}

export function computeNatality(s: GameSnapshot): NatalityBreakdown {
  const v = s.village;
  const pop = countPopulation(s);
  const activeUnions = s.unions.filter((u) => u.is_active).length;
  const marriageShare = pop.fertileAdults === 0 ? 0 : Math.min(1, (2 * activeUnions) / pop.fertileAdults);
  const coeffMarriages =
    1 + C.MARRIAGE_NATALITY_BONUS * marriageShare + (v.family_allowance_season === v.season_number ? C.FAMILY_ALLOWANCE_BONUS : 0);
  const coeffHousing = pop.total <= v.housing_capacity ? 1 : Math.max(0.3, v.housing_capacity / Math.max(1, pop.total));
  const coeffMorale = 0.5 + v.morale_pct / 100;
  const homosexualityFactor = 1 - v.homosexuality_rate_pct / 100;
  const effective = v.birth_rate_pct * homosexualityFactor * coeffMarriages * coeffHousing * coeffMorale;
  return {
    base: v.birth_rate_pct,
    homosexualityFactor: round2(homosexualityFactor),
    coeffMarriages: round2(coeffMarriages),
    coeffHousing: round2(coeffHousing),
    coeffMorale: round2(coeffMorale),
    effectiveRatePct: round2(effective),
    fertileAdults: pop.fertileAdults,
    expectedBirths: Math.round((effective / 100) * pop.fertileAdults * 10000) / 10000,
  };
}

/**
 * Évolution saisonnière de la pérennité [GDD §3.2] :
 * Δ = Naissances × 8 + Enfants_accueillis × 4 − (Vieillissement_base + Malus_homosexualité).
 * Les enfants accueillis sont crédités dès l'admission (+4 % chacun) : ils ne sont pas recomptés ici.
 */
export function viabilitySeasonDelta(s: GameSnapshot, births: number): number {
  const v = s.village;
  const pop = countPopulation(s);
  const seniorShare = pop.adults === 0 ? 0 : pop.seniors / pop.adults;
  const aging = C.VIABILITY_AGING_BASE + C.VIABILITY_AGING_SENIOR_FACTOR * seniorShare;
  const homoMalus = C.HOMO_MALUS_FACTOR * Math.max(0, v.homosexuality_rate_pct - C.HOMO_MALUS_FREE);
  return round2(births * C.VIABILITY_PER_BIRTH - (aging + homoMalus));
}

// ---------------------------------------------------------------------------
// Autonomie & Actes [GDD §1.3]
// ---------------------------------------------------------------------------
export interface AutonomyBreakdown {
  energy: number;
  water: number;
  food: number;
  debt: number;
  housing: number;
  sovereignty: number;
  total: number;
}

export function computeAutonomy(s: GameSnapshot, season: CalendarSeason): AutonomyBreakdown {
  const v = s.village;
  const energy = ({ 1: 0, 2: 5, 3: 10, 4: 20, 5: 25 } as Record<number, number>)[v.energy_tier] ?? 0;
  const water = computeWaterBalance(s, season);
  const waterScore =
    water.ratio >= 1 && v.water_network_condition_pct >= 60
      ? 15
      : 15 * 0.5 * Math.min(1, water.ratio) * (v.water_network_condition_pct / 100);
  const consumption = dailyFoodConsumption(s);
  const avgSeasonCoeff = 0.64; // moyenne annuelle des coefficients saisonniers
  const gardenAnnual =
    (v.garden_area_m2 / 100) * C.GARDEN_BASE_RATIONS_PER_100M2 * avgSeasonCoeff * (v.productivity_modifier_pct / 100) +
    v.livestock_count * C.LIVESTOCK_RATIONS_PER_HEAD_DAY;
  const foodRatio = consumption === 0 ? 1 : Math.min(1, gardenAnnual / consumption);
  const food = 20 * foodRatio * foodRatio;
  const debt = 20 * clamp(1 - v.land_debt_eur / C.INITIAL_LAND_DEBT_EUR, 0, 1);
  const beds = s.structures.filter((st) => st.kind === 'building');
  const totalBeds = beds.reduce((a, st) => a + st.beds_capacity, 0);
  const operationalBeds = beds.filter((st) => st.status === 'operational').reduce((a, st) => a + st.beds_capacity, 0);
  const housing = totalBeds === 0 ? 0 : 10 * (operationalBeds / totalBeds);
  const sovereignty =
    (s.constitution.some((a) => a.status === 'adopted') ? 3 : 0) +
    (v.independence_proclaimed ? 4 : 0) +
    (clamp(v.deterrence_level, 0, 5) / 5) * 3;
  const total = energy + waterScore + food + debt + housing + sovereignty;
  return {
    energy,
    water: round2(waterScore),
    food: round2(food),
    debt: round2(debt),
    housing: round2(housing),
    sovereignty: round2(sovereignty),
    total: Math.round(clamp(total, 0, 100)),
  };
}

export function actForAutonomy(current: number, autonomy: number): 1 | 2 | 3 {
  const target = autonomy >= C.ACT_THRESHOLDS.act3 ? 3 : autonomy >= C.ACT_THRESHOLDS.act2 ? 2 : 1;
  return Math.max(current, target) as 1 | 2 | 3; // les Actes ne régressent jamais
}

/** Risque d'embuscade d'une expédition de contrebande (25 % à 45 %) [GDD §5.2]. */
export function smugglingRiskPct(v: VillageState): number {
  const raw = C.SMUGGLING_RISK_MIN + v.smuggling_runs_this_season * 5 + v.customs_alert_pct / 5 - v.spanish_fluency_pct / 10;
  return round2(clamp(raw, C.SMUGGLING_RISK_MIN, C.SMUGGLING_RISK_MAX));
}

/** Surcoût de livraison (+40 % si piste < 40 %) [GDD §3.1]. */
export function deliverySurchargeFactor(v: VillageState): number {
  return v.track_condition_pct < C.TRACK_SURCHARGE_THRESHOLD ? 1 + C.TRACK_SURCHARGE_PCT / 100 : 1;
}

/** Efficacité morale de la Messe réduite par la friction culturelle [GDD §4.2]. */
export function massMoraleGain(v: VillageState): number {
  const efficacy = 1 - Math.max(0, v.cultural_friction_pct - 20) / 100;
  return round2(C.MASS_BASE_MORALE * clamp(efficacy, 0.2, 1));
}
