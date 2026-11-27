/**
 * Actions métiers déterministes (3 PA/jour) [GDD §2, §5, écran 2 « Mon Métier »].
 * performAction() vérifie : identité / délégation, prérogatives (métier, portefeuille, Acte),
 * PA, verrous (PLU, budget > 500 €, veto écologique), puis applique l'effet de façon déterministe.
 */
import { findCatalogItem, purchaseCost } from './catalog.ts';
import { addDays, addHours, calendarSeasonOf, dayKey as dayKeyOf, isAfter, isSunday, localParts } from './calendar.ts';
import * as C from './constants.ts';
import { emptyEffects, pushEvent, pushLedger, pushTrigger } from './effects.ts';
import { massMoraleGain, poleFactor, smugglingRiskPct } from './formulas.ts';
import { applyInjury, healInjury, injuryRiskPct, isDetained } from './health.ts';
import { applyMarketSale, ensureLife, marketQuote } from './life.ts';
import { advanceStructure, BUILDING_KINDS, findWorkPost, forestBan, residentSkill } from './work.ts';
import { cheerBlocker, cheerResident, firstName, temperOf } from './personality.ts';
import { adjustNeighbor, helpNeighbors, missionCostText, neighborHelpBlocker } from './neighbors.ts';
import { answerVisitor, visitorBlocker } from './visitors.ts';
import { buyBlocker, buyEtf, sellBlocker, sellEtf } from './funds.ts';
import { findInstall, orderBlocker, renderService, serviceBlocker, setupBlocker, setupCost, setupInstall, signOrder, stopBlocker, stopInstall, unitText } from './income.ts';
import { recordWeekAction } from './chronicle.ts';
import { contributeToCollective, currentCollective, findCollectiveProject } from './collective.ts';
import { buildingTypeOf, findBuildingType, findParcel, hasBuilding, planBlocker, planBuilding } from './buildings.ts';
import { applyUpgrade, maintainBlocker, nextUpgrade, UPGRADABLE_KINDS, upgradeBlocker, upgradeGains, WEARING_KINDS } from './upkeep.ts';
import { addPantry, pantryAmount } from './supply.ts';
import { castElectionVote, speakAtDebate, standForElection } from './elections.ts';
import { checkLocks, markGroupExecuted } from './locks.ts';
import { clamp, deepClone, gauge, money, round2, stock } from './math.ts';
import { adjustLoyalty } from './migrants.ts';
import { holderHasPortfolio, holderHasRole, resolveActor } from './permissions.ts';
import { findMigrant, findPlayer, isOperational, structureByCode } from './population.ts';
import { createRng, type Rng } from './rng.ts';
import { refreshDerived } from './simulation.ts';
import { duoGroupOf, duoPartners, missionFeasible, pickMission, recordDuoAct, skillLevel, skillMultiplier } from './skills.ts';
import type {
  ActionOutcome,
  ActionRequest,
  Child,
  EngineEffects,
  GameSnapshot,
  MapStructure,
  Migrant,
  Player,
  Portfolio,
  RoleCode,
  StructureKind,
  VillageState,
} from './types.ts';

// ---------------------------------------------------------------------------
// Contexte d'exécution
// ---------------------------------------------------------------------------
export class ActionError extends Error {}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ActionError(message);
}

/** Traduit l'erreur d'une règle (Error) en refus d'action. */
function asAction<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof Error && !(err instanceof ActionError)) throw new ActionError(err.message);
    throw err;
  }
}

export interface ActionContext {
  s: GameSnapshot;
  v: VillageState;
  now: Date;
  rng: Rng;
  fx: EngineEffects;
  req: ActionRequest;
  actor: Player;
  holder: Player;
  viaDelegation: boolean;
  def: ActionDef;
  /** Partenaires du binôme du jour (V5.2) : autres joueurs ayant fait une action du même groupe. */
  duo: string[];
}

export type TargetKind = 'none' | 'player' | 'migrant' | 'person' | 'child' | 'structure' | 'catalog' | 'market';

export interface ActionDef {
  code: string;
  label: string;
  description: string;
  roles?: readonly RoleCode[];
  portfolio?: Portfolio;
  anyone?: boolean;
  apCost: number;
  minAct?: 1 | 2 | 3;
  sundayOnly?: boolean;
  physical?: boolean;
  pole?: RoleCode | null;
  requiresPlu?: boolean;
  ecoSensitive?: boolean;
  delegable?: boolean;
  target: TargetKind;
  /** Dépense estimée sur la caisse commune (verrou budgétaire > 500 €). */
  cost?: (s: GameSnapshot, req: ActionRequest) => number;
  /** Refus immédiat (avant les verrous PLU / budget) : évite d'attendre une validation pour rien. */
  precheck?: (s: GameSnapshot, req: ActionRequest) => string | null;
  run: (ctx: ActionContext) => string;
}


function factor(ctx: ActionContext, pole?: RoleCode | null): number {
  const effective = pole === undefined ? ctx.def.pole ?? ctx.holder.role_code : pole;
  let f = poleFactor(ctx.s, effective, ctx.now);
  // Niveau de métier (V5.2) : bonus quand on travaille dans son propre métier
  if (effective && effective === ctx.actor.role_code) f *= skillMultiplier(ctx.actor.skill_xp);
  // Bonus d'action à deux (V5.2)
  if (ctx.duo.length > 0) f *= 1 + C.DUO_BONUS;
  return f;
}

/** Effet fixe renforcé par un binôme (V5.2). */
function duoBoost(ctx: ActionContext, base: number): number {
  return ctx.duo.length > 0 ? Math.round(base * (1 + C.DUO_BONUS)) : base;
}

function spendTreasury(ctx: ActionContext, amount: number, label: string, category: string, supplier: string | null = null): void {
  const value = money(amount);
  if (value <= 0) return;
  ensure(ctx.v.treasury_eur >= value, `Caisse commune insuffisante (${ctx.v.treasury_eur.toFixed(2)} € pour ${value.toFixed(2)} €).`);
  ctx.v.treasury_eur = money(ctx.v.treasury_eur - value);
  pushLedger(ctx.fx, ctx.s, { account: 'treasury', amount_eur: -value, label, category, supplier, created_by: ctx.actor.id });
}

function gainTreasury(ctx: ActionContext, amount: number, label: string, category: string): void {
  const value = money(amount);
  if (value <= 0) return;
  ctx.v.treasury_eur = money(ctx.v.treasury_eur + value);
  pushLedger(ctx.fx, ctx.s, { account: 'treasury', amount_eur: value, label, category, created_by: ctx.actor.id });
}

function spendPrivate(ctx: ActionContext, player: Player, amount: number, label: string, category: string): void {
  const value = money(amount);
  ensure(player.private_wealth_eur >= value, `Épargne privée insuffisante (${player.private_wealth_eur.toFixed(2)} €).`);
  player.private_wealth_eur = money(player.private_wealth_eur - value);
  pushLedger(ctx.fx, ctx.s, { account: 'private', player_id: player.id, amount_eur: -value, label, category, created_by: ctx.actor.id });
}

