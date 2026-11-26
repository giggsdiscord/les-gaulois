/**
 * Indicateurs cachés — visibles uniquement sur le tableau de bord du titulaire du rôle
 * (ou de son conjoint) [GDD §2.1, §2.2]. Calculés par le moteur côté serveur et stockés dans
 * role_hidden_indicators, lisibles via la RPC get_my_hidden_indicators().
 */
import { calendarSeasonOf, isAfter, localParts } from './calendar.ts';
import {
  computeEnergyBalance,
  computeInsecurity,
  computeNatality,
  computeProductivity,
  computeWaterBalance,
  overpopulationRatio,
  smugglingRiskPct,
} from './formulas.ts';
import { injuryRiskPct } from './health.ts';
import { clamp, round2 } from './math.ts';
import { activePlayers, countPopulation, countRuins, residents } from './population.ts';
import type { GameSnapshot } from './types.ts';

export type HiddenIndicatorMap = Record<string, Record<string, unknown>>;

/** Prochaines échéances fiscales espagnoles (modèles trimestriels : 20/04, 20/07, 20/10, 30/01). */
export function nextFiscalDeadlines(now: Date): string[] {
  const p = localParts(now);
  const candidates: [number, number, number][] = [];
  for (const year of [p.year, p.year + 1]) {
    candidates.push([year, 1, 30], [year, 4, 20], [year, 7, 20], [year, 10, 20]);
  }
  const today = p.year * 10000 + p.month * 100 + p.day;
  return candidates
    .filter(([y, m, d]) => y * 10000 + m * 100 + d >= today)
    .slice(0, 2)
    .map(([y, m, d]) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`);
}

function level(value: number, thresholds: [number, number]): 'faible' | 'modéré' | 'élevé' {
  return value >= thresholds[1] ? 'élevé' : value >= thresholds[0] ? 'modéré' : 'faible';
}

export function computeHiddenIndicators(s: GameSnapshot, now: Date): HiddenIndicatorMap {
  const v = s.village;
  const parts = localParts(now);
  const season = calendarSeasonOf(parts.month, parts.day);
  const pop = countPopulation(s);
  const water = computeWaterBalance(s, season);
  const energy = computeEnergyBalance(s);
  const insecurity = computeInsecurity(s, now);
  const players = activePlayers(s);
  const res = residents(s);
  const out: HiddenIndicatorMap = {};

  out.mayor_agri = {
    popularite_politique_pct: round2(clamp(v.morale_pct * 0.5 + (100 - v.insecurity_pct) * 0.3 + Math.min(20, v.food_rations / 10), 0, 100)),
    meteo_agricole: { temp_min_c: v.real_temp_min_c, risque_gel: level(4 - v.real_temp_min_c, [2, 4]), precipitations_mm: v.real_precip_mm },
    rendement_cheptel_rations_jour: round2(v.livestock_count * 0.25),
    indice_biodiversite_pct: v.ecology_index_pct,
    irrigation_potager_pct: round2(water.gardenSupplyRatio * 100),
    famille_grenouilles_protegee: v.frog_family_protected,
  };

  out.treasurer_physio = {
    echeances_fiscales: nextFiscalDeadlines(now),
    fuites_de_caisse_eur: v.treasury_leak_eur,
    capitaux_dissimules_andorre_eur: v.andorra_hidden_capital_eur,
    patrimoines_prives: players.map((p) => ({ joueur: p.display_name, eur: p.private_wealth_eur })),
    echeances_impayees: v.missed_loan_payments,
    risque_blessure: [
      ...players.map((p) => ({ nom: p.display_name, charge_mecanique_pct: p.fatigue_pct, risque_pct: injuryRiskPct(p, v, now), blessure: p.injury_type })),
      ...res.map((m) => ({ nom: m.full_name, charge_mecanique_pct: null, risque_pct: injuryRiskPct({ addiction_level_pct: m.addiction_level_pct, back_fragility: m.back_fragility }, v, now), blessure: m.injury_type })),
    ],
  };

  out.civil_eng = {
    vetuste_structurelle: s.structures
      .filter((st) => ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge'].includes(st.kind) && st.status !== 'demolished')
      .map((st) => ({ ouvrage: st.name, etat_pct: st.condition_pct, statut: st.status, avancement_pct: st.progress_pct })),
    occupation_reelle_lits: { population: pop.total, lits_plu: v.housing_capacity, surpeuplement_pct: round2(overpopulationRatio(pop.total, v.housing_capacity) * 100) },
    greve_en_cours: isAfter(v.strike_until, now),
    conformite_cadastrale_pct: round2(clamp(100 - v.admin_pressure_pct, 0, 100)),
    productivite: computeProductivity(s),
  };

  out.water_eng = {
    pression_hydraulique_pct: round2(clamp((water.demandTotal / Math.max(1, water.capacity)) * 100, 0, 300)),
    bilan_eau_l_jour: water,
    saturation_fosses_pct: v.septic_saturation_pct,
    sabotage_detecte: v.sabotage_pending,
    rendement_barrage_minage: { production_kwh: energy.productionKwh, surplus_kwh: energy.surplusKwh, minage_actif: v.crypto_mining_active },
    risque_crue: level(v.real_precip_mm, [15, 35]),
  };

  out.smith_diplo = {
    usure_parc_outils_pct: v.tools_wear_pct,
    stock_ferraille: v.scrap_stock,
    outils_voles_saison: v.tools_stolen_season,
    outils_vs_travailleurs: { outils: v.tools_stock, travailleurs: pop.workers },
    mefiance_voisins_police_pct: round2(clamp(v.admin_pressure_pct * 0.6 + v.customs_alert_pct * 0.4, 0, 100)),
  };

  out.druid = {
    incubation_maladies_jours: v.epidemic_incubation_days,
    qualite_eau_pct: v.water_quality_pct,
    residus_stupefiants_pct: v.drug_prevalence_pct,
    rd_avancement_pct: v.rd_progress_pct,
    niveau_dissuasion: v.deterrence_level,
    stock_remedes: v.medicine_stock,
  };

  out.priest_apoth = {
    sante_mentale: players.map((p) => ({ joueur: p.display_name, mentale_pct: p.mental_health_pct, burn_out_pct: p.fatigue_pct, addiction_pct: p.addiction_level_pct, culpabilite_pct: p.temptation_guilt_pct })),
    addiction_moyenne_pct: v.addiction_level_pct,
    residents: res.map((m) => ({ nom: m.full_name, loyautes: m.loyalty_scores, ideologie_reelle: m.left_wing_score, addiction_pct: m.addiction_level_pct })),
    secrets_confesses: s.temptations
      .filter((t) => t.confessed)
      .map((t) => ({ joueur: players.find((p) => p.id === t.player_id)?.display_name ?? '?', secret: t.title })),
    natalite: computeNatality(s),
  };

  out['portfolio:defense'] = {
    menace_perimetrique_pct: v.perimeter_threat_pct,
    ouvrages_defensifs: s.structures.filter((st) => (st.kind === 'watchtower' || st.kind === 'gate') && st.status === 'operational').length,
    preparation_defensive: { outils: v.tools_stock, dissuasion: v.deterrence_level },
  };
  out['portfolio:interior'] = {
    indice_marche_noir: { actif: v.black_market_active, ruines_refuges: countRuins(s) },
    cellules_clandestines: res.filter((m) => m.faction_type === 'union_agitator' || m.faction_type === 'black_market').map((m) => ({ nom: m.full_name, faction: m.faction_type })),
    faction_active: v.faction_active,
    stocks_manquants: { fuites_caisse_eur: v.treasury_leak_eur, outils_voles: v.tools_stolen_season },
    insecurite_detail: insecurity,
  };
  out['portfolio:customs'] = {
    usure_flotte_pct: v.fleet_wear_pct,
    expeditions_saison: v.smuggling_runs_this_season,
    alerte_douanes_pct: v.customs_alert_pct,
    risque_embuscade_pct: smugglingRiskPct(v),
  };
  out['portfolio:chancery'] = {
    risque_controle_fiscal_pct: round2(clamp(v.admin_pressure_pct * 0.7 + (v.gite_open ? 10 : 0) + (v.crypto_mining_active ? 10 : 0), 0, 100)),
    risque_perquisition_pct: round2(clamp(v.admin_pressure_pct * 0.5 + v.drug_prevalence_pct * 0.5, 0, 100)),
    risque_expulsion_madrid_pct: round2(clamp((v.independence_proclaimed ? 40 : 10) + v.admin_pressure_pct * 0.4, 0, 100)),
  };
  out['portfolio:media'] = {
    notoriete_internationale_pct: v.international_notoriety_pct,
    sympathie_opinion_europeenne_pct: v.eu_sympathy_pct,
  };
  return out;
}
