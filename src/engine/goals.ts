/**
 * Objectifs d'Acte [GDD §1.3, V5.1] : une liste à cocher par Acte (électricité, 20 lits,
 * 500 m² de potager, gîte ouvert…). Une étape se coche d'elle-même dès que la condition est
 * remplie (à chaque action et chaque nuit) et verse sa récompense une seule fois — surtout
 * des remises sur l'emprunt foncier, pour faire bouger le pilier « dette ».
 * État dans `village_state.life.act_goals` (VillageLife).
 */
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { gauge, money, stock } from './math.ts';
import { residents } from './population.ts';
import type { EngineEffects, GameSnapshot, VillageState } from './types.ts';

export interface ActGoalProgress {
  def: C.ActGoalDef;
  /** Valeur actuelle et cible (pour une barre). */
  value: number;
  target: number;
  /** Unité affichée après les nombres. */
  unit: string;
  met: boolean;
  /** Date à laquelle l'étape a été cochée (null si pas encore). */
  done_at: string | null;
}

export function findActGoal(id: string | null | undefined): C.ActGoalDef | undefined {
  return id ? C.ACT_GOALS.find((g) => g.id === id) : undefined;
}

export function actGoalsOf(act: number): C.ActGoalDef[] {
  return C.ACT_GOALS.filter((g) => g.act === act);
}

type GoalSnapshot = Pick<GameSnapshot, 'village' | 'structures' | 'migrants' | 'constitution'>;

function operationalBeds(s: Pick<GameSnapshot, 'structures'>): number {
  return s.structures.filter((st) => st.kind === 'building' && st.status === 'operational').reduce((a, st) => a + st.beds_capacity, 0);
}

function repaidShare(v: Pick<VillageState, 'land_debt_eur'>): number {
  return Math.max(0, Math.min(100, Math.round(100 * (1 - v.land_debt_eur / C.INITIAL_LAND_DEBT_EUR))));
}

/** Mesure d'un objectif sur l'état courant. */
export function measureActGoal(s: GoalSnapshot, id: C.ActGoalId): { value: number; target: number; unit: string } {
  const v = s.village;
  switch (id) {
    case 'power_on':
      return { value: Math.min(v.energy_tier, 2) - 1, target: 1, unit: '' };
    case 'green_power':
      return { value: Math.min(v.energy_tier, 4), target: 4, unit: '' };
    case 'beds_20':
      return { value: operationalBeds(s), target: 20, unit: ' lits' };
    case 'beds_30':
      return { value: operationalBeds(s), target: 30, unit: ' lits' };
    case 'garden_500':
      return { value: Math.round(v.garden_area_m2), target: C.ACT_GOAL_GARDEN_M2, unit: ' m²' };
    case 'track_70':
      return { value: Math.round(v.track_condition_pct), target: C.ACT_GOAL_TRACK_PCT, unit: ' %' };
    case 'gite_open':
      return { value: v.gite_open ? 1 : 0, target: 1, unit: '' };
    case 'herd_10':
      return { value: Math.floor(v.livestock_count), target: C.ACT_GOAL_HERD, unit: ' bêtes' };
    case 'residents_5':
      return {
        value: residents(s as GameSnapshot).filter((m) => m.status === 'accepted' && m.work_post && m.work_post !== 'none' && !m.private_employer_id).length,
        target: C.ACT_GOAL_RESIDENTS,
        unit: ' résidents',
      };
    case 'debt_25':
      return { value: repaidShare(v), target: 25, unit: ' %' };
    case 'debt_50':
      return { value: repaidShare(v), target: 50, unit: ' %' };
    case 'constitution':
      return { value: s.constitution.some((a) => a.status === 'adopted') ? 1 : 0, target: 1, unit: '' };
    case 'deterrence_3':
      return { value: Math.floor(v.deterrence_level), target: C.ACT_GOAL_DETERRENCE, unit: '' };
    case 'independence':
      return { value: v.independence_proclaimed ? 1 : 0, target: 1, unit: '' };
  }
}

/** Liste à cocher d'un Acte, avec la progression de chaque étape. */
export function actGoalProgress(s: GoalSnapshot, act: number): ActGoalProgress[] {
  const done = lifeOf(s.village).act_goals ?? {};
  return actGoalsOf(act).map((def) => {
    const m = measureActGoal(s, def.id);
    const done_at = done[def.id] ?? null;
    return { def, ...m, met: done_at !== null || m.value >= m.target, done_at };
  });
}

