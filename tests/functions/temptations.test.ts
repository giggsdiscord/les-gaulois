/**
 * Propositions discrètes (Tentations & Dérives) — V4.5 : variété de la banque, déterminisme,
 * absence de répétition rapprochée pour un même joueur, effets bornés, thème transmis à l'IA.
 */
import { describe, expect, it } from 'vitest';
import { boundTemptationEffects, constants, createRng, validateTemptationDraft } from '../../src/engine/index.ts';
import { fallbackResponse } from '../../supabase/functions/_shared/core/gm/fallback.ts';
import { buildUserMessage, SYSTEM_PROMPT, type GmContext, type PlayerBrief, type RecentTemptation } from '../../supabase/functions/_shared/core/gm/prompt.ts';
import { createGm, type LlmPort } from '../../supabase/functions/_shared/core/gm/runner.ts';
import { TEMPTATION_EFFECT_KEYS } from '../../supabase/functions/_shared/core/gm/schema.ts';
import {
  draftTemptationFromBank,
  pickTemptationTheme,
  TEMPTATION_TEMPLATES,
  TEMPTATION_THEME_CODES,
  TEMPTATION_THEMES,
  temptationConditions,
  themeOfTemptation,
  type TemptationConditions,
} from '../../supabase/functions/_shared/core/gm/temptationBank.ts';
import { GameSession } from '../../supabase/functions/_shared/core/session.ts';
import type { GameState } from '../../supabase/functions/_shared/core/types.ts';
import { playerId, seedSnapshot } from '../fixtures.ts';

const FOUNDERS: [string, string, string][] = [
  ['mayor_agri', 'Ely', 'Pit'],
  ['treasurer_physio', 'Guillem', 'M. Lerme'],
  ['civil_eng', 'Tiphaine', 'Tiph'],
  ['water_eng', 'Alex', 'Alex Joly'],
  ['smith_diplo', 'Julio', 'Julou'],
  ['druid', 'Tanguy', 'Tango'],
  ['priest_apoth', 'Guillaume B.', 'Brunel'],
];

function brief(role: string, display: string, character: string, slot = 1): PlayerBrief {
  return {
    id: playerId(slot), display_name: display, character_name: character, role_code: role, role_title: role,
    ministerial_portfolios: [], action_points: 3, health_pct: 100, mental_health_pct: 80, addiction_level_pct: 0, private_wealth_eur: 0,
  };
}

const ELY = brief('mayor_agri', 'Ely', 'Pit', 1);
const MILD: TemptationConditions = { temp_c: 14, snow_cm: 0 };

function context(village: Record<string, unknown> = { real_temp_c: 14, real_snow_cm: 0 }): GmContext {
  return { village, residents: [], childrenCount: 0, openProposals: [], chat: [], weather: 'Ensoleillé', news: [], player: null };
}

/** Donne N dilemmes successifs à un joueur en réinjectant l'historique, comme la session. */
function successive(player: PlayerBrief, n: number, c: TemptationConditions = MILD, seed = 's') {
  const recent: RecentTemptation[] = [];
  const picks = [];
  for (let i = 0; i < n; i++) {
    const rng = createRng(`${seed}:${i}`);
    const theme = pickTemptationTheme(rng, player, recent, c);
    const pick = draftTemptationFromBank(rng, player, recent, theme, c);
    picks.push({ ...pick, requested: theme });
    recent.unshift({ title: pick.title, category: pick.category, prompt_text: pick.prompt_text });
  }
  return picks;
}

