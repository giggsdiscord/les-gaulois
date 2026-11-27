// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/simulation.ts
/**
 * Écoulement du temps — applyElapsedTime() [GDD §3, §7.3 Sprint 2].
 * Aucun serveur permanent : à chaque connexion ou action, le moteur rattrape les minuits
 * franchis depuis last_tick_at (heure de Madrid). Chaque minuit :
 *   1. clôture de la journée écoulée (eau, énergie, récoltes, outils, piste, société, moral) ;
 *   2. si l'on entre dans un lundi : clôture de la saison de jeu (natalité, enfants, dette, gîte...) ;
 *   3. nuit : régénération des PA, santé, addictions, expirations (cachot, travaux forcés...).
 * Tous les tirages sont déterministes (graine = id du village + jour).
 */
import * as C from './constants.ts';
import {
  addDaysToKey,
  addHours,
  calendarSeasonOf,
  calendarSeasonOfKey,
  dayKey,
  isAfter,
  localParts,
  midnightsBetween,
  startOfLocalDay,
  weekdayOfKey,
} from './calendar.ts';
import { processBirths, processChildrenSeason, processDemographicSeason } from './demography.ts';
import { emptyEffects, pushEvent, pushLedger, pushTrigger } from './effects.ts';
import { processWear } from './upkeep.ts';
import {
  actForAutonomy,
  computeAutonomy,
  computeEnergyBalance,
  computeGardenHarvest,
  computeInsecurity,
  computeProductivity,
  computeWaterBalance,
  dailyFoodConsumption,
  exposureTier,
  septicSaturationPct,
} from './formulas.ts';
import { addictionDrift, applyInjury, computeDailyAp, isInWithdrawal } from './health.ts';
import { checkActGoals } from './goals.ts';
import { closeCollectiveWeek, startWeeklyProject } from './collective.ts';
import { hasBuilding, processBuildings } from './buildings.ts';
import { processElections } from './elections.ts';
import { lifeOf, processHeating, resetSeasonLife } from './life.ts';
import { clamp, deepClone, gauge, money, stepToward, stock } from './math.ts';
import { activePlayers, computeHousingCapacity, countPopulation, residents, structureByCode } from './population.ts';
import { createRng, type Rng } from './rng.ts';
import { processResidentWork } from './work.ts';
import { pickPutschLeader, putschConditions, updateIdeologyAndFriction, updateSubstancesAndBlackMarket } from './society.ts';
import type { CalendarSeason, EngineEffects, GameSnapshot } from './types.ts';

export interface TickResult extends EngineEffects {
  snapshot: GameSnapshot;
  daysProcessed: number;
  seasonsProcessed: number;
  skippedDays: number;
}

// ---------------------------------------------------------------------------
// Journée écoulée
// ---------------------------------------------------------------------------
function closeDay(s: GameSnapshot, fx: EngineEffects, endedKey: string, midnight: Date): void {
  const v = s.village;
  const rng = createRng(`${v.id}:day:${endedKey}`);
  const season = calendarSeasonOfKey(endedKey);
  v.housing_capacity = computeHousingCapacity(s);

  updateWaterAndSanitation(s, fx, rng, season, midnight);
  updateEnergy(s, fx);
  processResidentWork(s, fx, season, midnight);
  updateFood(s, fx, rng, season);
  processHeating(s, fx);
  processBuildings(s, fx, season);
  processWear(s, fx, season);
  updateToolsAndTrack(s, rng);
  updateIdeologyAndFriction(s, fx, rng.fork('society'), midnight);
  updateSubstancesAndBlackMarket(s, fx, rng.fork('substances'));
  updateMoraleAndDiplomacy(s, midnight);
  refreshDerived(s, midnight, season, fx);
  // Premier chantier collectif (V5.0) : ouvert dès la première nuit, sauf le lundi (closeSeason s'en charge)
  if (!lifeOf(v).collective && localParts(midnight).weekday !== 1) startWeeklyProject(s, fx, rng.fork('collective'), midnight);
  // Élections vivantes des portefeuilles (V5.3)
  processElections(s, fx, endedKey, midnight);
  v.game_day += 1;
}

