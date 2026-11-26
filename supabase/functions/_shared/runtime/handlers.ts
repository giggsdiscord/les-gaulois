/**
 * Logique HTTP des trois Edge Functions. Les fichiers index.ts se contentent de lire
 * l'environnement Deno et de passer la main ici (testable hors Deno).
 *
 *  game-engine       — joueurs (jeton x-player-token) : tick, actions, verrous, tentations, Carlage
 *  gm-ai-action      — Maître du Jeu IA : Action Libre (joueur) + tâches d'administration
 *  daily-world-sync  — pg_cron (x-cron-secret) ou admin : nuit (météo, RSS, sauvegarde, Gazette,
 *                      migrants, tentations) et maintenance (Agora, duels, sauvegarde pré-Agora)
 */
import { createRng, dayKey, localParts, weekdayOfKey } from '../engine/index.ts';
import { createGm, type GmPort } from '../core/gm/runner.ts';
import type { OpResult } from '../core/session.ts';
import { callRpc, createDb, isAdmin, playerIdFromToken, recentAiCalls, type Db } from './db.ts';
import type { FunctionEnv } from './env.ts';
import { createHttpHandler, HttpError, optStr, safeEqual, str, type JsonBody } from './http.ts';
import { createAnthropicLlm } from './llm.ts';
import { dispatchPush } from './push.ts';
import { runGame, type PipelineDeps } from './pipeline.ts';
import { fetchHeadlines, fetchWeather } from './world.ts';

export function createDeps(env: FunctionEnv, clock: () => Date = () => new Date()): PipelineDeps {
  const db = createDb(env);
  const llm = env.anthropicApiKey
    ? createAnthropicLlm({ apiKey: env.anthropicApiKey, model: env.gmModel, effort: env.gmEffort, timeoutMs: env.gmTimeoutMs })
    : null;
  const gm: GmPort = createGm(llm, { seed: `gm:${clock().toISOString().slice(0, 13)}` });
  return { db, gm, clock };
}

async function requirePlayer(db: Db, req: Request): Promise<string> {
  const playerId = await playerIdFromToken(db, req.headers.get('x-player-token'));
  if (!playerId) throw new HttpError(401, 'Session invalide ou expirée : reconnectez-vous avec votre code PIN.');
  return playerId;
}

async function requireAdmin(db: Db, req: Request): Promise<string> {
  const playerId = await requirePlayer(db, req);
  if (!(await isAdmin(db, playerId))) throw new HttpError(403, 'Réservé à l\'administrateur du village.');
  return playerId;
}

function bool(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, `Champ « ${field} » (booléen) manquant.`);
  return value;
}

// ---------------------------------------------------------------------------
// game-engine
// ---------------------------------------------------------------------------
export function gameEngineHandler(env: FunctionEnv): (req: Request) => Promise<Response> {
  return createHttpHandler(env.allowedOrigin, async (req, body) => {
    const deps = createDeps(env);
    const playerId = await requirePlayer(deps.db, req);
    const op = typeof body.op === 'string' ? body.op : 'tick';
    const run = async (fn: Parameters<typeof runGame>[1], skipIfTrivial = false): Promise<JsonBody> => {
      const out = await runGame(deps, fn, { skipIfTrivial });
      return {
        ...out.result,
        revision: out.revision,
        committed: out.committed,
        days_processed: out.session.daysProcessed,
        events: out.session.visibleEvents(playerId),
      };
    };
    switch (op) {
      case 'tick':
        return run(() => ({ ok: true }), true);
      case 'action':
        return run((s) => s.action(playerId, body.action));
      case 'decide_approval':
        return run((s) => s.decideApproval(playerId, str(body.approval_id, 'approval_id'), bool(body.approve, 'approve'), optStr(body.reason)));
      case 'respond_temptation':
        return run((s) => s.respondTemptation(playerId, str(body.temptation_id, 'temptation_id'), bool(body.yield, 'yield')));
      case 'carlage_challenge':
        return run((s) =>
          s.challengeDuel(playerId, {
            proposalId: optStr(body.proposal_id),
            targetPlayerId: optStr(body.target_player_id),
            championPlayerId: optStr(body.champion_player_id),
            mode: optStr(body.mode),
          }),
        );
      case 'carlage_resolve':
        return run((s) => s.resolveDuel(str(body.duel_id, 'duel_id'), 'player'), true);
      case 'putsch_repress':
        return run((s) => s.repressPutsch(playerId, str(body.duel_id, 'duel_id')));
      default:
        throw new HttpError(400, `Opération inconnue : ${op}`);
    }
  });
}

