// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/income.ts
/**
 * Plus d'argent & production automatique (V6.1) [GDD §5.12].
 *
 * Trois sources de revenus nouvelles :
 * - les **installations** (étal en libre-service, tournée du pain, bûcheron sous contrat, revente
 *   d'électricité, réservation en ligne du gîte) produisent seules chaque nuit ; elles coûtent un prix
 *   d'installation puis une charge hebdomadaire prélevée le lundi — impayée, l'installation est
 *   suspendue jusqu'à sa relance ;
 * - les **commandes régulières** : un client prend chaque nuit une quantité fixe, mieux payée que le
 *   marché, jusqu'au lundi ; deux livraisons manquées et il rompt (relation avec le voisin en baisse) ;
 * - les **services payants** (1 PA) : quelques fois par semaine, payés comptant.
 * L'état vit dans `village_state.life` (`installs`, `orders`, `services_week`, `income_last`).
 */
import * as C from './constants.ts';
import { pushEvent, pushLedger } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { gauge, money, round2, stock } from './math.ts';
import { adjustNeighbor } from './neighbors.ts';
import { hasBuilding } from './buildings.ts';
import { forestBan } from './work.ts';
import type { ActiveOrder, AutoInstall, CalendarSeason, EngineEffects, GameSnapshot, IncomeLine, IncomeNight, MapStructure, Player, VillageState } from './types.ts';

type IncomeView = { village: VillageState; structures: readonly MapStructure[] };

export function findInstall(id: unknown): C.AutoInstallDef | undefined {
  return typeof id === 'string' ? C.AUTO_INSTALLS.find((d) => d.id === id) : undefined;
}
export function findOrder(id: unknown): C.OrderDef | undefined {
  return typeof id === 'string' ? C.ORDER_OFFERS.find((d) => d.id === id) : undefined;
}
export function findService(id: unknown): C.PaidServiceDef | undefined {
  return typeof id === 'string' ? C.PAID_SERVICES.find((d) => d.id === id) : undefined;
}

export function installsOf(v: Pick<VillageState, 'life'>): Record<string, AutoInstall> {
  return lifeOf(v).installs ?? {};
}
export function ordersOf(v: Pick<VillageState, 'life'>): Record<string, ActiveOrder> {
  return lifeOf(v).orders ?? {};
}
export function servicesDone(v: Pick<VillageState, 'life'>, id: string): number {
  return Number(lifeOf(v).services_week?.[id] ?? 0) || 0;
}

/** Quantité disponible d'une réserve (colonne du village ou produit des filières). */
export function incomeStock(v: Pick<VillageState, 'life' | 'food_rations' | 'wood_stock' | 'tomatoes_stock'>, key: C.IncomeStockKey): number {
  if (key === 'cheese_kg' || key === 'ratafia_bottles') return Number(lifeOf(v).pantry?.[key] ?? 0) || 0;
  return Number(v[key]) || 0;
}

/** Quantité qu'une vente automatique peut prendre sans entamer la réserve de rations du hameau. */
function sellable(key: C.IncomeStockKey, amount: number): number {
  return key === 'food_rations' ? Math.max(0, amount - C.INCOME_RATIONS_FLOOR) : amount;
}

function addStock(v: VillageState, key: C.IncomeStockKey, delta: number): void {
  if (key === 'cheese_kg' || key === 'ratafia_bottles') {
    const life = ensureLife(v);
    life.pantry = { ...(life.pantry ?? {}), [key]: money(Math.max(0, (life.pantry?.[key] ?? 0) + delta)) };
  } else if (key === 'food_rations') v.food_rations = money(Math.max(0, v.food_rations + delta));
  else v[key] = stock(Math.max(0, v[key] + delta));
}

/** Condition d'une installation non remplie (null : elle peut tourner). */
export function installRequirement(s: IncomeView, def: C.AutoInstallDef): string | null {
  if (def.id === 'bread_round' && !hasBuilding(s, 'bakery')) return 'Il faut un four à pain en service.';
  if (def.id === 'power_resale' && s.village.energy_tier < 2) return 'Il faut l’électricité (palier 2 ou plus).';
  if (def.id === 'gite_booking' && !s.village.gite_open) return 'Le gîte doit être ouvert.';
  if (def.id === 'livestock_produce' && s.village.livestock_count < C.LIVESTOCK_PRODUCE_MIN) return `Il faut au moins ${C.LIVESTOCK_PRODUCE_MIN} bêtes à l’enclos.`;
  if (def.id === 'workshop_rental' && s.village.tools_wear_pct >= C.WORKSHOP_RENTAL_MAX_WEAR) return `Outils trop usés (${C.WORKSHOP_RENTAL_MAX_WEAR} % ou plus).`;
  if (def.id === 'nuclear_export' && s.village.energy_tier < 5) return 'Il faut le micro-réacteur (palier 5).';
  if (def.id === 'army_protection' && s.village.perimeter_threat_pct >= C.ARMY_PROTECTION_MAX_THREAT) return `Menace sur le périmètre trop forte (${C.ARMY_PROTECTION_MAX_THREAT} % ou plus) : la garde reste au hameau.`;
  return null;
}

