/**
 * Vie du village [GDD §5.5, V4.8] : marché d'Organyà, coupes de bois, chauffage d'hiver.
 * L'état propre à ces mécaniques vit dans la colonne JSONB `village_state.life` (VillageLife),
 * absente tant que la migration 20261201000100 n'est pas appliquée : on la lit via lifeOf().
 */
import { localParts } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { gauge, money, stock } from './math.ts';
import { activePlayers } from './population.ts';
import type { EngineEffects, GameSnapshot, MapStructure, VillageLife, VillageState } from './types.ts';

/** État « vie du village » en lecture (objet vide si la colonne n'existe pas encore). */
export function lifeOf(v: Pick<VillageState, 'life'>): VillageLife {
  return v.life && typeof v.life === 'object' ? v.life : {};
}

/** État « vie du village » modifiable (créé au besoin sur l'instantané). */
export function ensureLife(v: VillageState): VillageLife {
  if (!v.life || typeof v.life !== 'object') v.life = {};
  return v.life;
}

// ---------------------------------------------------------------------------
// Marché d'Organyà
// ---------------------------------------------------------------------------
export function findMarketItem(id: string | null | undefined): C.MarketItem | undefined {
  return id ? C.MARKET_ITEMS.find((i) => i.id === id) : undefined;
}

export interface MarketQuote {
  item: C.MarketItem;
  lots: number;
  units: number;
  unitPrice: number;
  total: number;
  saturday: boolean;
  /** Unités déjà vendues cette saison (semaine). */
  sold: number;
  /** Unités que le marché prendra encore cette semaine. */
  remaining: number;
  /** Unités disponibles dans la réserve du village. */
  available: number;
}

type MarketVillage = Pick<VillageState, 'life' | 'spanish_fluency_pct' | 'tomatoes_stock' | 'wood_stock' | 'food_rations'>;

/** Prix d'une vente : base × jour de marché × saturation de la semaine × maîtrise de l'espagnol. */
export function marketQuote(v: MarketVillage, itemId: string | null | undefined, lots: number, now: Date): MarketQuote | null {
  const item = findMarketItem(itemId);
  if (!item) return null;
  const n = Math.max(1, Math.min(20, Math.floor(Number.isFinite(lots) ? lots : 1)));
  const units = n * item.lot;
  const sold = lifeOf(v).market_sold?.[item.id] ?? 0;
  const saturday = localParts(now).weekday === 6;
  // Saturation moyenne sur la vente : la moitié de la quantité vendue compte déjà
  const saturation = Math.min(1, (sold + units / 2) / item.weekly_cap);
  const language = C.MARKET_LANGUAGE_MIN + ((C.MARKET_LANGUAGE_MAX - C.MARKET_LANGUAGE_MIN) * Math.max(0, Math.min(100, v.spanish_fluency_pct))) / 100;
  const unitPrice = money(item.price_eur * (saturday ? 1 + C.MARKET_SATURDAY_BONUS : 1) * (1 - C.MARKET_SATURATION_DROP * saturation) * language);
  return {
    item,
    lots: n,
    units,
    unitPrice,
    total: money(unitPrice * units),
    saturday,
    sold,
    remaining: Math.max(0, item.weekly_cap - sold),
    available: Math.floor(marketStock(v, item.stock)),
  };
}

/** Quantité disponible d'une réserve vendable (colonne du village ou produit des filières dans `life.pantry`, V5.6). */
export function marketStock(v: MarketVillage, key: C.MarketItem['stock']): number {
  if (key === 'cheese_kg' || key === 'ratafia_bottles') return Number(lifeOf(v).pantry?.[key] ?? 0) || 0;
  return v[key];
}

/** Enregistre une vente : réserve débitée, compteur de la semaine, recette dans la caisse (par l'appelant). */
export function applyMarketSale(v: VillageState, q: MarketQuote): void {
  const life = ensureLife(v);
  const key = q.item.stock;
  if (key === 'cheese_kg' || key === 'ratafia_bottles') life.pantry = { ...(life.pantry ?? {}), [key]: money(Math.max(0, (life.pantry?.[key] ?? 0) - q.units)) };
  else if (key === 'food_rations') v.food_rations = money(v.food_rations - q.units);
  else v[key] = stock(v[key] - q.units);
  life.market_sold = { ...(life.market_sold ?? {}), [q.item.id]: q.sold + q.units };
}

