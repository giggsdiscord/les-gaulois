// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/migrants.ts
/**
 * Bureau de l'Immigration [GDD §4.2, §4.3] : validation des dossiers générés par l'IA,
 * admission / refus votés à l'Agora, loyauté individuelle, naturalisation (Acte III).
 */
import { FOUNDER_ROLES, LEFT_SCORE_BY_LEANING, SPECIALTY_POLE } from './constants.ts';
import { welcomeMigrantChildren } from './demography.ts';
import { pushEvent } from './effects.ts';
import { clamp, gauge } from './math.ts';
import { countPopulation, findMigrant, findPlayer } from './population.ts';
import type { Rng } from './rng.ts';
import type {
  EngineEffects,
  FactionType,
  GameSnapshot,
  Migrant,
  PoliticalLeaning,
  RoleCode,
  SpecialtyCode,
} from './types.ts';

const SPECIALTY_ALIASES: Record<string, SpecialtyCode> = {
  mason: 'mason', 'maçon': 'mason', macon: 'mason',
  carpenter: 'carpenter', charpentier: 'carpenter',
  welder: 'welder', soudeur: 'welder',
  farmer: 'farmer', 'maraîcher': 'farmer', maraicher: 'farmer', agriculteur: 'farmer',
  mechanic: 'mechanic', 'mécanicien': 'mechanic', 'mécanicien diesel': 'mechanic', mecanicien: 'mechanic',
  electrician: 'electrician', 'électricien': 'electrician', electricien: 'electrician',
  shepherd: 'shepherd', berger: 'shepherd',
  unskilled: 'unskilled', 'sans qualification': 'unskilled',
};

export function normalizeSpecialty(raw: unknown): SpecialtyCode {
  const key = String(raw ?? '').trim().toLowerCase();
  return SPECIALTY_ALIASES[key] ?? 'unskilled';
}

export function normalizeLeaning(raw: unknown): PoliticalLeaning {
  const t = String(raw ?? '').toLowerCase();
  if (t.includes('extr') && t.includes('gauche')) return 'Extrême gauche / Collectiviste';
  if (t.includes('collectiv')) return 'Extrême gauche / Collectiviste';
  if (t.includes('gauche') || t.includes('syndic')) return 'Gauche sociale';
  if (t.includes('centre') || t.includes('pragmat')) return 'Centre';
  if (t.includes('libéral') || t.includes('liberal') || t.includes('entrepren')) return 'Droite libérale';
  if (t.includes('droite') || t.includes('conserv') || t.includes('tradition')) return 'Droite conservatrice';
  return 'Centre';
}

const HISPANIC_HINTS = ['espagne', 'españa', 'catalogne', 'catalunya', 'amérique latine', 'latin', 'mexique', 'colombie', 'argentine', 'pérou', 'équateur', 'venezuela', 'bolivie', 'chili', 'cuba'];

export interface MigrantDraft {
  full_name: string;
  age: number;
  origin: string;
  religion: string;
  political_leaning: PoliticalLeaning;
  left_wing_score: number;
  physical_strength: number;
  specialty_code: SpecialtyCode;
  specialty_level: number;
  children_count: number;
  spanish_speaker: boolean;
  value_proposition: string;
  hidden_risk_note: string | null;
  pathology_note: string | null;
  back_fragility: boolean;
  addiction_level_pct: number;
  faction_type: FactionType;
}

export interface DraftValidation {
  ok: boolean;
  draft: MigrantDraft | null;
  errors: string[];
}

