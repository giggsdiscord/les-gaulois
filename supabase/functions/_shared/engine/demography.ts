// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/demography.ts
/**
 * Moteur démographique saisonnier [GDD §3.2] : naissances, pérennité, taux d'homosexualité,
 * vieillissement, école du hameau, apprentissage et études de droit à Lleida.
 */
import * as C from './constants.ts';
import { pushEvent, pushLedger, pushTrigger } from './effects.ts';
import { computeNatality, viabilitySeasonDelta } from './formulas.ts';
import { gauge, money } from './math.ts';
import { countPopulation, findMigrant, findPlayer } from './population.ts';
import type { Rng } from './rng.ts';
import type { Child, EngineEffects, GameSnapshot, RoleCode } from './types.ts';

const FIRST_NAMES = [
  'Pau', 'Martí', 'Jana', 'Laia', 'Nil', 'Arlet', 'Joan', 'Núria', 'Biel', 'Queralt',
  'Louis', 'Jeanne', 'Marius', 'Rose', 'Gaspard', 'Elsa', 'Aran', 'Mireia', 'Oriol', 'Clàudia',
];

export const TRACK_POLE: Record<string, RoleCode> = {
  apprentice_forge: 'smith_diplo',
  apprentice_masonry: 'civil_eng',
  apprentice_lab: 'druid',
};

function surnameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : fullName;
}

function parentForBirth(s: GameSnapshot, rng: Rng): { summary: string; migrantId: string | null; playerId: string | null; surname: string } {
  const unions = s.unions.filter((u) => u.is_active);
  if (unions.length > 0) {
    const u = rng.pick(unions);
    const names = [
      findPlayer(s, u.partner_a_player_id)?.display_name ?? findMigrant(s, u.partner_a_migrant_id)?.full_name,
      findPlayer(s, u.partner_b_player_id)?.display_name ?? findMigrant(s, u.partner_b_migrant_id)?.full_name,
    ].filter((n): n is string => Boolean(n));
    const migrantParent = u.partner_a_migrant_id ?? u.partner_b_migrant_id;
    const playerParent = u.partner_a_player_id ?? u.partner_b_player_id;
    return {
      summary: `Enfant légitime de ${names.join(' et ')}`,
      migrantId: migrantParent,
      playerId: playerParent,
      surname: names[0] ? surnameOf(names[0]) : 'del Poble',
    };
  }
  return { summary: 'Né au hameau (foyer non marié)', migrantId: null, playerId: null, surname: 'del Poble' };
}

export function createChild(
  s: GameSnapshot,
  rng: Rng,
  now: Date,
  init: { ageYears: number; parentSummary: string; parentMigrantId?: string | null; parentPlayerId?: string | null; surname: string; bornInVillage: boolean },
): Child {
  const child: Child = {
    id: rng.uuid(),
    full_name: `${rng.pick(FIRST_NAMES)} ${init.surname}`,
    age_years: init.ageYears,
    parent_summary: init.parentSummary,
    parent_migrant_id: init.parentMigrantId ?? null,
    parent_player_id: init.parentPlayerId ?? null,
    born_in_village: init.bornInVillage,
    status: 'child',
    education_track: 'village_school',
    mentor_player_id: null,
    track_started_season: null,
    graduated_pole: null,
    created_at: now.toISOString(),
  };
  s.children.push(child);
  return child;
}

/** Naissances de la saison écoulée (accumulateur déterministe de natalité effective). */
export function processBirths(s: GameSnapshot, fx: EngineEffects, rng: Rng, now: Date): number {
  const v = s.village;
  const nat = computeNatality(s);
  v.birth_accumulator = Math.round((v.birth_accumulator + nat.expectedBirths) * 10000) / 10000;
  const maxBirths = Math.floor(nat.fertileAdults / 2);
  const births = Math.min(Math.floor(v.birth_accumulator), maxBirths);
  v.birth_accumulator = Math.round((v.birth_accumulator - Math.floor(v.birth_accumulator)) * 10000) / 10000;
  for (let i = 0; i < births; i++) {
    const parent = parentForBirth(s, rng);
    const child = createChild(s, rng, now, {
      ageYears: 0,
      parentSummary: parent.summary,
      parentMigrantId: parent.migrantId,
      parentPlayerId: parent.playerId,
      surname: parent.surname,
      bornInVillage: true,
    });
    pushEvent(fx, s, {
      event_type: 'birth',
      title: 'Naissance au hameau',
      body: `${child.full_name} est né(e) au hameau. ${parent.summary}.`,
      data: { child_id: child.id, natality_pct: nat.effectiveRatePct },
    });
  }
  v.births_this_season += births;
  return births;
}

