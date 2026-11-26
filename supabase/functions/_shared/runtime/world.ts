/** Récupération (réseau) de la météo réelle et des gros titres — tolérante aux pannes. */
import type { WeatherSnapshot } from '../core/types.ts';
import { interleaveHeadlines, openMeteoUrl, parseOpenMeteo, parseRssTitles } from '../core/world.ts';
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
