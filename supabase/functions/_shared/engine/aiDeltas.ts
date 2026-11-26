// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/aiDeltas.ts
/**
 * Validation & bornage des réponses du Maître du Jeu IA [GDD §3 « borne strictement les
 * modificateurs proposés par l'IA », §7.2]. Le moteur reste l'unique source de vérité :
 * toute clé inconnue est ignorée, chaque delta est plafonné selon le contexte, l'argent ne se
 * crée pas pour le fonds souverain, et l'insécurité passe par la part événementielle amortie.
 */
import { addHours, calendarSeasonOf, localParts } from './calendar.ts';
import { emptyEffects, pushEvent, pushLedger } from './effects.ts';
import { applyInjury } from './health.ts';
import { clamp, deepClone, gauge, money, stock } from './math.ts';
import { validateMigrantDraft, type MigrantDraft } from './migrants.ts';
import { activePlayers, findPlayer } from './population.ts';
import type { Rng } from './rng.ts';
import { refreshDerived } from './simulation.ts';
import { validateTemptationDraft, type TemptationDraft } from './temptations.ts';
import type { EngineEffects, GameSnapshot } from './types.ts';

/** Clés autorisées (JSON du System Prompt §7.2) et plafond absolu par appel (contexte « free_action »). */
export const AI_DELTA_BOUNDS = {
  treasury_eur: 3000,
  sovereign_fund_eur: 5000,
  food_rations: 40,
  tomatoes_stock: 40,
  track_condition_pct: 10,
  morale_pct: 12,
  spanish_fluency_pct: 4,
  admin_pressure_pct: 12,
  international_notoriety_pct: 8,
  homosexuality_rate_pct: 2,
  demographic_viability_pct: 6,
  alcohol_consumption_pct: 6,
  drug_prevalence_pct: 5,
  insecurity_pct: 12,
  left_wing_ideology_pct: 6,
  cultural_friction_pct: 8,
} as const;

export type AiDeltaKey = keyof typeof AI_DELTA_BOUNDS;
export type AiDeltas = Partial<Record<AiDeltaKey, number>>;

/** Multiplicateur de plafond selon le contexte de l'appel. */
export const AI_CONTEXT_MULTIPLIER = {
  free_action: 1,
  initiative: 2, // proposition hebdomadaire adoptée par l'Agora
  world_event: 1.5, // actualité réelle / incident quotidien
  gazette: 0.5,
  temptation: 0.5,
} as const;
export type AiContext = keyof typeof AI_CONTEXT_MULTIPLIER;

export interface AiIncident {
  type: string;
  severity: 1 | 2 | 3;
  description: string;
  target_player_id: string | null;
}

export interface SanitizedAiResponse {
  ok: boolean;
  gazette_headline: string;
  narrative_text: string;
  deltas: AiDeltas;
  triggered_incident: AiIncident | null;
  new_migrant_candidate: MigrantDraft | null;
  private_temptation: (TemptationDraft & { target_player_id: string | null; target_role: string | null }) | null;
  warnings: string[];
}

/** Extrait l'objet JSON d'une réponse brute (tolère les clôtures ```json et le texte parasite). */
export function extractJson(raw: unknown): unknown {
  if (raw !== null && typeof raw === 'object') return raw;
  const text = String(raw ?? '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function boundDeltas(raw: unknown, context: AiContext, warnings: string[] = []): AiDeltas {
  const out: AiDeltas = {};
  if (raw === null || typeof raw !== 'object') return out;
  const mult = AI_CONTEXT_MULTIPLIER[context];
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in AI_DELTA_BOUNDS)) {
      warnings.push(`Clé ignorée : ${key}`);
      continue;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      warnings.push(`Valeur non numérique ignorée : ${key}`);
      continue;
    }
    if (n === 0) continue;
    const bound = AI_DELTA_BOUNDS[key as AiDeltaKey] * mult;
    const bounded = clamp(n, -bound, bound);
    if (bounded !== n) warnings.push(`${key} plafonné de ${n} à ${bounded}`);
    out[key as AiDeltaKey] = Math.round(bounded * 100) / 100;
  }
  return out;
}