function text(raw: unknown, max: number): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Valide et borne un dossier de candidat proposé par l'IA (champ new_migrant_candidate). */
export function validateMigrantDraft(raw: unknown): DraftValidation {
  const errors: string[] = [];
  if (raw === null || typeof raw !== 'object') return { ok: false, draft: null, errors: ['Dossier absent'] };
  const r = raw as Record<string, unknown>;
  const fullName = text(r.full_name ?? r.name, 80);
  if (fullName.length < 3) errors.push('Nom manquant');
  const origin = text(r.origin, 80);
  if (!origin) errors.push('Origine manquante');
  const religion = text(r.religion, 40) || 'Athée/Laïque';
  const age = Math.round(Number(r.age));
  if (!Number.isFinite(age) || age < 18 || age > 65) errors.push('Âge hors bornes (18-65)');
  const leaning = normalizeLeaning(r.political_leaning);
  const leftRaw = Number(r.left_wing_score);
  const left = Number.isFinite(leftRaw) ? clamp(Math.round(leftRaw), 0, 100) : LEFT_SCORE_BY_LEANING[leaning] ?? 40;
  const strength = Number.isFinite(Number(r.physical_strength)) ? clamp(Math.round(Number(r.physical_strength)), 1, 100) : 50;
  const level = Number.isFinite(Number(r.specialty_level)) ? clamp(Math.round(Number(r.specialty_level)), 1, 5) : 1;
  const kids = Number.isFinite(Number(r.children_count)) ? clamp(Math.round(Number(r.children_count)), 0, 5) : 0;
  const value = text(r.value_proposition, 600);
  if (!value) errors.push('Apport concret manquant');
  const lowerOrigin = origin.toLowerCase();
  const spanish =
    typeof r.spanish_speaker === 'boolean' ? r.spanish_speaker : HISPANIC_HINTS.some((h) => lowerOrigin.includes(h));
  const factionRaw = String(r.faction_type ?? 'loyalist');
  const faction: FactionType = (['loyalist', 'union_agitator', 'black_market', 'devout'] as const).includes(factionRaw as FactionType)
    ? (factionRaw as FactionType)
    : 'loyalist';
  if (errors.length > 0) return { ok: false, draft: null, errors };
  return {
    ok: true,
    errors: [],
    draft: {
      full_name: fullName,
      age,
      origin,
      religion,
      political_leaning: leaning,
      left_wing_score: left,
      physical_strength: strength,
      specialty_code: normalizeSpecialty(r.specialty_code ?? r.specialty),
      specialty_level: level,
      children_count: kids,
      spanish_speaker: spanish,
      value_proposition: value,
      hidden_risk_note: text(r.hidden_risk_note ?? r.hidden_risk, 400) || null,
      pathology_note: text(r.pathology_note, 300) || null,
      back_fragility: r.back_fragility === true,
      addiction_level_pct: Number.isFinite(Number(r.addiction_level_pct)) ? gauge(Number(r.addiction_level_pct)) : 0,
      faction_type: faction,
    },
  };
}

export function createCandidate(
  s: GameSnapshot,
  draft: MigrantDraft,
  rng: Rng,
  now: Date,
  generatedBy: Migrant['generated_by'],
): Migrant {
  const loyalty: Partial<Record<RoleCode, number>> = {};
  for (const role of FOUNDER_ROLES) loyalty[role] = 40;
  const migrant: Migrant = {
    id: rng.uuid(),
    ...draft,
    health_pct: draft.back_fragility ? 80 : 90,
    injury_type: null,
    status: 'candidate',
    is_naturalized: false,
    patron_player_id: null,
    loyalty_scores: loyalty,
    assigned_pole: SPECIALTY_POLE[draft.specialty_code],
    private_employer_id: null,
    private_wage_eur_week: 0,
    forced_labor_until: null,
    is_detained_until: null,
    admission_proposal_id: null,
    generated_by: generatedBy,
    arrived_at: now.toISOString(),
    decided_at: null,
  };
  s.migrants.push(migrant);
  return migrant;
}

export function adjustLoyalty(m: Migrant, role: RoleCode, delta: number): void {
  const current = m.loyalty_scores[role] ?? 40;
  m.loyalty_scores = { ...m.loyalty_scores, [role]: Math.round(clamp(current + delta, 0, 100)) };
}

/** Rôle du fondateur auquel le résident est le plus loyal (son « protecteur »). */
export function topLoyaltyRole(m: Migrant): RoleCode | null {
  let best: RoleCode | null = null;
  let bestScore = -1;
  for (const role of FOUNDER_ROLES) {
    const score = m.loyalty_scores[role] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = role;
    }
  }
  return best;
}

