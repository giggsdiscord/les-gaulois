// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/collective.ts
/**
 * Chantier collectif de la semaine [GDD §5.5, V5.0] : un projet commun choisi par vote
 * (ou proposé par le hameau), auquel chacun apporte des PA ; barre de progression commune,
 * bonus s'il est achevé avant dimanche. État dans `village_state.life` (VillageLife).
 */
import { isSunday } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { gauge, stock } from './math.ts';
import { activePlayers } from './population.ts';
import type { Rng } from './rng.ts';
import type { CollectiveProject, EngineEffects, GameSnapshot, MapStructure, Player, VillageState } from './types.ts';
import { advanceStructure, BUILDING_KINDS } from './work.ts';

export function findCollectiveProject(id: string | null | undefined): C.CollectiveProjectDef | undefined {
  return id ? C.COLLECTIVE_PROJECTS.find((p) => p.id === id) : undefined;
}

/** Chantier en cours (null s'il n'y en a pas encore). */
export function currentCollective(v: Pick<VillageState, 'life'>): CollectiveProject | null {
  return lifeOf(v).collective ?? null;
}

/** Chantier de bâtisse le plus avancé (cible du « coup de main au chantier »). */
export function collectiveSite(s: Pick<GameSnapshot, 'structures'>): MapStructure | undefined {
  return s.structures
    .filter((st) => BUILDING_KINDS.includes(st.kind) && st.status === 'in_progress' && !st.eco_veto_active)
    .sort((a, b) => b.progress_pct - a.progress_pct || a.id.localeCompare(b.id))[0];
}

/** Objectif en points selon le nombre de fondateurs actifs. */
export function collectiveGoal(s: GameSnapshot): number {
  return Math.max(C.COLLECTIVE_MIN_GOAL, C.COLLECTIVE_POINTS_PER_PLAYER * activePlayers(s).length);
}

/** Points rapportés par un PA de ce joueur (double pour le métier du projet). */
export function contributionPoints(def: C.CollectiveProjectDef, player: { role_code: string }): number {
  return player.role_code === def.pole ? C.COLLECTIVE_POLE_POINTS : 1;
}

/** Utilité d'un projet pour le hameau (pour le proposer en premier) ; null = sans objet. */
export function collectiveNeed(s: GameSnapshot, id: C.CollectiveProjectId): number | null {
  const v = s.village;
  switch (id) {
    case 'woodpile':
      return Math.max(0, 100 - v.wood_stock);
    case 'track_day':
      return v.track_condition_pct >= 100 ? null : 100 - v.track_condition_pct;
    case 'water_works':
      return v.water_network_condition_pct >= 100 ? null : 100 - v.water_network_condition_pct;
    case 'garden_extension':
      return 30;
    case 'site_rush': {
      const site = collectiveSite(s);
      return site ? 40 + site.progress_pct / 2 : null;
    }
    case 'village_feast':
      return 100 - v.morale_pct;
  }
}

