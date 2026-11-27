import { describe, expect, it, vi } from 'vitest';
import { createRng, validateMigrantDraft } from '../../src/engine/index.ts';
import { generateMigrantDraft, fallbackResponse } from '../../supabase/functions/_shared/core/gm/fallback.ts';
import { buildUserMessage, SYSTEM_PROMPT, type GmContext, type PlayerBrief } from '../../supabase/functions/_shared/core/gm/prompt.ts';
import { createGm, type LlmPort } from '../../supabase/functions/_shared/core/gm/runner.ts';
import { GM_SCHEMAS, DELTA_KEYS, countUnions } from '../../supabase/functions/_shared/core/gm/schema.ts';
import { interleaveHeadlines, parseOpenMeteo, parseRssTitles, weatherCodeLabel } from '../../supabase/functions/_shared/core/world.ts';

describe('Connecteurs monde réel', () => {
  it('analyse un flux RSS (CDATA, entités, balises)', () => {
    const xml = `<rss><channel><title>El País</title>
      <item><title><![CDATA[La Generalitat aprueba el presupuesto <b>2027</b>]]></title></item>
      <item><title>Prix de l&#39;énergie : hausse de 3 % &amp; plus</title></item>
      <item><title>Court</title></item></channel></rss>`;
    expect(parseRssTitles(xml)).toEqual(['La Generalitat aprueba el presupuesto 2027', "Prix de l'énergie : hausse de 3 % & plus"]);
  });

  it('analyse un flux Atom', () => {
    expect(parseRssTitles('<feed><entry><title type="html">Nevada en el Pirineo de Lleida</title></entry></feed>')).toEqual(['Nevada en el Pirineo de Lleida']);
  });

  it('entrelace les titres de plusieurs flux sans doublon', () => {
    expect(interleaveHeadlines([['A1', 'A2'], ['B1', 'A1'], []], 3)).toEqual(['A1', 'B1', 'A2']);
  });

  it('convertit la réponse Open-Meteo en météo de jeu', () => {
    const w = parseOpenMeteo({ daily: { weather_code: [73], temperature_2m_max: [2.4], temperature_2m_min: [-5.1], precipitation_sum: [6.2], snowfall_sum: [4.34] } }, 'Alt Urgell');
    expect(w).toEqual({ summary: 'Neige, 2°C / -5°C, 6.2 mm, 4.3 cm de neige (Alt Urgell)', temp_max_c: 2.4, temp_min_c: -5.1, precip_mm: 6.2, snow_cm: 4.3 });
    expect(parseOpenMeteo({})).toBeNull();
    expect(weatherCodeLabel(0)).toBe('Ciel dégagé');
  });
});

const PLAYER: PlayerBrief = {
  id: '10000000-0000-4000-8000-000000000002',
  display_name: 'Guillem',
  character_name: 'M. Lerme',
  role_title: 'Trésorier & Kinésithérapeute',
  ministerial_portfolios: [],
  action_points: 2,
  health_pct: 100,
  mental_health_pct: 80,
  addiction_level_pct: 5,
  private_wealth_eur: 2000,
};

const CTX: GmContext = {
  village: { id: 'v', revision: 3, treasury_eur: 50000, morale_pct: 75 },
  residents: [],
  childrenCount: 0,
  openProposals: [],
  chat: Array.from({ length: 30 }, (_, i) => ({ sender: 'Ely', content: `message ${i}` })),
  weather: 'Ciel dégagé, 12°C / 3°C (Alt Urgell)',
  news: ['Titre réel'],
  player: null,
};

function validResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    gazette_headline: 'Le Trésorier négocie',
    narrative_text: 'M. Lerme obtient une remise chez BigMat. « Molt bé », dit le vendeur.',
    deltas: Object.fromEntries(DELTA_KEYS.map((k) => [k, k === 'treasury_eur' ? 99999 : 0])),
    triggered_incident: null,
    new_migrant_candidate: null,
    private_temptation: null,
    ...overrides,
  });
}

function mockLlm(text: string | Error): LlmPort & { complete: ReturnType<typeof vi.fn> } {
  const complete = vi.fn(async () => {
    if (text instanceof Error) throw text;
    return { text, model: 'claude-test', usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0 } };
  });
  return { model: 'claude-test', complete };
}

