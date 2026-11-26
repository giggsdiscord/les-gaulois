import { DemoApi } from './demo.ts';
import { SupabaseApi } from './supabase.ts';
import type { GameApi } from './types.ts';

/**
 * Supabase si VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies au build
 * (variables du dépôt GitHub, cf. .github/workflows/deploy-pages.yml), sinon mode démo local.
 */
export function createApi(): GameApi {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  // Clé publique VAPID des notifications push (V4.3), facultative
  const vapid = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? null;
  if (url && key) return new SupabaseApi(url, key, vapid);
  return new DemoApi();
}
