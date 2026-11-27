/**
 * Fonds souverain placé sur les ETF vu par l'interface (V6.2) : cours, variation du jour, parts, valeur,
 * plus-value latente, courbes, liquidités. Pur (aucun DOM) : testé dans tests/app/funds.test.ts.
 */
import {
  constants as C,
  dayChangePct,
  dayKey,
  etfFee,
  fundTotal,
  lifeOf,
  portfolioCost,
  portfolioValue,
  positionOf,
  quoteOf,
  quoteStale,
  type EtfQuote,
  type EtfValuePoint,
  type VillageState,
} from '../engine.ts';

export type FundVillage = Pick<VillageState, 'life' | 'sovereign_fund_eur'>;

export interface EtfRow {
  def: C.EtfDef;
  quote: EtfQuote | null;
  changePct: number | null;
  stale: boolean;
  shares: number;
  value: number;
  cost: number;
  gain: number;
  gainPct: number | null;
}

export interface FundView {
  cash: number;
  invested: number;
  cost: number;
  latent: number;
  realized: number;
  total: number;
  rows: EtfRow[];
  valueHistory: EtfValuePoint[];
  /** Au moins un cours simulé (mode démo). */
  demo: boolean;
  /** Aucun cours encore relevé. */
  noQuotes: boolean;
  /** Date de séance la plus récente. */
  asOf: string | null;
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

export function fundView(v: FundVillage, now: Date): FundView {
  const today = dayKey(now);
  const rows = C.ETFS.map((def): EtfRow => {
    const q = quoteOf(v, def.id) ?? null;
    const p = positionOf(v, def.id);
    const value = p && q ? Math.round(p.shares * q.price * 100) / 100 : 0;
    const cost = p?.cost_eur ?? 0;
    return {
      def,
      quote: q,
      changePct: dayChangePct(q ?? undefined),
      stale: q ? quoteStale(q, today) : false,
      shares: p?.shares ?? 0,
      value,
      cost,
      gain: Math.round((value - cost) * 100) / 100,
      gainPct: p ? pct(value, cost) : null,
    };
  });
  const invested = portfolioValue(v);
  const cost = portfolioCost(v);
  const quotes = rows.map((r) => r.quote).filter((q): q is EtfQuote => !!q);
  return {
    cash: v.sovereign_fund_eur,
    invested,
    cost,
    latent: Math.round((invested - cost) * 100) / 100,
    realized: lifeOf(v).etf_realized_eur ?? 0,
    total: fundTotal(v),
    rows,
    valueHistory: lifeOf(v).etf_value_history ?? [],
    demo: quotes.some((q) => q.demo),
    noQuotes: quotes.length === 0,
    asOf: quotes.map((q) => q.date).sort().at(-1) ?? null,
  };
}

/** Points d'une petite courbe SVG (largeur × hauteur), ou chaîne vide s'il y a moins de 2 points. */
export function sparkPoints(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values
    .map((val, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((val - min) / span) * height;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}

/** Estimation d'un ordre d'achat : frais et parts obtenues. */
export function buyEstimate(price: number, amount: number): { fee: number; shares: number } {
  if (!(amount > 0) || !(price > 0)) return { fee: 0, shares: 0 };
  const fee = etfFee(amount);
  return { fee, shares: Math.max(0, Math.floor(((amount - fee) / price) * 1e4) / 1e4) };
}