/** Prix à payer pour installer (ou relancer une installation suspendue : une charge hebdomadaire). */
export function setupCost(v: Pick<VillageState, 'life'>, id: unknown): number {
  const def = findInstall(id);
  if (!def) return 0;
  return installsOf(v)[def.id]?.paused ? def.weekly_eur : def.install_eur;
}

/** Raison pour laquelle on ne peut pas installer / relancer (hors caisse et PA). */
export function setupBlocker(s: IncomeView, id: unknown): string | null {
  const def = findInstall(id);
  if (!def) return 'Installation inconnue.';
  const cur = installsOf(s.village)[def.id];
  if (cur && !cur.paused) return `${def.label} : déjà en place.`;
  if (!cur && (s.village.act_number ?? 1) < def.act) return `${def.label} : à partir de l’Acte ${def.act}.`;
  return installRequirement(s, def);
}

export function stopBlocker(v: Pick<VillageState, 'life'>, id: unknown): string | null {
  const def = findInstall(id);
  if (!def) return 'Installation inconnue.';
  return installsOf(v)[def.id] ? null : `${def.label} : rien à arrêter.`;
}

export function orderBlocker(v: Pick<VillageState, 'life'>, id: unknown): string | null {
  const def = findOrder(id);
  if (!def) return 'Commande inconnue.';
  const orders = ordersOf(v);
  if (orders[def.id]) return `${def.client} : commande déjà signée jusqu’à lundi.`;
  if (Object.keys(orders).length >= C.ORDER_MAX_ACTIVE) return `Déjà ${C.ORDER_MAX_ACTIVE} commandes en cours : honorez-les d’abord.`;
  return null;
}

export function serviceBlocker(v: Pick<VillageState, 'life'>, id: unknown): string | null {
  const def = findService(id);
  if (!def) return 'Service inconnu.';
  if (servicesDone(v, def.id) >= def.weekly_cap) return `${def.label} : déjà ${def.weekly_cap} fois cette semaine.`;
  return null;
}

/** Installe (ou relance) ; la caisse est débitée par l'appelant. */
export function setupInstall(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'id' | 'display_name'>, id: unknown, day: string): { def: C.AutoInstallDef; resumed: boolean } {
  const blocker = setupBlocker(s, id);
  if (blocker) throw new Error(blocker);
  const def = findInstall(id)!;
  const life = ensureLife(s.village);
  const resumed = !!life.installs?.[def.id]?.paused;
  life.installs = { ...(life.installs ?? {}), [def.id]: { since: resumed ? life.installs![def.id]!.since : day, by: actor.id } };
  pushEvent(fx, s, {
    event_type: resumed ? 'install_resumed' : 'install_started',
    title: resumed ? `${def.label} : ça repart` : `Nouvelle installation : ${def.label}`,
    body: resumed
      ? `${actor.display_name} règle la charge en retard (${def.weekly_eur} €) : ${def.icon} ${def.label.toLowerCase()} tourne de nouveau.`
      : `${actor.display_name} met en place ${def.icon} ${def.label.toLowerCase()} (${def.install_eur} €, puis ${def.weekly_eur} € chaque lundi). ${def.summary}`,
    data: { install: def.id },
  });
  return { def, resumed };
}

export function stopInstall(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'display_name'>, id: unknown): C.AutoInstallDef {
  const blocker = stopBlocker(s.village, id);
  if (blocker) throw new Error(blocker);
  const def = findInstall(id)!;
  const life = ensureLife(s.village);
  const next = { ...(life.installs ?? {}) };
  delete next[def.id];
  life.installs = next;
  pushEvent(fx, s, { event_type: 'install_stopped', title: `${def.label} : arrêt`, body: `${actor.display_name} arrête ${def.label.toLowerCase()} : plus de charge le lundi, plus de recettes.`, data: { install: def.id } });
  return def;
}

