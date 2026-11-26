// Edge Function « gm-ai-action » — Maître du Jeu IA (System Prompt §7.2, bornage du moteur, dictionnaire de secours).
// Opérations : free_action (joueur) ; status, generate_migrants, regenerate_gazette, send_temptation (administrateur).
import { readEnv } from '../_shared/runtime/env.ts';
import { gmAiActionHandler } from '../_shared/runtime/handlers.ts';

Deno.serve(gmAiActionHandler(readEnv((key) => Deno.env.get(key))));