function updateWaterAndSanitation(s: GameSnapshot, fx: EngineEffects, rng: Rng, season: CalendarSeason, midnight: Date): void {
  const v = s.village;
  const pop = countPopulation(s);
  const wb = computeWaterBalance(s, season);
  v.septic_saturation_pct = septicSaturationPct(pop.total, v.septic_capacity_people);

  // Vieillissement du réseau, gel
  v.water_network_condition_pct = gauge(v.water_network_condition_pct - 0.2 - (v.real_temp_min_c < -2 ? 1 : 0));

  // Sabotage non détecté par Alex : dégât le lendemain [GDD §4.3]
  if (v.sabotage_pending) {
    v.sabotage_pending = false;
    v.water_network_condition_pct = gauge(v.water_network_condition_pct - C.SABOTAGE_PIPE_DAMAGE);
    const pipe = structureByCode(s, 'conduite_principale');
    if (pipe) pipe.leak_alert = true;
    pushEvent(fx, s, {
      event_type: 'sabotage',
      title: 'Conduite sabotée',
      body: 'Une conduite d\'eau a été sciée dans la nuit. Fuite importante sur le réseau d\'Alex.',
    });
  }

  // Rupture : sous-dimensionnement (risque proportionnel au déficit) ou réseau dégradé [GDD §3.1]
  const undersizedRisk = wb.ratio < 1 ? C.PIPE_RUPTURE_RISK_PCT * Math.min(1, (1 - wb.ratio) * 2) : 0;
  const degradedRisk = v.water_network_condition_pct < C.WATER_FAILURE_CONDITION ? C.PIPE_RUPTURE_RISK_PCT : 0;
  if (rng.chance(Math.max(undersizedRisk, degradedRisk))) {
    v.water_network_condition_pct = gauge(v.water_network_condition_pct - 15);
    v.water_quality_pct = gauge(v.water_quality_pct - 15);
    const pipe = structureByCode(s, 'conduite_principale');
    if (pipe) {
      pipe.leak_alert = true;
      pipe.condition_pct = Math.round(v.water_network_condition_pct);
    }
    pushEvent(fx, s, {
      event_type: 'pipe_rupture',
      title: 'Rupture de canalisation',
      body: 'Une canalisation a cédé : chantier inondé et risque de contamination hydrique.',
      data: { demand_l: wb.demandTotal, capacity_l: wb.capacity },
    });
  }

  // Fosses septiques saturées
  if (v.septic_saturation_pct > C.SEPTIC_OVERFLOW_THRESHOLD) {
    v.water_quality_pct = gauge(v.water_quality_pct - 5);
    v.ecology_index_pct = gauge(v.ecology_index_pct - 1);
  } else if (v.water_network_condition_pct >= 60) {
    v.water_quality_pct = gauge(v.water_quality_pct + 1);
  }

  // Épidémies (incubation cachée, visible par Tanguy) [GDD §3.1] ; le lavoir (V5.4) divise le risque par deux
  const washFactor = hasBuilding(s, 'washhouse') ? C.WASHHOUSE_EPIDEMIC_FACTOR : 1;
  if (v.epidemic_incubation_days > 0) {
    v.epidemic_incubation_days -= 1;
    if (v.epidemic_incubation_days === 0) {
      v.epidemic_until = addHours(midnight, C.EPIDEMIC_DURATION_DAYS * 24).toISOString();
      pushEvent(fx, s, {
        event_type: 'epidemic',
        title: 'Épidémie hydrique',
        body: 'Gastro-entérite généralisée : Tango et Brunel sont débordés.',
      });
    }
  } else if (v.water_quality_pct < 40 && !isAfter(v.epidemic_until, midnight) && rng.chance(20 * washFactor)) {
    v.epidemic_incubation_days = C.EPIDEMIC_INCUBATION_DAYS;
  }
  if (isAfter(v.epidemic_until, midnight)) {
    v.morale_pct = gauge(v.morale_pct - 3);
    for (const p of activePlayers(s)) {
      if (p.injury_type === null && rng.chance(C.EPIDEMIC_INFECTION_RISK_PCT * washFactor)) applyInjury(p, 'infectious', midnight);
    }
    for (const m of residents(s)) {
      if (m.injury_type === null && rng.chance(C.EPIDEMIC_INFECTION_RISK_PCT * washFactor)) m.injury_type = 'infectious';
    }
  }
}