describe('Maître du Jeu IA', () => {
  it('system prompt stable (cacheable) : règles §7.2, aucune donnée du tour', () => {
    expect(SYSTEM_PROMPT).toContain('RÉALISME CONTEMPORAIN STRICT');
    expect(SYSTEM_PROMPT).toContain('INITIATIVES LÉGISLATIVES HEBDOMADAIRES');
    expect(SYSTEM_PROMPT).toContain('RÉPONDS UNIQUEMENT AVEC CE JSON VALIDE');
    expect(SYSTEM_PROMPT).not.toMatch(/\{\{|\d{4}-\d{2}-\d{2}/);
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(6000);
  });

  it('message utilisateur : données du tour, 25 derniers messages au plus', () => {
    const msg = buildUserMessage({ kind: 'free_action', player: PLAYER, text: 'Je négocie chez BigMat' }, CTX);
    expect(msg).toContain('DONNÉES DU TOUR & CONTEXTE RÉEL');
    expect(msg).toContain('"treasury_eur":50000');
    expect(msg).toContain('message 29');
    expect(msg).not.toContain('"message 4"');
    expect(msg).toContain('Je négocie chez BigMat');
  });

  it('schéma de sortie strict : objets fermés, toutes les clés requises', () => {
    const visit = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return;
      const n = node as Record<string, unknown>;
      if (n.type === 'object') {
        expect(n.additionalProperties).toBe(false);
        expect([...(n.required as string[])].sort()).toEqual(Object.keys(n.properties as object).sort());
      }
      for (const v of Object.values(n)) visit(v);
    };
    for (const schema of Object.values(GM_SCHEMAS)) visit(schema);
  });

  it('schémas par tâche assez petits pour la grammaire de l’API (unions limitées)', () => {
    for (const [kind, schema] of Object.entries(GM_SCHEMAS)) {
      expect(countUnions(schema), kind).toBeLessThanOrEqual(2);
      const props = Object.keys((schema as { properties: object }).properties);
      expect(props, kind).toEqual(expect.arrayContaining(['gazette_headline', 'narrative_text', 'deltas']));
    }
    expect(Object.keys((GM_SCHEMAS.migrant as { properties: object }).properties)).toContain('new_migrant_candidate');
    expect(Object.keys((GM_SCHEMAS.temptation as { properties: object }).properties)).toContain('private_temptation');
    expect(Object.keys((GM_SCHEMAS.gazette as { properties: object }).properties)).not.toContain('new_migrant_candidate');
  });

  it('réponse valide du LLM : utilisée et bornée par le moteur', async () => {
    const llm = mockLlm(validResponse());
    const gm = createGm(llm, { seed: 't' });
    const out = await gm.run({ kind: 'free_action', player: PLAYER, text: 'Je négocie' }, CTX, PLAYER.id);
    expect(out.usedFallback).toBe(false);
    expect(out.response.deltas.treasury_eur).toBe(3000);
    expect(out.aiCall).toMatchObject({ used_fallback: false, model: 'claude-test', input_tokens: 2100, output_tokens: 50 });
    expect(llm.complete).toHaveBeenCalledWith(expect.objectContaining({ system: SYSTEM_PROMPT, schema: GM_SCHEMAS.free_action }));
  });

  it('erreur de l\'API : dictionnaire de secours, erreur journalisée', async () => {
    const gm = createGm(mockLlm(new Error('timeout')), { seed: 't' });
    const out = await gm.run({ kind: 'free_action', player: PLAYER, text: 'Une tournée générale au bar !' }, CTX);
    expect(out.usedFallback).toBe(true);
    expect(out.aiCall.error).toContain('timeout');
    expect(out.response.deltas.alcohol_consumption_pct).toBe(2);
  });

  it('sans clé API : secours déterministe', async () => {
    const out = await createGm(null, { seed: 't' }).run({ kind: 'gazette', date: '2026-11-27', events: [{ title: 'Naissance au hameau', body: 'Pau est né.' }], scandals: [] }, CTX);
    expect(out.usedFallback).toBe(true);
    expect(out.response.gazette_headline).toBe('Naissance au hameau');
  });

  it('tâche non remplie (pas de dossier migrant) : secours avec dossier valide', async () => {
    const out = await createGm(mockLlm(validResponse()), { seed: 't' }).run({ kind: 'migrant', index: 0 }, CTX);
    expect(out.usedFallback).toBe(true);
    expect(out.response.new_migrant_candidate).not.toBeNull();
  });

  it('les sorties hors tâche sont neutralisées', async () => {
    const draft = generateMigrantDraft(createRng('x'));
    const out = await createGm(mockLlm(validResponse({ new_migrant_candidate: draft })), { seed: 't' }).run({ kind: 'free_action', player: PLAYER, text: 'Je marche' }, CTX);
    expect(out.response.new_migrant_candidate).toBeNull();
  });

  it('mémorise le résultat d\'une tâche (pas de double facturation en cas de nouvel essai)', async () => {
    const llm = mockLlm(validResponse());
    const gm = createGm(llm, { seed: 't' });
    await gm.run({ kind: 'free_action', player: PLAYER, text: 'Je négocie' }, CTX);
    await gm.run({ kind: 'free_action', player: PLAYER, text: 'Je négocie' }, CTX);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it('générateur de dossiers de secours : déterministe et valide', () => {
    const a = generateMigrantDraft(createRng('seed-1'));
    expect(generateMigrantDraft(createRng('seed-1'))).toEqual(a);
    expect(validateMigrantDraft(a).ok).toBe(true);
  });

  it('initiative « fonds souverain » : versement de 10 % de la caisse (plafonné)', () => {
    const r = fallbackResponse(
      { kind: 'initiative', proposal: { id: 'p', title: 'Fonds souverain norvégien', detailed_explanation: 'Épargne intergénérationnelle', category: 'economy', yes: 5, no: 2 } },
      CTX,
      's',
    );
    expect(r.deltas.sovereign_fund_eur).toBe(5000);
  });

  it('Gazette de secours : la petite histoire des résidents (V5.7) paraît sans IA', () => {
    const story = { title: 'Petite histoire : Querelle de voisinage', body: 'Aitor accuse Nour d’avoir emprunté sa pelle.' };
    const r = fallbackResponse({ kind: 'gazette', date: '2026-11-28', events: [{ title: 'Chantier achevé', body: '« Four » est livré.' }, story], scandals: [] }, CTX, 's');
    expect(r.gazette_headline).toBe('Chantier achevé');
    expect(r.narrative_text).toContain('Au coin du feu : Aitor accuse Nour');
    const alone = fallbackResponse({ kind: 'gazette', date: '2026-11-28', events: [story], scandals: [] }, CTX, 's');
    expect(alone.narrative_text.match(/Aitor accuse/g)).toHaveLength(1);
  });
});