describe('Banque des propositions discrètes', () => {
  it('est nettement plus variée : ≥ 80 situations, 15 thèmes, les 3 catégories bien fournies', () => {
    expect(TEMPTATION_TEMPLATES.length).toBeGreaterThanOrEqual(80);
    expect(TEMPTATION_THEME_CODES).toHaveLength(15);
    for (const code of TEMPTATION_THEME_CODES) {
      expect(TEMPTATION_TEMPLATES.filter((t) => t.theme === code).length, code).toBeGreaterThanOrEqual(5);
    }
    for (const cat of ['festive', 'sentimental', 'ideological_financial'] as const) {
      expect(TEMPTATION_TEMPLATES.filter((t) => t.category === cat).length, cat).toBeGreaterThanOrEqual(14);
    }
  });

  it('a des clés et des titres uniques', () => {
    expect(new Set(TEMPTATION_TEMPLATES.map((t) => t.key)).size).toBe(TEMPTATION_TEMPLATES.length);
    expect(new Set(TEMPTATION_TEMPLATES.map((t) => t.title.toLowerCase())).size).toBe(TEMPTATION_TEMPLATES.length);
  });

  it('garde des effets modestes, toujours dans les bornes du moteur', () => {
    for (const t of TEMPTATION_TEMPLATES) {
      for (const fx of [t.yield_effects, t.resist_effects]) {
        for (const key of Object.keys(fx)) expect(TEMPTATION_EFFECT_KEYS as readonly string[], `${t.key}.${key}`).toContain(key);
        expect(boundTemptationEffects(fx), t.key).toEqual(fx);
      }
      expect(t.yield_effects.morale_pct ?? 0, t.key).toBeLessThanOrEqual(12);
    }
  });

  it('rédige un texte valide pour chaque fondateur, sans trou ni allusion à soi-même', () => {
    const SELF: Record<string, string> = {
      mayor_agri: 'Ely', treasurer_physio: 'M. Lerme', civil_eng: 'Tiphaine', water_eng: 'Alex', smith_diplo: 'Julio', druid: 'Tanguy', priest_apoth: 'Brunel',
    };
    for (const [role, display, character] of FOUNDERS) {
      const p = brief(role, display, character);
      for (const t of TEMPTATION_TEMPLATES) {
        if (t.only && !t.only.includes(role)) continue;
        if (t.notFor?.includes(role)) continue;
        for (let k = 0; k < 4; k++) {
          const text = t.prompt(p, createRng(`${t.key}:${role}:${k}`));
          expect(text.length, t.key).toBeGreaterThanOrEqual(40);
          expect(text.length, t.key).toBeLessThanOrEqual(600);
          expect(text, t.key).not.toMatch(/\bundefined\b|\bnull\b|\$\{|\bNaN\b/);
          // Le joueur peut être apostrophé par son surnom en tête de phrase, jamais cité à la 3e personne
          expect(text.replace(`${character}, `, ''), `${t.key} pour ${role}`).not.toContain(SELF[role]);
          const draft = validateTemptationDraft({ category: t.category, title: t.title, prompt_text: text, yield_effects: t.yield_effects, resist_effects: t.resist_effects });
          expect(draft, t.key).not.toBeNull();
        }
      }
    }
  });

  it('respecte les rôles : situations réservées au métier, et jamais d\'allusion à soi-même', () => {
    const elyPool = new Set(successive(ELY, 60, MILD, 'roles').map((p) => p.key));
    expect(elyPool.has('subst_plants')).toBe(false);
    expect(elyPool.has('riv_tomates')).toBe(false);
    expect([...elyPool].filter((k) => k.startsWith('call_')).every((k) => k === 'call_voix')).toBe(true);
    const brunel = brief('priest_apoth', 'Guillaume B.', 'Brunel', 7);
    for (let i = 0; i < 40; i++) {
      const text = draftTemptationFromBank(createRng(`riv:${i}`), brunel, [], 'rivalry', MILD).prompt_text;
      expect(text).not.toMatch(/Brunel/);
    }
  });

  it('tient compte de la météo réelle (pas de ski en été, pas de plage en hiver)', () => {
    const snowy = successive(ELY, 60, { temp_c: 1, snow_cm: 5 }, 'hiver').map((p) => p.key);
    const summer = successive(ELY, 60, { temp_c: 30, snow_cm: 0 }, 'ete').map((p) => p.key);
    expect(snowy).not.toContain('esc_salou');
    expect(summer).not.toContain('esc_ski');
    expect(temptationConditions({ real_temp_c: '3.5', real_snow_cm: null })).toEqual({ temp_c: 3.5, snow_cm: null });
  });
});

describe('Tirage sans répétition rapprochée', () => {
  it('ne repropose aucune situation parmi les 24 derniers dilemmes d\'un joueur', () => {
    for (const [role, display, character] of FOUNDERS) {
      const picks = successive(brief(role, display, character), constants.TEMPTATION_NO_REPEAT_WINDOW, MILD, role);
      expect(new Set(picks.map((p) => p.title)).size, role).toBe(picks.length);
    }
  });

  it('change de thème d\'un dilemme à l\'autre et alterne les catégories', () => {
    const picks = successive(ELY, 30, MILD, 'themes');
    for (let i = 1; i < picks.length; i++) {
      const previous = picks.slice(Math.max(0, i - constants.TEMPTATION_THEME_COOLDOWN), i).map((p) => p.theme);
      expect(previous, `tirage ${i}`).not.toContain(picks[i].theme);
      expect(picks[i].theme).toBe(picks[i].requested);
    }
    const categories = new Set(picks.slice(0, 9).map((p) => p.category));
    expect(categories.size).toBe(3);
    expect(new Set(picks.map((p) => p.theme)).size).toBeGreaterThanOrEqual(12);
  });

  it('reste utilisable quand toute la banque a déjà servi', () => {
    const everything = TEMPTATION_TEMPLATES.map((t) => ({ title: t.title, category: t.category }));
    const pick = draftTemptationFromBank(createRng('plein'), ELY, everything, null, MILD);
    expect(everything.slice(0, 5).map((r) => r.title)).not.toContain(pick.title);
  });

  it('varie d\'un joueur et d\'une nuit à l\'autre, mais reste déterministe', () => {
    const titles = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const r = fallbackResponse({ kind: 'temptation', player: ELY }, context(), `nuit-${i}`);
      titles.add(String(r.private_temptation?.title));
    }
    expect(titles.size).toBeGreaterThanOrEqual(30);
    const a = fallbackResponse({ kind: 'temptation', player: ELY, recent: [], theme: 'gambling' }, context(), 'graine');
    const b = fallbackResponse({ kind: 'temptation', player: ELY, recent: [], theme: 'gambling' }, context(), 'graine');
    expect(a).toEqual(b);
    expect(themeOfTemptation({ title: String(a.private_temptation?.title) })).toBe('gambling');
  });

  it('reconnaît le thème d\'un dilemme écrit par l\'IA', () => {
    expect(themeOfTemptation({ title: 'Partie de poker au refuge', prompt_text: 'Mise de 50 € chacun.' })).toBe('gambling');
    expect(themeOfTemptation({ title: 'Un colis à Andorre', prompt_text: 'Passer la douane du Pas de la Casa avec des cigarettes.' })).toBe('smuggling');
    expect(themeOfTemptation({ title: 'Sans rapport', prompt_text: 'Rien de reconnaissable.' })).toBeNull();
  });

  it('le dictionnaire de secours renvoie un dilemme complet aux effets bornés', () => {
    const r = fallbackResponse({ kind: 'temptation', player: ELY, recent: [{ title: 'Enveloppe discrète', category: 'ideological_financial' }], theme: 'romance' }, context(), 'x');
    const t = r.private_temptation as Record<string, unknown>;
    expect(t.target_player_id).toBe(ELY.id);
    expect(t.category).toBe('sentimental');
    expect(Object.keys(t.yield_effects as object).sort()).toEqual([...TEMPTATION_EFFECT_KEYS].sort());
    expect(validateTemptationDraft(t)).not.toBeNull();
  });
});