// ---------------------------------------------------------------------------
// gm-ai-action
// ---------------------------------------------------------------------------
export function gmAiActionHandler(env: FunctionEnv): (req: Request) => Promise<Response> {
  return createHttpHandler(env.allowedOrigin, async (req, body) => {
    const deps = createDeps(env);
    const op = typeof body.op === 'string' ? body.op : 'free_action';
    const finish = (out: Awaited<ReturnType<typeof runGame>>, playerId: string | null): JsonBody => ({
      ...out.result,
      revision: out.revision,
      committed: out.committed,
      events: out.session.visibleEvents(playerId),
    });

    if (op === 'free_action') {
      const playerId = await requirePlayer(deps.db, req);
      const text = str(body.text, 'text');
      const out = await runGame(deps, (s) =>
        s.action(playerId, { action_code: 'free_ai_action', free_text: text, on_behalf_of_id: optStr(body.on_behalf_of_id) }),
      );
      return finish(out, playerId);
    }

    const adminId = await requireAdmin(deps.db, req);
    switch (op) {
      case 'status':
        return {
          ok: true,
          model: env.gmModel,
          effort: env.gmEffort,
          api_key_configured: env.anthropicApiKey !== null,
          recent_calls: await recentAiCalls(deps.db),
        };
      case 'generate_migrants': {
        const count = Math.max(1, Math.min(3, Math.floor(Number(body.count ?? 1)) || 1));
        const out = await runGame(deps, async (s): Promise<OpResult> => ({ ok: true, created: await s.generateMigrants(count) }));
        return finish(out, adminId);
      }
      case 'regenerate_gazette': {
        const out = await runGame(deps, async (s): Promise<OpResult> => {
          const draft = await s.writeGazette(dayKey(s.now), []);
          return { ok: true, gazette: draft };
        });
        return finish(out, adminId);
      }
      case 'send_temptation': {
        const target = str(body.player_id, 'player_id');
        const out = await runGame(deps, async (s): Promise<OpResult> => {
          const id = await s.offerTemptation(target);
          return id ? { ok: true, temptation_id: id } : { ok: false, error: 'Joueur indisponible.' };
        });
        return finish(out, adminId);
      }
      default:
        throw new HttpError(400, `Opération inconnue : ${op}`);
    }
  });
}

// ---------------------------------------------------------------------------
// daily-world-sync
// ---------------------------------------------------------------------------
export function dailyWorldSyncHandler(env: FunctionEnv): (req: Request) => Promise<Response> {
  return createHttpHandler(env.allowedOrigin, async (req, body) => {
    const deps = createDeps(env);
    const secret = req.headers.get('x-cron-secret');
    const fromCron = env.cronSecret !== null && secret !== null && safeEqual(secret, env.cronSecret);
    if (!fromCron) await requireAdmin(deps.db, req);
    const mode = body.mode === 'nightly' ? 'nightly' : body.mode === 'push' ? 'push' : 'maintenance';
    const now = deps.clock();
    const today = dayKey(now);

    // Notifications : réveillé par la base à chaque nouvelle entrée de notification_queue
    if (mode === 'push') {
      return { ok: true, mode, push: await dispatchPush(deps.db, env.vapid, now) };
    }

    if (mode === 'maintenance') {
      // Filet de sécurité : envoie ce qu'un réveil aurait manqué (une erreur ici ne bloque pas la maintenance)
      await dispatchPush(deps.db, env.vapid, now).catch((err: unknown) => console.warn('Notifications : envoi différé impossible', err));
      const local = localParts(now);
      let preAgora = false;
      if (local.weekday === 7 && (local.hour === 10 && local.minute >= 30)) {
        await callRpc(deps.db, 'create_daily_snapshot', { p_trigger: 'pre_agora', p_label: null });
        preAgora = true;
      }
      const out = await runGame(deps, (s): OpResult => ({ ok: true, duels_advanced: s.expireDuels() }), { skipIfTrivial: true });
      return { ...out.result, mode, pre_agora_snapshot: preAgora, committed: out.committed, revision: out.revision };
    }

    // Nuit : sauvegarde J-0 + purge 30 jours, monde réel, scandales, Gazette, migrants, tentations
    const snapshotId = await callRpc(deps.db, 'create_daily_snapshot', { p_trigger: 'auto_midnight', p_label: null });
    const pruned = await callRpc(deps.db, 'prune_daily_snapshots', { p_keep_days: 30 });
    const [weather, headlines] = await Promise.all([fetchWeather(env), fetchHeadlines(env)]);
    const out = await runGame(deps, async (s): Promise<OpResult> => {
      s.applyWorld(weather, headlines);
      const scandals = s.publishScandals();
      const gazette = await s.writeGazette(today, scandals);
      // Dossiers migrants 2 à 3 fois par semaine (lundi, mercredi, vendredi), 1 à 3 candidats
      let migrants: string[] = [];
      const openCandidates = s.snapshot.migrants.filter((m) => m.status === 'candidate').length;
      if ([1, 3, 5].includes(weekdayOfKey(today)) && openCandidates < 5) {
        migrants = await s.generateMigrants(createRng(`${s.snapshot.village.id}:${today}:migrants`).int(1, 3));
      }
      const temptations = await s.generateTemptations(env.temptationChancePct);
      return {
        ok: true,
        weather: weather?.summary ?? null,
        headlines: headlines.length,
        scandals: scandals.length,
        gazette: gazette.headline,
        migrants: migrants.length,
        temptations: temptations.length,
      };
    });
    return { ...out.result, mode, snapshot_id: snapshotId, pruned_snapshots: pruned, revision: out.revision };
  });
}
