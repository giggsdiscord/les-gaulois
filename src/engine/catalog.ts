/**
 * Catalogue fournisseurs réels [GDD §1.1, §6.3 écran 4] : BigMat, Gedimat, Thomas Sograma,
 * Loxam, Kiloutou et Marché d'Andorre. Prix indicatifs TTC (2026), livraison sur la piste incluse.
 * Le surcoût de +40 % s'applique si la piste est sous 40 % [GDD §3.1].
 */
import { deliverySurchargeFactor } from './formulas.ts';
import { money } from './math.ts';
import type { VillageState } from './types.ts';

export type Supplier = 'BigMat' | 'Gedimat' | 'Thomas Sograma' | 'Loxam' | 'Kiloutou' | "Marché d'Andorre";

export interface CatalogEffects {
  wood_stock?: number;
  stone_stock?: number;
  iron_stock?: number;
  tools_stock?: number;
  fuel_stock_l?: number;
  medicine_stock?: number;
  food_rations?: number;
  morale_pct?: number;
  alcohol_consumption_pct?: number;
  fleet_wear_pct?: number;
  tools_wear_pct?: number;
  /** Location d'engins : bonus de rendement des chantiers (%) pendant N jours. */
  machinery_bonus_pct?: number;
  machinery_days?: number;
}

export interface CatalogItem {
  id: string;
  supplier: Supplier;
  label: string;
  unit: string;
  price_eur: number;
  kind: 'purchase' | 'rental';
  effects: CatalogEffects;
  /** Achat hors du circuit espagnol : vigilance douanière. */
  customs_sensitive?: boolean;
}

export const CATALOG: readonly CatalogItem[] = [
  // BigMat — matériaux de maçonnerie
  { id: 'bigmat_parpaings', supplier: 'BigMat', label: 'Palette de parpaings & pierres de taille', unit: 'palette', price_eur: 380, kind: 'purchase', effects: { stone_stock: 20 } },
  { id: 'bigmat_chaux', supplier: 'BigMat', label: 'Chaux hydraulique & ciment (10 sacs)', unit: 'lot', price_eur: 150, kind: 'purchase', effects: { stone_stock: 8 } },
  { id: 'bigmat_tuiles', supplier: 'BigMat', label: 'Tuiles canal de récupération (100)', unit: 'lot', price_eur: 290, kind: 'purchase', effects: { stone_stock: 6, wood_stock: 4 } },
  { id: 'bigmat_outillage', supplier: 'BigMat', label: 'Outillage de chantier (pelles, pioches, masses)', unit: 'lot de 2', price_eur: 260, kind: 'purchase', effects: { tools_stock: 2 } },
  // Gedimat — bois & quincaillerie
  { id: 'gedimat_charpente', supplier: 'Gedimat', label: 'Bois de charpente traité classe 4', unit: 'lot', price_eur: 640, kind: 'purchase', effects: { wood_stock: 30 } },
  { id: 'gedimat_quincaillerie', supplier: 'Gedimat', label: 'Quincaillerie & fers à béton', unit: 'lot', price_eur: 210, kind: 'purchase', effects: { iron_stock: 10 } },
  { id: 'gedimat_pharmacie', supplier: 'Gedimat', label: 'Trousse de premiers secours chantier', unit: 'trousse', price_eur: 95, kind: 'purchase', effects: { medicine_stock: 3 } },
  // Thomas Sograma — granulats & béton
  { id: 'sograma_grave', supplier: 'Thomas Sograma', label: 'Camion de grave 0/31,5 (empierrement)', unit: 'camion', price_eur: 520, kind: 'purchase', effects: { stone_stock: 40 } },
  { id: 'sograma_beton', supplier: 'Thomas Sograma', label: 'Béton prêt à l\'emploi 3 m³', unit: 'toupie', price_eur: 450, kind: 'purchase', effects: { stone_stock: 25 } },
  // Loxam — engins
  { id: 'loxam_minipelle', supplier: 'Loxam', label: 'Mini-pelle 2,5 t (1 jour, livrée)', unit: 'jour', price_eur: 290, kind: 'rental', effects: { machinery_bonus_pct: 30, machinery_days: 1 } },
  { id: 'loxam_chargeuse', supplier: 'Loxam', label: 'Chargeuse compacte (3 jours)', unit: '3 jours', price_eur: 780, kind: 'rental', effects: { machinery_bonus_pct: 35, machinery_days: 3 } },
  // Kiloutou — petit matériel
  { id: 'kiloutou_betonniere', supplier: 'Kiloutou', label: 'Bétonnière + échafaudage (7 jours)', unit: 'semaine', price_eur: 210, kind: 'rental', effects: { machinery_bonus_pct: 15, machinery_days: 7 } },
  { id: 'kiloutou_tronconneuse', supplier: 'Kiloutou', label: 'Tronçonneuse & débroussailleuse (1 jour)', unit: 'jour', price_eur: 60, kind: 'rental', effects: { wood_stock: 10 } },
  // Marché d'Andorre — détaxé (18 km)
  { id: 'andorre_gasoil', supplier: "Marché d'Andorre", label: 'Gasoil détaxé (200 L en jerricans)', unit: '200 L', price_eur: 230, kind: 'purchase', effects: { fuel_stock_l: 200 }, customs_sensitive: true },
  { id: 'andorre_alcool', supplier: "Marché d'Andorre", label: 'Alcool détaxé pour le banquet', unit: 'caisse', price_eur: 120, kind: 'purchase', effects: { morale_pct: 4, alcohol_consumption_pct: 3 }, customs_sensitive: true },
  { id: 'andorre_pieces', supplier: "Marché d'Andorre", label: 'Pièces mécaniques (4x4, tracteur, pompes)', unit: 'lot', price_eur: 340, kind: 'purchase', effects: { fleet_wear_pct: -15, tools_wear_pct: -10 } },
  { id: 'andorre_conserves', supplier: "Marché d'Andorre", label: 'Conserves & produits secs (30 rations)', unit: 'lot', price_eur: 160, kind: 'purchase', effects: { food_rations: 30 } },
];

export function findCatalogItem(id: string | null | undefined): CatalogItem | undefined {
  return id ? CATALOG.find((i) => i.id === id) : undefined;
}

/** Coût d'une commande (quantité 1-20), surcoût de piste inclus. */
export function purchaseCost(item: CatalogItem, quantity: number, v: VillageState): number {
  const qty = Math.max(1, Math.min(20, Math.floor(quantity)));
  return money(item.price_eur * qty * deliverySurchargeFactor(v));
}