function parseIncident(raw: unknown): AiIncident | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t ? { type: 'narrative', severity: 1, description: t.slice(0, 400), target_player_id: null } : null;
  }
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const severity = clamp(Math.round(Number(r.severity ?? 1)) || 1, 1, 3) as 1 | 2 | 3;
  return {
    type: String(r.type ?? 'narrative').toLowerCase().slice(0, 40),
    severity,
    description: String(r.description ?? '').slice(0, 400),
    target_player_id: typeof r.target_player_id === 'string' ? r.target_player_id : null,
  };
}

export function sanitizeAiResponse(raw: unknown, context: AiContext): SanitizedAiResponse {
  const warnings: string[] = [];
  const json = extractJson(raw);
  if (json === null || typeof json !== 'object') {
    return {
      ok: false,
      gazette_headline: '',
      narrative_text: '',
      deltas: {},
      triggered_incident: null,
      new_migrant_candidate: null,
      private_temptation: null,
      warnings: ['Réponse IA illisible : fallback déterministe requis.'],
    };
  }
  const r = json as Record<string, unknown>;
  const migrant = r.new_migrant_candidate ? validateMigrantDraft(r.new_migrant_candidate) : null;
  if (migrant && !migrant.ok) warnings.push(`Dossier migrant rejeté : ${migrant.errors.join(', ')}`);
  const temptationRaw = r.private_temptation as Record<string, unknown> | null | undefined;
  const temptation = temptationRaw ? validateTemptationDraft(temptationRaw) : null;
  if (temptationRaw && !temptation) warnings.push('Tentation rejetée (incomplète).');
  return {
    ok: true,
    gazette_headline: String(r.gazette_headline ?? '').trim().slice(0, 160),
    narrative_text: String(r.narrative_text ?? '').trim().slice(0, 2000),
    deltas: boundDeltas(r.deltas, context, warnings),
    triggered_incident: parseIncident(r.triggered_incident),
    new_migrant_candidate: migrant?.ok ? migrant.draft : null,
    private_temptation: temptation
      ? {
          ...temptation,
          target_player_id: typeof temptationRaw?.target_player_id === 'string' ? temptationRaw.target_player_id : null,
          target_role: typeof temptationRaw?.target_role === 'string' ? temptationRaw.target_role : null,
        }
      : null,
    warnings,
  };
}

export interface AppliedAi extends EngineEffects {
  snapshot: GameSnapshot;
  applied: AiDeltas;
}

/** Applique des deltas déjà bornés (conservation de la monnaie, jauges 0-100). */
export function applyAiDeltas(input: GameSnapshot, deltas: AiDeltas, label: string, now: Date): AppliedAi {
  const s = deepClone(input);
  const fx = emptyEffects();
  const v = s.village;
  const applied: AiDeltas = {};

  let treasury = deltas.treasury_eur ?? 0;
  let sovereign = deltas.sovereign_fund_eur ?? 0;
  // Un fonds souverain s'abonde depuis la caisse : pas de création monétaire
  if (sovereign > 0) {
    const fundedByTreasury = Math.max(0, -treasury);
    if (fundedByTreasury < sovereign) treasury -= sovereign - fundedByTreasury;
  }
  if (sovereign < 0) sovereign = Math.max(sovereign, -v.sovereign_fund_eur);
  if (v.treasury_eur + treasury < 0) {
    const shortfall = -(v.treasury_eur + treasury);
    treasury += shortfall;
    if (sovereign > 0) sovereign = Math.max(0, sovereign - shortfall);
  }
  if (treasury !== 0) {
    v.treasury_eur = money(v.treasury_eur + treasury);
    applied.treasury_eur = money(treasury);
    pushLedger(fx, s, { account: 'treasury', amount_eur: treasury, label, category: 'ai' });
  }
  if (sovereign !== 0) {
    v.sovereign_fund_eur = money(v.sovereign_fund_eur + sovereign);
    applied.sovereign_fund_eur = money(sovereign);
    pushLedger(fx, s, { account: 'sovereign_fund', amount_eur: sovereign, label, category: 'ai' });
  }

  if (deltas.food_rations) {
    const before = v.food_rations;
    v.food_rations = money(Math.max(0, v.food_rations + deltas.food_rations));
    applied.food_rations = money(v.food_rations - before);
  }
  if (deltas.tomatoes_stock) {
    const before = v.tomatoes_stock;
    v.tomatoes_stock = stock(v.tomatoes_stock + deltas.tomatoes_stock);
    applied.tomatoes_stock = v.tomatoes_stock - before;
  }
  const gaugeKeys = [
    'track_condition_pct',
    'morale_pct',
    'spanish_fluency_pct',
    'admin_pressure_pct',
    'international_notoriety_pct',
    'homosexuality_rate_pct',
    'demographic_viability_pct',
    'alcohol_consumption_pct',
    'drug_prevalence_pct',
    'left_wing_ideology_pct',
    'cultural_friction_pct',
  ] as const;
  for (const key of gaugeKeys) {
    const d = deltas[key];
    if (!d) continue;
    const before = v[key];
    v[key] = gauge(before + d);
    applied[key] = Math.round((v[key] - before) * 100) / 100;
  }
  // Insécurité : calculée par formule ; l'IA agit sur la part événementielle (amortie 10 %/jour)
  if (deltas.insecurity_pct) {
    v.insecurity_offset = Math.round((v.insecurity_offset + deltas.insecurity_pct) * 100) / 100;
    applied.insecurity_pct = deltas.insecurity_pct;
  }
  const p = localParts(now);
  refreshDerived(s, now, calendarSeasonOf(p.month, p.day), fx);
  return { snapshot: s, applied, ...fx };
}

