/**
 * Variables d'environnement des Edge Functions (secrets Supabase).
 * SUPABASE_URL et la clé secrète (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS) sont fournies
 * automatiquement par Supabase ; les secrets du jeu ne peuvent pas commencer par « SUPABASE_ ».
 */
import { DEFAULT_LOCATION, DEFAULT_RSS_FEEDS } from '../core/world.ts';

export type Effort = 'low' | 'medium' | 'high';

export interface FunctionEnv {
  supabaseUrl: string;
  serviceKey: string;
  /** Clé de l'API Claude ; absente = dictionnaire de secours déterministe (0 €). */
  anthropicApiKey: string | null;
  /** Modèle du Maître du Jeu (défaut claude-haiku-5-5, choisi pour le budget : < 1 $/mois). */
  gmModel: string;
  gmEffort: Effort;
  gmTimeoutMs: number;
  /** Secret partagé avec pg_cron pour appeler daily-world-sync. */
  cronSecret: string | null;
  /** Origine autorisée (CORS), ex. https://monpseudo.github.io ; « * » par défaut. */
  allowedOrigin: string;
  rssFeeds: string[];
  latitude: number;
  longitude: number;
  locationLabel: string;
  /** Probabilité (%) qu'un joueur reçoive une tentation chaque nuit (~1,4 par semaine à 20 %). */
  temptationChancePct: number;
}

/**
 * Clé secrète du serveur : ancienne clé service_role si le projet l'injecte encore, sinon la nouvelle
 * clé « sb_secret_… » fournie par Supabase dans SUPABASE_SECRET_KEYS (dictionnaire JSON, entrée « default »),
 * sinon un secret SB_SECRET_KEY posé à la main.
 */
export function serverSecretKey(get: (key: string) => string | undefined): string {
  const legacy = get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const json = get('SUPABASE_SECRET_KEYS');
  if (json) {
    try {
      const keys = JSON.parse(json) as Record<string, unknown>;
      const key = keys.default ?? Object.values(keys)[0];
      if (typeof key === 'string' && key.length > 0) return key;
    } catch {
      /* format inattendu : on tente le secret manuel */
    }
  }
  const manual = get('SB_SECRET_KEY');
  if (manual) return manual;
  throw new Error("Variable d'environnement manquante : SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS (clé secrète du projet).");
}

export function readEnv(get: (key: string) => string | undefined): FunctionEnv {
  const required = (key: string): string => {
    const value = get(key);
    if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
    return value;
  };
  const num = (key: string, fallback: number): number => {
    const n = Number(get(key));
    return Number.isFinite(n) && get(key) !== undefined && get(key) !== '' ? n : fallback;
  };
  const effort = get('GM_EFFORT');
  return {
    supabaseUrl: required('SUPABASE_URL'),
    serviceKey: serverSecretKey(get),
    anthropicApiKey: get('ANTHROPIC_API_KEY') || null,
    gmModel: get('GM_MODEL') || 'claude-haiku-5-5',
    gmEffort: effort === 'medium' || effort === 'high' ? effort : 'low',
    gmTimeoutMs: num('GM_TIMEOUT_MS', 45_000),
    cronSecret: get('CRON_SECRET') || null,
    allowedOrigin: get('ALLOWED_ORIGIN') || '*',
    rssFeeds: (get('RSS_FEEDS') || '').split(',').map((s) => s.trim()).filter(Boolean).length > 0
      ? (get('RSS_FEEDS') || '').split(',').map((s) => s.trim()).filter(Boolean)
      : [...DEFAULT_RSS_FEEDS],
    latitude: num('WEATHER_LAT', DEFAULT_LOCATION.latitude),
    longitude: num('WEATHER_LON', DEFAULT_LOCATION.longitude),
    locationLabel: get('WEATHER_LABEL') || DEFAULT_LOCATION.label,
    temptationChancePct: num('TEMPTATION_CHANCE_PCT', 20),
  };
}