function updateEnergy(s: GameSnapshot, fx: EngineEffects): void {
  const v = s.village;
  const spec = C.ENERGY_TIERS[v.energy_tier] ?? C.ENERGY_TIERS[1]!;
  const eb = computeEnergyBalance(s);
  let cost = spec.dailyFixedCostEur + eb.consumptionKwh * spec.costPerKwhEur;

  if (v.energy_tier === 2) {
    const litres = Math.ceil(eb.consumptionKwh * spec.fuelLitresPerKwh);
    if (v.fuel_stock_l >= litres) {
      v.fuel_stock_l = stock(v.fuel_stock_l - litres);
      cost += litres * C.FUEL_PRICE_EUR_PER_L; // carburant refacturé au prorata
    } else {
      v.fuel_stock_l = 0;
      v.morale_pct = gauge(v.morale_pct - 1);
      pushEvent(fx, s, {
        event_type: 'fuel_shortage',
        title: 'Panne sèche',
        body: 'Plus de gasoil pour le groupe électrogène : retour aux bougies ce soir.',
      });
    }
  }
  v.ecology_index_pct = gauge(v.ecology_index_pct + spec.ecologyPerDay);

  // Coût réel à la charge de la caisse (le carburant a déjà été acheté)
  const cashCost = v.energy_tier === 2 ? spec.dailyFixedCostEur : cost;
  v.treasury_eur = money(v.treasury_eur - cashCost);
  v.energy_cost_season_eur = money(v.energy_cost_season_eur + cost);

  for (const p of activePlayers(s)) p.power_kwh_used = money(p.power_kwh_used + eb.perPersonKwh);

  // Minage sur le surplus hydroélectrique [GDD §5.3]
  if (v.crypto_mining_active) {
    if (v.energy_tier >= 4 && eb.productionKwh >= eb.consumptionKwh) {
      v.crypto_reserves_eur = money(v.crypto_reserves_eur + C.MINING_KWH_DAY * C.MINING_EUR_PER_KWH);
    }
  }
}

function updateFood(s: GameSnapshot, fx: EngineEffects, rng: Rng, season: CalendarSeason): void {
  const v = s.village;
  const wb = computeWaterBalance(s, season);
  const harvest = computeGardenHarvest(s, season, wb.gardenSupplyRatio);
  v.food_rations = money(v.food_rations + harvest.rations + v.livestock_count * C.LIVESTOCK_RATIONS_PER_HEAD_DAY);
  v.tomatoes_stock = stock(v.tomatoes_stock + harvest.tomatoesKg);

  // Sangliers dans le potager [GDD §2.2 Défense]
  if (v.perimeter_threat_pct > 30 && rng.chance(v.perimeter_threat_pct / 3)) {
    v.food_rations = money(Math.max(0, v.food_rations - 5));
    pushEvent(fx, s, { event_type: 'boars', title: 'Sangliers', body: 'Des sangliers ont retourné le potager d\'Ely.' });
  }

  const consumption = dailyFoodConsumption(s);
  if (v.food_rations >= consumption) {
    v.food_rations = money(v.food_rations - consumption);
  } else {
    v.food_rations = 0;
    v.morale_pct = gauge(v.morale_pct - 5);
    v.insecurity_offset = money(v.insecurity_offset + 3);
    for (const p of activePlayers(s)) p.health_pct = Math.round(clamp(p.health_pct - 3, 0, 100));
    pushEvent(fx, s, { event_type: 'famine', title: 'Pénurie de rations', body: 'Les rations sont épuisées : on se serre la ceinture.' });
  }
}