/** Traduit un incident nommé par l'IA en conséquences déterministes du moteur. */
export function applyIncident(input: GameSnapshot, incident: AiIncident, rng: Rng, now: Date): { snapshot: GameSnapshot; effects: EngineEffects; applied: boolean } {
  const s = deepClone(input);
  const fx = emptyEffects();
  const v = s.village;
  const k = incident.severity;
  let applied = true;
  switch (incident.type) {
    case 'pipe_rupture':
      v.water_network_condition_pct = gauge(v.water_network_condition_pct - 10 * k);
      v.water_quality_pct = gauge(v.water_quality_pct - 5 * k);
      break;
    case 'police_raid':
    case 'inspection':
      v.admin_pressure_pct = gauge(v.admin_pressure_pct + 5 * k);
      v.insecurity_offset = Math.round((v.insecurity_offset - 3 * k) * 100) / 100;
      break;
    case 'fine': {
      const fine = Math.min(v.treasury_eur, 400 * k);
      v.treasury_eur = money(v.treasury_eur - fine);
      pushLedger(fx, s, { account: 'treasury', amount_eur: -fine, label: incident.description || 'Amende', category: 'fine' });
      break;
    }
    case 'injury': {
      const target = findPlayer(s, incident.target_player_id) ?? rng.pick(activePlayers(s));
      if (target && target.injury_type === null) {
        applyInjury(target, 'muscular', now);
        target.health_pct = Math.round(clamp(target.health_pct - 10 * k, 0, 100));
      }
      break;
    }
    case 'theft':
      v.tools_stock = stock(v.tools_stock - k);
      v.food_rations = money(Math.max(0, v.food_rations - 5 * k));
      v.tools_stolen_season += k;
      break;
    case 'epidemic':
      v.epidemic_incubation_days = Math.max(v.epidemic_incubation_days, 3);
      break;
    case 'strike':
      v.strike_until = addHours(now, 24 * k).toISOString();
      break;
    case 'mired_track':
      v.track_blocked_until = addHours(now, 24).toISOString();
      v.track_condition_pct = gauge(v.track_condition_pct - 3 * k);
      break;
    case 'storm':
      v.track_condition_pct = gauge(v.track_condition_pct - 4 * k);
      v.food_rations = money(Math.max(0, v.food_rations - 5 * k));
      break;
    case 'livestock_loss':
      v.livestock_count = Math.max(0, v.livestock_count - k);
      break;
    case 'fire': {
      const ruins = s.structures.filter((st) => st.status === 'operational' && st.kind === 'building');
      if (ruins.length > 0) {
        const st = rng.pick(ruins);
        st.condition_pct = Math.max(0, st.condition_pct - 20 * k);
        if (st.condition_pct < 40) st.status = 'damaged';
      }
      break;
    }
    case 'sabotage':
      v.sabotage_pending = true;
      break;
    default:
      applied = false;
  }
  if (applied || incident.description) {
    pushEvent(fx, s, {
      event_type: `incident_${incident.type}`,
      title: 'Incident',
      body: incident.description || incident.type,
      data: { severity: k, applied },
    });
  }
  const p = localParts(now);
  refreshDerived(s, now, calendarSeasonOf(p.month, p.day), fx);
  return { snapshot: s, effects: fx, applied };
}
