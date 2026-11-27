// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/work.ts
/**
 * Travail des résidents [GDD §4.7, V4.9] : chaque résident (accepté ou aux travaux forcés) reçoit
 * un poste (`village_migrants.work_post`, codes de `WORK_POSTS`) et produit chaque nuit selon sa
 * spécialité et son niveau. planResidentWork() calcule la nuit sans rien modifier (l'interface s'en
 * sert pour l'aperçu) ; processResidentWork() l'applique dans closeDay, avant les récoltes et le chauffage.
 * Droit de regard d'Ely : `life.forest_ban` interdit les coupes jusqu'au lundi (forestBan()).
 */
import { isAfter } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { computeWaterBalance } from './formulas.ts';
import { isDetained } from './health.ts';
import { ensureLife, lifeOf } from './life.ts';
import { personalityFactor } from './personality.ts';
import { clamp, gauge, money, round2, stock } from './math.ts';
import { residents, structureByCode } from './population.ts';
import { wornStructures } from './upkeep.ts';
import type {
  CalendarSeason,
  EngineEffects,
  ForestBan,
  GameSnapshot,
  MapStructure,
  Migrant,
  ResidentWorkTotals,
  StructureKind,
  VillageState,
} from './types.ts';

/** Bâtisses que l'on rénove ou construit avec « Rénover / construire » (et où travaillent les résidents). */
export const BUILDING_KINDS: readonly StructureKind[] = ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'];
/** Ouvrages livrés seulement après raccordement électrique validé par Tiphaine [GDD §2.1]. */
export const NEEDS_POWER: readonly StructureKind[] = [...BUILDING_KINDS, 'mining_farm', 'dam', 'solar'];
/** Livraison conditionnée au raccordement : nouveaux bâtiments (V5.4) selon leur type, sinon NEEDS_POWER. */
export function needsPower(st: Pick<MapStructure, 'kind' | 'variant'>): boolean {
  const type = st.kind === 'building' && st.variant ? C.BUILDING_TYPES.find((b) => b.id === st.variant) : undefined;
  return type ? type.power : NEEDS_POWER.includes(st.kind);
}
/** État au-delà duquel une bâtisse abîmée redevient opérationnelle. */
const REPAIRED_AT = 60;

/** Avance un chantier ; à 100 % il est livré (ou attend le raccordement électrique). */
export function advanceStructure(s: GameSnapshot, fx: EngineEffects, st: MapStructure, gain: number): void {
  st.progress_pct = Math.min(100, st.progress_pct + gain);
  if (st.status === 'ruin' || st.status === 'cleared' || st.status === 'planned') st.status = 'in_progress';
  if (st.progress_pct < 100) return;
  st.condition_pct = Math.max(st.condition_pct, 80);
  st.status = needsPower(st) && !st.is_power_connected ? 'awaiting_power' : 'operational';
  pushEvent(fx, s, {
    event_type: 'structure_completed',
    title: 'Chantier achevé',
    body:
      st.status === 'operational'
        ? `« ${st.name} » est livré.`
        : `« ${st.name} » est achevé mais attend le raccordement électrique de Tiphaine.`,
    data: { structure_id: st.id },
  });
}

export function findWorkPost(code: string | null | undefined): C.WorkPost | undefined {
  return code ? C.WORK_POSTS.find((p) => p.code === code) : undefined;
}

/** Poste conseillé : celui de sa spécialité, sinon le potager. */
export function suggestedPost(m: Pick<Migrant, 'specialty_code'>): C.WorkPost {
  return C.WORK_POSTS.find((p) => p.specialties.includes(m.specialty_code)) ?? C.WORK_POSTS[0]!;
}

/** Multiplicateur de spécialité : ×(1 + 0,25 × niveau) au poste de sa spécialité, ×1 ailleurs. */
export function residentSkill(m: Pick<Migrant, 'specialty_code' | 'specialty_level'>, post: C.WorkPost): number {
  if (!post.specialties.includes(m.specialty_code)) return 1;
  return 1 + C.RESIDENT_SKILL_BONUS_PER_LEVEL * clamp(Math.round(m.specialty_level), 1, 5);
}

/** Rendement d'un résident à son poste : spécialité × humeur et caractère (V5.7) × productivité du village × grève. */
export function residentFactor(
  v: Pick<VillageState, 'productivity_modifier_pct' | 'strike_until'>,
  m: Pick<Migrant, 'specialty_code' | 'specialty_level'> & Partial<Pick<Migrant, 'id' | 'traits'>>,
  post: C.WorkPost,
  now: Date,
): number {
  const strike = isAfter(v.strike_until, now) ? C.RESIDENT_STRIKE_FACTOR : 1;
  const mood = m.id ? personalityFactor({ id: m.id, traits: m.traits }) : 1;
  return round2(residentSkill(m, post) * mood * (v.productivity_modifier_pct / 100) * strike);
}