/** Phrase courte d'une récompense (« emprunt −5 000 €, moral +3 % »). */
export function describeReward(r: C.ActGoalReward): string {
  const eur = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} €`;
  const parts: string[] = [];
  if (r.debt_eur) parts.push(`emprunt −${eur(r.debt_eur)}`);
  if (r.treasury_eur) parts.push(`caisse +${eur(r.treasury_eur)}`);
  if (r.morale) parts.push(`moral +${r.morale} %`);
  if (r.wood) parts.push(`+${r.wood} stères de bois`);
  if (r.stone) parts.push(`+${r.stone} pierres`);
  if (r.iron) parts.push(`+${r.iron} fer`);
  return parts.join(', ');
}

/** Verse une récompense ; renvoie la phrase réellement appliquée (remise plafonnée à la dette restante). */
export function applyActGoalReward(v: VillageState, r: C.ActGoalReward): string {
  const applied: C.ActGoalReward = { ...r };
  if (r.debt_eur) {
    applied.debt_eur = money(Math.min(r.debt_eur, Math.max(0, v.land_debt_eur)));
    v.land_debt_eur = money(v.land_debt_eur - applied.debt_eur);
    // Emprunt soldé : la remise restante part dans la caisse
    const rest = money(r.debt_eur - applied.debt_eur);
    if (rest > 0) applied.treasury_eur = money((applied.treasury_eur ?? 0) + rest);
    if (!applied.debt_eur) delete applied.debt_eur;
  }
  if (applied.treasury_eur) v.treasury_eur = money(v.treasury_eur + applied.treasury_eur);
  if (r.morale) v.morale_pct = gauge(v.morale_pct + r.morale);
  if (r.wood) v.wood_stock = stock(v.wood_stock + r.wood);
  if (r.stone) v.stone_stock = stock(v.stone_stock + r.stone);
  if (r.iron) v.iron_stock = stock(v.iron_stock + r.iron);
  return describeReward(applied);
}

/**
 * Coche les étapes atteintes des Actes ouverts (l'Acte courant et les précédents) et verse
 * leurs récompenses, puis la récompense de fin de liste. Renvoie les étapes cochées
 * (et `act_N_complete` pour une liste terminée) : vide = rien n'a changé.
 */
export function checkActGoals(s: GameSnapshot, fx: EngineEffects, now: Date): string[] {
  const v = s.village;
  const known = lifeOf(v).act_goals ?? {};
  const newly = C.ACT_GOALS.filter((g) => g.act <= v.act_number && !known[g.id]).filter((g) => {
    const m = measureActGoal(s, g.id);
    return m.value >= m.target;
  });
  const completedActs = lifeOf(v).act_goals_complete ?? [];
  const pendingBonus = ([1, 2, 3] as const).filter(
    (act) => act <= v.act_number && !completedActs.includes(act) && actGoalsOf(act).every((g) => known[g.id] || newly.includes(g)),
  );
  if (newly.length === 0 && pendingBonus.length === 0) return [];
  const life = ensureLife(v);
  const at = now.toISOString();
  life.act_goals = { ...(life.act_goals ?? {}) };
  for (const g of newly) {
    life.act_goals[g.id] = at;
    const reward = applyActGoalReward(v, g.reward);
    const list = actGoalsOf(g.act);
    const count = list.filter((x) => life.act_goals![x.id]).length;
    pushEvent(fx, s, {
      event_type: 'act_goal_done',
      title: `Objectif d'Acte coché : ${g.label}`,
      body: `${g.icon} ${count}/${list.length} pour l'Acte ${'I'.repeat(g.act)}. Récompense : ${reward}.`,
      data: { goal: g.id, act: g.act, count, total: list.length },
    });
  }
  for (const act of pendingBonus) {
    life.act_goals_complete = [...(life.act_goals_complete ?? []), act];
    const reward = applyActGoalReward(v, C.ACT_GOALS_COMPLETE_BONUS[act]);
    pushEvent(fx, s, {
      event_type: 'act_goals_complete',
      title: `Liste de l'Acte ${'I'.repeat(act)} terminée !`,
      body: `🏆 Toutes les étapes de l'Acte ${'I'.repeat(act)} sont cochées. Prime du hameau : ${reward}.`,
      data: { act },
    });
  }
  return [...newly.map((g) => g.id as string), ...pendingBonus.map((act) => `act_${act}_complete`)];
}