export function signOrder(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'id' | 'display_name'>, id: unknown, day: string): C.OrderDef {
  const blocker = orderBlocker(s.village, id);
  if (blocker) throw new Error(blocker);
  const def = findOrder(id)!;
  const life = ensureLife(s.village);
  life.orders = { ...(life.orders ?? {}), [def.id]: { since: day, by: actor.id, delivered: 0, missed: 0, earned_eur: 0 } };
  pushEvent(fx, s, {
    event_type: 'order_signed',
    title: `Commande : ${def.client}`,
    body: `${actor.display_name} signe : ${def.per_night} ${unitText(def, def.per_night)} chaque nuit à ${def.unit_eur} € jusqu’à lundi. ${C.ORDER_MAX_MISSED} livraisons manquées et le client rompt.`,
    data: { order: def.id },
  });
  return def;
}

export function unitText(def: Pick<C.OrderDef, 'unit'>, n: number): string {
  return n > 1 && !def.unit.endsWith('s') && def.unit !== 'kg' ? `${def.unit}s` : def.unit;
}

/** Service payant rendu : recette et effet secondaire. */
export function renderService(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'display_name'>, id: unknown): { def: C.PaidServiceDef; eur: number } {
  const blocker = serviceBlocker(s.village, id);
  if (blocker) throw new Error(blocker);
  const def = findService(id)!;
  const v = s.village;
  let eur = def.eur;
  if (def.id === 'repairs') v.tools_wear_pct = gauge(v.tools_wear_pct + C.SERVICE_TOOLS_WEAR);
  if (def.id === 'guided_walk') {
    if (v.gite_open) eur += C.SERVICE_WALK_GITE_BONUS;
    v.international_notoriety_pct = gauge(v.international_notoriety_pct + C.SERVICE_WALK_NOTORIETY);
  }
  if (def.id === 'lessons') adjustNeighbor(v, 'organya', C.SERVICE_LESSONS_GAUGE);
  v.treasury_eur = money(v.treasury_eur + eur);
  pushLedger(fx, s, { account: 'treasury', amount_eur: eur, label: `${def.label} (${actor.display_name})`, category: 'income' });
  const life = ensureLife(v);
  life.services_week = { ...(life.services_week ?? {}), [def.id]: servicesDone(v, def.id) + 1 };
  return { def, eur };
}

// ---------------------------------------------------------------------------
// La nuit
// ---------------------------------------------------------------------------
export interface IncomePlan extends IncomeNight {
  /** Variation des réserves. */
  stocks: Partial<Record<C.IncomeStockKey, number>>;
  /** Commandes : livrée ou manquée cette nuit. */
  orders: Record<string, 'delivered' | 'missed'>;
  /** Effets secondaires : usure des outils, relation avec la mairie. */
  toolsWear: number;
  ayuntamiento: number;
}

