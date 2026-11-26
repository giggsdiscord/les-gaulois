/**
 * Schéma JSON de la réponse du Maître du Jeu (structured outputs : output_config.format).
 * Reprend le JSON du System Prompt §7.2 ; tous les objets sont fermés (additionalProperties: false)
 * et toutes les clés requises — les champs facultatifs sont « null ».
 */
import { AI_DELTA_BOUNDS } from '../../engine/index.ts';

export const DELTA_KEYS = Object.keys(AI_DELTA_BOUNDS) as (keyof typeof AI_DELTA_BOUNDS)[];

export const INCIDENT_TYPES = [
  'pipe_rupture', 'police_raid', 'inspection', 'fine', 'injury', 'theft', 'epidemic',
  'strike', 'mired_track', 'storm', 'livestock_loss', 'fire', 'sabotage', 'narrative',
] as const;

export const LEANINGS = ['Droite conservatrice', 'Droite libérale', 'Centre', 'Gauche sociale', 'Extrême gauche / Collectiviste'] as const;
export const SPECIALTIES = ['mason', 'carpenter', 'welder', 'farmer', 'mechanic', 'electrician', 'shepherd', 'unskilled'] as const;
export const FACTIONS = ['loyalist', 'union_agitator', 'black_market', 'devout'] as const;
export const TEMPTATION_EFFECT_KEYS = [
  'morale_pct', 'alcohol_consumption_pct', 'drug_prevalence_pct', 'homosexuality_rate_pct', 'treasury_eur',
  'private_wealth_eur', 'addiction_level_pct', 'left_wing_ideology_pct', 'admin_pressure_pct', 'international_notoriety_pct',
] as const;

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
const int = { type: 'integer' } as const;
const bool = { type: 'boolean' } as const;
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] });

function closedObject(properties: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}

const effects = closedObject(Object.fromEntries(TEMPTATION_EFFECT_KEYS.map((k) => [k, num])));

export const GM_RESPONSE_SCHEMA: Record<string, unknown> = closedObject({
  gazette_headline: str,
  narrative_text: str,
  deltas: closedObject(Object.fromEntries(DELTA_KEYS.map((k) => [k, num]))),
  triggered_incident: nullable(
    closedObject({
      type: { type: 'string', enum: [...INCIDENT_TYPES] },
      severity: { type: 'integer', enum: [1, 2, 3] },
      description: str,
      target_player_id: nullable(str),
    }),
  ),
  new_migrant_candidate: nullable(
    closedObject({
      full_name: str,
      age: int,
      origin: str,
      religion: str,
      political_leaning: { type: 'string', enum: [...LEANINGS] },
      left_wing_score: int,
      physical_strength: int,
      specialty_code: { type: 'string', enum: [...SPECIALTIES] },
      specialty_level: int,
      children_count: int,
      spanish_speaker: bool,
      value_proposition: str,
      hidden_risk_note: nullable(str),
      pathology_note: nullable(str),
      back_fragility: bool,
      addiction_level_pct: num,
      faction_type: { type: 'string', enum: [...FACTIONS] },
    }),
  ),
  private_temptation: nullable(
    closedObject({
      target_player_id: nullable(str),
      category: { type: 'string', enum: ['festive', 'sentimental', 'ideological_financial'] },
      title: str,
      prompt_text: str,
      yield_effects: effects,
      resist_effects: effects,
    }),
  ),
});