function targetPlayer(ctx: ActionContext, allowSelf = true): Player {
  const p = findPlayer(ctx.s, ctx.req.target_player_id);
  ensure(p && p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor'), 'Joueur ciblé introuvable.');
  ensure(allowSelf || p.id !== ctx.actor.id, 'Impossible de vous cibler vous-même.');
  return p;
}

function targetMigrant(ctx: ActionContext, statuses: readonly Migrant['status'][]): Migrant {
  const m = findMigrant(ctx.s, ctx.req.target_migrant_id);
  ensure(m && statuses.includes(m.status), 'Résident ou candidat ciblé introuvable.');
  return m;
}

function targetPerson(ctx: ActionContext): Player | Migrant {
  if (ctx.req.target_player_id) return targetPlayer(ctx);
  return targetMigrant(ctx, ['accepted', 'forced_labor', 'candidate']);
}

function targetChild(ctx: ActionContext): Child {
  const c = ctx.s.children.find((x) => x.id === ctx.req.target_child_id);
  ensure(c && c.status !== 'departed', 'Enfant introuvable.');
  return c;
}

function targetStructure(ctx: ActionContext, kinds?: readonly StructureKind[]): MapStructure {
  const st = ctx.s.structures.find((x) => x.id === ctx.req.target_structure_id);
  ensure(st, 'Ouvrage introuvable sur la carte.');
  ensure(!kinds || kinds.includes(st.kind), `Action impossible sur « ${st.name} ».`);
  return st;
}

function structureByCodeOrFail(ctx: ActionContext, code: string): MapStructure {
  const st = structureByCode(ctx.s, code);
  ensure(st, `Ouvrage « ${code} » absent de la carte.`);
  return st;
}

function useStock(ctx: ActionContext, key: 'wood_stock' | 'stone_stock' | 'iron_stock' | 'scrap_stock' | 'medicine_stock', qty: number, label: string): void {
  ensure(ctx.v[key] >= qty, `Stock insuffisant : ${label} (${ctx.v[key]} / ${qty}).`);
  ctx.v[key] = stock(ctx.v[key] - qty);
}

/** Fait progresser un chantier ; livraison conditionnée au raccordement électrique. */
function progressStructure(ctx: ActionContext, st: MapStructure, basePoints: number, pole: RoleCode = 'civil_eng'): number {
  const gain = Math.max(1, Math.round(basePoints * factor(ctx, pole)));
  advanceStructure(ctx.s, ctx.fx, st, gain);
  return gain;
}

/** Jet de blessure musculo-squelettique pour les efforts physiques [GDD §3.1]. */
function physicalRisk(ctx: ActionContext): string {
  const risk = injuryRiskPct(ctx.actor, ctx.v, ctx.now);
  ctx.actor.fatigue_pct = Math.round(clamp(ctx.actor.fatigue_pct + 12, 0, 100));
  if (ctx.actor.injury_type === null && ctx.rng.chance(risk)) {
    applyInjury(ctx.actor, 'muscular', ctx.now);
    ctx.actor.health_pct = Math.round(clamp(ctx.actor.health_pct - 15, 0, 100));
    pushEvent(ctx.fx, ctx.s, {
      event_type: 'injury',
      title: 'Blessure sur le chantier',
      body: `${ctx.actor.display_name} se bloque le dos : direction le cabinet de M. Lerme.`,
      data: { player_id: ctx.actor.id, risk_pct: risk },
    });
    return ' Aïe : blessure musculaire (soins de M. Lerme requis).';
  }
  return '';
}

/** Négociation avec les autorités ou fournisseurs : quiproquos si espagnol < 40 % [GDD §3.1]. */
function negotiation(ctx: ActionContext, baseChance: number): { success: boolean; quiproquo: boolean } {
  const duo = ctx.duo.length > 0 ? C.DUO_NEGOTIATION_BONUS : 0;
  const success = ctx.rng.chance(baseChance + duo + ctx.v.spanish_fluency_pct / 2);
  if (success) {
    ctx.v.spanish_fluency_pct = gauge(ctx.v.spanish_fluency_pct + 2);
    return { success, quiproquo: false };
  }
  const quiproquo = ctx.v.spanish_fluency_pct < 40 && ctx.rng.chance(50);
  return { success, quiproquo };
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Catalogue des actions
// ---------------------------------------------------------------------------
export const ACTIONS: readonly ActionDef[] = [
  // ======================= COMMUNES =======================
  {
    code: 'rest', label: 'Se reposer', description: 'Fatigue −30, santé mentale +5.', anyone: true, apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.actor.fatigue_pct = Math.round(clamp(ctx.actor.fatigue_pct - 30, 0, 100));
      ctx.actor.mental_health_pct = Math.round(clamp(ctx.actor.mental_health_pct + 5, 0, 100));
      ctx.actor.morale_pct = Math.round(clamp(ctx.actor.morale_pct + 3, 0, 100));
      return `${ctx.actor.display_name} s'accorde une sieste au soleil.`;
    },
  },
  {
    code: 'spanish_lesson', label: 'Cours d\'espagnol / catalan', description: 'Maîtrise de l\'espagnol du village +2 %.', anyone: true, apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.spanish_fluency_pct = gauge(ctx.v.spanish_fluency_pct + 2);
      return '« ¿Dónde está la ferretería? » — progrès notables en castillan.';
    },
  },
  {
    code: 'private_work', label: 'Travail privé (primes, commerce)', description: 'Revenu personnel selon la productivité.', anyone: true, apCost: 1, physical: true, delegable: false, target: 'none',
    run: (ctx) => {
      const gain = money(C.PRIVATE_WORK_BASE_EUR * (ctx.v.productivity_modifier_pct / 100) * ctx.rng.float(0.8, 1.3));
      ctx.actor.private_wealth_eur = money(ctx.actor.private_wealth_eur + gain);
      pushLedger(ctx.fx, ctx.s, { account: 'private', player_id: ctx.actor.id, amount_eur: gain, label: 'Revenu d\'activité privée', category: 'private_income', created_by: ctx.actor.id });
      return `+${gain.toFixed(2)} € sur votre compte privé.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'throw_tomatoes', label: 'Lancer de tomates sur les BOR', description: 'Moral +15 %, mais −20 kg de tomates et −5 rations (1 fois par saison).', anyone: true, apCost: 1, target: 'none',
    run: (ctx) => {
      ensure(!ctx.v.prohibition_tomatoes, 'Les tomates sont sous prohibition !');
      ensure(ctx.v.tomato_throw_season !== ctx.v.season_number, 'Les BOR ont déjà été bombardés cette saison.');
      ensure(ctx.v.tomatoes_stock >= C.TOMATO_THROW_TOMATOES, 'Pas assez de tomates.');
      ctx.v.tomatoes_stock = stock(ctx.v.tomatoes_stock - C.TOMATO_THROW_TOMATOES);
      ctx.v.food_rations = money(Math.max(0, ctx.v.food_rations - C.TOMATO_THROW_RATIONS));
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + C.TOMATO_THROW_MORALE);
      ctx.v.tomato_throw_season = ctx.v.season_number;
      pushEvent(ctx.fx, ctx.s, { event_type: 'tomatoes_thrown', title: 'Pluie de tomates', body: 'Les BOR ont été copieusement arrosés. Le moral remonte, les rations baissent.' });
      return 'Splash ! Moral +15 %.';
    },
  },
  {
    code: 'free_ai_action', label: 'Action libre (Maître du Jeu IA)', description: 'Décrivez librement votre action ; l\'IA arbitre dans les bornes du moteur.', anyone: true, apCost: 1, target: 'none',
    run: (ctx) => {
      const text = String(ctx.req.free_text ?? '').trim();
      ensure(text.length >= 10 && text.length <= 1000, 'Décrivez votre action (10 à 1000 caractères).');
      pushTrigger(ctx.fx, { type: 'needs_ai', reason: 'free_action', payload: { actor_id: ctx.actor.id, holder_id: ctx.holder.id, free_text: text } });
      return 'Votre action est soumise au Maître du Jeu.';
    },
  },
  {
    code: 'buy_supplies', label: 'Commande fournisseur', description: 'Achat ou location au catalogue (BigMat, Gedimat, Thomas Sograma, Loxam, Kiloutou, Andorre).', anyone: true, apCost: 1, target: 'catalog',
    cost: (s, req) => {
      const item = findCatalogItem(req.catalog_item_id);
      return item ? purchaseCost(item, num(req.quantity, 1), s.village) : 0;
    },
    run: (ctx) => {
      const item = findCatalogItem(ctx.req.catalog_item_id);
      ensure(item, 'Article inconnu au catalogue.');
      ensure(!isAfter(ctx.v.track_blocked_until, ctx.now), 'Livraisons bloquées : camion embourbé sur la piste.');
      const qty = Math.max(1, Math.min(20, Math.floor(num(ctx.req.quantity, 1))));
      const cost = purchaseCost(item, qty, ctx.v);
      if (ctx.v.track_condition_pct < C.TRACK_SURCHARGE_THRESHOLD && ctx.rng.chance(C.TRACK_MIRE_RISK_PCT)) {
        ctx.v.track_blocked_until = addHours(ctx.now, C.TRACK_MIRE_HOURS).toISOString();
        pushEvent(ctx.fx, ctx.s, { event_type: 'track_mired', title: 'Embourbement', body: `Le camion ${item.supplier} est embourbé : livraisons bloquées 24 h.` });
        return `Le camion ${item.supplier} s'embourbe dans la piste : commande annulée, livraisons bloquées 24 h.`;
      }
      spendTreasury(ctx, cost, `${item.label} ×${qty}`, item.kind === 'rental' ? 'rental' : 'supplies', item.supplier);
      const e = item.effects;
      const v = ctx.v;
      v.wood_stock = stock(v.wood_stock + (e.wood_stock ?? 0) * qty);
      v.stone_stock = stock(v.stone_stock + (e.stone_stock ?? 0) * qty);
      v.iron_stock = stock(v.iron_stock + (e.iron_stock ?? 0) * qty);
      v.tools_stock = stock(v.tools_stock + (e.tools_stock ?? 0) * qty);
      v.fuel_stock_l = stock(v.fuel_stock_l + (e.fuel_stock_l ?? 0) * qty);
      v.medicine_stock = stock(v.medicine_stock + (e.medicine_stock ?? 0) * qty);
      v.food_rations = money(v.food_rations + (e.food_rations ?? 0) * qty);
      v.morale_pct = gauge(v.morale_pct + (e.morale_pct ?? 0));
      v.alcohol_consumption_pct = gauge(v.alcohol_consumption_pct + (e.alcohol_consumption_pct ?? 0));
      v.fleet_wear_pct = gauge(v.fleet_wear_pct + (e.fleet_wear_pct ?? 0) * qty);
      v.tools_wear_pct = gauge(v.tools_wear_pct + (e.tools_wear_pct ?? 0) * qty);
      if (e.machinery_bonus_pct) {
        v.machinery_bonus_pct = e.machinery_bonus_pct;
        v.machinery_bonus_until = addDays(ctx.now, (e.machinery_days ?? 1) * qty).toISOString();
      }
      if (item.customs_sensitive) v.customs_alert_pct = gauge(v.customs_alert_pct + 3);
      v.track_condition_pct = gauge(v.track_condition_pct - C.TRACK_WEAR_CONVOY);
      const surcharge = v.track_condition_pct < C.TRACK_SURCHARGE_THRESHOLD ? ' (surcoût piste +40 %)' : '';
      return `${item.supplier} livre : ${item.label} ×${qty} pour ${cost.toFixed(2)} €${surcharge}.`;
    },
  },
  // ======================= Vie du village (V4.8) =======================
  {
    code: 'market_sale', label: 'Vendre au marché d\'Organyà', description: 'Tomates, bois, conserves, fromage ou ratafia vendus pour la caisse commune ; le samedi, jour de marché, +30 %. Le marché sature au fil de la semaine.', anyone: true, apCost: 1, target: 'market',
    run: (ctx) => {
      const q = marketQuote(ctx.v, ctx.req.catalog_item_id, num(ctx.req.quantity, 1), ctx.now);
      ensure(q, 'Produit inconnu au marché.');
      ensure(!isAfter(ctx.v.track_blocked_until, ctx.now), 'Piste bloquée : impossible de descendre au marché.');
      ensure(q.units <= q.available, `Réserve insuffisante : ${q.available} ${q.item.unit} de ${q.item.label.toLowerCase()} pour ${q.units}.`);
      ensure(q.remaining > 0, `Marché saturé cette semaine pour ce produit (${q.sold} ${q.item.unit} déjà vendus). Revenez lundi.`);
      ensure(q.units <= q.remaining, `Le marché n'en prendra plus que ${q.remaining} ${q.item.unit} cette semaine.`);
      applyMarketSale(ctx.v, q);
      gainTreasury(ctx, q.total, `Marché d'Organyà : ${q.item.label} ×${q.units} ${q.item.unit}`, 'market');
      ctx.v.spanish_fluency_pct = gauge(ctx.v.spanish_fluency_pct + 0.5);
      ctx.v.track_condition_pct = gauge(ctx.v.track_condition_pct - 1);
      adjustNeighbor(ctx.v, 'organya', C.NEIGHBOR_MARKET_SALE_GAIN);
      return `Vendu ${q.units} ${q.item.unit} (${q.item.label.toLowerCase()}) à ${q.unitPrice.toFixed(2)} € : +${q.total.toFixed(2)} € pour la caisse${q.saturday ? ' — jour de marché, +30 %' : ''}. Le marché en prendra encore ${q.remaining - q.units} ${q.item.unit} cette semaine.`;
    },
  },
  {
    code: 'cut_wood', label: 'Couper du bois', description: 'Bois de chauffage et de chantier dans la forêt communale (environ 8 stères). Au-delà de 10 coupes par semaine, la forêt souffre et les agents rurals s\'en mêlent.', anyone: true, apCost: 1, physical: true, ecoSensitive: false, pole: 'smith_diplo', target: 'none',
    run: (ctx) => {
      const ban = forestBan(ctx.v);
      ensure(!ban, `Ely a interdit les coupes jusqu'à lundi : « ${ban?.reason ?? ''} ».`);
      const life = ensureLife(ctx.v);
      const cuts = round2((life.wood_cuts ?? 0) + 1);
      life.wood_cuts = cuts;
      const wood = Math.max(1, Math.round(C.WOOD_CUT_BASE * factor(ctx))) + (hasBuilding(ctx.s, 'sawmill') ? C.SAWMILL_WOOD_BONUS : 0);
      ctx.v.wood_stock = stock(ctx.v.wood_stock + wood);
      let note = '';
      if (cuts > C.WOOD_CUT_SUSTAINABLE) {
        ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct - C.WOOD_OVERCUT_ECOLOGY);
        note = ` La forêt s'éclaircit à vue d'œil (${String(cuts).replace('.', ',')} coupes cette semaine).`;
        if (ctx.rng.chance(C.WOOD_OVERCUT_RISK_PCT)) {
          ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct + C.WOOD_OVERCUT_ADMIN);
          pushEvent(ctx.fx, ctx.s, { event_type: 'overcut', title: 'Les agents rurals comptent les souches', body: 'Coupes excessives dans la forêt communale : procès-verbal en vue, pression administrative en hausse.' });
          note += ' Un agent rural est passé compter les souches.';
        }
      }
      return `+${wood} stères de bois (réserve : ${ctx.v.wood_stock}).${note}${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'make_preserves', label: 'Faire des conserves', description: '10 kg de tomates + 12 € de bocaux → 8 rations qui se gardent tout l\'hiver.', anyone: true, apCost: 1, pole: 'mayor_agri', target: 'none',
    run: (ctx) => {
      ensure(ctx.v.tomatoes_stock >= C.PRESERVES_TOMATOES_KG, `Pas assez de tomates (${ctx.v.tomatoes_stock} kg pour ${C.PRESERVES_TOMATOES_KG}).`);
      spendTreasury(ctx, C.PRESERVES_JARS_EUR, 'Bocaux & couvercles', 'supplies', 'Gedimat');
      ctx.v.tomatoes_stock = stock(ctx.v.tomatoes_stock - C.PRESERVES_TOMATOES_KG);
      const rations = Math.max(1, Math.round(C.PRESERVES_RATIONS * Math.min(1.5, factor(ctx))));
      ctx.v.food_rations = money(ctx.v.food_rations + rations);
      return `${C.PRESERVES_TOMATOES_KG} kg de tomates mis en bocaux : +${rations} rations pour l'hiver.`;
    },
  },
  // ======================= Filières (V5.6) =======================
  {
    code: 'make_cheese', label: 'Faire du fromage', description: 'Le lait du troupeau (au moins 2 bêtes, 4 rations de lait) devient environ 3 kg de fromage qui se garde et se vend bien au marché ; davantage avec la fromagerie.', anyone: true, apCost: 1, pole: 'mayor_agri', target: 'none',
    run: (ctx) => {
      ensure(ctx.v.livestock_count >= C.CHEESE_MIN_LIVESTOCK, `Il faut au moins ${C.CHEESE_MIN_LIVESTOCK} bêtes à l'enclos (${ctx.v.livestock_count} aujourd'hui).`);
      ensure(ctx.v.food_rations >= C.CHEESE_MAKE_RATIONS, `Pas assez de lait : il faut ${C.CHEESE_MAKE_RATIONS} rations.`);
      ctx.v.food_rations = money(ctx.v.food_rations - C.CHEESE_MAKE_RATIONS);
      const dairy = hasBuilding(ctx.s, 'cheese_dairy');
      const kg = round2(Math.max(1, Math.round(C.CHEESE_MAKE_KG * Math.min(1.5, factor(ctx)))) + (dairy ? C.CHEESE_MAKE_DAIRY_BONUS : 0));
      const total = addPantry(ctx.v, 'cheese_kg', kg);
      return `Caillé, moulé, salé : +${kg} kg de fromage${dairy ? ' (fromagerie)' : ''}. Réserve : ${total} kg, à vendre au marché d'Organyà.`;
    },
  },
  {
    code: 'make_ratafia', label: 'Distiller du ratafia', description: '10 kg de prunes du verger + 15 € (eau-de-vie, sucre, droits d’accise déclarés) → 6 bouteilles de ratafia légal, à vendre au marché.', anyone: true, apCost: 1, pole: 'mayor_agri', target: 'none',
    run: (ctx) => {
      const plums = pantryAmount(ctx.v, 'plums_kg');
      ensure(plums >= C.RATAFIA_PLUMS_KG, `Pas assez de prunes (${plums} kg pour ${C.RATAFIA_PLUMS_KG}) : le verger en donne l'été et l'automne.`);
      spendTreasury(ctx, C.RATAFIA_COST_EUR, 'Ratafia : eau-de-vie, sucre et droits d’accise', 'supplies');
      addPantry(ctx.v, 'plums_kg', -C.RATAFIA_PLUMS_KG);
      const bottles = Math.max(1, Math.round(C.RATAFIA_BOTTLES * Math.min(1.5, factor(ctx))));
      const total = addPantry(ctx.v, 'ratafia_bottles', bottles);
      return `${C.RATAFIA_PLUMS_KG} kg de prunes macérés : +${bottles} bouteilles de ratafia déclaré (${total} en réserve).`;
    },
  },
  // ======================= Travail des résidents & droit de regard d'Ely (V4.9) =======================
  {
    code: 'assign_work_post', label: 'Affecter un résident à un poste', description: 'Potager, forêt, chantier, forge, pâturage, réseau d\'eau ou piste : il y travaille chaque nuit, bien mieux s\'il en a la spécialité.', anyone: true, apCost: 0, delegable: false, target: 'migrant',
    run: (ctx) => {
      const m = targetMigrant(ctx, ['accepted', 'forced_labor']);
      const code = String(ctx.req.params?.post ?? '').trim();
      if (code === '' || code === 'none') {
        ensure(m.work_post, `${m.full_name} n'a pas de poste.`);
        m.work_post = null;
        return `${m.full_name} n'a plus de poste : il ne produira plus rien la nuit.`;
      }
      const post = findWorkPost(code);
      ensure(post, 'Poste inconnu.');
      const boss = m.private_employer_id ? findPlayer(ctx.s, m.private_employer_id) : undefined;
      ensure(!m.private_employer_id, `${m.full_name} travaille sur le chantier privé${boss ? ` de ${boss.display_name}` : ''} : il faut d'abord mettre fin au contrat.`);
      ensure(m.work_post !== post.code, `${m.full_name} travaille déjà ${post.place}.`);
      m.work_post = post.code;
      const skill = residentSkill(m, post);
      return `${m.full_name} travaillera ${post.place} chaque nuit${skill > 1 ? ` — c'est sa spécialité (rendement ×${String(skill).replace('.', ',')})` : ''}.`;
    },
  },
  {
    code: 'cheer_resident', label: 'Encourager un résident', description: `Un mot gentil, un verre partagé : l’humeur du résident remonte (+${C.CHEER_MOOD}), une fois par jour. Un résident joyeux travaille mieux, un résident maussade moins bien.`, anyone: true, apCost: C.CHEER_AP, delegable: false, target: 'migrant',
    precheck: (s, req) => cheerBlocker(s.migrants.find((m) => m.id === req.target_migrant_id), ''),
    run: (ctx) => {
      const m = targetMigrant(ctx, ['accepted', 'forced_labor']);
      const day = dayKeyOf(ctx.now);
      const blocked = cheerBlocker(m, day);
      ensure(!blocked, blocked ?? '');
      const mood = cheerResident(m, day);
      return `${firstName(m)} (${temperOf(m).label.toLowerCase()}) a le cœur plus léger : humeur ${mood}/100.`;
    },
  },
  {
    code: 'answer_visitor', label: 'Répondre au visiteur', description: 'Un visiteur imprévu (randonneur, journaliste, inspecteur, vendeur) attend une réponse avant 21 h : le premier qui répond choisit (1 PA, parfois des ressources). Sans réponse, la nuit tranche, souvent mal.', anyone: true, apCost: 1, delegable: false, target: 'none',
    precheck: (s, req) => visitorBlocker(s.village, null, typeof req.params?.choice === 'string' ? req.params.choice : null),
    run: (ctx) => {
      const a = asAction(() => answerVisitor(ctx.s, ctx.fx, ctx.actor, ctx.req.params?.choice, ctx.now));
      return `${a.choice.icon} ${a.choice.result}${a.effects ? ` (${a.effects})` : ''}`;
    },
  },
  {
    code: 'help_neighbors', label: 'Rendre service aux voisins', description: 'Un coup de main pour la demande en cours d’Organyà, de la mairie ou des Mossos (1 PA, parfois des ressources). Demande remplie à temps : la relation monte et un bonus tombe ; manquée : elle baisse.', anyone: true, apCost: 1, delegable: false, target: 'none',
    precheck: (s) => neighborHelpBlocker(s.village),
    run: (ctx) => {
      const h = asAction(() => helpNeighbors(ctx.s, ctx.fx, ctx.actor, ctx.now));
      const cost = missionCostText(h.def);
      if (h.finished) return `${h.def.icon} « ${h.def.title} » : c’est fait ! Relation ${Math.round(h.gauge)}/100 et ${h.def.bonus}.`;
      return `${h.def.icon} Coup de main pour « ${h.def.title} » : ${h.mission.done_steps}/${h.def.steps}${cost ? ` (${cost})` : ''}.`;
    },
  },
  {
    code: 'setup_install', label: 'Installer un revenu automatique', description: 'Étal en libre-service, tournée du pain, bûcheron sous contrat, revente d’électricité, réservation en ligne du gîte : la caisse paie l’installation, puis une charge chaque lundi ; ensuite tout tourne seul chaque nuit. Une installation suspendue (charge impayée) se relance en réglant une semaine.', anyone: true, apCost: 1, delegable: false, target: 'none',
    cost: (s, req) => setupCost(s.village, req.params?.install),
    precheck: (s, req) => setupBlocker(s, req.params?.install),
    run: (ctx) => {
      const id = ctx.req.params?.install;
      const blocker = setupBlocker(ctx.s, id);
      ensure(!blocker, blocker ?? '');
      const def = findInstall(id)!;
      const price = setupCost(ctx.v, id);
      spendTreasury(ctx, price, `${ctx.v.life?.installs?.[def.id]?.paused ? 'Relance' : 'Installation'} — ${def.label}`, 'installations');
      const r = asAction(() => setupInstall(ctx.s, ctx.fx, ctx.actor, id, dayKeyOf(ctx.now)));
      return r.resumed ? `${def.icon} ${def.label} repart (${price} € réglés).` : `${def.icon} ${def.label} en place (${price} €) : premières recettes dès cette nuit, ${def.weekly_eur} € de charge chaque lundi.`;
    },
  },
  {
    code: 'stop_install', label: 'Arrêter une installation', description: 'Plus de charge le lundi, plus de recettes : l’installation est démontée (sans remboursement).', anyone: true, apCost: 0, delegable: false, target: 'none',
    precheck: (s, req) => stopBlocker(s.village, req.params?.install),
    run: (ctx) => {
      const def = asAction(() => stopInstall(ctx.s, ctx.fx, ctx.actor, ctx.req.params?.install));
      return `${def.icon} ${def.label} arrêté.`;
    },
  },
  {
    code: 'sign_order', label: 'Signer une commande régulière', description: `Un client prend chaque nuit une quantité fixe (rations, bois, fromage, tomates, ratafia), mieux payée qu’au marché, jusqu’au lundi. ${C.ORDER_MAX_ACTIVE} commandes à la fois ; ${C.ORDER_MAX_MISSED} livraisons manquées et le client rompt (relation en baisse).`, anyone: true, apCost: 1, delegable: false, target: 'none',
    precheck: (s, req) => orderBlocker(s.village, req.params?.order),
    run: (ctx) => {
      const def = asAction(() => signOrder(ctx.s, ctx.fx, ctx.actor, ctx.req.params?.order, dayKeyOf(ctx.now)));
      return `${def.icon} Commande signée : ${def.per_night} ${unitText(def, def.per_night)} par nuit pour ${def.client}, ${def.unit_eur} € l’unité, jusqu’à lundi.`;
    },
  },
  {
    code: 'paid_service', label: 'Rendre un service payant', description: 'Réparations chez les voisins, balade guidée pour randonneurs, cours de français à Organyà : payé comptant, quelques fois par semaine pour tout le hameau.', anyone: true, apCost: 1, physical: true, delegable: false, target: 'none',
    precheck: (s, req) => serviceBlocker(s.village, req.params?.service),
    run: (ctx) => {
      const r = asAction(() => renderService(ctx.s, ctx.fx, ctx.actor, ctx.req.params?.service));
      return `${r.def.icon} ${r.def.label} : +${r.eur} € dans la caisse (${r.def.extra}).`;
    },
  },
  {
    code: 'forest_ban', label: 'Interdire les coupes de bois (jusqu\'à lundi)', description: 'Droit de regard d\'Ely sur la forêt communale : plus aucune coupe jusqu\'au lundi ; les bûcherons résidents entretiennent la forêt (motif obligatoire).', roles: ['mayor_agri'], apCost: 0, delegable: false, target: 'none',
    run: (ctx) => {
      const ban = forestBan(ctx.v);
      ensure(!ban, 'Les coupes sont déjà interdites jusqu\'à lundi.');
      const reason = String(ctx.req.params?.reason ?? '').trim();
      ensure(reason.length >= C.FOREST_BAN_REASON_MIN, `Motivez l'interdiction (${C.FOREST_BAN_REASON_MIN} caractères minimum).`);
      ensureLife(ctx.v).forest_ban = { by: ctx.actor.id, reason, since: ctx.now.toISOString() };
      pushEvent(ctx.fx, ctx.s, { event_type: 'forest_ban', title: 'Forêt fermée aux coupes', body: `Ely interdit les coupes de bois jusqu'à lundi : ${reason}`, data: { reason } });
      return 'Coupes interdites jusqu\'à lundi : les bûcherons entretiendront la forêt.';
    },
  },
  {
    code: 'lift_forest_ban', label: 'Rouvrir la forêt aux coupes', description: 'Lève l\'interdiction des coupes de bois avant lundi.', roles: ['mayor_agri'], apCost: 0, delegable: false, target: 'none',
    run: (ctx) => {
      ensure(forestBan(ctx.v), 'La forêt est déjà ouverte aux coupes.');
      ensureLife(ctx.v).forest_ban = null;
      pushEvent(ctx.fx, ctx.s, { event_type: 'forest_ban_lifted', title: 'Forêt rouverte', body: 'Ely lève l\'interdiction : les coupes de bois reprennent.' });
      return 'La forêt est rouverte aux coupes.';
    },
  },
  // ======================= Chantier collectif de la semaine (V5.0) =======================
  {
    code: 'contribute_collective', label: 'Travailler au chantier de la semaine', description: 'Mettre 1 PA dans le projet commun : 1 point, 2 si c\'est votre métier. Fini avant dimanche, son effet est multiplié par 1,5.', anyone: true, apCost: 1, physical: true, delegable: false, target: 'none',
    run: (ctx) => {
      const project = currentCollective(ctx.v);
      const def = findCollectiveProject(project?.id);
      ensure(project && def, 'Pas de chantier collectif cette semaine : le prochain s\'ouvrira cette nuit.');
      ensure(!project.completed_at, 'Le chantier de la semaine est déjà achevé : rendez-vous lundi pour le suivant.');
      const { gained, project: p, finished } = contributeToCollective(ctx.s, ctx.fx, ctx.actor, ctx.now);
      if (finished) return `${def.icon} Dernier coup de collier : « ${def.label} » est achevé ! ${finished.charAt(0).toUpperCase()}${finished.slice(1)}.`;
      return `${def.icon} +${gained} point${gained > 1 ? 's' : ''} pour « ${def.label} » : ${p.points}/${p.goal}.`;
    },
  },
  {
    code: 'vote_collective_project', label: 'Voter pour le chantier de la semaine prochaine', description: 'Choisir parmi les projets proposés celui qui s\'ouvrira lundi ; sans vote, le hameau retient sa proposition.', anyone: true, apCost: 0, delegable: false, target: 'none',
    run: (ctx) => {
      const life = ensureLife(ctx.v);
      const candidates = life.collective_candidates ?? [];
      ensure(candidates.length > 0, 'Aucun projet à voter pour l\'instant.');
      const choice = String(ctx.req.params?.project ?? '').trim();
      const def = findCollectiveProject(choice);
      ensure(def && candidates.includes(choice), 'Ce projet n\'est pas soumis au vote.');
      ensure(life.collective_votes?.[ctx.actor.id] !== choice, `Vous avez déjà voté pour « ${def.label} ».`);
      life.collective_votes = { ...(life.collective_votes ?? {}), [ctx.actor.id]: choice };
      return `Voix donnée à « ${def.icon} ${def.label} » pour la semaine prochaine.`;
    },
  },
  // ======================= Élections vivantes (V5.3) =======================
  {
    code: 'run_for_office', label: 'Se porter candidat·e à l\'élection', description: 'Pendant les candidatures : se présenter au portefeuille mis en jeu avec un programme (20 à 280 caractères).', anyone: true, apCost: 1, minAct: 2, delegable: false, target: 'none',
    run: (ctx) => {
      const e = asAction(() => standForElection(ctx.s, ctx.actor, ctx.req.params?.program, ctx.now));
      return `🗳️ Candidature déposée : ${C.PORTFOLIO_TITLE[e.portfolio]}. Défendez votre programme au débat de la Taverne.`;
    },
  },
  {
    code: 'campaign_speech', label: 'Prendre la parole au débat', description: 'Candidat·e : une intervention par jour au débat de la Taverne (10 à 280 caractères) ; à égalité de voix, le plus présent au débat l\'emporte.', anyone: true, apCost: 1, minAct: 2, delegable: false, target: 'none',
    run: (ctx) => {
      const first = asAction(() => speakAtDebate(ctx.s, ctx.actor, ctx.req.params?.text, ctx.now));
      if (first) ctx.v.morale_pct = gauge(ctx.v.morale_pct + C.ELECTION_SPEECH_MORALE);
      return `🎙️ Intervention publiée au débat${first ? ` : la place s'anime (moral +${C.ELECTION_SPEECH_MORALE} %)` : ''}.`;
    },
  },
  {
    code: 'vote_election', label: 'Voter à l\'élection', description: 'Pendant le vote : choisir un candidat (pas soi-même) ; on peut changer d\'avis jusqu\'au dépouillement.', anyone: true, apCost: 0, minAct: 2, delegable: false, target: 'none',
    run: (ctx) => {
      const who = asAction(() => castElectionVote(ctx.s, ctx.actor, ctx.req.params?.candidate, ctx.now));
      return `🗳️ Bulletin déposé pour ${who.display_name}. Dépouillement à la fin du vote.`;
    },
  },
  {
    code: 'hire_resident', label: 'Embaucher un résident (chantier privé)', description: 'Salaire hebdomadaire sur fonds privés : bonus de propriété privée +10 à +20 %.', anyone: true, apCost: 0, delegable: false, target: 'migrant',
    run: (ctx) => {
      ensure(!ctx.v.collectivization_active, 'La collectivisation interdit l\'emploi privé.');
      const m = targetMigrant(ctx, ['accepted']);
      ensure(!m.private_employer_id, `${m.full_name} travaille déjà pour un autre fondateur.`);
      const wage = money(clamp(num(ctx.req.amount_eur, 120), 50, 400));
      ensure(ctx.actor.private_wealth_eur >= wage, 'Épargne insuffisante pour la première semaine.');
      m.private_employer_id = ctx.actor.id;
      m.private_wage_eur_week = wage;
      const leftPost = findWorkPost(m.work_post);
      m.work_post = null;
      adjustLoyalty(m, ctx.actor.role_code, 10);
      return `${m.full_name} rejoint votre chantier privé pour ${wage} €/semaine${leftPost ? ` (il quitte son poste ${leftPost.place})` : ''}.`;
    },
  },
  {
    code: 'fire_resident', label: 'Mettre fin à un contrat privé', description: 'Libère le résident de votre chantier privé.', anyone: true, apCost: 0, delegable: false, target: 'migrant',
    run: (ctx) => {
      const m = targetMigrant(ctx, ['accepted', 'forced_labor']);
      ensure(m.private_employer_id === ctx.actor.id, 'Ce résident ne travaille pas pour vous.');
      m.private_employer_id = null;
      m.private_wage_eur_week = 0;
      adjustLoyalty(m, ctx.actor.role_code, -10);
      return `${m.full_name} quitte votre chantier privé.`;
    },
  },
  {
    code: 'improve_own_housing', label: 'Améliorer mon logement (fonds privés)', description: '1 500 € privés ; requiert l\'accord PLU de Tiphaine.', anyone: true, apCost: 1, requiresPlu: true, delegable: false, physical: true, target: 'structure',
    run: (ctx) => {
      const st = targetStructure(ctx, ['building']);
      ensure(st.status === 'operational' && !buildingTypeOf(st), 'Seule une bâtisse habitable peut être améliorée.');
      spendPrivate(ctx, ctx.actor, 1500, `Amélioration du logement — ${st.name}`, 'housing');
      st.condition_pct = Math.min(100, st.condition_pct + 10);
      st.owner_player_id = st.owner_player_id ?? ctx.actor.id;
      ctx.actor.morale_pct = Math.round(clamp(ctx.actor.morale_pct + 10, 0, 100));
      ctx.actor.mental_health_pct = Math.round(clamp(ctx.actor.mental_health_pct + 5, 0, 100));
      return `Votre logement à ${st.name} gagne en confort.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'plan_building', label: 'Bâtir sur une parcelle libre', description: 'Choisir un nouveau bâtiment (four à pain, fromagerie, lavoir, serre…) et la parcelle où le poser ; la caisse paie le plan, puis le chantier avance par la rénovation.', anyone: true, apCost: 1, pole: 'civil_eng', target: 'none',
    cost: (_s, req) => findBuildingType(req.params?.variant)?.price_eur ?? 0,
    precheck: (s, req) => planBlocker(s, req.params?.variant, req.params?.parcel),
    run: (ctx) => {
      const variant = ctx.req.params?.variant;
      const parcelId = ctx.req.params?.parcel;
      const blocker = planBlocker(ctx.s, variant, parcelId);
      ensure(!blocker, blocker ?? '');
      const type = findBuildingType(variant)!;
      const parcel = findParcel(parcelId)!;
      spendTreasury(ctx, type.price_eur, `Plan du bâtiment — ${type.label} (${parcel.name})`, 'construction');
      const st = asAction(() => planBuilding(ctx.s, ctx.holder, variant, parcelId, ctx.rng.fork('plan')));
      pushEvent(ctx.fx, ctx.s, {
        event_type: 'building_planned',
        title: 'Nouveau bâtiment en projet',
        body: `${ctx.actor.display_name} pose le plan : ${type.icon} ${type.label} sur la parcelle « ${parcel.name} ».`,
        data: { structure_id: st.id, variant: type.id, parcel: parcel.id },
      });
      const plu = st.plu_approved ? '' : ' Il faudra l\'accord PLU de Tiphaine au premier coup de pioche.';
      return `Plan posé : ${type.label} sur « ${parcel.name} » (${type.price_eur} €). Faites avancer le chantier par « Rénover / construire ».${plu}`;
    },
  },
  {
    code: 'renovate_building', label: 'Rénover / construire (chantier)', description: 'Fait avancer un chantier de bâtisse ; accord PLU requis ; 300 € de matériaux par séance.', anyone: true, apCost: 1, physical: true, requiresPlu: true, ecoSensitive: true, pole: 'civil_eng', target: 'structure',
    cost: () => 300,
    run: (ctx) => {
      const st = targetStructure(ctx, BUILDING_KINDS);
      ensure(['ruin', 'cleared', 'in_progress', 'damaged', 'planned'].includes(st.status), `« ${st.name} » n'a pas besoin de travaux.`);
      useStock(ctx, 'stone_stock', 5, 'pierre');
      useStock(ctx, 'wood_stock', 5, 'bois');
      spendTreasury(ctx, 300, `Matériaux de chantier — ${st.name}`, 'construction', 'BigMat');
      if (st.status === 'damaged') {
        st.condition_pct = Math.min(100, st.condition_pct + Math.round(25 * factor(ctx, 'civil_eng')));
        if (st.condition_pct >= 60) st.status = 'operational';
        return `Réparations à ${st.name} : état ${st.condition_pct} %.${physicalRisk(ctx)}`;
      }
      const bonus = (ctx.holder.role_code === 'civil_eng' ? 1.2 : 1) * (buildingTypeOf(st)?.ease ?? 1);
      const gain = progressStructure(ctx, st, C.BUILDING_BASE_PROGRESS * bonus);
      return `Chantier ${st.name} : +${gain} % (avancement ${st.progress_pct} %).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'maintain_building', label: 'Entretenir une bâtisse', description: `Toiture, joints, ferrures : +${C.MAINTAIN_POINTS} % d'état pour ${C.MAINTAIN_STONE} pierres et ${C.MAINTAIN_IRON} fer, sans dépense.`, anyone: true, apCost: 1, physical: true, pole: 'civil_eng', target: 'structure',
    precheck: (s, req) => maintainBlocker(s.structures.find((x) => x.id === req.target_structure_id), s.village),
    run: (ctx) => {
      const st = targetStructure(ctx, WEARING_KINDS);
      const blocker = maintainBlocker(st, ctx.v);
      ensure(!blocker, blocker ?? '');
      useStock(ctx, 'stone_stock', C.MAINTAIN_STONE, 'pierre');
      useStock(ctx, 'iron_stock', C.MAINTAIN_IRON, 'fer');
      const gain = Math.max(1, Math.round(C.MAINTAIN_POINTS * factor(ctx, 'civil_eng')));
      st.condition_pct = Math.min(100, st.condition_pct + gain);
      return `Entretien de ${st.name} : état ${st.condition_pct} % (+${gain}).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'upgrade_building', label: 'Améliorer une bâtisse (niveau)', description: 'Logement, gîte ou nouveau bâtiment : +2 lits ou +50 % de production, meilleure isolation, usure plus lente ; accord PLU requis.', anyone: true, apCost: 1, physical: true, requiresPlu: true, ecoSensitive: true, pole: 'civil_eng', target: 'structure',
    cost: (s, req) => {
      const st = s.structures.find((x) => x.id === req.target_structure_id);
      return (st && nextUpgrade(st)?.price_eur) ?? 0;
    },
    precheck: (s, req) => upgradeBlocker(s.structures.find((x) => x.id === req.target_structure_id), s.village),
    run: (ctx) => {
      const st = targetStructure(ctx, UPGRADABLE_KINDS);
      const blocker = upgradeBlocker(st, ctx.v);
      ensure(!blocker, blocker ?? '');
      const next = nextUpgrade(st)!;
      const gains = upgradeGains(st);
      useStock(ctx, 'stone_stock', next.stone, 'pierre');
      useStock(ctx, 'iron_stock', next.iron, 'fer');
      useStock(ctx, 'wood_stock', next.wood, 'bois');
      spendTreasury(ctx, next.price_eur, `Amélioration niveau ${next.level} — ${st.name}`, 'construction', 'BigMat');
      const level = asAction(() => applyUpgrade(st));
      pushEvent(ctx.fx, ctx.s, {
        event_type: 'building_upgraded',
        title: 'Bâtisse améliorée',
        body: `${ctx.actor.display_name} fait passer « ${st.name} » au niveau ${level} : ${gains.join(', ')}.`,
        data: { structure_id: st.id, level },
      });
      return `${st.name} passe au niveau ${level} : ${gains.join(', ')}.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'train_apprentice', label: 'Former un apprenti', description: 'Enfant de 12 ans et plus : forge (Julio), maçonnerie (Tiphaine) ou laboratoire (Tanguy).', roles: ['smith_diplo', 'civil_eng', 'druid'], apCost: 1, target: 'child',
    run: (ctx) => {
      const c = targetChild(ctx);
      ensure(c.status === 'child' && c.age_years >= C.APPRENTICE_MIN_AGE, 'L\'enfant doit avoir au moins 12 ans et ne pas être déjà en formation.');
      const track = ({ smith_diplo: 'apprentice_forge', civil_eng: 'apprentice_masonry', druid: 'apprentice_lab' } as const)[
        ctx.holder.role_code as 'smith_diplo' | 'civil_eng' | 'druid'
      ];
      c.status = 'apprentice';
      c.education_track = track;
      c.mentor_player_id = ctx.holder.id;
      c.track_started_season = ctx.v.season_number;
      return `${c.full_name} entre en apprentissage auprès de ${ctx.holder.display_name}.`;
    },
  },

  // ======================= ELY — Maire, Agriculture & Écologie =======================
  {
    code: 'garden_tend', label: 'Entretenir le potager', description: 'Récolte immédiate selon saison, eau et productivité.', roles: ['mayor_agri'], apCost: 1, physical: true, pole: 'mayor_agri', target: 'none',
    run: (ctx) => {
      const p = localParts(ctx.now);
      const season = calendarSeasonOf(p.month, p.day);
      const base = (ctx.v.garden_area_m2 / 100) * C.GARDEN_BASE_RATIONS_PER_100M2 * C.SEASON_HARVEST_COEFF[season];
      const harvest = money(base * factor(ctx));
      const tomatoes = stock(harvest * C.TOMATO_SHARE[season] * C.TOMATO_KG_PER_RATION);
      ctx.v.food_rations = money(ctx.v.food_rations + harvest);
      ctx.v.tomatoes_stock = stock(ctx.v.tomatoes_stock + tomatoes);
      ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct + 0.5);
      return `Récolte : +${harvest} rations, +${tomatoes} kg de tomates.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'expand_garden', label: 'Agrandir le potager (+100 m²)', description: '150 € de semences et compost.', roles: ['mayor_agri', 'smith_diplo'], apCost: 1, physical: true, target: 'none',
    run: (ctx) => {
      ensure(ctx.v.garden_area_m2 < 2000, 'Le potager a atteint sa taille maximale (2 000 m²).');
      spendTreasury(ctx, 150, 'Semences & compost', 'agriculture');
      ctx.v.garden_area_m2 += 100;
      return `Potager étendu à ${ctx.v.garden_area_m2} m² (besoin d'irrigation accru).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'build_livestock_pen', label: 'Construire l\'enclos (Cleda)', description: 'Chantier de l\'enclos pastoral (350 € par séance).', roles: ['mayor_agri', 'smith_diplo', 'civil_eng'], apCost: 1, physical: true, requiresPlu: true, ecoSensitive: true, target: 'structure',
    cost: () => 350,
    run: (ctx) => {
      const st = targetStructure(ctx, ['livestock_pen']);
      ensure(st.status !== 'operational', 'L\'enclos est déjà opérationnel.');
      useStock(ctx, 'wood_stock', 8, 'bois');
      spendTreasury(ctx, 350, 'Clôtures & abreuvoirs', 'construction', 'Gedimat');
      const gain = progressStructure(ctx, st, 34, 'mayor_agri');
      return `Enclos : +${gain} % (avancement ${st.progress_pct} %).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'buy_livestock', label: 'Acheter du bétail (foire de Lleida)', description: 'Brebis & cochons (140 €/tête) ; enclos requis.', roles: ['mayor_agri', 'smith_diplo'], apCost: 1, target: 'none',
    cost: (_s, req) => C.LIVESTOCK_PRICE_EUR * Math.max(1, Math.min(20, Math.floor(num(req.quantity, 1)))),
    run: (ctx) => {
      ensure(isOperational(ctx.s, 'cleda'), 'Construisez d\'abord l\'enclos (Cleda).');
      const qty = Math.max(1, Math.min(20, Math.floor(num(ctx.req.quantity, 1))));
      ensure(ctx.v.livestock_count + qty <= C.LIVESTOCK_PEN_CAPACITY, 'L\'enclos est plein.');
      spendTreasury(ctx, C.LIVESTOCK_PRICE_EUR * qty, `Achat de ${qty} tête(s) de bétail`, 'livestock', 'Fira de Lleida');
      ctx.v.livestock_count += qty;
      return `${qty} bête(s) rejoignent la Cleda (cheptel : ${ctx.v.livestock_count}).`;
    },
  },
  {
    code: 'livestock_care', label: 'Soigner le cheptel', description: 'Laitages et œufs : rations, biodiversité +1.', roles: ['mayor_agri', 'smith_diplo'], apCost: 1, pole: 'mayor_agri', target: 'none',
    run: (ctx) => {
      ensure(ctx.v.livestock_count > 0, 'Aucun animal à soigner.');
      const gain = money(ctx.v.livestock_count * 0.3 * factor(ctx));
      ctx.v.food_rations = money(ctx.v.food_rations + gain);
      ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct + 1);
      return `Traite et soins : +${gain} rations.`;
    },
  },
  {
    code: 'forest_patrol', label: 'Surveiller les parcelles forestières', description: 'Détruit les cultures clandestines (stupéfiants −3 %).', roles: ['mayor_agri'], apCost: 1, physical: true, target: 'none',
    run: (ctx) => {
      ctx.v.drug_prevalence_pct = gauge(ctx.v.drug_prevalence_pct - 3);
      ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct + 1);
      ctx.v.perimeter_threat_pct = gauge(ctx.v.perimeter_threat_pct - 3);
      return `Ronde forestière : quelques plants suspects arrachés.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'family_allowance', label: 'Verser les allocations familiales', description: '150 € par foyer avec enfants : moral +3, natalité +10 % cette saison.', roles: ['mayor_agri'], apCost: 1, target: 'none',
    cost: (s) => 150 * Math.max(1, new Set(s.children.filter((c) => c.status !== 'departed').map((c) => c.parent_migrant_id ?? c.parent_player_id ?? c.parent_summary)).size),
    run: (ctx) => {
      ensure(ctx.v.family_allowance_season !== ctx.v.season_number, 'Allocations déjà versées cette saison.');
      const households = Math.max(1, new Set(ctx.s.children.filter((c) => c.status !== 'departed').map((c) => c.parent_migrant_id ?? c.parent_player_id ?? c.parent_summary)).size);
      spendTreasury(ctx, 150 * households, `Allocations familiales (${households} foyer(s))`, 'social');
      ctx.v.family_allowance_season = ctx.v.season_number;
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + 3);
      return `Allocations versées à ${households} foyer(s).`;
    },
  },
  {
    code: 'eco_veto', label: 'Veto écologique', description: 'Suspend un chantier menaçant la faune locale (motif obligatoire).', roles: ['mayor_agri'], apCost: 0, delegable: false, target: 'structure',
    run: (ctx) => {
      const st = targetStructure(ctx);
      ensure(!st.eco_veto_active, 'Ce chantier est déjà sous veto écologique.');
      ensure(st.status !== 'operational' && st.status !== 'demolished', 'Le veto ne vise que les chantiers en cours ou projetés.');
      const reason = String(ctx.req.params?.reason ?? '').trim();
      ensure(reason.length >= 10, 'Motivez votre veto (10 caractères minimum).');
      st.eco_veto_active = true;
      pushEvent(ctx.fx, ctx.s, { event_type: 'eco_veto', title: 'Veto écologique', body: `Ely suspend « ${st.name} » : ${reason}`, data: { structure_id: st.id } });
      return `Chantier « ${st.name} » suspendu pour protéger la faune.`;
    },
  },
  {
    code: 'lift_eco_veto', label: 'Lever le veto écologique', description: 'Autorise la reprise du chantier.', roles: ['mayor_agri'], apCost: 0, delegable: false, target: 'structure',
    run: (ctx) => {
      const st = targetStructure(ctx);
      ensure(st.eco_veto_active, 'Aucun veto sur cet ouvrage.');
      st.eco_veto_active = false;
      return `Le chantier « ${st.name} » peut reprendre.`;
    },
  },
  {
    code: 'diplomacy_ayuntamiento', label: 'Négocier à l\'Ayuntamiento', description: 'Diplomatie extérieure (avec Julio) : pression administrative −8 % si succès.', roles: ['mayor_agri', 'smith_diplo'], apCost: 1, target: 'none',
    run: (ctx) => {
      const r = negotiation(ctx, 40);
      if (r.success) {
        ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 8);
        const g = adjustNeighbor(ctx.v, 'ayuntamiento', C.NEIGHBOR_DIPLOMACY_GAIN);
        return `« Molt bé ! » L’Ayuntamiento se montre conciliant : pression administrative −8 %, relation avec la mairie ${Math.round(g)}/100.`;
      }
      if (r.quiproquo) {
        spendTreasury(ctx, Math.min(150, ctx.v.treasury_eur), 'Amende administrative (quiproquo)', 'fine');
        ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct + 5);
        adjustNeighbor(ctx.v, 'ayuntamiento', -3);
        return '« ¿Perdone? » Quiproquo linguistique : amende de 150 € et dossier rouvert.';
      }
      return 'Le fonctionnaire est en pause café jusqu\'à nouvel ordre.';
    },
  },

  // ======================= GUILLEM / M. LERME — Trésorier & Kiné =======================
  {
    code: 'treat_muscular', label: 'Soigner une blessure musculo-squelettique', description: 'Guérit une blessure musculaire (joueur ou résident).', roles: ['treasurer_physio'], apCost: 1, target: 'person',
    run: (ctx) => {
      const t = targetPerson(ctx);
      ensure(t.injury_type === 'muscular', 'Aucune blessure musculaire à soigner.');
      healInjury(t, 15);
      if ('loyalty_scores' in t) adjustLoyalty(t, 'treasurer_physio', 15);
      const name = 'display_name' in t ? t.display_name : t.full_name;
      return `Séance de kiné : ${name} est remis(e) sur pied.`;
    },
  },
  {
    code: 'preventive_strapping', label: 'Strapping préventif', description: 'Risque de blessure divisé par deux pendant 3 jours.', roles: ['treasurer_physio'], apCost: 1, target: 'player',
    run: (ctx) => {
      const t = targetPlayer(ctx);
      t.strapping_until = addDays(ctx.now, C.STRAPPING_DAYS).toISOString();
      return `${t.display_name} est strappé(e) pour 3 jours.`;
    },
  },
  {
    code: 'screen_migrant_physical', label: 'Ausculter un candidat (force & dos)', description: 'Révèle la force réelle et la fragilité lombaire.', roles: ['treasurer_physio'], apCost: 1, target: 'migrant',
    run: (ctx) => {
      const m = targetMigrant(ctx, ['candidate', 'accepted']);
      ctx.fx.screenings.push({
        migrant_id: m.id,
        screened_by: ctx.actor.id,
        screening_type: 'physical',
        findings: {
          physical_strength: m.physical_strength,
          back_fragility: m.back_fragility,
          injury_risk_pct: injuryRiskPct({ addiction_level_pct: m.addiction_level_pct, back_fragility: m.back_fragility, fatigue_pct: 20 }, ctx.v, ctx.now),
        },
      });
      adjustLoyalty(m, 'treasurer_physio', 5);
      return `Auscultation de ${m.full_name} consignée dans votre dossier confidentiel.`;
    },
  },
  {
    code: 'financial_audit', label: 'Audit financier complet', description: 'Récupère 50 % des fuites de caisse ; pression administrative −3 %.', roles: ['treasurer_physio'], apCost: 1, target: 'none',
    run: (ctx) => {
      const recovered = money(ctx.v.treasury_leak_eur * 0.5);
      gainTreasury(ctx, recovered, 'Fonds récupérés après audit', 'audit');
      const leak = ctx.v.treasury_leak_eur;
      ctx.v.treasury_leak_eur = 0;
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 3);
      return leak > 0
        ? `Audit : ${leak.toFixed(2)} € de ponctions occultes détectées, ${recovered.toFixed(2)} € récupérés.`
        : 'Audit : comptes en ordre. Rien à signaler.';
    },
  },
  {
    code: 'pay_land_debt', label: 'Remboursement anticipé de la dette', description: 'Verse un montant de la caisse sur l\'emprunt foncier.', roles: ['treasurer_physio'], apCost: 1, target: 'none',
    run: (ctx) => {
      const amount = money(Math.min(num(ctx.req.amount_eur, 0), ctx.v.land_debt_eur));
      ensure(amount >= 100, 'Montant minimal : 100 €.');
      spendTreasury(ctx, amount, 'Remboursement anticipé de l\'emprunt foncier', 'loan');
      ctx.v.land_debt_eur = money(ctx.v.land_debt_eur - amount);
      pushLedger(ctx.fx, ctx.s, { account: 'land_debt', amount_eur: -amount, label: 'Remboursement anticipé', category: 'loan', created_by: ctx.actor.id });
      return `Dette foncière ramenée à ${ctx.v.land_debt_eur.toFixed(2)} €.`;
    },
  },
  {
    code: 'transfer_sovereign_fund', label: 'Mouvement du fonds souverain', description: 'Montant positif : abonde le fonds ; négatif : rapatrie vers la caisse.', roles: ['treasurer_physio'], apCost: 0, target: 'none',
    run: (ctx) => {
      const amount = money(num(ctx.req.amount_eur, 0));
      ensure(amount !== 0, 'Montant requis.');
      if (amount > 0) {
        spendTreasury(ctx, amount, 'Abondement du fonds souverain', 'sovereign_fund');
        ctx.v.sovereign_fund_eur = money(ctx.v.sovereign_fund_eur + amount);
      } else {
        ensure(ctx.v.sovereign_fund_eur >= -amount, 'Fonds souverain insuffisant.');
        ctx.v.sovereign_fund_eur = money(ctx.v.sovereign_fund_eur + amount);
        gainTreasury(ctx, -amount, 'Rapatriement depuis le fonds souverain', 'sovereign_fund');
      }
      pushLedger(ctx.fx, ctx.s, { account: 'sovereign_fund', amount_eur: amount, label: 'Mouvement du fonds souverain', category: 'sovereign_fund', created_by: ctx.actor.id });
      return `Fonds souverain : ${ctx.v.sovereign_fund_eur.toFixed(2)} €.`;
    },
  },
  {
    code: 'buy_etf', label: 'Placer le fonds sur un ETF', description: `Achète des parts d’un ETF (Monde, S&P 500, Nasdaq 100, CAC 40, émergents, Europe) avec les liquidités du fonds souverain, au dernier cours relevé la nuit. Frais : ${C.ETF_FEE_PCT} % (min. ${C.ETF_FEE_MIN_EUR} €). Les cours suivent les vrais marchés : la valeur peut baisser.`, roles: ['treasurer_physio'], apCost: 0, delegable: false, target: 'none',
    precheck: (s, req) => buyBlocker(s, req.params?.etf, req.amount_eur),
    run: (ctx) => {
      const r = asAction(() => buyEtf(ctx.s, ctx.fx, ctx.actor, ctx.req.params?.etf, ctx.req.amount_eur, dayKeyOf(ctx.now)));
      return `${r.def.icon} ${r.shares} parts ${r.def.label} achetées à ${r.price.toFixed(2)} € (frais ${r.fee.toFixed(2)} €). Liquidités du fonds : ${ctx.v.sovereign_fund_eur.toFixed(2)} €.`;
    },
  },
  {
    code: 'sell_etf', label: 'Vendre des parts d’ETF', description: `Revend des parts d’un ETF du fonds souverain au dernier cours (montant vide = tout vendre) ; le produit revient aux liquidités du fonds. Frais : ${C.ETF_FEE_PCT} % (min. ${C.ETF_FEE_MIN_EUR} €).`, roles: ['treasurer_physio'], apCost: 0, delegable: false, target: 'none',
    precheck: (s, req) => sellBlocker(s, req.params?.etf, req.amount_eur),
    run: (ctx) => {
      const r = asAction(() => sellEtf(ctx.s, ctx.fx, ctx.actor, ctx.req.params?.etf, ctx.req.amount_eur, dayKeyOf(ctx.now)));
      return `${r.def.icon} Vente ${r.def.label} : ${r.proceeds.toFixed(2)} € au fonds (${r.gain >= 0 ? 'plus' : 'moins'}-value ${r.gain.toFixed(2)} €).`;
    },
  },
  {
    code: 'set_carlage_fee', label: 'Fixer la Franchise Carlage', description: 'Montant payé par tout blessé du Carlage (0 à 500 €).', roles: ['treasurer_physio'], apCost: 0, delegable: false, target: 'none',
    run: (ctx) => {
      const fee = money(clamp(num(ctx.req.amount_eur, 50), 0, 500));
      ctx.v.carlage_injury_fee_eur = fee;
      return `Franchise Carlage fixée à ${fee} €.`;
    },
  },
  {
    code: 'open_gite', label: 'Ouvrir le gîte rural', description: 'Mas de l\'Era rénové et raccordé : +800 à +2 500 €/semaine.', roles: ['treasurer_physio'], apCost: 1, target: 'none',
    run: (ctx) => {
      ensure(!ctx.v.gite_open, 'Le gîte est déjà ouvert.');
      ensure(isOperational(ctx.s, 'mas_era'), 'Le Mas de l\'Era doit être rénové et raccordé.');
      ctx.v.gite_open = true;
      pushEvent(ctx.fx, ctx.s, { event_type: 'gite_opened', title: 'Ouverture du gîte', body: 'Randonneurs et fans des BOR sont les bienvenus au Mas de l\'Era.' });
      return 'Le gîte rural ouvre ses portes.';
    },
  },
  {
    code: 'close_gite', label: 'Fermer le gîte rural', description: 'Stoppe recettes et nuisances.', roles: ['treasurer_physio'], apCost: 0, target: 'none',
    run: (ctx) => {
      ensure(ctx.v.gite_open, 'Le gîte est déjà fermé.');
      ctx.v.gite_open = false;
      return 'Le gîte ferme ses volets.';
    },
  },
  {
    code: 'andorra_fiscal_scheme', label: 'Montage fiscal andorran', description: 'Optimisation (+600 €, pression −5 %) ; risque de contrôle approfondi.', roles: ['treasurer_physio'], portfolio: 'chancery', apCost: 1, minAct: 2, target: 'none',
    run: (ctx) => {
      const chancery = ctx.s.players.some((p) => p.ministerial_portfolios.includes('chancery') && p.status === 'active');
      if (ctx.rng.chance(chancery ? 10 : 20)) {
        spendTreasury(ctx, Math.min(2000, ctx.v.treasury_eur), 'Redressement fiscal (Agencia Tributaria)', 'fine');
        ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct + 15);
        return 'L\'Agencia Tributaria flaire le montage : redressement de 2 000 €.';
      }
      gainTreasury(ctx, 600, 'Optimisation fiscale andorrane', 'tax');
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 5);
      return 'Montage validé par un cabinet d\'Andorra la Vella : +600 €.';
    },
  },

  // ======================= TIPHAINE — Architecte, Génie civil, PLU & Énergie =======================
  {
    code: 'clear_rubble', label: 'Déblayer les gravats', description: 'Récupère de la pierre et réduit les refuges du marché noir.', roles: ['civil_eng', 'water_eng', 'smith_diplo'], apCost: 1, physical: true, pole: 'civil_eng', target: 'structure',
    run: (ctx) => {
      const st = targetStructure(ctx, BUILDING_KINDS);
      ensure(st.status === 'ruin', 'Seule une ruine peut être déblayée.');
      const stone = Math.round(6 * factor(ctx));
      ctx.v.stone_stock += stone;
      st.status = 'cleared';
      st.condition_pct = Math.min(100, st.condition_pct + 5);
      return `Gravats évacués à ${st.name} : +${stone} pierres.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'demolish_building', label: 'Démolir une bâtisse', description: 'Accord PLU requis ; récupère de la pierre.', roles: ['civil_eng'], apCost: 1, physical: true, requiresPlu: true, ecoSensitive: true, target: 'structure',
    run: (ctx) => {
      const st = targetStructure(ctx, BUILDING_KINDS);
      ensure(st.status !== 'demolished', 'Déjà démolie.');
      st.status = 'demolished';
      st.beds_capacity = 0;
      ctx.v.stone_stock += 10;
      return `${st.name} est rasée. +10 pierres.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'connect_power', label: 'Raccorder au réseau électrique', description: 'Valide le raccordement d\'un ouvrage (palier ≥ 2) ; 120 € de câbles.', roles: ['civil_eng'], apCost: 1, target: 'structure',
    run: (ctx) => {
      const st = targetStructure(ctx);
      ensure(!st.is_power_connected, 'Déjà raccordé.');
      const selfProducing = st.kind === 'dam' || st.kind === 'solar';
      ensure(selfProducing || ctx.v.energy_tier >= 2, 'Aucune source électrique : installez d\'abord le groupe électrogène.');
      spendTreasury(ctx, 120, `Câblage — ${st.name}`, 'energy', 'Gedimat');
      st.is_power_connected = true;
      if (st.status === 'awaiting_power') st.status = 'operational';
      if (selfProducing && st.status === 'operational' && ctx.v.energy_tier < 4) ctx.v.energy_tier = 4;
      if (st.kind === 'mining_farm' && st.status === 'operational') ctx.v.crypto_mining_active = ctx.v.energy_tier >= 4;
      return `« ${st.name} » est raccordé${st.status === 'operational' ? ' et livré' : ''}.`;
    },
  },
  {
    code: 'install_generator', label: 'Installer le groupe électrogène (palier 2)', description: '2 800 € (groupe + cuve + 100 L) ; dégrade l\'écologie.', roles: ['civil_eng', 'water_eng'], apCost: 1, requiresPlu: true, target: 'structure',
    cost: () => 2800,
    run: (ctx) => {
      ensure(ctx.v.energy_tier === 1, 'Le hameau dispose déjà d\'une source d\'électricité.');
      const st = targetStructure(ctx, ['generator']);
      spendTreasury(ctx, 2800, 'Groupe électrogène 20 kVA + cuve', 'energy', 'Loxam');
      st.status = 'operational';
      st.progress_pct = 100;
      st.is_power_connected = true;
      ctx.v.energy_tier = 2;
      ctx.v.fuel_stock_l += 100;
      ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct - 3);
      pushEvent(ctx.fx, ctx.s, { event_type: 'energy_tier', title: 'Palier 2 : Groupe électrogène', body: 'Fini les bougies : le groupe ronronne (et fume).' });
      return 'Le groupe électrogène démarre au troisième coup de lanceur.';
    },
  },
  {
    code: 'build_power_line', label: 'Raccordement au réseau aérien (palier 3)', description: '1 500 € par séance ; bloqué si pression administrative ≥ 60 %.', roles: ['civil_eng'], apCost: 1, requiresPlu: true, ecoSensitive: true, target: 'structure',
    cost: () => 1500,
    run: (ctx) => {
      const st = targetStructure(ctx, ['power_line']);
      ensure(ctx.v.energy_tier < 3, 'Le réseau aérien est déjà en service.');
      ensure(ctx.v.admin_pressure_pct < 60, 'Dossier bloqué par l\'administration (pression ≥ 60 %).');
      spendTreasury(ctx, 1500, 'Raccordement Endesa — poteaux & câbles', 'energy');
      st.progress_pct = Math.min(100, st.progress_pct + Math.max(1, Math.round(20 * factor(ctx))));
      st.status = st.progress_pct >= 100 ? 'operational' : 'in_progress';
      if (st.status === 'operational') {
        st.is_power_connected = true;
        ctx.v.energy_tier = Math.max(ctx.v.energy_tier, 3);
        pushEvent(ctx.fx, ctx.s, { event_type: 'energy_tier', title: 'Palier 3 : Réseau aérien', body: 'Le hameau est raccordé au réseau électrique.' });
      }
      return `Ligne aérienne : ${st.progress_pct} %.`;
    },
  },
  {
    code: 'install_meters', label: 'Poser les compteurs individuels', description: 'Facturation de l\'énergie au prorata réel (450 €).', roles: ['civil_eng'], apCost: 1, target: 'none',
    run: (ctx) => {
      ensure(ctx.v.energy_tier >= 2, 'Pas d\'électricité à compter.');
      ensure(!ctx.v.power_meters_installed, 'Compteurs déjà posés.');
      spendTreasury(ctx, 450, 'Compteurs individuels', 'energy', 'Gedimat');
      ctx.v.power_meters_installed = true;
      return 'Chacun paiera désormais sa propre consommation.';
    },
  },
  {
    code: 'plu_inspection', label: 'Contrôle de conformité cadastrale', description: 'Pression administrative −4 %.', roles: ['civil_eng'], apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 4);
      return 'Le cadastre est à jour : l\'Ayuntamiento n\'a rien à redire.';
    },
  },
  {
    code: 'build_solar', label: 'Chantier du champ solaire (palier 4)', description: '3 000 € par séance (Acte II).', roles: ['civil_eng', 'water_eng'], apCost: 1, minAct: 2, physical: true, requiresPlu: true, ecoSensitive: true, target: 'structure',
    cost: () => 3000,
    run: (ctx) => {
      const st = targetStructure(ctx, ['solar']);
      ensure(st.status !== 'operational', 'Champ solaire déjà en service.');
      spendTreasury(ctx, 3000, 'Panneaux photovoltaïques & onduleurs', 'energy');
      const gain = progressStructure(ctx, st, 25, 'civil_eng');
      return `Champ solaire : +${gain} % (${st.progress_pct} %).${physicalRisk(ctx)}`;
    },
  },

  // ======================= ALEX — Ingénieur polyvalent =======================
  {
    code: 'survey_land', label: 'Cartographier les 30 ha & cours d\'eau', description: 'Prérequis au barrage ; révèle les risques de crue.', roles: ['water_eng'], apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.land_surveyed = true;
      return 'Relevés topographiques terminés : le site du barrage est identifié.';
    },
  },
  {
    code: 'lay_pipes', label: 'Poser des canalisations (PEHD)', description: '+800 L/jour de capacité ; 800 € de tubes.', roles: ['water_eng'], apCost: 1, physical: true, requiresPlu: true, ecoSensitive: true, pole: 'water_eng', target: 'structure',
    cost: () => 800,
    run: (ctx) => {
      const st = targetStructure(ctx, ['pipe']);
      spendTreasury(ctx, 800, 'Tubes PEHD & raccords', 'water', 'Gedimat');
      const added = Math.round(800 * factor(ctx));
      ctx.v.water_capacity_l_day += added;
      ctx.v.water_network_condition_pct = gauge(ctx.v.water_network_condition_pct + 5);
      st.condition_pct = Math.round(ctx.v.water_network_condition_pct);
      return `Réseau étendu : +${added} L/jour (capacité ${ctx.v.water_capacity_l_day} L).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'repair_pipes', label: 'Inspecter & réparer le réseau d\'eau', description: 'État +25 %, détecte et déjoue les sabotages.', roles: ['water_eng'], apCost: 1, physical: true, pole: 'water_eng', target: 'none',
    run: (ctx) => {
      spendTreasury(ctx, 120, 'Pièces de plomberie', 'water');
      const sabotage = ctx.v.sabotage_pending;
      ctx.v.sabotage_pending = false;
      ctx.v.water_network_condition_pct = gauge(ctx.v.water_network_condition_pct + 25 * factor(ctx));
      const pipe = structureByCode(ctx.s, 'conduite_principale');
      if (pipe) {
        pipe.leak_alert = false;
        pipe.condition_pct = Math.round(ctx.v.water_network_condition_pct);
      }
      return `${sabotage ? 'Sabotage déjoué de justesse ! ' : ''}Réseau à ${Math.round(ctx.v.water_network_condition_pct)} %.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'build_septic', label: 'Construire une fosse septique', description: '+6 personnes de capacité ; 1 200 €.', roles: ['water_eng'], apCost: 1, physical: true, requiresPlu: true, target: 'structure',
    cost: () => 1200,
    run: (ctx) => {
      const st = targetStructure(ctx, ['septic_tank']);
      spendTreasury(ctx, 1200, 'Fosse septique & épandage', 'water', 'BigMat');
      ctx.v.septic_capacity_people += 6;
      st.status = 'operational';
      return `Assainissement : capacité ${ctx.v.septic_capacity_people} personnes.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'build_dam', label: 'Chantier du micro-barrage (palier 4)', description: '2 500 € par séance ; débit réservé pour les poissons de Julio.', roles: ['water_eng', 'civil_eng'], apCost: 1, minAct: 2, physical: true, requiresPlu: true, ecoSensitive: true, pole: 'water_eng', target: 'structure',
    cost: () => 2500,
    run: (ctx) => {
      ensure(ctx.v.land_surveyed, 'Cartographiez d\'abord les cours d\'eau.');
      const st = targetStructure(ctx, ['dam']);
      ensure(st.status !== 'operational', 'Le barrage est déjà en service.');
      useStock(ctx, 'stone_stock', 10, 'pierre');
      useStock(ctx, 'iron_stock', 5, 'fer');
      spendTreasury(ctx, 2500, 'Turbine & génie civil du micro-barrage', 'energy');
      const gain = progressStructure(ctx, st, 8, 'water_eng');
      ctx.v.dam_progress_pct = st.progress_pct;
      ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct - 2);
      return `Barrage : +${gain} % (${st.progress_pct} %).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'connect_mining_farm', label: 'Ferme de minage crypto (Acte III)', description: '4 000 € de matériel ; surplus hydroélectrique requis.', roles: ['water_eng'], apCost: 1, minAct: 3, requiresPlu: true, target: 'structure',
    cost: () => 4000,
    run: (ctx) => {
      const st = targetStructure(ctx, ['mining_farm']);
      ensure(ctx.v.energy_tier >= 4, 'Pas de surplus électrique (barrage ou solaire requis).');
      ensure(!ctx.v.crypto_mining_active, 'La ferme tourne déjà.');
      spendTreasury(ctx, 4000, 'Serveurs de calcul', 'crypto');
      st.progress_pct = 100;
      st.status = st.is_power_connected ? 'operational' : 'awaiting_power';
      ctx.v.crypto_mining_active = st.status === 'operational';
      return st.status === 'operational' ? 'Les serveurs chauffent la grange : minage lancé.' : 'Serveurs installés : Tiphaine doit valider le raccordement.';
    },
  },
  {
    code: 'repair_machinery', label: 'Réparer engins & pompes', description: 'Usure flotte −15 %, usure outils −10 %.', roles: ['water_eng', 'smith_diplo', 'transport_customs'], apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.fleet_wear_pct = gauge(ctx.v.fleet_wear_pct - 15);
      ctx.v.tools_wear_pct = gauge(ctx.v.tools_wear_pct - 10);
      return 'Graissage, joints neufs, et le tracteur redémarre.';
    },
  },
  {
    code: 'track_maintenance', label: 'Empierrer la piste forestière', description: 'Piste +6 % × productivité (5 pierres).', roles: ['water_eng', 'civil_eng', 'transport_customs'], portfolio: 'customs', apCost: 1, physical: true, ecoSensitive: true, pole: 'water_eng', target: 'none',
    run: (ctx) => {
      const track = structureByCodeOrFail(ctx, 'piste');
      ensure(!track.eco_veto_active, 'Veto écologique sur la piste.');
      useStock(ctx, 'stone_stock', 5, 'pierre');
      ctx.v.track_condition_pct = gauge(ctx.v.track_condition_pct + 6 * factor(ctx));
      track.condition_pct = Math.round(ctx.v.track_condition_pct);
      return `Piste à ${Math.round(ctx.v.track_condition_pct)} %.${physicalRisk(ctx)}`;
    },
  },

  // ======================= JULIO — Forgeron, Subsistance & Co-diplomate =======================
  {
    code: 'forge_tools', label: 'Forger des outils', description: '3 fers → outils (selon productivité).', roles: ['smith_diplo'], apCost: 1, physical: true, pole: 'smith_diplo', target: 'none',
    run: (ctx) => {
      ensure(isOperational(ctx.s, 'cal_ferrer'), 'La forge est hors service.');
      useStock(ctx, 'iron_stock', C.IRON_PER_TOOL, 'fer');
      const batch = Math.max(1, Math.round(1.5 * factor(ctx)));
      // Niveau 4 de Julio (V5.2) : fournée double
      const tools = ctx.actor.role_code === 'smith_diplo' && skillLevel(ctx.actor.skill_xp) >= C.SKILL_FORGE_DOUBLE_LEVEL ? batch * 2 : batch;
      ctx.v.tools_stock += tools;
      return `Clang ! +${tools} outil(s) (stock : ${ctx.v.tools_stock}).${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'recycle_scrap', label: 'Recycler la ferraille', description: '4 ferrailles → 2 fers.', roles: ['smith_diplo'], apCost: 1, target: 'none',
    run: (ctx) => {
      useStock(ctx, 'scrap_stock', 4, 'ferraille');
      ctx.v.iron_stock += 2;
      return 'La ferraille repart au creuset : +2 fers.';
    },
  },
  {
    code: 'forge_defense', label: 'Forger herses & équipements de garde', description: 'Sécurité +3, menace périmétrique −5 (5 fers).', roles: ['smith_diplo'], apCost: 1, minAct: 2, physical: true, target: 'none',
    run: (ctx) => {
      useStock(ctx, 'iron_stock', 5, 'fer');
      ctx.v.security_reduction_pct = gauge(ctx.v.security_reduction_pct + 3);
      ctx.v.perimeter_threat_pct = gauge(ctx.v.perimeter_threat_pct - 5);
      return `Pointes de herse et gourdins forgés.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'fish_hunt', label: 'Pêche & chasse', description: 'Rations selon la saison (respect du débit réservé).', roles: ['smith_diplo'], apCost: 1, physical: true, pole: 'smith_diplo', target: 'none',
    run: (ctx) => {
      const p = localParts(ctx.now);
      const season = calendarSeasonOf(p.month, p.day);
      const base = { winter: 6, spring: 10, summer: 12, autumn: 14 }[season];
      const rations = money(base * ctx.rng.float(0.7, 1.2) * factor(ctx));
      ctx.v.food_rations = money(ctx.v.food_rations + rations);
      ctx.v.ecology_index_pct = gauge(ctx.v.ecology_index_pct - 0.5);
      return `Truites et sanglier : +${rations} rations.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'butcher_livestock', label: 'Boucherie du cheptel', description: '1 bête → 25 rations.', roles: ['smith_diplo', 'mayor_agri'], apCost: 1, target: 'none',
    run: (ctx) => {
      ensure(ctx.v.livestock_count > 0, 'Pas de bétail.');
      ctx.v.livestock_count -= 1;
      ctx.v.food_rations = money(ctx.v.food_rations + 25);
      return 'Saucisses et côtelettes : +25 rations.';
    },
  },
  {
    code: 'negotiate_spain_andorra', label: 'Négocier en Espagne / Andorre', description: 'Affaire conclue (+300 €, pression −3 %) ou quiproquo.', roles: ['smith_diplo', 'mayor_agri'], apCost: 1, target: 'none',
    run: (ctx) => {
      const r = negotiation(ctx, 45);
      if (r.success) {
        gainTreasury(ctx, 300, 'Négoce transfrontalier', 'trade');
        ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 3);
        return '« Tracte fet ! » +300 € et des contacts utiles.';
      }
      if (r.quiproquo) {
        spendTreasury(ctx, Math.min(200, ctx.v.treasury_eur), 'Quiproquo commercial', 'fine');
        return 'Malentendu sur les unités : 200 € envolés.';
      }
      return 'Pas d\'accord aujourd\'hui.';
    },
  },
  {
    code: 'banjo_evening', label: 'Soirée banjo', description: 'Moral +4 %, alcool +1 %.', roles: ['smith_diplo'], apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + 4);
      ctx.v.alcohol_consumption_pct = gauge(ctx.v.alcohol_consumption_pct + 1);
      return 'Julou fait chanter le hameau jusqu\'à minuit.';
    },
  },

  // ======================= TANGUY — Médecin-Druide & Scientifique =======================
  {
    code: 'treat_infectious', label: 'Soigner une maladie infectieuse', description: '1 remède ; guérit joueur ou résident.', roles: ['druid', 'priest_apoth'], apCost: 1, target: 'person',
    run: (ctx) => {
      const t = targetPerson(ctx);
      ensure(t.injury_type === 'infectious', 'Aucune infection à traiter.');
      useStock(ctx, 'medicine_stock', 1, 'remèdes');
      healInjury(t, 10);
      if ('loyalty_scores' in t) adjustLoyalty(t, ctx.holder.role_code, 15);
      return 'Décoction amère, guérison certaine.';
    },
  },
  {
    code: 'brew_remedies', label: 'Préparer remèdes & décoctions', description: 'Remèdes +3 × productivité.', roles: ['druid', 'priest_apoth'], apCost: 1, pole: 'druid', target: 'none',
    run: (ctx) => {
      const n = Math.max(1, Math.round(3 * factor(ctx)));
      ctx.v.medicine_stock += n;
      return `+${n} remèdes à l'apothicairerie.`;
    },
  },
  {
    code: 'analyze_water', label: 'Analyse physico-chimique de l\'eau', description: 'Traite l\'eau (+15 %) et stoppe une épidémie en incubation.', roles: ['druid'], apCost: 1, target: 'none',
    run: (ctx) => {
      const incubating = ctx.v.epidemic_incubation_days > 0;
      ctx.v.epidemic_incubation_days = 0;
      ctx.v.water_quality_pct = gauge(ctx.v.water_quality_pct + 15);
      return incubating ? 'Contamination détectée et traitée avant l\'épidémie !' : `Eau traitée : qualité ${Math.round(ctx.v.water_quality_pct)} %.`;
    },
  },
  {
    code: 'screen_migrant_medical', label: 'Dépister un candidat (pathologies & addictions)', description: 'Révèle pathologies et addictions avant le vote.', roles: ['druid'], apCost: 1, target: 'migrant',
    run: (ctx) => {
      const m = targetMigrant(ctx, ['candidate', 'accepted']);
      ctx.fx.screenings.push({
        migrant_id: m.id,
        screened_by: ctx.actor.id,
        screening_type: 'medical',
        findings: { pathology: m.pathology_note ?? 'RAS', addiction_level_pct: m.addiction_level_pct, health_pct: m.health_pct },
      });
      adjustLoyalty(m, 'druid', 5);
      return `Bilan sanguin de ${m.full_name} consigné.`;
    },
  },
  {
    code: 'dismantle_lab', label: 'Démanteler alambics & labos clandestins', description: 'Stupéfiants −6 %, alcool −3 %, insécurité −3.', roles: ['druid'], portfolio: 'interior', apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.drug_prevalence_pct = gauge(ctx.v.drug_prevalence_pct - 6);
      ctx.v.alcohol_consumption_pct = gauge(ctx.v.alcohol_consumption_pct - 3);
      ctx.v.insecurity_offset = money(ctx.v.insecurity_offset - 3);
      return 'Un alambic artisanal finit à la ferraille.';
    },
  },
  {
    code: 'withdrawal_cure', label: 'Cure de sevrage', description: 'Addiction −20 % (1 remède) ; binôme Tanguy & Brunel.', roles: ['druid', 'priest_apoth'], apCost: 1, target: 'person',
    run: (ctx) => {
      const t = targetPerson(ctx);
      useStock(ctx, 'medicine_stock', 1, 'remèdes');
      t.addiction_level_pct = gauge(t.addiction_level_pct - duoBoost(ctx, 20));
      if ('mental_health_pct' in t) t.mental_health_pct = Math.round(clamp(t.mental_health_pct + 5, 0, 100));
      if ('loyalty_scores' in t) adjustLoyalty(t, ctx.holder.role_code, 10);
      return 'Tisanes, marche en montagne et volonté : l\'addiction recule.';
    },
  },
  {
    code: 'rd_progress', label: 'R&D énergétique & dissuasion', description: 'Avancement secret ; à 100 % en Acte III : dissuasion +1.', roles: ['druid'], apCost: 1, pole: 'druid', target: 'none',
    run: (ctx) => {
      const gain = Math.max(1, Math.round(6 * factor(ctx)));
      ctx.v.rd_progress_pct = Math.min(100, ctx.v.rd_progress_pct + gain);
      if (ctx.v.rd_progress_pct >= 100 && ctx.v.act_number === 3 && ctx.v.deterrence_level < 5) {
        ctx.v.deterrence_level += 1;
        ctx.v.rd_progress_pct = 0;
        return `Prototype abouti : niveau de dissuasion ${ctx.v.deterrence_level}.`;
      }
      return `Carnet de laboratoire : R&D à ${ctx.v.rd_progress_pct} %.`;
    },
  },
  {
    code: 'build_microreactor', label: 'Micro-réacteur (palier 5)', description: 'Acte III, dissuasion ≥ 3 : 25 000 € ; scandale international.', roles: ['druid', 'civil_eng'], apCost: 1, minAct: 3, requiresPlu: true, ecoSensitive: true, target: 'structure',
    cost: () => 25000,
    run: (ctx) => {
      ensure(ctx.v.deterrence_level >= 3 && ctx.v.energy_tier === 4, 'Prérequis : palier 4 et dissuasion ≥ 3.');
      targetStructure(ctx, ['dam', 'solar', 'lab']);
      spendTreasury(ctx, 25000, 'Micro-réacteur (prototype)', 'energy');
      ctx.v.energy_tier = 5;
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct + 20);
      ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct + 10);
      pushEvent(ctx.fx, ctx.s, { event_type: 'energy_tier', title: 'Palier 5 : Nucléaire', body: 'Le Micro-État divise l\'atome. Madrid s\'étrangle.' });
      return 'Le micro-réacteur diverge. Le CSN demande des explications.';
    },
  },

  // ======================= BRUNEL — Apothicaire, Psychiatre & Prêtre =======================
  {
    code: 'sunday_mass', label: 'Messe dominicale', description: 'Dimanche : moral +12 % (réduit par la friction), tempère addictions et radicalité.', roles: ['priest_apoth'], apCost: 1, sundayOnly: true, delegable: false, target: 'none',
    run: (ctx) => {
      ensure(!ctx.v.mass_held_this_season, 'La messe a déjà été célébrée cette semaine.');
      const church = structureByCodeOrFail(ctx, 'esglesia');
      ensure(church.status !== 'ruin' && church.status !== 'demolished', 'L\'église est en ruine.');
      let gain = massMoraleGain(ctx.v);
      if (ctx.v.penance_required) {
        gain += C.PENANCE_EXTRA_MORALE;
        ctx.v.penance_required = false;
      }
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + gain);
      ctx.v.mass_held_this_season = true;
      ctx.v.brunel_reduction_pct = gauge(ctx.v.brunel_reduction_pct + 4);
      ctx.v.alcohol_consumption_pct = gauge(ctx.v.alcohol_consumption_pct - 2);
      if (ctx.v.left_wing_ideology_pct > 40) ctx.v.left_wing_ideology_pct = gauge(ctx.v.left_wing_ideology_pct - 1);
      for (const p of ctx.s.players) if (p.status === 'active') p.addiction_level_pct = gauge(p.addiction_level_pct - 2);
      return `Messe à Sant Climent : moral +${gain} %.`;
    },
  },
  {
    code: 'celebrate_marriage', label: 'Célébrer un mariage', description: 'Union officielle : natalité légitime +20 %, partage des indicateurs cachés entre époux.', roles: ['priest_apoth'], apCost: 1, delegable: false, target: 'none',
    run: (ctx) => {
      const params = ctx.req.params ?? {};
      const aPlayer = findPlayer(ctx.s, params.a_player as string | undefined);
      const aMigrant = findMigrant(ctx.s, params.a_migrant as string | undefined);
      const bPlayer = findPlayer(ctx.s, params.b_player as string | undefined);
      const bMigrant = findMigrant(ctx.s, params.b_migrant as string | undefined);
      ensure(Boolean(aPlayer) !== Boolean(aMigrant) && Boolean(bPlayer) !== Boolean(bMigrant), 'Désignez exactement deux époux.');
      const aId = aPlayer?.id ?? aMigrant!.id;
      const bId = bPlayer?.id ?? bMigrant!.id;
      ensure(aId !== bId, 'On ne s\'épouse pas soi-même.');
      for (const m of [aMigrant, bMigrant]) if (m) ensure(m.status === 'accepted', `${m.full_name} n'est pas résident(e).`);
      for (const p of [aPlayer, bPlayer]) if (p) ensure(p.status === 'active' && p.spouse_id === null, `${p.display_name} n'est pas libre.`);
      const married = (id: string) =>
        ctx.s.unions.some((u) => u.is_active && [u.partner_a_player_id, u.partner_a_migrant_id, u.partner_b_player_id, u.partner_b_migrant_id].includes(id));
      ensure(!married(aId) && !married(bId), 'L\'un des deux est déjà marié.');
      ctx.s.unions.push({
        id: ctx.rng.uuid(),
        partner_a_player_id: aPlayer?.id ?? null,
        partner_a_migrant_id: aMigrant?.id ?? null,
        partner_b_player_id: bPlayer?.id ?? null,
        partner_b_migrant_id: bMigrant?.id ?? null,
        celebrated_by: ctx.actor.id,
        celebrated_at: ctx.now.toISOString(),
        is_active: true,
      });
      if (aPlayer && bPlayer) {
        aPlayer.spouse_id = bPlayer.id;
        bPlayer.spouse_id = aPlayer.id;
      }
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + 4);
      const names = [aPlayer?.display_name ?? aMigrant!.full_name, bPlayer?.display_name ?? bMigrant!.full_name];
      pushEvent(ctx.fx, ctx.s, { event_type: 'marriage', title: 'Mariage à Sant Climent', body: `${names[0]} et ${names[1]} se sont dit oui.` });
      return `Vive les mariés : ${names.join(' & ')} !`;
    },
  },
  {
    code: 'hear_confession', label: 'Recueillir une confession', description: 'Culpabilité −40 % ; étouffe le scandale avant La Gazette.', roles: ['priest_apoth'], apCost: 1, delegable: false, target: 'player',
    run: (ctx) => {
      const t = targetPlayer(ctx, false);
      const pending = ctx.s.temptations.filter((x) => x.player_id === t.id && x.choice === 'yielded' && !x.confessed && !x.published);
      for (const temptation of pending) {
        temptation.confessed = true;
        temptation.confessed_at = ctx.now.toISOString();
      }
      t.temptation_guilt_pct = Math.round(clamp(t.temptation_guilt_pct - 40, 0, 100));
      t.mental_health_pct = Math.round(clamp(t.mental_health_pct + 5, 0, 100));
      return pending.length > 0
        ? `${t.display_name} s'est confessé(e) : ${pending.length} écart(s) ne paraîtront pas dans La Gazette.`
        : `${t.display_name} s'est confié(e). Rien de publiable.`;
    },
  },
  {
    code: 'therapy', label: 'Thérapie individuelle', description: 'Santé mentale +20 %, guérit les troubles psychologiques.', roles: ['priest_apoth'], apCost: 1, target: 'person',
    run: (ctx) => {
      const t = targetPerson(ctx);
      if ('mental_health_pct' in t) t.mental_health_pct = Math.round(clamp(t.mental_health_pct + duoBoost(ctx, 20), 0, 100));
      if (t.injury_type === 'psychological') healInjury(t, 0);
      if ('loyalty_scores' in t) adjustLoyalty(t, 'priest_apoth', 10);
      ctx.v.brunel_reduction_pct = gauge(ctx.v.brunel_reduction_pct + 1);
      return 'Séance sur le divan de la sacristie.';
    },
  },
  {
    code: 'mediation', label: 'Médiation interreligieuse & idéologique', description: 'Friction culturelle −8 %, gauche −2 % ; capacité d\'intégration +2.', roles: ['priest_apoth'], apCost: 1, target: 'none',
    run: (ctx) => {
      ctx.v.cultural_friction_pct = gauge(ctx.v.cultural_friction_pct - 8);
      if (ctx.v.left_wing_ideology_pct > 30) ctx.v.left_wing_ideology_pct = gauge(ctx.v.left_wing_ideology_pct - 2);
      ctx.v.mediations_this_season += 1;
      ctx.v.brunel_reduction_pct = gauge(ctx.v.brunel_reduction_pct + 2);
      return 'Thé, pain et dialogue sur la place : les tensions retombent.';
    },
  },
  {
    code: 'screen_migrant_psych', label: 'Entretien psychologique d\'un candidat', description: 'Révèle loyauté potentielle et sensibilité idéologique réelle.', roles: ['priest_apoth'], apCost: 1, target: 'migrant',
    run: (ctx) => {
      const m = targetMigrant(ctx, ['candidate', 'accepted']);
      ctx.fx.screenings.push({
        migrant_id: m.id,
        screened_by: ctx.actor.id,
        screening_type: 'psychological',
        findings: { real_left_wing_score: m.left_wing_score, faction_type: m.faction_type, hidden_risk: m.hidden_risk_note ?? 'RAS' },
      });
      adjustLoyalty(m, 'priest_apoth', 5);
      return `Entretien avec ${m.full_name} consigné sous le secret.`;
    },
  },

  // ======================= PORTEFEUILLE DÉFENSE (Acte II) =======================
  {
    code: 'guard_rounds', label: 'Tours de garde', description: 'Menace périmétrique −8, sécurité +4.', portfolio: 'defense', apCost: 1, minAct: 2, physical: true, target: 'none',
    run: (ctx) => {
      ensure(ctx.v.tools_stock > 0, 'Aucun équipement forgé pour la garde.');
      ctx.v.perimeter_threat_pct = gauge(ctx.v.perimeter_threat_pct - 8);
      ctx.v.security_reduction_pct = gauge(ctx.v.security_reduction_pct + 4);
      ctx.v.insecurity_offset = money(ctx.v.insecurity_offset - 2);
      return `Nuit de garde sans incident.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'build_watchtower', label: 'Poser mirador & herse', description: '400 € par séance ; chaque ouvrage réduit l\'insécurité de 3.', portfolio: 'defense', apCost: 1, minAct: 2, physical: true, requiresPlu: true, ecoSensitive: true, target: 'structure',
    cost: () => 400,
    run: (ctx) => {
      const st = targetStructure(ctx, ['watchtower', 'gate']);
      ensure(st.status !== 'operational', 'Ouvrage déjà en service.');
      useStock(ctx, 'wood_stock', 6, 'bois');
      spendTreasury(ctx, 400, `Matériaux — ${st.name}`, 'defense', 'Gedimat');
      const gain = progressStructure(ctx, st, 25, 'civil_eng');
      return `${st.name} : +${gain} %.${physicalRisk(ctx)}`;
    },
  },
  {
    code: 'repel_boars', label: 'Repousser les sangliers', description: 'Protège le potager (+3 rations sauvées).', portfolio: 'defense', apCost: 1, minAct: 2, target: 'none',
    run: (ctx) => {
      ctx.v.perimeter_threat_pct = gauge(ctx.v.perimeter_threat_pct - 3);
      ctx.v.food_rations = money(ctx.v.food_rations + 3);
      return 'Les sangliers repartent vers l\'Obaga.';
    },
  },

  // ======================= PORTEFEUILLE SÉCURITÉ INTÉRIEURE (Acte II) =======================
  {
    code: 'ruin_search', label: 'Perquisition des ruines', description: 'Saisit les stocks du marché noir (reversés à la caisse).', portfolio: 'interior', apCost: 1, minAct: 2, target: 'none',
    run: (ctx) => {
      if (!ctx.v.black_market_active) return 'Perquisition : quelques rats, aucune marchandise.';
      const seized = money(ctx.rng.int(200, 800));
      gainTreasury(ctx, seized, 'Saisies du marché noir', 'seizure');
      ctx.v.black_market_active = false;
      ctx.v.drug_prevalence_pct = gauge(ctx.v.drug_prevalence_pct - 5);
      ctx.v.insecurity_offset = money(ctx.v.insecurity_offset - 5);
      return `Réseau démantelé : ${seized} € de marchandises saisies.`;
    },
  },
  {
    code: 'dismantle_cell', label: 'Démanteler une cellule clandestine', description: 'Retourne ou isole un agitateur ; gauche −2 %.', portfolio: 'interior', apCost: 1, minAct: 2, target: 'migrant',
    run: (ctx) => {
      const m = targetMigrant(ctx, ['accepted', 'forced_labor']);
      ensure(m.faction_type === 'union_agitator' || m.faction_type === 'black_market', 'Ce résident n\'appartient à aucune cellule connue.');
      ctx.v.left_wing_ideology_pct = gauge(ctx.v.left_wing_ideology_pct - 2);
      if (ctx.rng.chance(50)) {
        m.faction_type = 'loyalist';
        return `${m.full_name} renonce à la cellule et rentre dans le rang.`;
      }
      m.is_detained_until = addHours(ctx.now, C.DETENTION_HOURS).toISOString();
      adjustLoyalty(m, ctx.holder.role_code, -20);
      return `${m.full_name} refuse de coopérer : 24 h de cachot.`;
    },
  },
  {
    code: 'detain_cachot', label: 'Mise au cachot (24 h)', description: 'Isolement d\'un joueur ou d\'un résident (cachot requis).', portfolio: 'interior', apCost: 1, minAct: 2, delegable: false, target: 'person',
    run: (ctx) => {
      ensure(isOperational(ctx.s, 'torre_vella'), 'Le cachot (Torre Vella) n\'est pas opérationnel.');
      const t = targetPerson(ctx);
      ensure(!('display_name' in t) || t.id !== ctx.actor.id, 'Impossible de vous isoler vous-même.');
      ensure(!isDetained(t, ctx.now), 'Déjà au cachot.');
      t.is_detained_until = addHours(ctx.now, C.DETENTION_HOURS).toISOString();
      if ('loyalty_scores' in t) adjustLoyalty(t, ctx.holder.role_code, -20);
      ctx.v.morale_pct = gauge(ctx.v.morale_pct - 2);
      const name = 'display_name' in t ? t.display_name : t.full_name;
      pushEvent(ctx.fx, ctx.s, { event_type: 'detention', title: 'Cachot', body: `${name} passe 24 h à la Torre Vella.` });
      return `${name} est placé(e) à l'isolement pour 24 h.`;
    },
  },

  // ======================= PORTEFEUILLE TRANSPORTS & DOUANES (Acte II) =======================
  {
    code: 'smuggling_run', label: 'Expédition nocturne de contrebande (Andorre)', description: '+1 500 à +6 000 € ; embuscade 25 à 45 %.', portfolio: 'customs', apCost: 1, minAct: 2, delegable: false, target: 'none',
    run: (ctx) => {
      const risk = smugglingRiskPct(ctx.v);
      ctx.v.smuggling_runs_this_season += 1;
      ctx.v.fleet_wear_pct = gauge(ctx.v.fleet_wear_pct + 5);
      if (ctx.rng.chance(risk)) {
        const fine = money(ctx.rng.int(1000, 3000));
        spendTreasury(ctx, Math.min(fine, ctx.v.treasury_eur), 'Amende douanière — saisie de contrebande', 'fine');
        ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct + 15);
        ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct - 5);
        ctx.v.customs_alert_pct = gauge(ctx.v.customs_alert_pct + 20);
        ctx.actor.is_detained_until = addHours(ctx.now, C.POLICE_CUSTODY_HOURS).toISOString();
        pushEvent(ctx.fx, ctx.s, { event_type: 'smuggling_caught', title: 'Embuscade de la Guardia Civil', body: `${ctx.actor.display_name} est en garde à vue ; cargaison saisie (${fine} € d'amende).` });
        return `Embuscade (risque ${risk} %) : garde à vue et ${fine} € d'amende.`;
      }
      const profit = money(ctx.rng.int(C.SMUGGLING_PROFIT_MIN, C.SMUGGLING_PROFIT_MAX));
      gainTreasury(ctx, profit, 'Négoce nocturne transfrontalier', 'smuggling');
      ctx.v.customs_alert_pct = gauge(ctx.v.customs_alert_pct + 8);
      ctx.v.alcohol_consumption_pct = gauge(ctx.v.alcohol_consumption_pct + 2);
      return `Retour à l'aube : +${profit} € de bénéfice net (risque encouru ${risk} %).`;
    },
  },
  {
    code: 'inspect_cargo', label: 'Contrôler les cargaisons entrantes', description: 'Stupéfiants −2 %, alerte douanière −5.', portfolio: 'customs', apCost: 1, minAct: 2, target: 'none',
    run: (ctx) => {
      ctx.v.drug_prevalence_pct = gauge(ctx.v.drug_prevalence_pct - 2);
      ctx.v.customs_alert_pct = gauge(ctx.v.customs_alert_pct - 5);
      ctx.v.insecurity_offset = money(ctx.v.insecurity_offset - 2);
      return 'Contrôle des camions : tout est (presque) en règle.';
    },
  },
  {
    code: 'vehicle_maintenance', label: 'Entretien de la flotte & déneigement', description: 'Usure flotte −15 % ; piste +5 % par temps de neige.', portfolio: 'customs', apCost: 1, minAct: 2, target: 'none',
    run: (ctx) => {
      ctx.v.fleet_wear_pct = gauge(ctx.v.fleet_wear_pct - 15);
      if (ctx.v.real_snow_cm > 0) ctx.v.track_condition_pct = gauge(ctx.v.track_condition_pct + 5);
      return 'Le 4x4 et le tracteur sont prêts à repartir.';
    },
  },
  {
    code: 'border_control', label: 'Tenir le poste-frontière', description: 'Acte III : contrôle des passeports, notoriété +2.', portfolio: 'customs', apCost: 1, minAct: 3, target: 'none',
    run: (ctx) => {
      ensure(isOperational(ctx.s, 'duana'), 'Le poste-frontière n\'est pas construit.');
      ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct + 2);
      ctx.v.perimeter_threat_pct = gauge(ctx.v.perimeter_threat_pct - 4);
      return 'Tampons officiels de la Principauté apposés sur trois passeports de randonneurs amusés.';
    },
  },

  // ======================= PORTEFEUILLE CHANCELLERIE (Acte III) =======================
  {
    code: 'legal_defense', label: 'Défendre un joueur interpellé', description: 'Libère un joueur en garde à vue ou au cachot.', portfolio: 'chancery', apCost: 1, minAct: 3, target: 'player',
    run: (ctx) => {
      const p = findPlayer(ctx.s, ctx.req.target_player_id);
      ensure(p && isDetained(p, ctx.now), 'Ce joueur n\'est pas détenu.');
      p.is_detained_until = null;
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 3);
      return `${p.display_name} est libéré(e) sur vice de procédure.`;
    },
  },
  {
    code: 'international_recognition', label: 'Démarche de reconnaissance internationale', description: 'Notoriété +4, sympathie européenne +2, agacement de Madrid.', portfolio: 'chancery', apCost: 1, minAct: 3, target: 'none',
    run: (ctx) => {
      ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct + 4);
      ctx.v.eu_sympathy_pct = gauge(ctx.v.eu_sympathy_pct + 2);
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct + 3);
      return 'Une lettre recommandée part pour Strasbourg.';
    },
  },

  // ======================= PORTEFEUILLE MÉDIAS (Acte III) =======================
  {
    code: 'editorial', label: 'Éditorial officiel de La Gazette', description: 'Sympathie européenne +3, notoriété +2.', portfolio: 'media', apCost: 1, minAct: 3, target: 'none',
    run: (ctx) => {
      ctx.v.eu_sympathy_pct = gauge(ctx.v.eu_sympathy_pct + 3);
      ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct + 2);
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + 1);
      return 'Éditorial publié : « Petit pays, grandes idées ».';
    },
  },
  {
    code: 'organize_banquet', label: 'Banquet dominical', description: '250 € : moral +5 %, alcool +3 %, −10 rations.', portfolio: 'media', apCost: 1, minAct: 3, target: 'none',
    run: (ctx) => {
      spendTreasury(ctx, 250, 'Banquet dominical', 'culture');
      ctx.v.food_rations = money(Math.max(0, ctx.v.food_rations - 10));
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + 5);
      ctx.v.alcohol_consumption_pct = gauge(ctx.v.alcohol_consumption_pct + 3);
      return 'Grande tablée sur la Plaça del Poble.';
    },
  },
  {
    code: 'bor_concert', label: 'Venue mensuelle des BOR', description: 'Moral +8 %, recettes du gîte, mais alcool et stupéfiants en hausse.', portfolio: 'media', apCost: 1, minAct: 3, target: 'none',
    run: (ctx) => {
      ensure(ctx.v.season_number - ctx.v.bor_concert_season >= 4, 'Les BOR ne viennent qu\'une fois par mois (4 saisons).');
      ctx.v.bor_concert_season = ctx.v.season_number;
      ctx.v.morale_pct = gauge(ctx.v.morale_pct + 8);
      ctx.v.drug_prevalence_pct = gauge(ctx.v.drug_prevalence_pct + 3);
      ctx.v.alcohol_consumption_pct = gauge(ctx.v.alcohol_consumption_pct + 4);
      ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct + 2);
      return 'Les BOR montent sur scène. Les tomates sont prêtes.';
    },
  },
  {
    code: 'counter_defamation', label: 'Contre-campagne de diffamation', description: 'Pression administrative −5 %, notoriété +3.', portfolio: 'media', apCost: 1, minAct: 3, target: 'none',
    run: (ctx) => {
      ctx.v.admin_pressure_pct = gauge(ctx.v.admin_pressure_pct - 5);
      ctx.v.international_notoriety_pct = gauge(ctx.v.international_notoriety_pct + 3);
      return 'Démenti cinglant publié dans La Vanguardia.';
    },
  },
];

