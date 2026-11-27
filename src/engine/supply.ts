/**
 * Filières, péremption & stockage (V5.6) [GDD §5.8].
 *
 * - Filières : le lait devient du fromage (fromagerie chaque nuit, ou action `make_cheese`),
 *   les prunes du verger (cueillies l'été et l'automne) deviennent un ratafia légal
 *   (`make_ratafia`). Fromage et ratafia se vendent au marché d'Organyà.
 *   Ces produits vivent dans `village_state.life.pantry` (pas de nouvelle colonne).
 * - Péremption : chaque nuit d'été (ou de chaleur), sans chambre froide en service, une part
 *   des vivres frais (rations, tomates, prunes) se gâte. Fromage et ratafia se gardent.
 * - Stockage : chaque réserve a une capacité ; le hangar la relève (×1,5 / ×2 / ×2,5 selon son
 *   niveau). Au-delà, le surplus se perd la nuit.
 * `processSupply` est appelé par closeDay après l'usure ; `planSupplyNight` est le calcul pur
 * réutilisé par l'interface.
 */
import { existingBuilding, hasBuilding } from './buildings.ts';
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife, lifeOf, structureLevel } from './life.ts';
import { money, round2, stock } from './math.ts';
import { outputFactor } from './upkeep.ts';
import type { CalendarSeason, EngineEffects, GameSnapshot, MapStructure, SupplyNight, VillageState } from './types.ts';

type SupplyView = { structures: readonly MapStructure[]; village: VillageState };

export const STORAGE_KEYS: readonly C.StorageKey[] = Object.keys(C.STORAGE_BASE) as C.StorageKey[];
const PANTRY_KEYS: readonly C.PantryGood[] = ['cheese_kg', 'ratafia_bottles', 'plums_kg'];

export function isPantryGood(key: string): key is C.PantryGood {
  return (PANTRY_KEYS as readonly string[]).includes(key);
}

