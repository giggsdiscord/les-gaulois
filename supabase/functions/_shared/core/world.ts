/**
 * Connecteurs monde réel (0 €) — fonctions pures de construction d'URL et d'analyse :
 * météo Open-Meteo (sans clé) et gros titres RSS Espagne / Catalogne / France [GDD §6.3].
 */
import type { WeatherSnapshot } from './types.ts';

/** Hameau des Pyrénées de Lleida (Alt Urgell, ~18 km d'Andorre) — modifiable par variables d'environnement. */
export const DEFAULT_LOCATION = { latitude: 42.33, longitude: 1.33, label: 'Alt Urgell, Lleida' } as const;

export const DEFAULT_RSS_FEEDS: readonly string[] = [
  'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada',
  'https://www.lavanguardia.com/rss/home.xml',
  'https://www.ara.cat/rss/',
  'https://www.lemonde.fr/rss/une.xml',
];

export function openMeteoUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum',
    timezone: 'Europe/Madrid',
    forecast_days: '1',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/** Codes météo WMO (Open-Meteo) → libellé français. */
export function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Ciel dégagé';
  if (code <= 2) return 'Éclaircies';
  if (code === 3) return 'Couvert';
  if (code === 45 || code === 48) return 'Brouillard';
  if (code >= 51 && code <= 57) return 'Bruine';
  if (code >= 61 && code <= 67) return 'Pluie';
  if (code >= 71 && code <= 77) return 'Neige';
  if (code >= 80 && code <= 82) return 'Averses';
  if (code === 85 || code === 86) return 'Averses de neige';
  if (code >= 95) return 'Orages';
  return 'Temps variable';
}

function firstNumber(value: unknown, fallback: number): number {
  const arr = Array.isArray(value) ? value : [];
  const n = Number(arr[0]);
  return Number.isFinite(n) ? n : fallback;
}

/** Analyse la réponse JSON d'Open-Meteo (prévision du jour). */
export function parseOpenMeteo(json: unknown, label: string = DEFAULT_LOCATION.label): WeatherSnapshot | null {
  if (json === null || typeof json !== 'object') return null;
  const daily = (json as Record<string, unknown>).daily as Record<string, unknown> | undefined;
  if (!daily) return null;
  const code = firstNumber(daily.weather_code, -1);
  const tmax = firstNumber(daily.temperature_2m_max, NaN);
  const tmin = firstNumber(daily.temperature_2m_min, NaN);
  if (!Number.isFinite(tmax) || !Number.isFinite(tmin)) return null;
  const precip = Math.max(0, firstNumber(daily.precipitation_sum, 0));
  const snow = Math.max(0, firstNumber(daily.snowfall_sum, 0));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    summary: `${weatherCodeLabel(code)}, ${Math.round(tmax)}°C / ${Math.round(tmin)}°C${precip > 0 ? `, ${round1(precip)} mm` : ''}${snow > 0 ? `, ${round1(snow)} cm de neige` : ''} (${label})`,
    temp_max_c: round1(tmax),
    temp_min_c: round1(tmin),
    precip_mm: round1(precip),
    snow_cm: round1(snow),
  };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Extrait les titres des articles d'un flux RSS 2.0 ou Atom. */
export function parseRssTitles(xml: string, max = 5): string[] {
  const titles: string[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const m = block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (!m?.[1]) continue;
    const raw = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    const clean = decodeEntities(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (clean.length >= 8 && !titles.includes(clean)) titles.push(clean);
    if (titles.length >= max) break;
  }
  return titles;
}

/** Entrelace les titres de plusieurs flux (1er de chaque flux, puis 2e...). */
export function interleaveHeadlines(lists: readonly string[][], max = 8): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < max; i++) {
    let added = false;
    for (const list of lists) {
      const t = list[i];
      if (t && !out.includes(t)) {
        out.push(t);
        added = true;
        if (out.length >= max) break;
      }
    }
    if (!added) break;
  }
  return out;
}
