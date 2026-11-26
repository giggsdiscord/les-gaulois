// Edge Function « daily-world-sync » — appelée par pg_cron (en-tête x-cron-secret) ou par l'administrateur.
// mode "nightly"     : sauvegarde J-0 + purge 30 j, météo Open-Meteo, RSS, scandales, Gazette, migrants, tentations.
// mode "maintenance" : clôture / exécution de l'Agora, duels abandonnés, sauvegarde pré-Agora du dimanche.
import { readEnv } from '../_shared/runtime/env.ts';
import { dailyWorldSyncHandler } from '../_shared/runtime/handlers.ts';

Deno.serve(dailyWorldSyncHandler(readEnv((key) => Deno.env.get(key))));