export interface AdmissionInput {
  migrantId: string;
  proposalId: string | null;
  proposerId: string | null;
  votesYes: string[];
  votesNo: string[];
}

/** Admission votée : effets démographiques, idéologiques et linguistiques immédiats [GDD §4.2]. */
export function admitMigrant(s: GameSnapshot, fx: EngineEffects, rng: Rng, now: Date, input: AdmissionInput): Migrant | null {
  const m = findMigrant(s, input.migrantId);
  if (!m || m.status !== 'candidate') return null;
  const v = s.village;
  const adultsBefore = countPopulation(s).adults;
  m.status = 'accepted';
  m.decided_at = now.toISOString();
  m.arrived_at = now.toISOString();
  m.admission_proposal_id = input.proposalId;

  for (const id of input.votesYes) {
    const p = findPlayer(s, id);
    if (p) adjustLoyalty(m, p.role_code, 25);
  }
  for (const id of input.votesNo) {
    const p = findPlayer(s, id);
    if (p) adjustLoyalty(m, p.role_code, -15);
  }
  const proposer = findPlayer(s, input.proposerId);
  if (proposer && input.votesYes.includes(proposer.id)) {
    m.patron_player_id = proposer.id;
  } else {
    const role = topLoyaltyRole(m);
    m.patron_player_id = s.players.find((p) => p.role_code === role)?.id ?? null;
  }

  // Modifie directement left_wing_ideology_pct dès l'admission (poids d'un nouvel adulte)
  v.left_wing_ideology_pct = gauge(v.left_wing_ideology_pct + (m.left_wing_score - v.left_wing_ideology_pct) / (adultsBefore + 1));
  if (m.spanish_speaker) v.spanish_fluency_pct = gauge(v.spanish_fluency_pct + 2);
  v.new_adults_this_season += 1;
  const kids = welcomeMigrantChildren(s, rng, now, m.id, m.children_count);

  pushEvent(fx, s, {
    event_type: 'migrant_admitted',
    title: 'Nouvel arrivant',
    body: `${m.full_name} (${m.age} ans, ${m.origin}) s'installe au hameau${kids.length ? ` avec ${kids.length} enfant(s)` : ''}.`,
    data: { migrant_id: m.id, children: kids.length },
  });
  return m;
}

export function rejectMigrant(s: GameSnapshot, fx: EngineEffects, now: Date, migrantId: string): Migrant | null {
  const m = findMigrant(s, migrantId);
  if (!m || m.status !== 'candidate') return null;
  m.status = 'rejected';
  m.decided_at = now.toISOString();
  pushEvent(fx, s, {
    event_type: 'migrant_rejected',
    title: 'Candidature refusée',
    body: `${m.full_name} reprend la piste forestière vers Lleida.`,
    data: { migrant_id: m.id },
  });
  return m;
}

/** Naturalisation (Acte III) : le résident vote désormais en faveur de son protecteur [GDD §4.3]. */
export function naturalizeMigrant(s: GameSnapshot, fx: EngineEffects, migrantId: string): Migrant | null {
  const m = findMigrant(s, migrantId);
  if (!m || m.status !== 'accepted' || m.is_naturalized || s.village.act_number < 3) return null;
  m.is_naturalized = true;
  if (!m.patron_player_id) {
    const role = topLoyaltyRole(m);
    m.patron_player_id = s.players.find((p) => p.role_code === role)?.id ?? null;
  }
  const patron = findPlayer(s, m.patron_player_id);
  if (patron) adjustLoyalty(m, patron.role_code, 10);
  s.village.international_notoriety_pct = gauge(s.village.international_notoriety_pct + 1);
  pushEvent(fx, s, {
    event_type: 'naturalization',
    title: 'Naturalisation',
    body: `${m.full_name} devient citoyen(ne) du Micro-État${patron ? ` sous la protection de ${patron.display_name}` : ''}.`,
    data: { migrant_id: m.id },
  });
  return m;
}
