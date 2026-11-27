/**
 * Objectifs d'Acte (V5.1) côté interface : la liste à cocher de l'Acte en cours, relue avec les
 * formules du moteur (`actGoalProgress`) sur l'état public, et le lien avec « À faire en priorité ».
 */
import { actGoalProgress, constants as C, describeReward, type GameSnapshot } from '../engine.ts';
import type { GameData } from '../api/types.ts';

export interface ActGoalLine {
  id: string;
  icon: string;
  label: string;
  hint: string;
  reward: string;
  /** « 12 / 20 lits » (vide pour une étape oui / non). */
  progress: string;
  /** 0 à 1, pour la barre. */
  ratio: number;
  met: boolean;
  /** Cochée par le moteur (récompense versée) ; une étape atteinte mais pas encore cochée l'est à la prochaine action ou la nuit. */
  done: boolean;
}

export interface ActGoalsView {
  act: number;
  goals: ActGoalLine[];
  done: number;
  total: number;
  /** Prime quand toute la liste est cochée. */
  bonus: string;
  bonusPaid: boolean;
  /** Première étape restante (la plus avancée d'abord). */
  next: ActGoalLine | null;
}

export type ActGoalsData = Pick<GameData, 'village' | 'structures' | 'migrants' | 'constitution'>;

/** Priorités (clés de `priorities.ts`) qui font avancer chaque objectif. */
export const GOAL_PRIORITY_KEYS: Record<C.ActGoalId, readonly string[]> = {
  power_on: ['generator'],
  green_power: ['power_line', 'meters'],
  beds_20: ['renovate:', 'connect:'],
  beds_30: ['renovate:', 'connect:'],
  garden_500: ['garden'],
  track_70: ['track'],
  gite_open: ['gite', 'open_gite'],
  herd_10: ['pen', 'livestock'],
  residents_5: ['residents_idle'],
  debt_25: ['debt'],
  debt_50: ['debt'],
  constitution: ['constitution'],
  deterrence_3: [],
  independence: [],
};

export function actGoalsView(data: ActGoalsData): ActGoalsView {
  const s = { village: data.village, structures: data.structures, migrants: data.migrants, constitution: data.constitution } as unknown as GameSnapshot;
  const act = data.village.act_number;
  const goals: ActGoalLine[] = actGoalProgress(s, act).map((p) => ({
    id: p.def.id,
    icon: p.def.icon,
    label: p.def.label,
    hint: p.def.hint,
    reward: describeReward(p.def.reward),
    progress: p.target > 1 ? `${Math.min(p.value, p.target)} / ${p.target}${p.unit}` : '',
    ratio: p.met ? 1 : Math.max(0, Math.min(1, p.value / p.target)),
    met: p.met,
    done: p.done_at !== null,
  }));
  const next = goals.filter((g) => !g.met).sort((a, b) => b.ratio - a.ratio)[0] ?? null;
  const paid = (data.village.life?.act_goals_complete ?? []).includes(act);
  return {
    act,
    goals,
    done: goals.filter((g) => g.met).length,
    total: goals.length,
    bonus: describeReward(C.ACT_GOALS_COMPLETE_BONUS[act as 1 | 2 | 3] ?? {}),
    bonusPaid: paid,
    next,
  };
}

/** Objectif d'Acte restant que sert une priorité (null s'il n'y en a pas). */
export function goalForPriority(view: ActGoalsView, key: string): ActGoalLine | null {
  return view.goals.find((g) => !g.met && (GOAL_PRIORITY_KEYS[g.id as C.ActGoalId] ?? []).some((k) => (k.endsWith(':') ? key.startsWith(k) : key === k))) ?? null;
}
