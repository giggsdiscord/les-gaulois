// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/temptations.ts
/**
 * Moteur de Tentations & Dérives [GDD §6.2] : dilemmes privés soumis par le Maître du Jeu.
 * Céder : +20 % de moral immédiat, −2 PA le lendemain, et scandale dans La Gazette
 * si le joueur ne se confesse pas à Brunel avant la parution.
 */
import { TEMPTATION_AP_PENALTY, TEMPTATION_MORALE_BONUS } from './constants.ts';
import { pushEvent, pushLedger, pushTrigger } from './effects.ts';
import { clamp, gauge, money } from './math.ts';
import { findPlayer } from './population.ts';
import type { Rng } from './rng.ts';
import type { EngineEffects, GameSnapshot, Temptation, TemptationCategory, TemptationEffects } from './types.ts';

const EFFECT_BOUNDS: Record<keyof TemptationEffects, number> = {
  morale_pct: 20,
  alcohol_consumption_pct: 5,
  drug_prevalence_pct: 3,
  homosexuality_rate_pct: 1,
  treasury_eur: 500,
  private_wealth_eur: 500,
  addiction_level_pct: 10,
  left_wing_ideology_pct: 3,
  admin_pressure_pct: 10,
  international_notoriety_pct: 5,
};

export function boundTemptationEffects(raw: unknown): TemptationEffects {
  const out: TemptationEffects = {};
  if (raw === null || typeof raw !== 'object') return out;
  for (const [key, bound] of Object.entries(EFFECT_BOUNDS) as [keyof TemptationEffects, number][]) {
    const value = Number((raw as Record<string, unknown>)[key]);
    if (Number.isFinite(value) && value !== 0) out[key] = Math.round(clamp(value, -bound, bound) * 100) / 100;
  }
  return out;
}

export interface TemptationDraft {
  category: TemptationCategory;
  title: string;
  prompt_text: string;
  yield_effects: TemptationEffects;
  resist_effects: TemptationEffects;
}

/** Valide le champ private_temptation renvoyé par l'IA. */
export function validateTemptationDraft(raw: unknown): TemptationDraft | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const cat = String(r.category ?? 'festive');
  const category: TemptationCategory = cat === 'sentimental' || cat === 'ideological_financial' ? cat : 'festive';
  const title = String(r.title ?? '').trim().slice(0, 120);
  const prompt = String(r.prompt_text ?? r.prompt ?? r.dilemma ?? '').trim().slice(0, 1200);
  if (title.length < 3 || prompt.length < 20) return null;
  return {
    category,
    title,
    prompt_text: prompt,
    yield_effects: boundTemptationEffects(r.yield_effects),
    resist_effects: boundTemptationEffects(r.resist_effects),
  };
}

export function createTemptation(
  s: GameSnapshot,
  playerId: string,
  draft: TemptationDraft,
  rng: Rng,
  now: Date,
  generatedBy: Temptation['generated_by'],
): Temptation {
  const t: Temptation = {
    id: rng.uuid(),
    player_id: playerId,
    ...draft,
    choice: 'pending',
    confessed: false,
    confessed_at: null,
    published: false,
    generated_by: generatedBy,
    created_at: now.toISOString(),
    responded_at: null,
    expires_at: new Date(now.getTime() + 36 * 3_600_000).toISOString(),
  };
  s.temptations.push(t);
  return t;
}