/** Interdiction des coupes en cours (droit de regard d'Ely), ou null. */
export function forestBan(v: Pick<VillageState, 'life'>): ForestBan | null {
  return lifeOf(v).forest_ban ?? null;
}

export function emptyWorkTotals(): ResidentWorkTotals {
  return { workers: 0, idle: 0, unassigned: 0, rations: 0, tomatoes: 0, wood: 0, build: 0, repair: 0, stone_used: 0, tools_wear: 0, iron: 0, scrap_used: 0, water: 0, track: 0, ecology: 0 };
}

export interface ResidentWorkLine {
  migrant_id: string;
  post: C.WorkPostCode | null;
  working: boolean;
  /** Spécialité adaptée au poste. */
  skilled: boolean;
  factor: number;
  /** Production de la nuit, ou raison de l'inactivité. */
  note: string;
}

export interface ResidentWorkPlan {
  lines: ResidentWorkLine[];
  totals: ResidentWorkTotals;
  /** Points d'avancement par chantier et de réparation par bâtisse (id → points). */
  build: Record<string, number>;
  repair: Record<string, number>;
  /** Bûcherons qui coupent cette nuit (hors interdiction). */
  forestWorkers: number;
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Calcule la production de la nuit sans modifier l'instantané. Les spécialistes passent en premier
 * (meilleur rendement d'abord) quand les places sont comptées (potager, troupeau, pierre).
 */
export function planResidentWork(s: GameSnapshot, season: CalendarSeason, now: Date): ResidentWorkPlan {
  const v = s.village;
  const totals = emptyWorkTotals();
  const lines: ResidentWorkLine[] = [];
  const build: Record<string, number> = {};
  const repair: Record<string, number> = {};
  let forestWorkers = 0;

  const banned = forestBan(v) !== null;
  const gardenSlots = Math.floor(v.garden_area_m2 / C.RESIDENT_GARDEN_M2_PER_WORKER);
  let gardenUsed = 0;
  let headsLeft = Math.max(0, Math.floor(v.livestock_count));
  let stoneLeft = v.stone_stock;
  let wearLeft = v.tools_wear_pct;
  let scrapLeft = v.scrap_stock;
  let waterLeft = 100 - v.water_network_condition_pct;
  let trackLeft = 100 - v.track_condition_pct;
  const workforce = residents(s);
  const supply = workforce.some((m) => m.work_post === 'garden') ? Math.min(1, computeWaterBalance(s, season).gardenSupplyRatio) : 1;
  const forgeOk = structureByCode(s, 'cal_ferrer')?.status === 'operational';
  const trackVeto = structureByCode(s, 'piste')?.eco_veto_active === true;
  const byLeft = (a: { st: MapStructure; left: number }, b: { st: MapStructure; left: number }) => a.left - b.left || a.st.id.localeCompare(b.st.id);
  const sites = s.structures
    .filter((st) => BUILDING_KINDS.includes(st.kind) && st.status === 'in_progress' && !st.eco_veto_active)
    .map((st) => ({ st, left: 100 - st.progress_pct }))
    .sort(byLeft);
  const damaged = s.structures
    .filter((st) => BUILDING_KINDS.includes(st.kind) && st.status === 'damaged' && !st.eco_veto_active)
    .map((st) => ({ st, left: Math.max(1, REPAIRED_AT - st.condition_pct) }))
    .sort(byLeft);

  // Entretien (V5.5) : bâtisses en service sous RESIDENT_MAINTAIN_BELOW, les plus abîmées d'abord
  const worn = wornStructures(s, C.RESIDENT_MAINTAIN_BELOW)
    .filter((st) => !st.eco_veto_active)
    .map((st) => ({ st, left: C.RESIDENT_MAINTAIN_BELOW - st.condition_pct }));

  const pool = workforce
    .map((m) => {
      const post = findWorkPost(m.work_post);
      return { m, post, factor: post ? residentFactor(v, m, post, now) : 0 };
    })
    .sort((a, b) => b.factor - a.factor || a.m.id.localeCompare(b.m.id));

  for (const { m, post, factor } of pool) {
    if (!post) {
      totals.unassigned += 1;
      lines.push({ migrant_id: m.id, post: null, working: false, skilled: false, factor: 0, note: 'Sans poste' });
      continue;
    }
    const skilled = post.specialties.includes(m.specialty_code);
    const idle = (note: string) => {
      totals.idle += 1;
      lines.push({ migrant_id: m.id, post: post.code, working: false, skilled, factor, note });
    };
    const work = (note: string) => {
      totals.workers += 1;
      lines.push({ migrant_id: m.id, post: post.code, working: true, skilled, factor, note });
    };
    if (m.private_employer_id) {
      const boss = s.players.find((p) => p.id === m.private_employer_id);
      idle(`Sur le chantier privé${boss ? ` de ${boss.display_name}` : ''}`);
      continue;
    }
    if (isDetained(m, now)) {
      idle('Au cachot');
      continue;
    }
    if (m.injury_type) {
      idle('Blessé : il se soigne');
      continue;
    }
    if (m.health_pct < C.RESIDENT_MIN_HEALTH) {
      idle('Trop faible pour travailler');
      continue;
    }

    switch (post.code) {
      case 'garden': {
        if (gardenUsed >= gardenSlots) {
          idle(`Potager trop petit (${gardenSlots} jardinier${gardenSlots > 1 ? 's' : ''} pour ${v.garden_area_m2} m²)`);
          break;
        }
        if (supply <= 0) {
          idle('Potager à sec : plus d\'eau pour l\'arrosage');
          break;
        }
        gardenUsed += 1;
        const harvest = C.RESIDENT_GARDEN_RATIONS * C.SEASON_HARVEST_COEFF[season] * supply * factor;
        const share = C.TOMATO_SHARE[season];
        const rations = round2(harvest * (1 - share));
        const tomatoes = round2(harvest * share * C.TOMATO_KG_PER_RATION);
        totals.rations += rations;
        totals.tomatoes += tomatoes;
        work(`+${fmt(rations)} rations${tomatoes > 0 ? `, +${fmt(tomatoes)} kg de tomates` : ''}${supply < 1 ? ` (arrosage à ${Math.round(supply * 100)} %)` : ''}`);
        break;
      }
      case 'forest': {
        if (banned) {
          totals.ecology += C.RESIDENT_FOREST_CARE_ECOLOGY;
          work('Entretient la forêt (coupes interdites par Ely)');
          break;
        }
        const wood = round2(C.RESIDENT_FOREST_WOOD * factor);
        totals.wood += wood;
        forestWorkers += 1;
        work(`+${fmt(wood)} stères de bois`);
        break;
      }
      case 'construction': {
        const site = sites.find((x) => x.left > 0) ?? damaged.find((x) => x.left > 0) ?? worn.find((x) => x.left > 0);
        if (!site) {
          idle('Aucun chantier, aucune bâtisse à réparer ni à entretenir');
          break;
        }
        if (stoneLeft < C.RESIDENT_BUILD_STONE) {
          idle('Plus de pierre pour le chantier');
          break;
        }
        stoneLeft -= C.RESIDENT_BUILD_STONE;
        totals.stone_used += C.RESIDENT_BUILD_STONE;
        const isUpkeep = site.st.status === 'operational';
        const isRepair = site.st.status === 'damaged' || isUpkeep;
        const base = isRepair ? C.RESIDENT_REPAIR_POINTS : C.RESIDENT_BUILD_POINTS;
        const pts = Math.min(site.left, Math.max(1, Math.round(base * factor)));
        site.left -= pts;
        const bucket = isRepair ? repair : build;
        bucket[site.st.id] = (bucket[site.st.id] ?? 0) + pts;
        if (isRepair) totals.repair += pts;
        else totals.build += pts;
        work(isUpkeep ? `Entretient « ${site.st.name} » (+${pts} % d'état)` : isRepair ? `Répare « ${site.st.name} » (+${pts} % d'état)` : `Chantier « ${site.st.name} » +${pts} %`);
        break;
      }
      case 'forge': {
        if (!forgeOk) {
          idle('Forge hors service');
          break;
        }
        if (wearLeft > 0) {
          const w = round2(Math.min(wearLeft, C.RESIDENT_FORGE_WEAR * factor));
          wearLeft -= w;
          totals.tools_wear += w;
          work(`Répare les outils (usure −${fmt(w)} %)`);
          break;
        }
        if (scrapLeft >= C.RESIDENT_FORGE_SCRAP) {
          scrapLeft -= C.RESIDENT_FORGE_SCRAP;
          totals.scrap_used += C.RESIDENT_FORGE_SCRAP;
          totals.iron += 1;
          work(`+1 fer (${C.RESIDENT_FORGE_SCRAP} ferrailles recyclées)`);
          break;
        }
        idle('Rien à forger (outils neufs, plus de ferraille)');
        break;
      }
      case 'pasture': {
        if (headsLeft <= 0) {
          idle(v.livestock_count > 0 ? 'Troupeau trop petit pour un berger de plus' : 'Pas de bétail à garder');
          break;
        }
        const heads = Math.min(C.RESIDENT_PASTURE_HEADS, headsLeft);
        headsLeft -= heads;
        const rations = round2(heads * C.RESIDENT_PASTURE_RATIONS_PER_HEAD * factor);
        totals.rations += rations;
        work(`+${fmt(rations)} rations de lait (${heads} bête${heads > 1 ? 's' : ''})`);
        break;
      }
      case 'water': {
        if (waterLeft <= 0) {
          idle('Réseau d\'eau en parfait état');
          break;
        }
        const w = round2(Math.min(waterLeft, C.RESIDENT_WATER_POINTS * factor));
        waterLeft -= w;
        totals.water += w;
        work(`Réseau d'eau +${fmt(w)} %`);
        break;
      }
      case 'track': {
        if (trackVeto) {
          idle('Veto écologique sur la piste');
          break;
        }
        if (trackLeft <= 0) {
          idle('Piste en parfait état');
          break;
        }
        const w = round2(Math.min(trackLeft, C.RESIDENT_TRACK_POINTS * factor));
        trackLeft -= w;
        totals.track += w;
        work(`Piste +${fmt(w)} %`);
        break;
      }
    }
  }

  for (const key of Object.keys(totals) as (keyof ResidentWorkTotals)[]) totals[key] = round2(totals[key]);
  return { lines, totals, build, repair, forestWorkers };
}

/** Chaque nuit : applique le travail des résidents et le mémorise dans `life.work_last`. */
export function processResidentWork(s: GameSnapshot, fx: EngineEffects, season: CalendarSeason, now: Date): ResidentWorkPlan | null {
  if (residents(s).length === 0) return null;
  const v = s.village;
  const plan = planResidentWork(s, season, now);
  const t = plan.totals;
  v.food_rations = money(v.food_rations + t.rations);
  v.tomatoes_stock = stock(v.tomatoes_stock + t.tomatoes);
  v.wood_stock = stock(v.wood_stock + t.wood);
  v.stone_stock = stock(v.stone_stock - t.stone_used);
  for (const [id, pts] of Object.entries(plan.build)) {
    const st = s.structures.find((x) => x.id === id);
    if (st) advanceStructure(s, fx, st, pts);
  }
  for (const [id, pts] of Object.entries(plan.repair)) {
    const st = s.structures.find((x) => x.id === id);
    if (!st) continue;
    st.condition_pct = Math.min(100, st.condition_pct + pts);
    if (st.status === 'damaged' && st.condition_pct >= REPAIRED_AT) {
      st.status = 'operational';
      pushEvent(fx, s, { event_type: 'structure_repaired', title: 'Bâtisse réparée', body: `Les résidents ont remis « ${st.name} » en état.`, data: { structure_id: st.id } });
    }
  }
  if (t.tools_wear > 0) v.tools_wear_pct = gauge(v.tools_wear_pct - t.tools_wear);
  if (t.scrap_used > 0) {
    v.scrap_stock = stock(v.scrap_stock - t.scrap_used);
    v.iron_stock = stock(v.iron_stock + t.iron);
  }
  if (t.water > 0) {
    v.water_network_condition_pct = gauge(v.water_network_condition_pct + t.water);
    const pipe = structureByCode(s, 'conduite_principale');
    if (pipe) pipe.condition_pct = Math.round(v.water_network_condition_pct);
  }
  if (t.track > 0) {
    v.track_condition_pct = gauge(v.track_condition_pct + t.track);
    const track = structureByCode(s, 'piste');
    if (track) track.condition_pct = Math.round(v.track_condition_pct);
  }
  const life = ensureLife(v);
  if (plan.forestWorkers > 0) {
    life.wood_cuts = round2((life.wood_cuts ?? 0) + plan.forestWorkers * C.RESIDENT_FOREST_CUT_SHARE);
    if (life.wood_cuts > C.WOOD_CUT_SUSTAINABLE) t.ecology = round2(t.ecology - plan.forestWorkers * C.RESIDENT_OVERCUT_ECOLOGY);
  }
  if (t.ecology !== 0) v.ecology_index_pct = gauge(v.ecology_index_pct + t.ecology);
  life.work_last = { ...t };
  return plan;
}
