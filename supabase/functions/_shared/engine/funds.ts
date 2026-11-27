// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/funds.ts
/**
 * Fonds souverain placé sur les marchés réels (V6.2) [GDD §5.13].
 *
 * Le fonds souverain (`sovereign_fund_eur`) reste la part **liquide** ; le gardien du fonds (trésorier)
 * peut en placer une partie sur des ETF (Monde, S&P 500, Nasdaq 100, CAC 40, émergents, Stoxx 600).
 * Les cours ne viennent **jamais** du réseau ici : l'Edge Function de nuit `daily-world-sync` les relève
 * (cotations réelles en euros) et les passe à `applyMarketQuotes` ; le mode démo les simule par
 * `simulateDemoQuotes` (marche aléatoire déterministe, signalée « démo »). Si la source tombe, le dernier
 * cours connu reste en place.
 * État dans `village_state.life` : `market_quotes`, `etf_positions`, `etf_value_history`, `etf_realized_eur`.
 * La valeur des ETF n'entre pas dans l'autonomie (le moteur ne lit pas le fonds pour la calculer).
 * C'est un jeu : aucune vraie transaction, aucun conseil financier.
 */
import { addDaysToKey } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent, pushLedger } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { money, round2 } from './math.ts';
import { createRng } from './rng.ts';
import type { EngineEffects, EtfPosition, EtfQuote, GameSnapshot, Player, VillageState } from './types.ts';

type FundView = Pick<VillageState, 'life' | 'sovereign_fund_eur'>;

/** Cours entrant (relevé par l'Edge Function ou simulé en démo). */
export interface IncomingQuote {
  price: number;
  prev?: number | null;
  date: string;
  history?: number[];
  demo?: boolean;
}