function updateToolsAndTrack(s: GameSnapshot, rng: Rng): void {
  const v = s.village;
  const pop = countPopulation(s);
  const tier = exposureTier(v);
  const wearMultiplier = tier >= 3 ? 2 : tier === 2 ? 1.2 : 1; // l'ébriété double l'usure [GDD §2.1 Julio]
  v.tools_wear_pct = v.tools_wear_pct + pop.workers * C.TOOLS_WEAR_PER_WORKER_DAY * wearMultiplier;
  while (v.tools_wear_pct >= 100 && v.tools_stock > 0) {
    v.tools_wear_pct -= 100;
    v.tools_stock -= 1;
    v.scrap_stock += 1;
  }
  v.tools_wear_pct = gauge(v.tools_wear_pct);
  if (v.insecurity_pct > 30 && v.tools_stock > 0 && rng.chance(v.insecurity_pct / 4)) {
    v.tools_stock -= 1;
    v.tools_stolen_season += 1;
  }

  let wear = 0.1;
  if (v.real_precip_mm > C.RAIN_THRESHOLD_MM) wear += C.TRACK_WEAR_RAIN;
  if (v.real_snow_cm > 0) wear += C.TRACK_WEAR_SNOW;
  v.track_condition_pct = gauge(v.track_condition_pct - wear);
  v.fleet_wear_pct = gauge(v.fleet_wear_pct + 0.3);
}

function updateMoraleAndDiplomacy(s: GameSnapshot, midnight: Date): void {
  const v = s.village;
  v.morale_pct = gauge(stepToward(v.morale_pct, 60, 1));
  if (v.insecurity_pct > 50) v.morale_pct = gauge(v.morale_pct - 2);
  if (isAfter(v.strike_until, midnight)) v.morale_pct = gauge(v.morale_pct - 1);
  if (v.left_wing_ideology_pct > C.COLLECTIVIST_SHORTAGE_THRESHOLD) v.morale_pct = gauge(v.morale_pct - 1);
  if (v.real_snow_cm > 0) v.morale_pct = gauge(v.morale_pct - 1);
  if (v.rationing_active) v.morale_pct = gauge(v.morale_pct - 1);

  const adminFloor = Math.max(0, 10 - C.LAW_ADMIN_PRESSURE_REDUCTION * v.law_graduates);
  v.admin_pressure_pct = gauge(stepToward(v.admin_pressure_pct, adminFloor, 0.3));
  const hispanophones = residents(s).filter((m) => m.spanish_speaker).length;
  v.spanish_fluency_pct = gauge(v.spanish_fluency_pct + hispanophones * 0.05);
  v.customs_alert_pct = gauge(stepToward(v.customs_alert_pct, 10, 1));
  v.perimeter_threat_pct = gauge(stepToward(v.perimeter_threat_pct, 10 + (v.gite_open ? 5 : 0), 0.5));

  v.security_reduction_pct = gauge(v.security_reduction_pct - C.SECURITY_REDUCTION_DECAY);
  v.brunel_reduction_pct = gauge(v.brunel_reduction_pct - C.BRUNEL_REDUCTION_DECAY);
  v.insecurity_offset = Math.round(v.insecurity_offset * C.INSECURITY_OFFSET_DECAY * 100) / 100;
}

/** Recalcule les grandeurs dérivées (productivité, insécurité, autonomie, Acte). */
export function refreshDerived(s: GameSnapshot, now: Date, season: CalendarSeason, fx: EngineEffects): void {
  const v = s.village;
  v.housing_capacity = computeHousingCapacity(s);
  v.productivity_modifier_pct = computeProductivity(s).total;
  v.insecurity_pct = computeInsecurity(s, now).total;
  updateAutonomyAndAct(s, now, season, fx);
  // Objectifs d'Acte (V5.1) : une étape cochée verse sa récompense (dette, moral) -> autonomie recalculée
  if (checkActGoals(s, fx, now).length > 0) updateAutonomyAndAct(s, now, season, fx);
}