/** Projets soumis au vote : le plus utile d'abord, puis deux autres tirés au sort. */
export function drawCandidates(s: GameSnapshot, rng: Rng, exclude: string | null): string[] {
  const usable = C.COLLECTIVE_PROJECTS.map((p) => ({ id: p.id, need: collectiveNeed(s, p.id) }))
    .filter((p): p is { id: C.CollectiveProjectId; need: number } => p.need !== null && p.id !== exclude)
    .sort((a, b) => b.need - a.need || a.id.localeCompare(b.id));
  if (usable.length === 0) return [];
  const [first, ...rest] = usable;
  const out = [first!.id as string];
  const pool = rest.map((p) => p.id as string);
  while (out.length < C.COLLECTIVE_CANDIDATES && pool.length > 0) {
    const i = rng.int(0, pool.length - 1);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

/** Projet retenu : le plus voté ; à égalité (ou sans vote), l'ordre des candidats (proposition du hameau). */
export function tallyCollectiveVotes(candidates: readonly string[], votes: Record<string, string> | undefined): { winner: string | null; counts: Record<string, number> } {
  const counts: Record<string, number> = Object.fromEntries(candidates.map((c) => [c, 0]));
  for (const choice of Object.values(votes ?? {})) if (choice in counts) counts[choice] = (counts[choice] ?? 0) + 1;
  let winner: string | null = null;
  for (const c of candidates) if (winner === null || (counts[c] ?? 0) > (counts[winner] ?? 0)) winner = c;
  return { winner, counts };
}

/** Ouvre le chantier de la semaine (vote, sinon proposition) et tire les candidats de la semaine suivante. */
export function startWeeklyProject(s: GameSnapshot, fx: EngineEffects, rng: Rng, now: Date): CollectiveProject | null {
  const life = ensureLife(s.village);
  const candidates = (life.collective_candidates ?? []).filter((id) => findCollectiveProject(id) && collectiveNeed(s, id as C.CollectiveProjectId) !== null);
  const pool = candidates.length > 0 ? candidates : drawCandidates(s, rng.fork('first'), null);
  const { winner, counts } = tallyCollectiveVotes(pool, life.collective_votes);
  const def = findCollectiveProject(winner);
  life.collective_votes = {};
  if (!def) {
    life.collective = null;
    life.collective_candidates = [];
    return null;
  }
  const project: CollectiveProject = { id: def.id, started_at: now.toISOString(), goal: collectiveGoal(s), points: 0, contributions: {}, completed_at: null, early: false };
  life.collective = project;
  life.collective_candidates = drawCandidates(s, rng.fork('candidates'), def.id);
  const votes = counts[def.id] ?? 0;
  pushEvent(fx, s, {
    event_type: 'collective_started',
    title: `Chantier de la semaine : ${def.label}`,
    body: `${def.icon} ${votes > 0 ? `Choisi à l'Agora (${votes} voix)` : 'Proposé par le hameau'} : ${project.goal} points à réunir, chacun peut y mettre ses PA. ${def.summary} Fini avant dimanche : effet ×${String(C.COLLECTIVE_EARLY_FACTOR).replace('.', ',')} et moral +${C.COLLECTIVE_EARLY_MORALE} %.`,
    data: { project: def.id, goal: project.goal, votes },
  });
  return project;
}

/** Applique l'effet d'un chantier achevé ; renvoie la phrase d'effet. */
export function applyCollectiveEffect(s: GameSnapshot, fx: EngineEffects, def: C.CollectiveProjectDef, early: boolean): string {
  const v = s.village;
  const k = early ? C.COLLECTIVE_EARLY_FACTOR : 1;
  let text: string;
  switch (def.id) {
    case 'woodpile': {
      const wood = Math.round(C.COLLECTIVE_WOOD * k);
      v.wood_stock = stock(v.wood_stock + wood);
      text = `+${wood} stères de bois`;
      break;
    }
    case 'track_day': {
      const pts = Math.round(C.COLLECTIVE_TRACK * k);
      v.track_condition_pct = gauge(v.track_condition_pct + pts);
      text = `piste +${pts} %`;
      break;
    }
    case 'water_works': {
      const pts = Math.round(C.COLLECTIVE_WATER_NETWORK * k);
      v.water_network_condition_pct = gauge(v.water_network_condition_pct + pts);
      v.water_quality_pct = gauge(v.water_quality_pct + C.COLLECTIVE_WATER_QUALITY);
      text = `réseau d'eau +${pts} %, qualité +${C.COLLECTIVE_WATER_QUALITY} %`;
      break;
    }
    case 'garden_extension': {
      const m2 = Math.round(C.COLLECTIVE_GARDEN_M2 * k);
      v.garden_area_m2 = Math.round(v.garden_area_m2 + m2);
      text = `+${m2} m² de potager`;
      break;
    }
    case 'site_rush': {
      const site = collectiveSite(s);
      const pts = Math.round(C.COLLECTIVE_SITE_PROGRESS * k);
      if (site) {
        advanceStructure(s, fx, site, pts);
        text = `« ${site.name} » +${pts} %`;
      } else {
        v.morale_pct = gauge(v.morale_pct + 2);
        text = 'plus de chantier ouvert : le cœur y est (moral +2 %)';
      }
      break;
    }
    case 'village_feast': {
      const pts = Math.round(C.COLLECTIVE_FEAST_MORALE * k);
      v.morale_pct = gauge(v.morale_pct + pts);
      text = `moral +${pts} %`;
      break;
    }
  }
  if (early) {
    v.morale_pct = gauge(v.morale_pct + C.COLLECTIVE_EARLY_MORALE);
    text += `, et moral +${C.COLLECTIVE_EARLY_MORALE} % (fini avant dimanche)`;
  }
  return text;
}

/** Ajoute des points au chantier ; l'achève (effet + bonus éventuel) à l'objectif. */
export function contributeToCollective(s: GameSnapshot, fx: EngineEffects, player: Player, now: Date): { gained: number; project: CollectiveProject; finished: string | null } {
  const life = ensureLife(s.village);
  const project = life.collective;
  const def = findCollectiveProject(project?.id);
  if (!project || !def) throw new Error('Pas de chantier collectif cette semaine.');
  if (project.completed_at) throw new Error('Le chantier de la semaine est déjà achevé : rendez-vous lundi pour le suivant.');
  const gained = Math.min(contributionPoints(def, player), project.goal - project.points);
  project.points += gained;
  project.contributions = { ...project.contributions, [player.id]: (project.contributions[player.id] ?? 0) + gained };
  let finished: string | null = null;
  if (project.points >= project.goal) {
    project.completed_at = now.toISOString();
    project.early = !isSunday(now);
    finished = applyCollectiveEffect(s, fx, def, project.early);
    pushEvent(fx, s, {
      event_type: 'collective_completed',
      title: `Chantier de la semaine achevé : ${def.label}`,
      body: `${def.icon} Grâce à ${Object.keys(project.contributions).length} participant(s) : ${finished}.`,
      data: { project: def.id, early: project.early, contributions: project.contributions },
    });
  }
  return { gained, project, finished };
}

/** Lundi : bilan du chantier écoulé (inachevé = moral en baisse), puis ouverture du suivant. */
export function closeCollectiveWeek(s: GameSnapshot, fx: EngineEffects, rng: Rng, now: Date): void {
  const life = ensureLife(s.village);
  const last = life.collective ?? null;
  const def = findCollectiveProject(last?.id);
  if (last && def && !last.completed_at) {
    s.village.morale_pct = gauge(s.village.morale_pct - C.COLLECTIVE_FAIL_MORALE);
    pushEvent(fx, s, {
      event_type: 'collective_failed',
      title: `Chantier inachevé : ${def.label}`,
      body: `${def.icon} ${last.points}/${last.goal} points seulement : le chantier est abandonné (moral −${C.COLLECTIVE_FAIL_MORALE} %).`,
      data: { project: def.id, points: last.points, goal: last.goal },
    });
  }
  life.collective_last = last;
  startWeeklyProject(s, fx, rng, now);
}