// ---------------------------------------------------------------------------
// Chauffage d'hiver
// ---------------------------------------------------------------------------
export interface HeatingNeed {
  /** Bâtisses habitées à chauffer. */
  buildings: number;
  perBuilding: number;
  /** Bois nécessaire pour la nuit. */
  wood: number;
  tempMin: number;
}

/** Niveau d'amélioration d'un ouvrage (1 à UPGRADE_MAX_LEVEL ; 1 si la colonne manque) (V5.5). */
export function structureLevel(st: Pick<MapStructure, 'upgrade_level'>): number {
  const lvl = Math.floor(Number(st.upgrade_level ?? 1));
  return Number.isFinite(lvl) ? Math.min(C.UPGRADE_MAX_LEVEL, Math.max(1, lvl)) : 1;
}

/** Part du bois de chauffage brûlée par cette bâtisse selon son isolation (V5.5). */
export function insulationFactor(st: Pick<MapStructure, 'upgrade_level'>): number {
  return C.UPGRADE_HEATING_FACTOR[structureLevel(st) - 1] ?? 1;
}

/** Bois à brûler cette nuit selon la température minimale réelle (moitié moins au palier 4 et plus ; isolation V5.5). */
export function heatingNeed(s: Pick<GameSnapshot, 'village' | 'structures'>): HeatingNeed {
  const v = s.village;
  const tempMin = Number.isFinite(v.real_temp_min_c) ? v.real_temp_min_c : 10;
  const band = [...C.HEATING_BANDS].sort((a, b) => a.below_c - b.below_c).find((b) => tempMin < b.below_c);
  const heated = s.structures.filter(
    (st) => st.status === 'operational' && ((st.kind === 'building' && st.beds_capacity > 0) || (st.kind === 'gite' && v.gite_open)),
  );
  const buildings = heated.length;
  const perBuilding = band?.wood_per_building ?? 0;
  const raw = Math.max(0, Math.ceil(perBuilding * heated.reduce((a, st) => a + insulationFactor(st), 0) - 1e-9));
  return { buildings, perBuilding, wood: v.energy_tier >= 4 ? Math.ceil(raw / 2) : raw, tempMin };
}

/** Chaque nuit : les bâtisses habitées brûlent du bois ; sans bois, le froid use le moral et la santé. */
export function processHeating(s: GameSnapshot, fx: EngineEffects): void {
  const v = s.village;
  const need = heatingNeed(s);
  const life = ensureLife(v);
  if (need.wood <= 0) {
    life.heating_last = 0;
    life.cold_streak = 0;
    return;
  }
  if (v.wood_stock >= need.wood) {
    v.wood_stock = stock(v.wood_stock - need.wood);
    life.heating_last = need.wood;
    life.cold_streak = 0;
    return;
  }
  life.heating_last = v.wood_stock;
  v.wood_stock = 0;
  life.cold_streak = (life.cold_streak ?? 0) + 1;
  v.morale_pct = gauge(v.morale_pct - C.HEATING_COLD_MORALE);
  for (const p of activePlayers(s)) p.health_pct = Math.max(0, Math.round(p.health_pct - C.HEATING_COLD_HEALTH));
  if (life.cold_streak === 1 || life.cold_streak % 3 === 0) {
    pushEvent(fx, s, {
      event_type: 'cold_night',
      title: 'Nuit glaciale sans feu',
      body: `${Math.round(need.tempMin)} °C au petit matin et plus de bois à brûler : le hameau grelotte (moral −${C.HEATING_COLD_MORALE} %, santé −${C.HEATING_COLD_HEALTH}). Il faut couper ou acheter du bois.`,
      data: { cold_streak: life.cold_streak, wood_needed: need.wood },
    });
  }
}

/** Remise à zéro des compteurs de la saison (chaque lundi). */
export function resetSeasonLife(v: VillageState): void {
  const life = ensureLife(v);
  life.market_sold = {};
  life.wood_cuts = 0;
  // Interdiction des coupes par Ely : valable jusqu'au lundi (V4.9)
  if (life.forest_ban) life.forest_ban = null;
}