export function findEtf(id: unknown): C.EtfDef | undefined {
  return typeof id === 'string' ? C.ETFS.find((e) => e.id === id) : undefined;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validPrice = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e7;

/** Cours utilisable d'un ETF, ou `undefined` s'il n'a jamais été relevé. */
export function quoteOf(v: Pick<VillageState, 'life'>, id: string): EtfQuote | undefined {
  const q = lifeOf(v).market_quotes?.[id];
  return q && validPrice(q.price) ? q : undefined;
}

export function positionOf(v: Pick<VillageState, 'life'>, id: string): EtfPosition | undefined {
  const p = lifeOf(v).etf_positions?.[id];
  return p && p.shares > 0 ? p : undefined;
}

/** Frais de courtage d'un ordre. */
export function etfFee(amount: number): number {
  return money(Math.max(C.ETF_FEE_MIN_EUR, (amount * C.ETF_FEE_PCT) / 100));
}

export function positionValue(v: Pick<VillageState, 'life'>, id: string): number {
  const p = positionOf(v, id);
  const q = quoteOf(v, id);
  return p && q ? money(p.shares * q.price) : 0;
}

/** Valeur totale des ETF du fonds, au dernier cours connu. */
export function portfolioValue(v: Pick<VillageState, 'life'>): number {
  return money(C.ETFS.reduce((sum, e) => sum + positionValue(v, e.id), 0));
}

/** Prix de revient total des positions ouvertes. */
export function portfolioCost(v: Pick<VillageState, 'life'>): number {
  return money(C.ETFS.reduce((sum, e) => sum + (positionOf(v, e.id)?.cost_eur ?? 0), 0));
}

/** Fonds souverain complet : liquidités + ETF. */
export function fundTotal(v: FundView): number {
  return money(v.sovereign_fund_eur + portfolioValue(v));
}

/** Variation du jour en % (null si inconnue). */
export function dayChangePct(q: Pick<EtfQuote, 'price' | 'prev'> | undefined): number | null {
  if (!q || !validPrice(q.prev)) return null;
  return round2(((q.price - q.prev) / q.prev) * 100);
}

/** Le cours n'a pas été rafraîchi depuis plus de `ETF_STALE_DAYS` jours. */
export function quoteStale(q: Pick<EtfQuote, 'updated_day'> | undefined, today: string): boolean {
  if (!q) return true;
  return addDaysToKey(q.updated_day, C.ETF_STALE_DAYS) < today;
}

export function buyBlocker(s: Pick<GameSnapshot, 'village'>, id: unknown, amount: unknown): string | null {
  const def = findEtf(id);
  if (!def) return 'Choisissez un ETF.';
  if (!quoteOf(s.village, def.id)) return `Pas encore de cours pour ${def.label} : il sera relevé cette nuit.`;
  const a = Number(amount);
  if (!Number.isFinite(a) || a < C.ETF_MIN_ORDER_EUR) return `Ordre minimal : ${C.ETF_MIN_ORDER_EUR} €.`;
  if (a > s.village.sovereign_fund_eur) return `Fonds souverain insuffisant (${s.village.sovereign_fund_eur.toFixed(2)} € disponibles) : abondez-le d’abord depuis la caisse.`;
  if (a <= etfFee(a)) return 'Montant trop faible face aux frais.';
  return null;
}

/** `amount` nul ou absent = tout vendre. */
export function sellBlocker(s: Pick<GameSnapshot, 'village'>, id: unknown, amount: unknown): string | null {
  const def = findEtf(id);
  if (!def) return 'Choisissez un ETF.';
  if (!positionOf(s.village, def.id)) return `Le fonds ne détient pas de parts ${def.label}.`;
  if (!quoteOf(s.village, def.id)) return `Pas de cours pour ${def.label}.`;
  const a = Number(amount ?? 0);
  if (!Number.isFinite(a) || a < 0) return 'Montant invalide.';
  if (a > 0 && a < C.ETF_MIN_ORDER_EUR) return `Vente partielle minimale : ${C.ETF_MIN_ORDER_EUR} €.`;
  if (positionValue(s.village, def.id) <= etfFee(positionValue(s.village, def.id))) return 'Position trop petite face aux frais.';
  return null;
}

export interface BuyResult { def: C.EtfDef; shares: number; fee: number; price: number }
export interface SellResult { def: C.EtfDef; shares: number; fee: number; proceeds: number; gain: number; all: boolean }

const roundShares = (n: number) => Math.floor(n * 1e4) / 1e4;

export function buyEtf(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'id' | 'display_name'>, id: unknown, amount: unknown, day: string): BuyResult {
  const blocker = buyBlocker(s, id, amount);
  if (blocker) throw new Error(blocker);
  const def = findEtf(id)!;
  const v = s.village;
  const a = money(Number(amount));
  const q = quoteOf(v, def.id)!;
  const fee = etfFee(a);
  const shares = roundShares((a - fee) / q.price);
  if (shares <= 0) throw new Error('Montant trop faible pour une part.');
  const life = ensureLife(v);
  const positions = (life.etf_positions ??= {});
  const old = positionOf(v, def.id);
  positions[def.id] = {
    shares: roundShares((old?.shares ?? 0) + shares),
    cost_eur: money((old?.cost_eur ?? 0) + a),
    since: old?.since ?? day,
  };
  v.sovereign_fund_eur = money(v.sovereign_fund_eur - a);
  pushLedger(fx, s, { account: 'sovereign_fund', amount_eur: -a, label: `Achat ETF ${def.label} (${fee.toFixed(2)} € de frais)`, category: 'etf', created_by: actor.id });
  pushEvent(fx, s, {
    event_type: 'etf_trade',
    title: `Fonds souverain : achat ${def.label}`,
    body: `${actor.display_name} place ${a.toFixed(0)} € du fonds souverain sur l’ETF ${def.label} (${shares} parts à ${q.price.toFixed(2)} €).`,
  });
  recordValuePoint(v, day);
  return { def, shares, fee, price: q.price };
}

export function sellEtf(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'id' | 'display_name'>, id: unknown, amount: unknown, day: string): SellResult {
  const blocker = sellBlocker(s, id, amount);
  if (blocker) throw new Error(blocker);
  const def = findEtf(id)!;
  const v = s.village;
  const pos = positionOf(v, def.id)!;
  const q = quoteOf(v, def.id)!;
  const value = pos.shares * q.price;
  const wanted = Number(amount ?? 0);
  const all = !(wanted > 0) || wanted >= value * 0.999;
  const shares = all ? pos.shares : Math.min(pos.shares, roundShares(wanted / q.price));
  const gross = money(shares * q.price);
  const fee = etfFee(gross);
  const proceeds = money(gross - fee);
  const costPart = all ? pos.cost_eur : money((pos.cost_eur * shares) / pos.shares);
  const gain = money(proceeds - costPart);
  const life = ensureLife(v);
  const positions = (life.etf_positions ??= {});
  if (all || pos.shares - shares <= 0) delete positions[def.id];
  else positions[def.id] = { ...pos, shares: roundShares(pos.shares - shares), cost_eur: money(pos.cost_eur - costPart) };
  life.etf_realized_eur = money((life.etf_realized_eur ?? 0) + gain);
  v.sovereign_fund_eur = money(v.sovereign_fund_eur + proceeds);
  pushLedger(fx, s, { account: 'sovereign_fund', amount_eur: proceeds, label: `Vente ETF ${def.label} (${gain >= 0 ? 'plus' : 'moins'}-value ${gain.toFixed(2)} €)`, category: 'etf', created_by: actor.id });
  pushEvent(fx, s, {
    event_type: 'etf_trade',
    title: `Fonds souverain : vente ${def.label}`,
    body: `${actor.display_name} vend ${all ? 'toutes les' : shares} parts ${def.label} : ${proceeds.toFixed(0)} € reviennent au fonds (${gain >= 0 ? '+' : ''}${gain.toFixed(0)} €).`,
  });
  recordValuePoint(v, day);
  return { def, shares, fee, proceeds, gain, all };
}

/** Point du jour de la courbe du portefeuille (remplacé s'il existe déjà). */
function recordValuePoint(v: VillageState, day: string): void {
  const life = ensureLife(v);
  const history = life.etf_value_history ?? [];
  const value = portfolioValue(v);
  if (history.length === 0 && value === 0) return;
  const next = history.filter((p) => p.day !== day);
  next.push({ day, value });
  next.sort((a, b) => (a.day < b.day ? -1 : 1));
  life.etf_value_history = next.slice(-C.ETF_HISTORY_POINTS);
}

/** Nettoie des cours reçus de l'extérieur (Edge Function). */
export function sanitizeQuotes(input: unknown): Record<string, IncomingQuote> {
  const out: Record<string, IncomingQuote> = {};
  if (!input || typeof input !== 'object') return out;
  for (const def of C.ETFS) {
    const raw = (input as Record<string, unknown>)[def.id] as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object' || !validPrice(raw.price) || typeof raw.date !== 'string' || !DAY_RE.test(raw.date)) continue;
    const history = Array.isArray(raw.history) ? raw.history.filter(validPrice).map(round2).slice(-C.ETF_HISTORY_POINTS) : undefined;
    out[def.id] = {
      price: round2(raw.price),
      prev: validPrice(raw.prev) ? round2(raw.prev) : null,
      date: raw.date,
      ...(history && history.length > 0 ? { history } : {}),
      ...(raw.demo === true ? { demo: true } : {}),
    };
  }
  return out;
}

/**
 * Écrit les cours de la nuit dans la partie. Un ETF absent de `incoming` garde son dernier cours
 * (source tombée). Ajoute le point du jour à la courbe du portefeuille.
 * @returns nombre d'ETF mis à jour.
 */
export function applyMarketQuotes(s: GameSnapshot, incoming: unknown, day: string): number {
  const fresh = sanitizeQuotes(incoming);
  const v = s.village;
  const life = ensureLife(v);
  const quotes = { ...(life.market_quotes ?? {}) };
  let updated = 0;
  for (const def of C.ETFS) {
    const q = fresh[def.id];
    if (!q) continue;
    const old = quotes[def.id];
    const sameSession = old?.date === q.date;
    let history: number[];
    if (q.history && q.history.length >= 2) history = q.history;
    else if (old && sameSession) history = [...old.history.slice(0, -1), q.price];
    else history = [...(old?.history ?? []), q.price];
    const prev = q.prev ?? (old ? (sameSession ? old.prev : old.price) : null);
    quotes[def.id] = {
      price: q.price,
      prev: validPrice(prev) ? prev : null,
      date: q.date,
      history: history.slice(-C.ETF_HISTORY_POINTS),
      updated_day: day,
      ...(q.demo ? { demo: true } : {}),
    };
    updated++;
  }
  if (updated > 0) life.market_quotes = quotes;
  recordValuePoint(v, day);
  return updated;
}

/** Variation quotidienne simulée (≈ loi normale, légère dérive haussière), en fraction. */
function demoStep(seed: string, volPct: number): number {
  const rng = createRng(seed);
  const z = (rng.next() + rng.next() + rng.next() + rng.next() - 2) * Math.sqrt(3);
  return 0.0003 + (z * volPct) / 100;
}

/**
 * Cours simulés du mode démo (aucun réseau) : marche aléatoire déterministe par ETF et par jour.
 * Premier appel : 60 jours d'historique générés à partir de `demo_price`.
 */
export function simulateDemoQuotes(v: Pick<VillageState, 'life' | 'id'>, day: string): Record<string, IncomingQuote> {
  const out: Record<string, IncomingQuote> = {};
  for (const def of C.ETFS) {
    const old = quoteOf(v, def.id);
    if (old && old.date === day) continue;
    if (!old) {
      const history: number[] = [def.demo_price];
      for (let i = 1; i < C.ETF_HISTORY_POINTS; i++) {
        const back = addDaysToKey(day, -i);
        history.unshift(round2(history[0]! / (1 + demoStep(`${v.id}:etf:${def.id}:${back}`, def.demo_vol_pct))));
      }
      out[def.id] = { price: def.demo_price, prev: history[history.length - 2] ?? null, date: day, history, demo: true };
    } else {
      const price = round2(Math.max(0.01, old.price * (1 + demoStep(`${v.id}:etf:${def.id}:${day}`, def.demo_vol_pct))));
      out[def.id] = { price, prev: old.price, date: day, demo: true };
    }
  }
  return out;
}
