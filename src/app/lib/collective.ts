/**
 * Chantier collectif de la semaine vu par l'interface (V5.0) : progression commune, participants,
 * temps restant avant dimanche (bonus) et vote pour la semaine suivante.
 * Pur (aucun DOM) : testé dans tests/app/collective.test.ts.
 */
import {
  constants as C,
  contributionPoints,
  findCollectiveProject,
  lifeOf,
  localParts,
  tallyCollectiveVotes,
  type CollectiveProject,
} from '../engine.ts';
import type { GameData } from '../api/types.ts';

type CollectiveProjectDef = C.CollectiveProjectDef;

export interface CollectiveCandidate {
  def: CollectiveProjectDef;
  votes: number;
  mine: boolean;
  /** Projet que le hameau propose (retenu sans vote ou à égalité). */
  proposed: boolean;
  leading: boolean;
}

export interface CollectiveView {
  project: CollectiveProject | null;
  def: CollectiveProjectDef | null;
  pct: number;
  remaining: number;
  done: boolean;
  /** Participants, du plus investi au moins investi. */
  contributors: { id: string; name: string; points: number }[];
  /** Points que rapporte un PA du joueur (2 pour le métier du projet). */
  myPoints: number;
  /** Jours pleins avant dimanche (0 = on est dimanche : plus de bonus possible). */
  daysBeforeSunday: number;
  /** Phrase d'état : bonus encore possible, acquis, perdu… */
  status: string;
  candidates: CollectiveCandidate[];
  last: CollectiveProject | null;
  lastDef: CollectiveProjectDef | null;
}

export function collectiveView(data: Pick<GameData, 'village' | 'players' | 'me'>, now: Date): CollectiveView {
  const life = lifeOf(data.village);
  const project = life.collective ?? null;
  const def = findCollectiveProject(project?.id) ?? null;
  const weekday = localParts(now).weekday; // lundi = 1 … dimanche = 7
  const daysBeforeSunday = Math.max(0, 7 - weekday);
  const done = !!project?.completed_at;
  const remaining = project ? Math.max(0, project.goal - project.points) : 0;
  const name = (id: string) => data.players.find((p) => p.id === id)?.display_name ?? 'Quelqu\'un';
  const contributors = Object.entries(project?.contributions ?? {})
    .map(([id, points]) => ({ id, name: name(id), points }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  let status = '';
  if (!project || !def) status = 'Le premier chantier commun s\'ouvrira cette nuit.';
  else if (done) status = project.early ? `Achevé avant dimanche : effet ×${String(C.COLLECTIVE_EARLY_FACTOR).replace('.', ',')} et moral +${C.COLLECTIVE_EARLY_MORALE} % !` : 'Achevé (dimanche) : effet obtenu, sans le bonus.';
  else if (daysBeforeSunday === 0) status = `Dimanche : plus de bonus, mais il reste jusqu'à ce soir pour le finir (${remaining} point${remaining > 1 ? 's' : ''}).`;
  else status = `Encore ${remaining} point${remaining > 1 ? 's' : ''} — ${daysBeforeSunday === 1 ? 'dernier jour' : `${daysBeforeSunday} jours`} pour le bonus (×${String(C.COLLECTIVE_EARLY_FACTOR).replace('.', ',')}, moral +${C.COLLECTIVE_EARLY_MORALE} %).`;

  const ids = life.collective_candidates ?? [];
  const { winner, counts } = tallyCollectiveVotes(ids, life.collective_votes);
  const myVote = life.collective_votes?.[data.me.id];
  const candidates = ids
    .map((id, i) => {
      const d = findCollectiveProject(id);
      return d ? { def: d, votes: counts[id] ?? 0, mine: myVote === id, proposed: i === 0, leading: winner === id } : null;
    })
    .filter((c): c is CollectiveCandidate => c !== null);

  const last = life.collective_last ?? null;
  return {
    project,
    def,
    pct: project && project.goal > 0 ? Math.min(100, Math.round((project.points / project.goal) * 100)) : 0,
    remaining,
    done,
    contributors,
    myPoints: def ? contributionPoints(def, data.me) : 1,
    daysBeforeSunday,
    status,
    candidates,
    last,
    lastDef: findCollectiveProject(last?.id) ?? null,
  };
}