describe('IA : thème imposé et historique dans le message', () => {
  it('cite le thème et les derniers dilemmes reçus, sans toucher au system prompt', () => {
    const recent = Array.from({ length: 12 }, (_, i) => ({ title: `Dilemme « n°${i} »`, category: 'festive' }));
    const msg = buildUserMessage({ kind: 'temptation', player: ELY, recent, theme: 'fame' }, context());
    expect(msg).toContain(TEMPTATION_THEMES.fame.label);
    expect(msg).toContain('« Dilemme n°0 » (festive)');
    expect(msg).toContain('Dilemme n°7');
    expect(msg).not.toContain('Dilemme n°8');
    expect(buildUserMessage({ kind: 'temptation', player: ELY }, context())).toContain('Dilemmes déjà reçus par ce joueur : aucun.');
    expect(SYSTEM_PROMPT).not.toMatch(/20\d\d-\d\d-\d\d/);
    expect(SYSTEM_PROMPT).toContain('Ne reprends jamais la situation');
  });
});

describe('Session : historique des dilemmes', () => {
  const NOW = '2026-11-27T23:10:00Z';
  const state = (overrides: Partial<GameState> = {}): GameState => ({
    snapshot: seedSnapshot(), proposals: [], duels: [], moves: [], targetResults: [], chat: [], recentEvents: [], ...overrides,
  });

  it('fusionne l\'historique chargé et l\'instantané, du plus récent au plus ancien', () => {
    const ely = playerId(1);
    const s = state({
      recentTemptations: [
        { id: 'a', player_id: ely, category: 'festive', title: 'Ancien', prompt_text: null, created_at: '2026-10-01T00:00:00Z' },
        { id: 'b', player_id: playerId(2), category: 'festive', title: 'Autre joueur', prompt_text: null, created_at: '2026-11-01T00:00:00Z' },
        { id: 'c', player_id: ely, category: 'sentimental', title: 'Récent', prompt_text: 'x', created_at: '2026-11-20T00:00:00Z' },
      ],
    });
    const gs = new GameSession(s, { now: new Date(NOW), gm: createGm(null, { seed: 't' }) });
    expect(gs.temptationHistory(ely).map((r) => r.title)).toEqual(['Récent', 'Ancien']);
  });

  it('ne repropose pas une situation déjà reçue et transmet le thème à l\'IA', async () => {
    const ely = playerId(1);
    const used = TEMPTATION_TEMPLATES.filter((t) => t.theme === 'bar' || t.theme === 'fiesta');
    const recentTemptations = used.map((t, i) => ({
      id: `old-${i}`, player_id: ely, category: t.category, title: t.title, prompt_text: null,
      created_at: new Date(Date.parse(NOW) - (i + 1) * 86_400_000).toISOString(),
    }));
    const prompts: string[] = [];
    const llm: LlmPort = {
      model: 'test',
      complete: async ({ user }) => {
        prompts.push(user);
        throw new Error('indisponible');
      },
    };
    const gs = new GameSession(state({ recentTemptations }), { now: new Date(NOW), gm: createGm(llm, { seed: 't' }) });
    gs.tick();
    const id = await gs.offerTemptation(ely);
    const offered = gs.snapshot.temptations.find((t) => t.id === id);
    expect(offered).toBeDefined();
    expect(used.map((t) => t.title)).not.toContain(offered?.title);
    expect(prompts[0]).toMatch(/Thème imposé pour varier/);
    expect(prompts[0]).toContain(used[0].title);
  });

  it('enchaîne des nuits sans répéter les dilemmes d\'un joueur', async () => {
    const ely = playerId(1);
    let s = state();
    const titles: string[] = [];
    for (let night = 0; night < 12; night++) {
      const now = new Date(Date.parse(NOW) + night * 86_400_000);
      const gs = new GameSession(s, { now, gm: createGm(null, { seed: `nuit-${night}` }) });
      gs.tick();
      const id = await gs.offerTemptation(ely);
      expect(id, `nuit ${night}`).not.toBeNull();
      const t = gs.snapshot.temptations.find((x) => x.id === id);
      titles.push(String(t?.title));
      expect(gs.respondTemptation(ely, String(id), false).ok).toBe(true);
      s = { ...gs.state, recentEvents: [] };
    }
    expect(new Set(titles).size).toBe(titles.length);
  });
});
