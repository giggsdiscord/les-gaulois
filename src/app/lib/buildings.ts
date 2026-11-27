/**
 * Nouveaux bâtiments & parcelles libres (V5.4) — logique pure pour l'interface : choix possibles
 * sur une parcelle (avec la raison d'un refus), vue d'ensemble des nouveaux bâtiments et ce
 * qu'ils donnent chaque nuit. Relit les règles du moteur (planBlocker, planBuildingsNight).
 * Testé dans tests/app/buildings.test.ts.
 */
import type { GameData } from '../api/types.ts';
import {
  buildingTypeOf,
  constants as C,
  findParcel,
  freeParcels,
  openBuildingProjects,
  planBlocker,
  planBuildingsNight,
  type CalendarSeason,
  type GameSnapshot,
} from '../engine.ts';

type BuildData = Pick<GameData, 'structures' | 'village'> & { me?: Pick<GameData['me'], 'action_points'> };

export interface BuildingChoice {
  type: C.BuildingTypeDef;
  /** Raison d'un refus (règles, caisse, PA) ; null = possible. */
  blocker: string | null;
  /** La dépense dépasse le seuil : M. Lerme devra la valider. */
  needsBudget: boolean;
}

export interface ParcelChoices {
  parcel: C.ParcelDef;
  free: boolean;
  choices: BuildingChoice[];
}

const asView = (data: BuildData) => ({ structures: data.structures, village: data.village });

/** Ce qu'on peut bâtir sur cette parcelle (les bâtiments possibles d'abord). */
export function parcelChoices(data: BuildData, parcelId: string): ParcelChoices | null {
  const parcel = findParcel(parcelId);
  if (!parcel) return null;
  const view = asView(data);
  const free = freeParcels(view).some((p) => p.id === parcel.id);
  const choices = C.BUILDING_TYPES.map((type): BuildingChoice => {
    let blocker = planBlocker(view, type.id, parcel.id);
    if (!blocker && data.village.treasury_eur < type.price_eur) blocker = `Caisse commune insuffisante (${type.price_eur} € nécessaires).`;
    if (!blocker && data.me && data.me.action_points < 1) blocker = 'Plus de point d\'action aujourd\'hui.';
    return { type, blocker, needsBudget: type.price_eur > C.BUDGET_LOCK_THRESHOLD_EUR };
  });
  choices.sort((a, b) => Number(a.blocker !== null) - Number(b.blocker !== null));
  return { parcel, free, choices };
}

export interface BuildingsOverview {
  /** Nouveaux bâtiments debout (en projet, en chantier, en service). */
  built: GameData['structures'];
  openProjects: number;
  freeParcels: number;
  /** Rations que les bâtiments en service donnent chaque nuit. */
  rationsPerNight: number;
  /** Il reste un bâtiment à bâtir et une place pour le faire. */
  canPlan: boolean;
}

export function buildingsOverview(data: BuildData, season: CalendarSeason): BuildingsOverview {
  const view = asView(data);
  const built = data.structures.filter((s) => buildingTypeOf(s) && s.status !== 'demolished');
  const open = openBuildingProjects(view).length;
  const free = freeParcels(view).length;
  const night = planBuildingsNight({ structures: data.structures, village: data.village } as unknown as GameSnapshot, season);
  return {
    built,
    openProjects: open,
    freeParcels: free,
    rationsPerNight: night.rations,
    canPlan: free > 0 && open < C.BUILDING_MAX_OPEN_PROJECTS && built.length < C.BUILDING_TYPES.length,
  };
}
