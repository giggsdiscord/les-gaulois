// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/buildings.ts
/**
 * Nouveaux bâtiments & parcelles libres (V5.4) [GDD §5.6].
 *
 * Un nouveau bâtiment est un ouvrage `kind = 'building'` (la contrainte CHECK de
 * `map_structures.kind` ne s'élargit pas) avec une `variant` (four, fromagerie…). Il est créé
 * par le moteur sur une parcelle libre (`PARCELS`) avec le statut « planned » ; le chantier
 * avance ensuite par la rénovation habituelle (accord PLU, matériaux), plus vite pour les petits
 * bâtiments (`ease`). Une fois en service, chaque bâtiment produit son effet chaque nuit
 * (`processBuildings`, appelé par closeDay après le chauffage), sauf la scierie (coupe de bois)
 * et le lavoir (épidémies), lus par `hasBuilding`.
 * L'occupation des parcelles vit dans `village_state.life.parcels` (parcelle → ouvrage).
 */
import * as C from './constants.ts';
import { pushLedger } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { outputFactor } from './upkeep.ts';
import { gauge, money, round2, stock } from './math.ts';
import { activePlayers } from './population.ts';
import type { Rng } from './rng.ts';
import type { BuildingsNight, CalendarSeason, EngineEffects, GameSnapshot, MapStructure, Player, VillageState } from './types.ts';

type StructuresView = { structures: readonly MapStructure[]; village: Pick<VillageState, 'life'> };

export function findBuildingType(id: unknown): C.BuildingTypeDef | undefined {
  return typeof id === 'string' ? C.BUILDING_TYPES.find((b) => b.id === id) : undefined;
}

export function findParcel(id: unknown): C.ParcelDef | undefined {
  return typeof id === 'string' ? C.PARCELS.find((p) => p.id === id) : undefined;
}

/** Type du nouveau bâtiment porté par cet ouvrage (undefined pour les ouvrages d'origine). */
export function buildingTypeOf(st: Pick<MapStructure, 'kind' | 'variant'>): C.BuildingTypeDef | undefined {
  return st.kind === 'building' ? findBuildingType(st.variant) : undefined;
}

/** Ouvrage qui occupe la parcelle (un ouvrage démoli la libère). */
export function parcelOccupant(s: StructuresView, parcelId: string): MapStructure | undefined {
  const id = lifeOf(s.village).parcels?.[parcelId];
  const st = id ? s.structures.find((x) => x.id === id) : undefined;
  return st && st.status !== 'demolished' ? st : undefined;
}

export function freeParcels(s: StructuresView): C.ParcelDef[] {
  return C.PARCELS.filter((p) => !parcelOccupant(s, p.id));
}

/** Nouveau bâtiment de ce type encore debout (en projet, en chantier ou en service). */
export function existingBuilding(s: Pick<StructuresView, 'structures'>, variant: string): MapStructure | undefined {
  return s.structures.find((st) => st.kind === 'building' && st.variant === variant && st.status !== 'demolished');
}

/** Le bâtiment est en service (effet actif). */
export function hasBuilding(s: Pick<StructuresView, 'structures'>, variant: C.BuildingVariant): boolean {
  return existingBuilding(s, variant)?.status === 'operational';
}

/** Nouveaux bâtiments en projet ou en chantier (plafond BUILDING_MAX_OPEN_PROJECTS). */
export function openBuildingProjects(s: Pick<StructuresView, 'structures'>): MapStructure[] {
  return s.structures.filter((st) => buildingTypeOf(st) && ['planned', 'in_progress', 'cleared', 'ruin'].includes(st.status));
}

/** Raison pour laquelle ce plan est impossible (null : possible), hors caisse et PA. */
export function planBlocker(s: StructuresView, variant: unknown, parcelId: unknown): string | null {
  const type = findBuildingType(variant);
  if (!type) return 'Bâtiment inconnu.';
  const parcel = findParcel(parcelId);
  if (!parcel) return 'Parcelle inconnue.';
  if (parcelOccupant(s, parcel.id)) return `La parcelle « ${parcel.name} » est déjà prise.`;
  if (existingBuilding(s, type.id)) return `Le hameau a déjà son ${type.label.toLowerCase()}.`;
  if (type.river && !parcel.river) return `${type.label} : seulement sur une parcelle en bord de rivière.`;
  if (openBuildingProjects(s).length >= C.BUILDING_MAX_OPEN_PROJECTS) {
    return `Déjà ${C.BUILDING_MAX_OPEN_PROJECTS} nouveaux bâtiments en projet : finissez-en un d'abord.`;
  }
  return null;
}

/**
 * Pose le plan d'un nouveau bâtiment sur une parcelle libre (lève une Error si impossible).
 * Le prix est payé par l'appelant. L'ouvrage démoli d'un même type est réutilisé (code unique).
 */