/** Ce que les installations et commandes feraient cette nuit (calcul pur, réutilisé par l'interface). */
export function planIncomeNight(s: IncomeView, season: CalendarSeason, day = ''): IncomePlan {
  const v = s.village;
  const left: Record<C.IncomeStockKey, number> = {
    food_rations: incomeStock(v, 'food_rations'),
    wood_stock: incomeStock(v, 'wood_stock'),
    tomatoes_stock: incomeStock(v, 'tomatoes_stock'),
    cheese_kg: incomeStock(v, 'cheese_kg'),
    ratafia_bottles: incomeStock(v, 'ratafia_bottles'),
  };
  const plan: IncomePlan = { day, eur: 0, wood: 0, lines: [], stocks: {}, orders: {}, toolsWear: 0, ayuntamiento: 0 };
  const move = (key: C.IncomeStockKey, delta: number) => {
    left[key] = round2(left[key] + delta);
    plan.stocks[key] = round2((plan.stocks[key] ?? 0) + delta);
  };
  const line = (l: IncomeLine) => {
    plan.lines.push(l);
    plan.eur = round2(plan.eur + l.eur);
  };
  const installs = installsOf(v);
  const active = C.AUTO_INSTALLS.filter((d) => installs[d.id]);

  // 1. Ce qui entre d'abord : le bois du bûcheron
  const wood = active.find((d) => d.id === 'wood_contract');
  if (wood) {
    if (installs[wood.id]!.paused) line({ id: wood.id, icon: wood.icon, label: wood.label, eur: 0, idle: 'suspendu (charge impayée)' });
    else if (forestBan(v)) line({ id: wood.id, icon: wood.icon, label: wood.label, eur: 0, idle: 'forêt fermée par Ely' });
    else {
      move('wood_stock', C.WOOD_CONTRACT_STERES);
      plan.wood += C.WOOD_CONTRACT_STERES;
      line({ id: wood.id, icon: wood.icon, label: wood.label, eur: 0, goods: `+${C.WOOD_CONTRACT_STERES} stères` });
    }
  }

  // 2. Les commandes signées passent avant les ventes libres
  for (const def of C.ORDER_OFFERS) {
    if (!ordersOf(v)[def.id]) continue;
    if (sellable(def.stock, left[def.stock]) >= def.per_night) {
      move(def.stock, -def.per_night);
      const eur = money(def.per_night * def.unit_eur);
      plan.orders[def.id] = 'delivered';
      line({ id: `order:${def.id}`, icon: def.icon, label: def.client, eur, goods: `−${def.per_night} ${unitText(def, def.per_night)}` });
    } else {
      plan.orders[def.id] = 'missed';
      line({ id: `order:${def.id}`, icon: def.icon, label: def.client, eur: 0, idle: `livraison manquée : il manque des ${def.stock === 'food_rations' ? `rations (réserve de ${C.INCOME_RATIONS_FLOOR} gardée)` : unitText(def, 2)}` });
    }
  }

  // 3. Les installations
  for (const def of active) {
    if (def.id === 'wood_contract') continue;
    const add = (l: Omit<IncomeLine, 'id' | 'icon' | 'label'>) => line({ id: def.id, icon: def.icon, label: def.label, ...l });
    if (installs[def.id]!.paused) {
      add({ eur: 0, idle: 'suspendu (charge impayée)' });
      continue;
    }
    const missing = installRequirement(s, def);
    if (missing) {
      add({ eur: 0, idle: missing });
      continue;
    }
    if (def.id === 'roadside_stall') {
      const wf = season === 'winter' ? C.STALL_WINTER_FACTOR : 1;
      const kg = Math.min(Math.floor(C.STALL_TOMATOES_KG * wf), Math.floor(left.tomatoes_stock));
      if (kg >= 1) {
        move('tomatoes_stock', -kg);
        add({ eur: money(kg * C.STALL_TOMATO_EUR), goods: `−${kg} kg de tomates` });
      } else {
        const r = Math.min(Math.max(1, Math.floor(C.STALL_RATIONS * wf)), Math.floor(sellable('food_rations', left.food_rations)));
        if (r >= 1) {
          move('food_rations', -r);
          add({ eur: money(r * C.STALL_RATION_EUR), goods: `−${r} ration${r > 1 ? 's' : ''}` });
        } else add({ eur: 0, idle: 'étal vide (ni tomates, ni rations de trop)' });
      }
    } else if (def.id === 'bread_round') {
      if (sellable('food_rations', left.food_rations) >= C.BREAD_ROUND_RATIONS) {
        move('food_rations', -C.BREAD_ROUND_RATIONS);
        add({ eur: money(C.BREAD_ROUND_RATIONS * C.BREAD_ROUND_EUR), goods: `−${C.BREAD_ROUND_RATIONS} rations` });
      } else add({ eur: 0, idle: `pas assez de rations (réserve de ${C.INCOME_RATIONS_FLOOR} gardée)` });
    } else if (def.id === 'power_resale') {
      add({ eur: money(C.POWER_RESALE_EUR_PER_TIER * (v.energy_tier - 1) * C.POWER_RESALE_SEASON[season]) });
    } else if (def.id === 'gite_booking') {
      add({ eur: v.morale_pct >= C.GITE_BOOKING_MORALE ? C.GITE_BOOKING_GOOD_EUR : C.GITE_BOOKING_EUR });
    } else if (def.id === 'livestock_produce') {
      add({ eur: money(Math.min(C.LIVESTOCK_PRODUCE_MAX_EUR, v.livestock_count * C.LIVESTOCK_PRODUCE_EUR)) });
    } else if (def.id === 'track_toll') {
      add({ eur: v.track_condition_pct >= C.TRACK_TOLL_GOOD_PCT ? C.TRACK_TOLL_EUR : C.TRACK_TOLL_POOR_EUR });
    } else if (def.id === 'workshop_rental') {
      plan.toolsWear = round2(plan.toolsWear + C.WORKSHOP_RENTAL_WEAR);
      add({ eur: C.WORKSHOP_RENTAL_EUR, goods: `outils +${C.WORKSHOP_RENTAL_WEAR} % d’usure` });
    } else if (def.id === 'nuclear_export') {
      add({ eur: C.NUCLEAR_EXPORT_EUR });
    } else if (def.id === 'army_protection') {
      plan.ayuntamiento = round2(plan.ayuntamiento + C.ARMY_PROTECTION_GAUGE);
      add({ eur: C.ARMY_PROTECTION_EUR, goods: `mairie +${C.ARMY_PROTECTION_GAUGE}` });
    } else if (def.id === 'collector_stamps') {
      add({ eur: money(C.STAMPS_BASE_EUR + C.STAMPS_PER_NOTORIETY_EUR * Math.max(0, v.international_notoriety_pct)) });
    }
  }
  return plan;
}

