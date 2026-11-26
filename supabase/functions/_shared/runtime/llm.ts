/**
 * Port LLM du Maître du Jeu, implémenté avec le SDK officiel Anthropic (Messages API).
 *  - system prompt stable mis en cache (cache_control éphémère, minimum 512 jetons atteint) ;
 *  - sortie JSON stricte (output_config.format = schéma JSON du §7.2) ;
 *  - effort explicite (défaut « low » : narration courte, coût maîtrisé) ;
 *  - repli serveur sur refus (fallbacks: "default") pour les modèles qui le permettent ;
 *  - délai maximal et 1 nouvelle tentative ; toute erreur bascule sur le dictionnaire de secours.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { LlmCompletion, LlmPort } from '../core/gm/runner.ts';
import type { Effort } from './env.ts';

/** Modèles acceptant le repli serveur sur refus (paramètre fallbacks, bêta server-side-fallback). */
const SERVER_FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1|fable-5-2)$/;

export interface AnthropicLlmConfig {
  apiKey: string;
  model: string;
  effort: Effort;
  timeoutMs: number;
}

export function createAnthropicLlm(config: AnthropicLlmConfig): LlmPort {
  const client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 1 });
  const serverFallback = SERVER_FALLBACK_MODELS.test(config.model);

  return {
    model: config.model,
    async complete({ system, user, schema }): Promise<LlmCompletion> {
      const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
        model: config.model,
        max_tokens: 16000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { effort: config.effort, format: { type: 'json_schema', schema } },
      };
      if (serverFallback) {
        params.betas = ['server-side-fallback-2026-07-01'];
        params.fallbacks = 'default';
      }
      const response = await client.beta.messages.create(params);
      if (response.stop_reason === 'refusal') {
        throw new Error(`Refus du modèle (${response.stop_details?.category ?? 'catégorie inconnue'})`);
      }
      if (response.stop_reason === 'max_tokens') throw new Error('Réponse tronquée (max_tokens atteint)');
      let text = '';
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
      }
      return {
        text,
        model: response.model,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}