function updateAutonomyAndAct(s: GameSnapshot, _now: Date, season: CalendarSeason, fx: EngineEffects): void {
  const v = s.village;
  v.autonomy_pct = computeAutonomy(s, season).total;
  const newAct = actForAutonomy(v.act_number, v.autonomy_pct);
  if (newAct !== v.act_number) {
    const from = v.act_number;
    v.act_number = newAct;
    pushEvent(fx, s, {
      event_type: 'act_changed',
      title: newAct === 2 ? 'Acte II — L\'Autarcie Pyrénéenne' : 'Acte III — La Principauté des Gaulois',
      body:
        newAct === 2
          ? 'Les portefeuilles Défense, Sécurité Intérieure et Transports & Douanes s\'ouvrent à l\'élection.'
          : 'La Chancellerie et les Médias s\'ouvrent ; la Constitution peut être rédigée.',
      data: { from, to: newAct, autonomy_pct: v.autonomy_pct },
    });
    pushTrigger(fx, { type: 'act_changed', from, to: newAct });
  }
}

// ---------------------------------------------------------------------------
// Nuit : régénération et expirations
// ---------------------------------------------------------------------------
function processNight(s: GameSnapshot, fx: EngineEffects, newKey: string, midnight: Date): void {
  const v = s.village;
  const rng = createRng(`${v.id}:night:${newKey}`);

  for (const p of s.players) {
    if (!p.is_active_slot) continue;
    if (p.is_detained_until && !isAfter(p.is_detained_until, midnight)) p.is_detained_until = null;
    if (p.strapping_until && !isAfter(p.strapping_until, midnight)) p.strapping_until = null;
    if (p.delegation_until && !isAfter(p.delegation_until, midnight)) {
      p.delegated_to = null;
      p.delegation_until = null;
    }
    if (p.status === 'forced_labor') {
      if (p.forced_labor_until && !isAfter(p.forced_labor_until, midnight)) {
        p.status = 'active';
        p.forced_labor_until = null;
      } else {
        p.fatigue_pct = Math.round(clamp(p.fatigue_pct + C.FORCED_LABOR_DAILY_FATIGUE, 0, 100));
        v.track_condition_pct = gauge(v.track_condition_pct + 2); // empierrement de la piste
      }
    }
    if (p.status !== 'active' && p.status !== 'forced_labor') {
      p.action_points = 0;
      continue;
    }

    p.fatigue_pct = Math.round(clamp(p.fatigue_pct - C.NIGHT_FATIGUE_RECOVERY, 0, 100));
    if (p.injury_type === 'muscular') p.health_pct = Math.round(clamp(p.health_pct - 1, 0, 100));
    if (p.injury_type === 'infectious') p.health_pct = Math.round(clamp(p.health_pct - 3, 0, 100));
    if (p.injury_type === 'psychological') p.mental_health_pct = Math.round(clamp(p.mental_health_pct - 3, 0, 100));
    if (p.injury_type === null && p.fatigue_pct < 50) p.health_pct = Math.round(clamp(p.health_pct + 2, 0, 100));

    p.addiction_level_pct = addictionDrift(p.addiction_level_pct, v);
    let mentalDelta = v.morale_pct >= 60 ? 1 : v.morale_pct < 40 ? -1 : 0;
    if (isInWithdrawal(p)) mentalDelta -= C.WITHDRAWAL_MENTAL_LOSS;
    if (p.temptation_guilt_pct > 50) mentalDelta -= 2;
    p.mental_health_pct = Math.round(clamp(p.mental_health_pct + mentalDelta, 0, 100));
    p.morale_pct = Math.round(clamp(stepToward(p.morale_pct, v.morale_pct, 2), 0, 100));

    p.action_points = computeDailyAp(p, v, rng, midnight);
    p.pending_ap_penalty = 0;
  }

  for (const m of s.migrants) {
    if (m.status !== 'accepted' && m.status !== 'forced_labor') continue;
    if (m.is_detained_until && !isAfter(m.is_detained_until, midnight)) m.is_detained_until = null;
    if (m.status === 'forced_labor') {
      if (m.forced_labor_until && !isAfter(m.forced_labor_until, midnight)) {
        m.status = 'accepted';
        m.forced_labor_until = null;
      } else {
        v.track_condition_pct = gauge(v.track_condition_pct + 2);
      }
    }
    m.addiction_level_pct = addictionDrift(m.addiction_level_pct, v);
    if (m.injury_type === 'infectious') m.health_pct = Math.round(clamp(m.health_pct - 3, 0, 100));
    else if (m.injury_type === null) m.health_pct = Math.round(clamp(m.health_pct + 1, 0, 100));
  }

  for (const t of s.temptations) {
    if (t.choice === 'pending' && !isAfter(t.expires_at, midnight)) {
      t.choice = 'expired';
      t.responded_at = midnight.toISOString();
    }
  }

  // Dimanche matin : tentative de putsch pendant l'Agora [GDD §4.3]
  if (weekdayOfKey(newKey) === 7 && putschConditions(s)) {
    const leader = pickPutschLeader(s);
    if (leader) {
      v.last_putsch_season = v.season_number;
      const president = activePlayers(s).find((p) => p.role_code === C.PRESIDENT_ROLE);
      pushEvent(fx, s, {
        event_type: 'putsch_attempt',
        title: 'Tentative de putsch',
        body: `${leader.full_name} et sa faction tentent de s'emparer de l'Agora. Duel au Carlage 2×2 avec la Présidente !`,
        data: { leader_migrant_id: leader.id },
      });
      pushTrigger(fx, { type: 'putsch_attempt', leader_migrant_id: leader.id, president_player_id: president?.id ?? null });
    }
  }
}

