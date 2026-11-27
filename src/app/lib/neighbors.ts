/**
 * Relations avec les voisins vues par l'interface (V5.8) : trois jauges (Organyà, mairie, Mossos),
 * leur effet du moment, la demande en cours (coups de main, échéance, coût) et la dernière demande close.
 * Pur (aucun DOM) : testé dans tests/app/neighbors.test.ts.
 */
import {
  addDaysToKey,
  constants as C,
  currentNeighborMission,
  dayKey,
  findNeighbor,
  findNeighborMission,
  lifeOf,
  missionCostText,
  neighborGauge,
  neighborHelpBlocker,
  neighborStanding,
  type NeighborStanding,
} from '../engine.ts';
import type { GameData } from '../api/types.ts';

export interface NeighborGaugeView {
  def: C.NeighborDef;
  value: number;
  standing: NeighborStanding;
  /** Effet du moment (vide si la relation est neutre). */
  effect: string;
}

export interface NeighborMissionView {
  def: C.NeighborMissionDef;
  from: C.NeighborDef;
  done: number;
  steps: number;
  pct: number;
  cost: string;
  /** Jours restants, aujourd'hui compris (1 = dernier jour). */
  daysLeft: number;
  deadline: string;
  helpers: { id: string; name: string; count: number }[];
  /** Raison de ne pas pouvoir aider (null = possible, hors PA). */
  blocked: string | null;
}

export interface NeighborsView {
  gauges: NeighborGaugeView[];
  mission: NeighborMissionView | null;
  /** Dernière demande close, en une phrase (null s'il n'y en a pas). */
  last: string | null;
  /** Quand arrivera la prochaine demande, s'il n'y en a pas. */
  idle: string;
}

export function neighborsView(data: Pick<GameData, 'village' | 'players'>, now: Date): NeighborsView {
  const v = data.village;
  const gauges = C.NEIGHBORS.map((def) => {
    const value = Math.round(neighborGauge(v, def.id));
    const standing = neighborStanding(value);
    return { def, value, standing, effect: standing === 'good' ? def.good : standing === 'bad' ? def.bad : '' };
  });
  const cur = currentNeighborMission(v);
  const today = dayKey(now);
  let mission: NeighborMissionView | null = null;
  if (cur) {
    const { def } = cur;
    const daysLeft = Math.max(1, Math.round((Date.parse(cur.mission.due_day) - Date.parse(today)) / 86_400_000) + 1);
    mission = {
      def,
      from: findNeighbor(def.from)!,
      done: cur.mission.done_steps,
      steps: def.steps,
      pct: Math.min(100, Math.round((cur.mission.done_steps / def.steps) * 100)),
      cost: missionCostText(def),
      daysLeft,
      deadline: daysLeft <= 1 ? 'dernier jour : ce soir minuit' : `encore ${daysLeft} jours`,
      helpers: Object.entries(cur.mission.helpers)
        .map(([id, count]) => ({ id, count, name: data.players.find((p) => p.id === id)?.display_name ?? '?' }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      blocked: neighborHelpBlocker(v),
    };
  }
  const lastRes = lifeOf(v).neighbor_last;
  const lastDef = findNeighborMission(lastRes?.id);
  const last =
    lastRes && lastDef
      ? `${lastDef.icon} ${lastDef.title} : ${lastRes.outcome === 'done' ? 'faite' : 'manquée'} (${findNeighbor(lastDef.from)?.short} ${lastRes.delta > 0 ? '+' : '−'}${Math.abs(lastRes.delta)}).`
      : null;
  const next = lifeOf(v).neighbor_next_day;
  const idle = next && next > addDaysToKey(today, 1) ? 'Pas de demande des voisins pour l’instant : la prochaine arrivera d’ici deux nuits.' : 'Pas de demande des voisins pour l’instant : la prochaine arrivera cette nuit.';
  return { gauges, mission, last, idle };
}

/** Une demande ouverte mérite-t-elle une place dans « À faire en priorité » ? Score selon l'échéance. */
export function neighborPriorityScore(view: NeighborsView): number | null {
  const m = view.mission;
  if (!m || m.blocked) return null;
  return m.daysLeft <= 1 ? 62 : 48;
}
