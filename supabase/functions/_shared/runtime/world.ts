/** Récupération (réseau) de la météo réelle et des gros titres — tolérante aux pannes. */
import type { WeatherSnapshot } from '../core/types.ts';
import { constants, type IncomingQuote } from '../engine/index.ts';
import { QUOTE_HOSTS, interleaveHeadlines, openMeteoUrl, parseOpenMeteo, parseRssTitles, parseYahooChart, yahooChartUrl } from '../core/world.ts';
import type { FunctionEnv } from './env.ts';

const USER_AGENT = 'LesGaulois-Game/1.0 (simulation de village)';

export async function fetchWeather(env: FunctionEnv, timeoutMs = 8000): Promise<WeatherSnapshot | null> {
  try {
    const res = await fetch(openMeteoUrl(env.latitude, env.longitude), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return parseOpenMeteo(await res.json(), env.locationLabel);
  } catch (err) {
    console.error('Open-Meteo indisponible', err);
    return null;
  }
}

export async function fetchHeadlines(env: FunctionEnv, timeoutMs = 8000): Promise<string[]> {
  const lists = await Promise.all(
    env.rssFeeds.map(async (url) => {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) return [];
        return parseRssTitles(await res.text(), 3);
      } catch (err) {
        console.error(`Flux RSS indisponible : ${url}`, err);
        return [];
      }
    }),
  );
  return interleaveHeadlines(lists, 8);
}

/** Cours réels des ETF du fonds souverain (V6.2) : id d'ETF → cours ; un ETF en panne est simplement absent. */
export async function fetchEtfQuotes(timeoutMs = 6000): Promise<Record<string, IncomingQuote>> {
  const out: Record<string, IncomingQuote> = {};
  await Promise.all(
    constants.ETFS.map(async (etf) => {
      for (const host of QUOTE_HOSTS) {
        try {
          const res = await fetch(yahooChartUrl(etf.symbol, host), {
            headers: { 'User-Agent': `Mozilla/5.0 (compatible; ${USER_AGENT})`, Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) continue;
          const quote = parseYahooChart(await res.json());
          if (quote) {
            out[etf.id] = quote;
            return;
          }
        } catch (err) {
          console.error(`Cours ${etf.symbol} indisponible (${host})`, err);
        }
      }
    }),
  );
  return out;
}