/** Quantité d'un produit des filières (0 si absent). */
export function pantryAmount(v: Pick<VillageState, 'life'>, key: C.PantryGood): number {
  const n = Number(lifeOf(v).pantry?.[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Ajoute (ou retire) un produit des filières. */
export function addPantry(v: VillageState, key: C.PantryGood, delta: number): number {
  const life = ensureLife(v);
  const next = round2(Math.max(0, pantryAmount(v, key) + delta));
  life.pantry = { ...(life.pantry ?? {}), [key]: next };
  return next;
}

/** Quantité d'une réserve soumise au stockage. */
export function storageAmount(v: VillageState, key: C.StorageKey): number {
  return isPantryGood(key) ? pantryAmount(v, key) : Number(v[key]) || 0;
}

function setStorage(v: VillageState, key: C.StorageKey, value: number): void {
  if (isPantryGood(key)) {
    const life = ensureLife(v);
    life.pantry = { ...(life.pantry ?? {}), [key]: round2(Math.max(0, value)) };
  } else if (key === 'food_rations') v.food_rations = money(Math.max(0, value));
  else v[key] = stock(Math.max(0, value));
}

/** Niveau du hangar en service (0 sans hangar). */
export function shedLevel(s: Pick<SupplyView, 'structures'>): number {
  return hasBuilding(s, 'shed') ? structureLevel(existingBuilding(s, 'shed')!) : 0;
}

/** Multiplicateur des capacités (1 sans hangar). */
export function storageFactor(s: Pick<SupplyView, 'structures'>): number {
  const lvl = shedLevel(s);
  return lvl > 0 ? (C.SHED_STORAGE_FACTOR[lvl - 1] ?? C.SHED_STORAGE_FACTOR[C.SHED_STORAGE_FACTOR.length - 1]!) : 1;
}

/** Capacité de chaque réserve. */
export function storageCaps(s: Pick<SupplyView, 'structures'>): Record<C.StorageKey, number> {
  const k = storageFactor(s);
  const out = {} as Record<C.StorageKey, number>;
  for (const key of STORAGE_KEYS) out[key] = Math.round(C.STORAGE_BASE[key] * k);
  return out;
}

/** Les vivres frais se gâtent cette nuit : été ou chaleur, et pas de chambre froide en service. */
export function spoilageActive(s: SupplyView, season: CalendarSeason): boolean {
  if (hasBuilding(s, 'cold_room')) return false;
  return season === 'summer' || (Number.isFinite(s.village.real_temp_c) && s.village.real_temp_c >= C.SPOIL_HOT_C);
}

/** Fromage affiné par la fromagerie cette nuit (≥ 2 bêtes ; × niveau). */
export function dairyCheese(s: SupplyView): number {
  if (!hasBuilding(s, 'cheese_dairy') || s.village.livestock_count < C.CHEESE_MIN_LIVESTOCK) return 0;
  return round2(C.CHEESE_DAIRY_KG * outputFactor(existingBuilding(s, 'cheese_dairy')));
}

/** Ce que la nuit donnerait (calcul pur sur les réserves actuelles). */
export function planSupplyNight(s: SupplyView, season: CalendarSeason): SupplyNight & { caps: Record<C.StorageKey, number>; hot: boolean } {
  const v = s.village;
  const cheese = dairyCheese(s);
  const plums = C.PLUMS_PER_NIGHT[season] ?? 0;
  const after = (key: C.StorageKey) => storageAmount(v, key) + (key === 'cheese_kg' ? cheese : key === 'plums_kg' ? plums : 0);
  const hot = spoilageActive(s, season);
  const spoiled: Record<string, number> = {};
  if (hot) {
    for (const [key, rate] of Object.entries(C.SPOIL_RATE) as [C.StorageKey, number][]) {
      const amount = after(key);
      if (amount < C.SPOIL_MIN_STOCK) continue;
      const lost = key === 'food_rations' ? round2(amount * rate) : Math.max(1, Math.floor(amount * rate));
      if (lost > 0) spoiled[key] = lost;
    }
  }
  const caps = storageCaps(s);
  const overflow: Record<string, number> = {};
  for (const key of STORAGE_KEYS) {
    const extra = round2(after(key) - (spoiled[key] ?? 0) - caps[key]);
    if (extra > 0) overflow[key] = key === 'food_rations' || isPantryGood(key) ? extra : Math.ceil(extra);
  }
  return { cheese, plums, spoiled, overflow, caps, hot };
}

function describe(rec: Record<string, number>): string {
  return Object.entries(rec)
    .map(([key, n]) => {
      const meta = C.STORAGE_LABEL[key as C.StorageKey];
      return `${meta.label.toLowerCase()} −${Number(n.toFixed(2))} ${meta.unit}`;
    })
    .join(', ');
}

/** Chaque nuit : verger, fromagerie, péremption puis surplus perdu faute de place. */
export function processSupply(s: GameSnapshot, fx: EngineEffects, season: CalendarSeason): void {
  const v = s.village;
  const plan = planSupplyNight(s, season);
  const before = lifeOf(v).supply_last;
  const nothing = plan.cheese === 0 && plan.plums === 0 && Object.keys(plan.spoiled).length === 0 && Object.keys(plan.overflow).length === 0;
  if (nothing) {
    if (before) ensureLife(v).supply_last = null;
    return;
  }
  if (plan.cheese > 0) addPantry(v, 'cheese_kg', plan.cheese);
  if (plan.plums > 0) addPantry(v, 'plums_kg', plan.plums);
  for (const [key, n] of Object.entries(plan.spoiled)) setStorage(v, key as C.StorageKey, storageAmount(v, key as C.StorageKey) - n);
  for (const [key, n] of Object.entries(plan.overflow)) setStorage(v, key as C.StorageKey, storageAmount(v, key as C.StorageKey) - n);
  const spoiledNow = Object.keys(plan.spoiled).length > 0;
  if (spoiledNow && !(before && Object.keys(before.spoiled ?? {}).length > 0)) {
    pushEvent(fx, s, {
      event_type: 'food_spoiled',
      title: 'Les vivres se gâtent',
      body: `La chaleur abîme les vivres frais (${describe(plan.spoiled)}). Une chambre froide (électricité requise) arrêterait le gâchis ; fromage et ratafia, eux, se gardent.`,
      data: { spoiled: plan.spoiled },
    });
  }
  if (Object.keys(plan.overflow).length > 0) {
    pushEvent(fx, s, {
      event_type: 'storage_full',
      title: 'Réserves pleines',
      body: `Faute de place, le surplus s'est perdu cette nuit (${describe(plan.overflow)}). Vendez au marché d'Organyà ou bâtissez un hangar.`,
      data: { overflow: plan.overflow },
    });
  }
  ensureLife(v).supply_last = { cheese: plan.cheese, plums: plan.plums, spoiled: plan.spoiled, overflow: plan.overflow };
}
