/**
 * Exécution d'une tâche du Maître du Jeu : appel du LLM (port injecté), validation et bornage
 * par le moteur, repli déterministe sur le dictionnaire local en cas d'échec.
 * Les résultats sont mémorisés par tâche : si l'écriture en base doit être rejouée (conflit
 * de révision), le LLM n'est pas rappelé.
 */
import { sanitizeAiResponse, type SanitizedAiResponse } from '../../engine/index.ts';
import type { AiCallDraft } from '../types.ts';
import { fallbackResponse } from './fallback.ts';
import { buildUserMessage, SYSTEM_PROMPT, TASK_CONTEXT, type GmContext, type GmTask } from './prompt.ts';
import { GM_RESPONSE_SCHEMA } from './schema.ts';

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface LlmCompletion {
  text: string;
  model: string;
  usage: LlmUsage;
}

/** Port vers un fournisseur de LLM (implémenté par runtime/llm.ts avec le SDK Anthropic). */
export interface LlmPort {
  readonly model: string;
  complete(request: { system: string; user: string; schema: Record<string, unknown> }): Promise<LlmCompletion>;
}

export interface GmOutcome {
  response: SanitizedAiResponse;
  usedFallback: boolean;
  aiCall: AiCallDraft;
}

export interface GmPort {
  run(task: GmTask, ctx: GmContext, playerId?: string | null): Promise<GmOutcome>;
}

function taskKey(task: GmTask): string {
  switch (task.kind) {
    case 'free_action':
      return `free:${task.player.id}:${task.text}`;
    case 'initiative':
      return `initiative:${task.proposal.id}`;
    case 'migrant':
      return `migrant:${task.index}`;
    case 'temptation':
      return `temptation:${task.player.id}`;
    case 'gazette':
      return `gazette:${task.date}`;
  }
}

/** Vérifie que la réponse contient ce que la tâche exige. */
function fulfils(task: GmTask, r: SanitizedAiResponse): string | null {
  if (!r.ok) return r.warnings.join(' ; ') || 'réponse illisible';
  if (!r.narrative_text) return 'récit manquant';
  if (task.kind === 'migrant' && !r.new_migrant_candidate) return 'dossier migrant manquant ou invalide';
  if (task.kind === 'temptation' && !r.private_temptation) return 'dilemme manquant ou invalide';
  if (task.kind === 'gazette' && !r.gazette_headline) return 'titre de Gazette manquant';
  return null;
}

/** Les sorties hors tâche sont neutralisées (pas de migrant surprise dans une action libre…). */
function restrictToTask(task: GmTask, r: SanitizedAiResponse): SanitizedAiResponse {
  return {
    ...r,
    new_migrant_candidate: task.kind === 'migrant' ? r.new_migrant_candidate : null,
    private_temptation: task.kind === 'temptation' ? r.private_temptation : null,
  };
}

export interface GmOptions {
  /** Graine des tirages de secours (ex. id du village + date). */
  seed: string;
  /** Horloge pour mesurer la latence (injectée pour les tests). */
  clock?: () => number;
}

export function createGm(llm: LlmPort | null, options: GmOptions): GmPort {
  const memo = new Map<string, Promise<GmOutcome>>();
  const clock = options.clock ?? (() => Date.now());

  async function execute(task: GmTask, ctx: GmContext, playerId: string | null): Promise<GmOutcome> {
    const context = TASK_CONTEXT[task.kind];
    const started = clock();
    let error: string | null = llm ? null : 'aucune clé API : dictionnaire de secours';
    let usage: LlmUsage | null = null;
    let model: string | null = null;
    if (llm) {
      try {
        const completion = await llm.complete({ system: SYSTEM_PROMPT, user: buildUserMessage(task, ctx), schema: GM_RESPONSE_SCHEMA });
        usage = completion.usage;
        model = completion.model;
        const sanitized = sanitizeAiResponse(completion.text, context);
        const problem = fulfils(task, sanitized);
        if (!problem) {
          return {
            response: restrictToTask(task, sanitized),
            usedFallback: false,
            aiCall: {
              call_kind: task.kind,
              player_id: playerId,
              used_fallback: false,
              model,
              input_tokens: usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
              output_tokens: usage.output_tokens,
              latency_ms: Math.round(clock() - started),
              error: sanitized.warnings.length > 0 ? sanitized.warnings.join(' ; ').slice(0, 500) : null,
            },
          };
        }
        error = `réponse rejetée : ${problem}`;
      } catch (err) {
        error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      }
    }
    const fallback = sanitizeAiResponse(fallbackResponse(task, ctx, `${options.seed}:${taskKey(task)}`), context);
    return {
      response: restrictToTask(task, fallback),
      usedFallback: true,
      aiCall: {
        call_kind: task.kind,
        player_id: playerId,
        used_fallback: true,
        model,
        input_tokens: usage ? usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens : null,
        output_tokens: usage ? usage.output_tokens : null,
        latency_ms: Math.round(clock() - started),
        error: error ? error.slice(0, 500) : null,
      },
    };
  }

  return {
    run(task, ctx, playerId = null) {
      const key = taskKey(task);
      const cached = memo.get(key);
      if (cached) return cached;
      const promise = execute(task, ctx, playerId);
      memo.set(key, promise);
      return promise;
    },
  };
}