const ACTION_INDEX = new Map(ACTIONS.map((a) => [a.code, a]));

export function getAction(code: string): ActionDef | undefined {
  return ACTION_INDEX.get(code);
}

/** Les fondateurs peuvent toujours agir sur leurs rôles « co- » listés ; utilitaire pour l'UI. */
/**
 * Mission du jour (V5.2) : action conseillée au joueur aujourd'hui, parmi celles de son métier
 * qu'il peut faire (Acte, dimanche) ; null s'il n'en a aucune.
 */
export function dailyMission(s: Pick<GameSnapshot, 'village'>, player: Player, now: Date): ActionDef | null {
  const code = pickMission(player, now, (c) => {
    const def = ACTION_INDEX.get(c);
    if (!def || !isAllowedFor(def, player, s.village.act_number)) return false;
    if (def.sundayOnly && !isSunday(now)) return false;
    return missionFeasible(c, s.village);
  });
  return code ? ACTION_INDEX.get(code) ?? null : null;
}

/** Après une action réussie : passage de niveau, mission du jour, binôme (V5.2). */
function applyDailyExtras(ctx: ActionContext, duoGroup: C.DuoGroup | undefined, levelBefore: number, mission: ActionDef | null): string {
  const { s, v, actor, now, fx, def } = ctx;
  let extra = '';
  const life = ensureLife(v);
  const today = dayKeyOf(now);
  // Mission du jour (tirée sur l'état d'avant l'action : elle peut avoir consommé ses propres prérequis)
  if (mission && mission.code === def.code && life.missions_done?.[actor.id]?.day !== today) {
    life.missions_done = { ...(life.missions_done ?? {}), [actor.id]: { day: today, code: def.code } };
    actor.skill_xp += C.MISSION_XP_REWARD;
    v.morale_pct = gauge(v.morale_pct + C.MISSION_MORALE_REWARD);
    extra += ` Mission du jour accomplie : +${C.MISSION_XP_REWARD} XP, moral +${C.MISSION_MORALE_REWARD} %.`;
  }
  // Binôme
  if (duoGroup) {
    const partners = ctx.duo;
    const day = recordDuoAct(life, v, actor.id, duoGroup.id, now);
    if (partners.length > 0) {
      actor.skill_xp += C.DUO_XP;
      const names = partners.map((id) => findPlayer(s, id)?.display_name ?? '?');
      extra += ` Binôme avec ${names.join(' et ')} : rendement +${Math.round(C.DUO_BONUS * 100)} %, +${C.DUO_XP} XP.`;
      if (!day.announced.includes(duoGroup.id)) {
        day.announced.push(duoGroup.id);
        for (const id of partners) {
          const p = findPlayer(s, id);
          if (p) p.skill_xp += C.DUO_XP;
        }
        pushEvent(fx, s, {
          event_type: 'duo_bonus',
          title: `${duoGroup.icon} Binôme : ${duoGroup.label}`,
          body: `${actor.display_name} et ${names.join(' et ')} ont travaillé ensemble aujourd'hui (${def.label}).`,
          data: { group: duoGroup.id, players: [actor.id, ...partners] },
        });
      }
    }
  }
  // Passage de niveau
  const levelAfter = skillLevel(actor.skill_xp);
  if (levelAfter > levelBefore) {
    pushEvent(fx, s, {
      event_type: 'skill_level_up',
      title: `Niveau ${levelAfter} de métier`,
      body: `${actor.display_name} passe au niveau ${levelAfter} : +${Math.round(C.SKILL_LEVEL_BONUS[levelAfter - 1]! * 100)} % de rendement dans son métier${levelAfter >= C.SKILL_FORGE_DOUBLE_LEVEL && actor.role_code === 'smith_diplo' ? ', fournée double à la forge' : ''}.`,
      data: { player_id: actor.id, level: levelAfter },
    });
    extra += ` Niveau ${levelAfter} atteint !`;
  }
  return extra;
}