// ---------------------------------------------------------------------------
// Fin de saison de jeu (lundi 00:00)
// ---------------------------------------------------------------------------
function closeSeason(s: GameSnapshot, fx: EngineEffects, midnight: Date): void {
  const v = s.village;
  const rng = createRng(`${v.id}:season:${v.season_number}`);

  const births = processBirths(s, fx, rng.fork('births'), midnight);
  processDemographicSeason(s, fx, births);
  processChildrenSeason(s, fx);
  payLandLoan(s, fx);
  processGite(s, fx, rng.fork('gite'));
  payPrivateWages(s, fx);
  billEnergy(s, fx);

  // Cheptel : agnelages et portées
  const pen = structureByCode(s, 'cleda');
  if (pen?.status === 'operational' && v.livestock_count >= 4) {
    v.livestock_count = Math.min(C.LIVESTOCK_PEN_CAPACITY, v.livestock_count + Math.max(1, Math.floor(v.livestock_count * 0.08)));
  }

  // Effondrement soviétique [GDD §4.1]
  v.high_left_seasons = v.left_wing_ideology_pct > C.SOVIET_COLLAPSE_THRESHOLD ? v.high_left_seasons + 1 : 0;
  if (v.high_left_seasons >= C.SOVIET_COLLAPSE_SEASONS && !v.is_defeated) {
    v.is_defeated = true;
    v.defeat_reason = 'soviet_collapse';
    pushEvent(fx, s, {
      event_type: 'defeat',
      title: 'Effondrement soviétique du hameau',
      body: 'Cessation de paiement de l\'emprunt, saisie judiciaire par les banques espagnoles et dispersion des habitants.',
    });
    pushTrigger(fx, { type: 'defeat', reason: 'soviet_collapse' });
  }

  pushEvent(fx, s, {
    event_type: 'season_report',
    title: `Bilan de la saison ${v.season_number}`,
    body: `Naissances : ${v.births_this_season}. Pérennité démographique : ${Math.round(v.demographic_viability_pct)} %. Autonomie : ${v.autonomy_pct} %.`,
    data: {
      births: v.births_this_season,
      viability: v.demographic_viability_pct,
      homosexuality_rate: v.homosexuality_rate_pct,
      left_wing: v.left_wing_ideology_pct,
    },
  });

  // Remise à zéro hebdomadaire
  for (const p of s.players) {
    p.veto_tokens = (C.VETO_ROLES as string[]).includes(p.role_code) && p.is_active_slot ? 1 : 0;
  }
  v.mass_held_this_season = false;
  v.mediations_this_season = 0;
  v.smuggling_runs_this_season = 0;
  v.tools_stolen_season = 0;
  v.births_this_season = 0;
  v.children_welcomed_this_season = 0;
  v.new_adults_this_season = 0;
  resetSeasonLife(v);
  closeCollectiveWeek(s, fx, rng.fork('collective'), midnight);
  v.season_number += 1;
}