export function planBuilding(s: GameSnapshot, holder: Pick<Player, 'role_code'>, variant: unknown, parcelId: unknown, rng: Rng): MapStructure {
  const blocker = planBlocker(s, variant, parcelId);
  if (blocker) throw new Error(blocker);
  const type = findBuildingType(variant)!;
  const parcel = findParcel(parcelId)!;
  const code = `nb_${type.id}`;
  const fields = {
    kind: 'building' as const,
    name: `${type.label} (${parcel.name})`,
    status: 'planned' as const,
    condition_pct: 100,
    progress_pct: 0,
    beds_capacity: 0,
    is_power_connected: false,
    plu_approved: holder.role_code === 'civil_eng',
    eco_veto_active: false,
    owner_player_id: null,
    leak_alert: false,
    variant: type.id,
    upgrade_level: 1,
    x: parcel.x,
    y: parcel.y,
    width: parcel.width,
    height: parcel.height,
    path_points: null,
    notes: type.effect,
  };
  let st = s.structures.find((x) => x.code === code);
  if (st) Object.assign(st, fields);
  else {
    st = { id: rng.uuid(), code, ...fields };
    s.structures.push(st);
  }
  const life = ensureLife(s.village);
  life.parcels = { ...(life.parcels ?? {}), [parcel.id]: st.id };
  return st;
}

/** Ce que les bâtiments en service donneraient cette nuit (calcul pur, réutilisé par l'interface). */
export function planBuildingsNight(s: Pick<GameSnapshot, 'structures' | 'village'>, season: CalendarSeason): BuildingsNight & { health: number; morale: number; ecology: number; toolsWear: number; alcohol: number } {
  const v = s.village;
  const on = (variant: C.BuildingVariant) => hasBuilding(s, variant);
  const out = { rations: 0, wood: 0, eur: 0, active: [] as string[], health: 0, morale: 0, ecology: 0, toolsWear: 0, alcohol: 0 };
  // Niveau du bâtiment (V5.5) : +50 % de production par niveau
  const k = (variant: C.BuildingVariant) => outputFactor(existingBuilding(s, variant));
  const add = (variant: C.BuildingVariant, rations: number) => {
    out.rations += round2(rations * k(variant));
    out.active.push(variant);
  };
  if (on('bakery') && v.wood_stock >= C.BAKERY_WOOD) {
    out.wood += C.BAKERY_WOOD;
    add('bakery', C.BAKERY_RATIONS + (on('water_mill') ? C.MILL_BAKERY_BONUS : 0));
  }
  if (on('water_mill')) add('water_mill', C.MILL_RATIONS);
  if (on('cheese_dairy') && v.livestock_count >= C.CHEESE_MIN_LIVESTOCK) add('cheese_dairy', C.CHEESE_RATIONS);
  if (on('cold_room')) add('cold_room', C.COLD_ROOM_RATIONS);
  if (on('henhouse')) add('henhouse', C.HENHOUSE_RATIONS);
  if (on('beehives')) {
    add('beehives', C.BEEHIVES_RATIONS);
    out.ecology = C.BEEHIVES_ECOLOGY;
  }
  if (on('greenhouse')) add('greenhouse', season === 'autumn' || season === 'winter' ? C.GREENHOUSE_RATIONS_COLD : C.GREENHOUSE_RATIONS_WARM);
  if (on('village_bar')) {
    out.active.push('village_bar');
    out.eur = round2(C.BAR_INCOME_EUR * k('village_bar'));
    out.morale = v.morale_pct < C.BAR_MORALE_CAP ? C.BAR_MORALE : 0;
    out.alcohol = C.BAR_ALCOHOL;
  }
  if (on('shed')) {
    out.active.push('shed');
    out.toolsWear = C.SHED_TOOLS_WEAR;
  }
  if (on('infirmary')) {
    out.active.push('infirmary');
    out.health = Math.round(C.INFIRMARY_HEALTH * k('infirmary'));
  }
  return out;
}

/** Effets nocturnes des nouveaux bâtiments (closeDay, après le chauffage). */
export function processBuildings(s: GameSnapshot, fx: EngineEffects, season: CalendarSeason): void {
  const plan = planBuildingsNight(s, season);
  const v = s.village;
  const life = lifeOf(v);
  if (plan.active.length === 0) {
    if (life.buildings_last) ensureLife(v).buildings_last = null;
    return;
  }
  v.food_rations = round2(v.food_rations + plan.rations);
  v.wood_stock = stock(v.wood_stock - plan.wood);
  if (plan.ecology > 0) v.ecology_index_pct = gauge(v.ecology_index_pct + plan.ecology);
  if (plan.morale > 0) v.morale_pct = gauge(Math.min(C.BAR_MORALE_CAP, v.morale_pct + plan.morale));
  if (plan.alcohol > 0) v.alcohol_consumption_pct = gauge(v.alcohol_consumption_pct + plan.alcohol);
  if (plan.toolsWear > 0) v.tools_wear_pct = gauge(v.tools_wear_pct - plan.toolsWear);
  if (plan.eur > 0) {
    v.treasury_eur = money(v.treasury_eur + plan.eur);
    pushLedger(fx, s, { account: 'treasury', amount_eur: plan.eur, label: 'Recettes du bar du hameau', category: 'income' });
  }
  if (plan.health > 0) {
    for (const p of activePlayers(s)) {
      if (p.injury_type !== null) p.health_pct = Math.round(Math.min(100, p.health_pct + plan.health));
    }
  }
  ensureLife(v).buildings_last = { rations: plan.rations, wood: plan.wood, eur: plan.eur, active: plan.active };
}