/** Charges hebdomadaires de toutes les installations qui tournent. */
export function weeklyCharges(v: Pick<VillageState, 'life'>): number {
  const installs = installsOf(v);
  return C.AUTO_INSTALLS.filter((d) => installs[d.id] && !installs[d.id]!.paused).reduce((a, d) => a + d.weekly_eur, 0);
}

/** Chaque nuit (closeDay, après les filières) : installations et commandes. */
export function processIncome(s: GameSnapshot, fx: EngineEffects, season: CalendarSeason, day: string): void {
  const v = s.village;
  const life = lifeOf(v);
  if (Object.keys(life.installs ?? {}).length === 0 && Object.keys(life.orders ?? {}).length === 0) {
    if (life.income_last) ensureLife(v).income_last = null;
    return;
  }
  const plan = planIncomeNight(s, season, day);
  for (const [key, delta] of Object.entries(plan.stocks) as [C.IncomeStockKey, number][]) addStock(v, key, delta);
  if (plan.toolsWear > 0) v.tools_wear_pct = gauge(v.tools_wear_pct + plan.toolsWear);
  if (plan.ayuntamiento > 0) adjustNeighbor(v, 'ayuntamiento', plan.ayuntamiento);
  for (const l of plan.lines) {
    if (l.eur <= 0) continue;
    v.treasury_eur = money(v.treasury_eur + l.eur);
    pushLedger(fx, s, { account: 'treasury', amount_eur: l.eur, label: l.id.startsWith('order:') ? `Commande — ${l.label}` : `${l.label} (recette de la nuit)`, category: 'income' });
  }
  const orders = { ...(ensureLife(v).orders ?? {}) };
  for (const [id, outcome] of Object.entries(plan.orders)) {
    const def = findOrder(id)!;
    const o = { ...orders[id]! };
    if (outcome === 'delivered') {
      o.delivered += 1;
      o.earned_eur = money(o.earned_eur + def.per_night * def.unit_eur);
      orders[id] = o;
      continue;
    }
    o.missed += 1;
    adjustNeighbor(v, def.from, -C.ORDER_MISS_GAUGE);
    if (o.missed >= C.ORDER_MAX_MISSED) {
      delete orders[id];
      adjustNeighbor(v, def.from, -C.ORDER_BREAK_GAUGE);
      pushEvent(fx, s, {
        event_type: 'order_broken',
        title: `Commande rompue : ${def.client}`,
        body: `${C.ORDER_MAX_MISSED} livraisons manquées : ${def.client} ne compte plus sur le hameau cette semaine (relation −${C.ORDER_MISS_GAUGE * C.ORDER_MAX_MISSED + C.ORDER_BREAK_GAUGE}).`,
        data: { order: id, delivered: o.delivered },
      });
    } else orders[id] = o;
  }
  ensureLife(v).orders = orders;
  ensureLife(v).income_last = { day: plan.day, eur: plan.eur, wood: plan.wood, lines: plan.lines };
}

/** Chaque lundi (closeSeason) : charges des installations, fin des commandes, compteurs des services. */
export function closeIncomeWeek(s: GameSnapshot, fx: EngineEffects): void {
  const v = s.village;
  const life = ensureLife(v);
  const installs = { ...(life.installs ?? {}) };
  for (const def of C.AUTO_INSTALLS) {
    const cur = installs[def.id];
    if (!cur || cur.paused) continue;
    if (v.treasury_eur >= def.weekly_eur) {
      v.treasury_eur = money(v.treasury_eur - def.weekly_eur);
      pushLedger(fx, s, { account: 'treasury', amount_eur: -def.weekly_eur, label: `Charge hebdomadaire — ${def.label}`, category: 'installations' });
    } else {
      installs[def.id] = { ...cur, paused: true };
      pushEvent(fx, s, {
        event_type: 'install_suspended',
        title: `${def.label} : suspendu`,
        body: `La caisse ne couvre pas la charge de la semaine (${def.weekly_eur} €) : ${def.label.toLowerCase()} s’arrête jusqu’à ce qu’on la règle.`,
        data: { install: def.id },
      });
    }
  }
  life.installs = installs;
  for (const [id, o] of Object.entries(life.orders ?? {})) {
    const def = findOrder(id);
    if (def && o.missed === 0 && o.delivered > 0) adjustNeighbor(v, def.from, C.ORDER_KEPT_GAUGE);
  }
  life.orders = {};
  life.services_week = {};
}
