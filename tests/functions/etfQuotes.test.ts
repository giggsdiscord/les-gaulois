/** Cours réels des ETF (V6.2) : analyse de la réponse « chart » de Yahoo Finance. */
import { describe, expect, it } from 'vitest';
import { parseYahooChart, yahooChartUrl } from '../../supabase/functions/_shared/core/world.ts';

// Extrait réduit d'une vraie réponse (IWDA.AS, 27/11/2026).
const day = (iso: string) => Date.parse(`${iso}T08:00:00Z`) / 1000;
const sample = (currency = 'EUR', live: number | null = 127.23) => ({
  chart: {
    result: [
      {
        meta: { currency, symbol: 'IWDA.AS', regularMarketPrice: live, regularMarketTime: day('2026-11-27') + 25000 },
        timestamp: [day('2026-11-23'), day('2026-11-24'), day('2026-11-25'), day('2026-11-26'), day('2026-11-27')],
        indicators: { quote: [{ close: [126.76000213623047, 124.58000183105469, null, 125.81999969482422, 127.2] }] },
      },
    ],
    error: null,
  },
});

describe('Cours des ETF (Yahoo Finance)', () => {
  it('construit l’URL sans clé', () => {
    expect(yahooChartUrl('SXR8.DE')).toBe('https://query1.finance.yahoo.com/v8/finance/chart/SXR8.DE?range=3mo&interval=1d');
  });

  it('extrait cours, veille, date et historique (trous ignorés, cours en direct prioritaire)', () => {
    expect(parseYahooChart(sample())).toEqual({
      price: 127.23,
      prev: 125.82,
      date: '2026-11-27',
      history: [126.76, 124.58, 125.82, 127.23],
    });
  });

  it('sans cours en direct : dernière clôture', () => {
    expect(parseYahooChart(sample('EUR', null))?.price).toBe(127.2);
  });

  it('refuse une cotation hors euros ou une réponse vide', () => {
    expect(parseYahooChart(sample('USD'))).toBeNull();
    expect(parseYahooChart({ chart: { result: null, error: { code: 'Not Found' } } })).toBeNull();
    expect(parseYahooChart(null)).toBeNull();
  });
});