function payLandLoan(s: GameSnapshot, fx: EngineEffects): void {
  const v = s.village;
  if (v.land_debt_eur <= 0) return;
  const rate = v.left_wing_ideology_pct > C.COLLECTIVIST_SHORTAGE_THRESHOLD ? C.LOAN_ANNUAL_RATE * 2 : C.LOAN_ANNUAL_RATE;
  const interest = money((v.land_debt_eur * rate) / 52);
  const installment = Math.min(C.LOAN_WEEKLY_INSTALLMENT_EUR, money(v.land_debt_eur + interest));
  if (v.treasury_eur >= installment) {
    v.treasury_eur = money(v.treasury_eur - installment);
    const principal = money(installment - interest);
    v.land_debt_eur = money(Math.max(0, v.land_debt_eur - principal));
    pushLedger(fx, s, { account: 'treasury', amount_eur: -installment, label: 'Échéance hebdomadaire de l\'emprunt foncier', category: 'loan' });
    pushLedger(fx, s, { account: 'land_debt', amount_eur: -principal, label: 'Capital remboursé', category: 'loan' });
  } else {
    v.missed_loan_payments += 1;
    v.land_debt_eur = money(v.land_debt_eur + interest);
    v.admin_pressure_pct = gauge(v.admin_pressure_pct + 5);
    v.international_notoriety_pct = gauge(v.international_notoriety_pct - 1);
    pushEvent(fx, s, {
      event_type: 'loan_missed',
      title: 'Échéance impayée',
      body: `La banque n'a pas été payée (${v.missed_loan_payments} impayé(s)). Les intérêts s'ajoutent à la dette.`,
    });
  }
}

function processGite(s: GameSnapshot, fx: EngineEffects, rng: Rng): void {
  const v = s.village;
  if (!v.gite_open) return;
  let revenue = C.GITE_REVENUE_MIN;
  if (v.track_condition_pct >= 60) revenue += 600;
  else if (v.track_condition_pct >= 40) revenue += 300;
  if (v.bor_concert_season === v.season_number) revenue += 700;
  revenue += clamp((v.morale_pct - 50) * 8, -200, 400);
  revenue = money(clamp(revenue * rng.float(0.9, 1.1), C.GITE_REVENUE_MIN, C.GITE_REVENUE_MAX));
  v.treasury_eur = money(v.treasury_eur + revenue);
  pushLedger(fx, s, { account: 'treasury', amount_eur: revenue, label: 'Recettes hebdomadaires du gîte rural', category: 'gite' });
  // Marginaux attirés [GDD §5.3]
  v.drug_prevalence_pct = gauge(v.drug_prevalence_pct + 1.5);
  v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct + 1);
  const controlRisk = 15 + v.admin_pressure_pct / 10 - (activePlayers(s).some((p) => p.ministerial_portfolios.includes('chancery')) ? 7 : 0);
  if (rng.chance(controlRisk)) {
    const fine = money(rng.int(500, 1500));
    v.treasury_eur = money(v.treasury_eur - fine);
    v.admin_pressure_pct = gauge(v.admin_pressure_pct + 8);
    pushLedger(fx, s, { account: 'treasury', amount_eur: -fine, label: 'Amende — contrôle fiscal/touristique de l\'Ayuntamiento', category: 'fine' });
    pushEvent(fx, s, { event_type: 'gite_control', title: 'Contrôle au gîte', body: `L'Ayuntamiento inflige ${fine} € d'amende au gîte.` });
  }
}