function applyEffects(s: GameSnapshot, fx: EngineEffects, playerId: string, e: TemptationEffects, label: string): void {
  const v = s.village;
  const p = findPlayer(s, playerId);
  if (e.morale_pct) v.morale_pct = gauge(v.morale_pct + e.morale_pct / 4);
  if (e.alcohol_consumption_pct) v.alcohol_consumption_pct = gauge(v.alcohol_consumption_pct + e.alcohol_consumption_pct);
  if (e.drug_prevalence_pct) v.drug_prevalence_pct = gauge(v.drug_prevalence_pct + e.drug_prevalence_pct);
  if (e.homosexuality_rate_pct) v.homosexuality_rate_pct = gauge(v.homosexuality_rate_pct + e.homosexuality_rate_pct);
  if (e.left_wing_ideology_pct) v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct + e.left_wing_ideology_pct);
  if (e.admin_pressure_pct) v.admin_pressure_pct = gauge(v.admin_pressure_pct + e.admin_pressure_pct);
  if (e.international_notoriety_pct) v.international_notoriety_pct = gauge(v.international_notoriety_pct + e.international_notoriety_pct);
  if (e.treasury_eur) {
    const delta = Math.max(-v.treasury_eur, e.treasury_eur);
    v.treasury_eur = money(v.treasury_eur + delta);
    pushLedger(fx, s, { account: 'treasury', amount_eur: delta, label, category: 'temptation' });
  }
  if (p) {
    if (e.addiction_level_pct) p.addiction_level_pct = gauge(p.addiction_level_pct + e.addiction_level_pct);
    if (e.private_wealth_eur) {
      const delta = Math.max(-p.private_wealth_eur, e.private_wealth_eur);
      p.private_wealth_eur = money(p.private_wealth_eur + delta);
      pushLedger(fx, s, { account: 'private', player_id: p.id, amount_eur: delta, label, category: 'temptation' });
    }
  }
}

export interface TemptationResponse {
  ok: boolean;
  error: string | null;
  narrative: string;
}

export function respondToTemptation(
  s: GameSnapshot,
  fx: EngineEffects,
  temptationId: string,
  playerId: string,
  yieldToIt: boolean,
  now: Date,
): TemptationResponse {
  const t = s.temptations.find((x) => x.id === temptationId);
  if (!t || t.player_id !== playerId) return { ok: false, error: 'Dilemme introuvable.', narrative: '' };
  if (t.choice !== 'pending') return { ok: false, error: 'Vous avez déjà répondu.', narrative: '' };
  if (new Date(t.expires_at).getTime() <= now.getTime()) return { ok: false, error: 'L\'occasion est passée.', narrative: '' };
  const p = findPlayer(s, playerId);
  if (!p) return { ok: false, error: 'Joueur introuvable.', narrative: '' };
  t.responded_at = now.toISOString();
  if (yieldToIt) {
    t.choice = 'yielded';
    p.morale_pct = Math.round(clamp(p.morale_pct + TEMPTATION_MORALE_BONUS, 0, 100));
    p.pending_ap_penalty = Math.min(3, p.pending_ap_penalty + TEMPTATION_AP_PENALTY);
    p.temptation_guilt_pct = Math.round(clamp(p.temptation_guilt_pct + 30, 0, 100));
    applyEffects(s, fx, p.id, t.yield_effects, `Tentation : ${t.title}`);
    return { ok: true, error: null, narrative: 'Vous avez cédé. Moral +20 %, mais −2 PA demain… et Brunel attend votre confession avant La Gazette.' };
  }
  t.choice = 'resisted';
  p.skill_xp += 10;
  applyEffects(s, fx, p.id, t.resist_effects, `Tentation repoussée : ${t.title}`);
  return { ok: true, error: null, narrative: 'Vous avez résisté. La vertu ne fait pas de bruit, mais elle compte.' };
}

/** À la parution de La Gazette : chaque écart non confessé devient un scandale public. */
export function publishScandals(s: GameSnapshot, fx: EngineEffects): Temptation[] {
  const published: Temptation[] = [];
  for (const t of s.temptations) {
    if (t.choice !== 'yielded' || t.confessed || t.published) continue;
    t.published = true;
    const p = findPlayer(s, t.player_id);
    if (p) {
      p.morale_pct = Math.round(clamp(p.morale_pct - 10, 0, 100));
      p.temptation_guilt_pct = Math.round(clamp(p.temptation_guilt_pct + 10, 0, 100));
    }
    s.village.admin_pressure_pct = gauge(s.village.admin_pressure_pct + (t.category === 'ideological_financial' ? 5 : 2));
    s.village.international_notoriety_pct = gauge(s.village.international_notoriety_pct - 1);
    pushEvent(fx, s, {
      event_type: 'scandal',
      title: `Scandale : ${t.title}`,
      body: `${p?.display_name ?? 'Un habitant'} n'a pas jugé bon de se confesser. La Gazette, elle, a tout noté.`,
      data: { temptation_id: t.id, category: t.category },
    });
    pushTrigger(fx, { type: 'scandal_published', temptation_id: t.id, player_id: t.player_id });
    published.push(t);
  }
  return published;
}