export function actionsAvailableTo(s: GameSnapshot, player: Player): ActionDef[] {
  return ACTIONS.filter((a) => isAllowedFor(a, player, s.village.act_number));
}

function isAllowedFor(def: ActionDef, holder: Player, act: number): boolean {
  if (def.minAct && act < def.minAct) return false;
  if (def.anyone) return true;
  if (holderHasRole(holder, def.roles)) return true;
  return holderHasPortfolio(holder, def.portfolio, act);
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
export interface PerformOptions {
  /** Ré-exécution après accord PLU / budget : PA déjà payés, verrous du groupe accordés. */
  executingApprovalGroup?: string | null;
}

function refused(input: GameSnapshot, error: string): ActionOutcome {
  return { ok: false, status: 'refused', error, narrative: error, snapshot: input, ap_spent: 0, ...emptyEffects() };
}

export function performAction(input: GameSnapshot, request: ActionRequest, now: Date, options: PerformOptions = {}): ActionOutcome {
  const def = getAction(request.action_code);
  if (!def) return refused(input, 'Action inconnue.');
  if (input.village.is_defeated) return refused(input, 'La partie est terminée.');

  const s = deepClone(input);
  const fx = emptyEffects();
  const resolution = resolveActor(s, request, now);
  if (typeof resolution === 'string') return refused(input, resolution);
  const { actor, holder, viaDelegation } = resolution;
  const v = s.village;

  if (viaDelegation && def.delegable === false) return refused(input, 'Action non délégable.');
  if (def.minAct && v.act_number < def.minAct) return refused(input, `Action disponible à partir de l'Acte ${def.minAct}.`);
  if (!isAllowedFor(def, holder, v.act_number)) {
    // Les portefeuilles exigent aussi l'Acte de déblocage ; les fondateurs ne cumulent que s'ils sont élus.
    if (def.portfolio && holder.ministerial_portfolios.includes(def.portfolio)) {
      return refused(input, `Le portefeuille ${def.portfolio} n'est pas encore débloqué.`);
    }
    return refused(input, 'Cette action ne relève pas de vos prérogatives.');
  }
  if (def.sundayOnly && !isSunday(now)) return refused(input, 'Uniquement le dimanche.');

  const executing = options.executingApprovalGroup ?? null;
  if (!executing && holder.action_points < def.apCost) return refused(input, 'Points d\'Action insuffisants.');
  if (holder.status === 'forced_labor' && !def.physical && def.apCost > 0 && !executing) {
    return refused(input, 'Aux travaux forcés, seules les tâches physiques sont permises.');
  }

  const rng = createRng(`${v.id}:act:${v.revision}:${request.actor_id}:${request.action_code}:${now.toISOString()}`);
  const structure = request.target_structure_id ? s.structures.find((st) => st.id === request.target_structure_id) : undefined;
  const costEur = def.cost ? def.cost(s, request) : 0;
  const early = def.precheck?.(s, request);
  if (early) return refused(input, early);

  const lock = checkLocks(
    s,
    {
      holder,
      viaDelegation,
      requiresPlu: def.requiresPlu === true,
      ecoSensitive: def.ecoSensitive === true,
      costEur,
      structure,
      request,
      approvedGroup: executing,
    },
    rng.fork('locks'),
  );
  if (lock.status === 'blocked') return refused(input, lock.error);
  if (lock.status === 'needs_approval') {
    holder.action_points -= def.apCost;
    for (const d of lock.drafts) {
      s.approvals.push({ ...d, status: 'pending', decided_by: null, decided_at: null, reason: null, created_at: now.toISOString() });
      fx.approvals.push(d);
    }
    const who = lock.drafts.map((d) => (d.kind === 'plu' ? 'l\'accord PLU de Tiphaine' : 'la validation de M. Lerme')).join(' et ');
    pushEvent(fx, s, {
      event_type: 'approval_requested',
      title: 'Validation requise',
      body: `${actor.display_name} demande ${who} pour « ${def.label} »${costEur > 0 ? ` (${costEur.toFixed(2)} €)` : ''}.`,
      data: { approvals: lock.drafts.map((d) => d.id) },
    });
    return { ok: true, status: 'pending_approval', error: null, narrative: `En attente de ${who}.`, snapshot: s, ap_spent: def.apCost, ...fx };
  }

  const duoGroup = duoGroupOf(def.code);
  const duo = duoGroup ? duoPartners(v, actor.id, duoGroup.id, now) : [];
  const ctx: ActionContext = { s, v, now, rng, fx, req: request, actor, holder, viaDelegation, def, duo };
  const mission = dailyMission(s, actor, now);
  let narrative: string;
  try {
    narrative = def.run(ctx);
  } catch (err) {
    if (err instanceof ActionError) return refused(input, err.message);
    throw err;
  }

  const apSpent = executing ? 0 : def.apCost;
  holder.action_points = Math.max(0, holder.action_points - apSpent);
  const levelBefore = skillLevel(actor.skill_xp);
  actor.skill_xp += 5 + apSpent * 5;
  if (executing) markGroupExecuted(s, executing);
  const today = dayKeyOf(now);
  const missionBefore = ensureLife(v).missions_done?.[actor.id]?.day === today;
  narrative += applyDailyExtras(ctx, duoGroup, levelBefore, mission);
  // Bilan de la semaine (V6.0) : compteurs de l'acteur
  recordWeekAction(v, actor.id, def.code, apSpent, {
    mission: !missionBefore && ensureLife(v).missions_done?.[actor.id]?.day === today,
    duo: duo.length > 0,
  }, today);

  const p = localParts(now);
  refreshDerived(s, now, calendarSeasonOf(p.month, p.day), fx);
  pushEvent(fx, s, {
    event_type: 'action',
    visibility: 'private',
    player_id: actor.id,
    title: def.label,
    body: narrative,
    data: { action_code: def.code, holder_id: holder.id, via_delegation: viaDelegation },
  });
  return { ok: true, status: 'done', error: null, narrative, snapshot: s, ap_spent: apSpent, ...fx };
}