function payPrivateWages(s: GameSnapshot, fx: EngineEffects): void {
  for (const m of residents(s)) {
    if (!m.private_employer_id || m.private_wage_eur_week <= 0) continue;
    const employer = s.players.find((p) => p.id === m.private_employer_id);
    if (!employer || employer.private_wealth_eur < m.private_wage_eur_week) {
      m.private_employer_id = null;
      m.private_wage_eur_week = 0;
      pushEvent(fx, s, {
        event_type: 'private_contract_ended',
        visibility: 'private',
        player_id: employer?.id ?? null,
        title: 'Contrat privé rompu',
        body: `${m.full_name} n'a pas été payé et quitte votre chantier privé.`,
      });
      continue;
    }
    employer.private_wealth_eur = money(employer.private_wealth_eur - m.private_wage_eur_week);
    pushLedger(fx, s, {
      account: 'private',
      player_id: employer.id,
      amount_eur: -m.private_wage_eur_week,
      label: `Salaire hebdomadaire de ${m.full_name}`,
      category: 'wages',
    });
  }
}

/** Facturation individuelle de l'énergie au prorata de power_kwh_used [GDD §3.1]. */
function billEnergy(s: GameSnapshot, fx: EngineEffects): void {
  const v = s.village;
  const total = v.energy_cost_season_eur;
  const payers = activePlayers(s);
  if (total > 0 && payers.length > 0) {
    const totalKwh = payers.reduce((a, p) => a + p.power_kwh_used, 0);
    let collected = 0;
    for (const p of payers) {
      const share = v.power_meters_installed && totalKwh > 0 ? (total * p.power_kwh_used) / totalKwh : total / payers.length;
      const paid = money(Math.min(share, p.private_wealth_eur));
      if (paid <= 0) continue;
      p.private_wealth_eur = money(p.private_wealth_eur - paid);
      collected += paid;
      pushLedger(fx, s, {
        account: 'private',
        player_id: p.id,
        amount_eur: -paid,
        label: v.power_meters_installed ? `Facture d'énergie (${Math.round(p.power_kwh_used)} kWh)` : 'Facture d\'énergie (part égale)',
        category: 'energy',
      });
    }
    v.treasury_eur = money(v.treasury_eur + collected);
    pushLedger(fx, s, { account: 'treasury', amount_eur: collected, label: 'Refacturation de l\'énergie aux habitants', category: 'energy' });
  }
  for (const p of s.players) p.power_kwh_used = 0;
  v.energy_cost_season_eur = 0;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
export function applyElapsedTime(input: GameSnapshot, now: Date): TickResult {
  const s = deepClone(input);
  const fx = emptyEffects();
  const v = s.village;
  const last = new Date(v.last_tick_at);
  const total = midnightsBetween(last, now);
  const skipped = Math.max(0, total - C.MAX_CATCH_UP_DAYS);
  const startKey = dayKey(last);
  let seasons = 0;
  let processed = 0;

  if (!v.is_defeated) {
    if (skipped > 0) {
      v.game_day += skipped;
      pushEvent(fx, s, {
        event_type: 'catch_up_skipped',
        title: 'Longue absence',
        body: `${skipped} jours sans aucune connexion n'ont pas été simulés en détail.`,
      });
    }
    for (let i = skipped + 1; i <= total; i++) {
      const newKey = addDaysToKey(startKey, i);
      const endedKey = addDaysToKey(newKey, -1);
      const midnight = startOfLocalDay(newKey);
      closeDay(s, fx, endedKey, midnight);
      if (weekdayOfKey(newKey) === 1 && i > skipped) {
        closeSeason(s, fx, midnight);
        seasons += 1;
      }
      processNight(s, fx, newKey, midnight);
      processed += 1;
      if (s.village.is_defeated) break;
    }
  }

  const parts = localParts(now);
  refreshDerived(s, now, calendarSeasonOf(parts.month, parts.day), fx);
  s.village.last_tick_at = now.toISOString();
  return { snapshot: s, ...fx, daysProcessed: processed, seasonsProcessed: seasons, skippedDays: skipped };
}