/** Bilan démographique de fin de saison : pérennité, taux d'homosexualité, déclin, extinction. */
export function processDemographicSeason(s: GameSnapshot, fx: EngineEffects, births: number): void {
  const v = s.village;
  v.demographic_viability_pct = gauge(v.demographic_viability_pct + viabilitySeasonDelta(s, births));

  let homoRise = 0;
  if (v.new_adults_this_season === 0) homoRise += C.HOMO_ISOLATION_RISE; // isolement démographique
  if (v.alcohol_consumption_pct > 45) homoRise += C.HOMO_FESTIVE_RISE; // dérives festives prolongées
  if (v.mass_held_this_season) homoRise /= 2; // la Messe freine la hausse [GDD §2.1]
  v.homosexuality_rate_pct = gauge(v.homosexuality_rate_pct + homoRise);

  v.seasons_without_birth = v.births_this_season > 0 ? 0 : v.seasons_without_birth + 1;
  v.low_viability_seasons = v.demographic_viability_pct <= 0 ? v.low_viability_seasons + 1 : 0;

  const declining =
    v.homosexuality_rate_pct > C.HOMO_DECLINE_THRESHOLD || v.seasons_without_birth >= C.SEASONS_WITHOUT_BIRTH_DECLINE;
  if (declining && !v.demographic_decline) {
    pushEvent(fx, s, {
      event_type: 'demographic_decline',
      title: 'Déclin démographique',
      body: 'Le hameau vieillit : sans naissances ni accueil familial, son avenir est menacé.',
    });
  }
  v.demographic_decline = declining;
  if (declining) v.international_notoriety_pct = gauge(v.international_notoriety_pct - 2);

  if (v.low_viability_seasons >= C.EXTINCTION_SEASONS && !v.is_defeated) {
    v.is_defeated = true;
    v.defeat_reason = 'demographic_extinction';
    pushEvent(fx, s, {
      event_type: 'defeat',
      title: 'Extinction démographique',
      body: 'Deux saisons sans pérennité démographique : le dernier habitant éteint la lumière. Défaite collective.',
    });
    pushTrigger(fx, { type: 'defeat', reason: 'demographic_extinction' });
  }
}

/** Les enfants grandissent d'un an par saison ; apprentissages et études de droit. */
export function processChildrenSeason(s: GameSnapshot, fx: EngineEffects): void {
  const v = s.village;
  for (const c of s.children) {
    if (c.status === 'departed') continue;
    c.age_years = Math.min(30, c.age_years + C.CHILD_YEARS_PER_SEASON);

    if (c.status === 'apprentice' && c.track_started_season !== null) {
      const seasons = v.season_number - c.track_started_season;
      if (c.age_years >= C.APPRENTICE_GRADUATION_AGE && seasons >= C.APPRENTICE_MIN_SEASONS) {
        c.status = 'graduated';
        c.graduated_pole = TRACK_POLE[c.education_track] ?? null;
        pushEvent(fx, s, {
          event_type: 'apprentice_graduated',
          title: 'Apprenti diplômé',
          body: `${c.full_name} devient un PNJ spécialisé (+${C.POLE_GRADUATE_BONUS} % de rendement permanent).`,
          data: { child_id: c.id, pole: c.graduated_pole },
        });
      }
    }

    if (c.status === 'law_student' && c.track_started_season !== null) {
      const seasons = v.season_number - c.track_started_season;
      if (seasons >= C.LAW_STUDIES_SEASONS) {
        c.status = 'lawyer';
        v.law_graduates += 1;
        v.admin_pressure_pct = gauge(v.admin_pressure_pct - C.LAW_ADMIN_PRESSURE_REDUCTION);
        pushEvent(fx, s, {
          event_type: 'law_graduate',
          title: 'Diplôme de droit',
          body: `${c.full_name} revient de Lleida avec un diplôme juridique : pression administrative −${C.LAW_ADMIN_PRESSURE_REDUCTION} %.`,
          data: { child_id: c.id },
        });
      } else if (v.treasury_eur >= C.LAW_STUDIES_COST_EUR) {
        v.treasury_eur = money(v.treasury_eur - C.LAW_STUDIES_COST_EUR);
        pushLedger(fx, s, {
          account: 'treasury',
          amount_eur: -C.LAW_STUDIES_COST_EUR,
          label: `Études de droit à Lleida — ${c.full_name}`,
          category: 'education',
        });
      } else {
        c.status = c.age_years >= C.ADULT_AGE ? 'graduated' : 'child';
        c.education_track = 'village_school';
        c.track_started_season = null;
        pushEvent(fx, s, {
          event_type: 'law_studies_interrupted',
          title: 'Études interrompues',
          body: `Faute de 2 500 € en caisse, ${c.full_name} rentre de Lleida sans diplôme.`,
        });
      }
    }
  }
}

/** Accueil des enfants d'un foyer migrant admis : +4 % de pérennité par enfant [GDD §4.2]. */
export function welcomeMigrantChildren(s: GameSnapshot, rng: Rng, now: Date, migrantId: string, count: number): Child[] {
  const m = findMigrant(s, migrantId);
  if (!m || count <= 0) return [];
  const created: Child[] = [];
  for (let i = 0; i < count; i++) {
    created.push(
      createChild(s, rng, now, {
        ageYears: rng.int(0, 15),
        parentSummary: `Enfant de ${m.full_name} (${m.origin})`,
        parentMigrantId: m.id,
        surname: surnameOf(m.full_name),
        bornInVillage: false,
      }),
    );
  }
  s.village.children_welcomed_this_season += count;
  s.village.demographic_viability_pct = gauge(s.village.demographic_viability_pct + count * C.VIABILITY_PER_CHILD_WELCOMED);
  return created;
}

export function populationPyramid(s: GameSnapshot): { label: string; count: number }[] {
  const buckets = [
    { label: '0-11', min: 0, max: 11 },
    { label: '12-17', min: 12, max: 17 },
    { label: '18-30', min: 18, max: 30 },
    { label: '31-45', min: 31, max: 45 },
    { label: '46-65', min: 46, max: 65 },
    { label: '66+', min: 66, max: 200 },
  ];
  const ages: number[] = [
    ...s.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor').map((m) => m.age),
    ...s.children.filter((c) => c.status !== 'departed' && c.status !== 'law_student').map((c) => c.age_years),
  ];
  const founders = countPopulation(s).founders;
  return buckets.map((b) => ({
    label: b.label,
    count: ages.filter((a) => a >= b.min && a <= b.max).length + (b.label === '31-45' ? founders : 0),
  }));
}
