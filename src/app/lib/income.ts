/**
 * Revenus & production automatique vus par l'interface (V6.1) : installations (en place, suspendues,
 * possibles), commandes régulières, services payants, estimation de la nuit et charges du lundi.
 * Pur (aucun DOM) : testé dans tests/app/income.test.ts.
 */
import {
  buyBlocker,
  calendarSeasonOfKey,
  constants as C,
  dayKey,
  installRequirement,
  installsOf,
  lifeOf,
  orderBlocker,
  positionOf,
  quoteOf,
  sellBlocker,
  ordersOf,
  planIncomeNight,
  serviceBlocker,
  servicesDone,
  setupBlocker,
  setupCost,
  stopBlocker,
  unitText,
  weeklyCharges,
  type ActiveOrder,
  type GameSnapshot,
  type IncomeLine,
  type IncomeNight,
} from '../engine.ts';
import type { GameData } from '../api/types.ts';

export type IncomeData = Pick<GameData, 'village' | 'structures'>;

export interface InstallView {
  def: C.AutoInstallDef;
  state: 'off' | 'on' | 'paused';
  /** Prix pour installer (ou relancer). */
  cost: number;
  /** Raison de ne pas pouvoir installer / relancer (hors caisse et PA). */
  blocked: string | null;
  /** Condition non remplie pour une installation en place (elle ne produit rien). */
  idle: string | null;
  /** Estimation de cette nuit. */
  tonight: IncomeLine | null;
}

export interface OrderView {
  def: C.OrderDef;
  active: ActiveOrder | null;
  blocked: string | null;
  /** Commande en cours qui manquerait sa livraison cette nuit. */
  short: boolean;
  text: string;
}

export interface ServiceView {
  def: C.PaidServiceDef;
  done: number;
  blocked: string | null;
}

export interface IncomeView {
  installs: InstallView[];
  orders: OrderView[];
  services: ServiceView[];
  /** Recettes estimées de la nuit à venir. */
  tonightEur: number;
  /** Charges prélevées lundi prochain. */
  weeklyEur: number;
  last: IncomeNight | null;
  /** Caisse insuffisante pour les charges du lundi. */
  chargesAtRisk: boolean;
}

const view = (data: IncomeData) => ({ village: data.village, structures: data.structures }) as unknown as GameSnapshot;

export function incomeView(data: IncomeData, now: Date): IncomeView {
  const s = view(data);
  const v = s.village;
  const plan = planIncomeNight(s, calendarSeasonOfKey(dayKey(now)));
  const installs = installsOf(v);
  const orders = ordersOf(v);
  const weeklyEur = weeklyCharges(v);
  return {
    installs: C.AUTO_INSTALLS.map((def) => {
      const cur = installs[def.id];
      const state = !cur ? 'off' : cur.paused ? 'paused' : 'on';
      return {
        def,
        state,
        cost: setupCost(v, def.id),
        blocked: state === 'on' ? null : setupBlocker(s, def.id),
        idle: state === 'on' ? installRequirement(s, def) : null,
        tonight: plan.lines.find((l) => l.id === def.id) ?? null,
      };
    }),
    orders: C.ORDER_OFFERS.map((def) => ({
      def,
      active: orders[def.id] ?? null,
      blocked: orders[def.id] ? null : orderBlocker(v, def.id),
      short: plan.orders[def.id] === 'missed',
      text: `${def.per_night} ${unitText(def, def.per_night)}/nuit à ${def.unit_eur} € (${Math.round(def.per_night * def.unit_eur * 100) / 100} €/nuit)`,
    })),
    services: C.PAID_SERVICES.map((def) => ({ def, done: servicesDone(v, def.id), blocked: serviceBlocker(v, def.id) })),
    tonightEur: plan.eur,
    weeklyEur,
    last: lifeOf(v).income_last ?? null,
    chargesAtRisk: weeklyEur > 0 && v.treasury_eur < weeklyEur,
  };
}

/** Choix proposés par le formulaire d'action (paramètre + options). */
export function incomeChoices(code: string, data: IncomeData): { param: string; label: string; options: { id: string; label: string; hint: string; blocked: string | null }[] } | null {
  const s = view(data);
  const v = s.village;
  if (code === 'setup_install') {
    return {
      param: 'install',
      label: 'Installation',
      options: C.AUTO_INSTALLS.map((d) => ({ id: d.id, label: `${d.icon} ${d.label} — ${setupCost(v, d.id)} €`, hint: `${d.summary} Charge : ${d.weekly_eur} € chaque lundi.`, blocked: setupBlocker(s, d.id) })),
    };
  }
  if (code === 'stop_install') {
    return {
      param: 'install',
      label: 'Installation',
      options: C.AUTO_INSTALLS.filter((d) => !stopBlocker(v, d.id)).map((d) => ({ id: d.id, label: `${d.icon} ${d.label}`, hint: `Plus de charge (${d.weekly_eur} €/semaine), plus de recettes.`, blocked: null })),
    };
  }
  if (code === 'sign_order') {
    return {
      param: 'order',
      label: 'Commande',
      options: C.ORDER_OFFERS.map((d) => ({ id: d.id, label: `${d.icon} ${d.client}`, hint: `${d.per_night} ${unitText(d, d.per_night)} chaque nuit à ${d.unit_eur} € jusqu’à lundi.`, blocked: orderBlocker(v, d.id) })),
    };
  }
  if (code === 'paid_service') {
    return {
      param: 'service',
      label: 'Service',
      options: C.PAID_SERVICES.map((d) => ({ id: d.id, label: `${d.icon} ${d.label} — ${d.eur} €`, hint: `${servicesDone(v, d.id)}/${d.weekly_cap} cette semaine ; ${d.extra}.`, blocked: serviceBlocker(v, d.id) })),
    };
  }
  // Fonds souverain (V6.2) : ETF choisi (le montant est vérifié à l'envoi)
  if (code === 'buy_etf') {
    return {
      param: 'etf',
      label: 'ETF',
      options: C.ETFS.map((d) => {
        const q = quoteOf(v, d.id);
        return { id: d.id, label: `${d.icon} ${d.label}${q ? ` — ${q.price.toFixed(2)} €` : ''}`, hint: `${d.summary} Fonds suivi : ${d.fund}.`, blocked: buyBlocker(s, d.id, Math.max(C.ETF_MIN_ORDER_EUR, v.sovereign_fund_eur)) };
      }),
    };
  }
  if (code === 'sell_etf') {
    return {
      param: 'etf',
      label: 'ETF',
      options: C.ETFS.filter((d) => positionOf(v, d.id)).map((d) => ({ id: d.id, label: `${d.icon} ${d.label} — ${positionOf(v, d.id)!.shares} parts`, hint: d.summary, blocked: sellBlocker(s, d.id, 0) })),
    };
  }
  return null;
}

/** Première option possible (sinon la première tout court). */
export function defaultChoice(choices: NonNullable<ReturnType<typeof incomeChoices>>): string {
  return (choices.options.find((o) => !o.blocked) ?? choices.options[0])?.id ?? '';
}
