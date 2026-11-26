// Edge Function « game-engine » — moteur déterministe faisant autorité (joueurs authentifiés par PIN).
// Opérations : tick, action, decide_approval, respond_temptation, carlage_challenge, carlage_resolve, putsch_repress.
import { readEnv } from '../_shared/runtime/env.ts';
import { gameEngineHandler } from '../_shared/runtime/handlers.ts';

Deno.serve(gameEngineHandler(readEnv((key) => Deno.env.get(key))));
