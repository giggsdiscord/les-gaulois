/**
 * Niveaux de métier, mission du jour & bonus d'action à deux (V5.2) [GDD §2.3].
 * - Niveau : calculé depuis `players.skill_xp` (aucune colonne nouvelle).
 * - Mission du jour : tirage déterministe (joueur + jour local) dans MISSION_POOLS ;
 *   « faite » = `life.missions_done[joueur] = jour`.
 * - Binômes : `life.duo_day` garde, pour le jour en cours, qui a fait quelle action de quel groupe.
 */
import { dayKey } from './calendar.ts';
import * as C from './constants.ts';
import { createRng } from './rng.ts';
import { lifeOf } from './life.ts';
import type { DuoDay, Player, VillageLife, VillageState } from './types.ts';

export type SkillLevel = 1 | 2 | 3 | 4;

export function skillLevel(xp: number): SkillLevel {
  let level = 1;
  for (let i = 1; i < C.SKILL_LEVEL_XP.length; i++) if (xp >= C.SKILL_LEVEL_XP[i]!) level = i + 1;
  return level as SkillLevel;
}

export interface SkillProgress {
  level: SkillLevel;
  xp: number;
  /** XP du niveau atteint et du suivant (null au niveau maximal). */
  floor: number;
  next: number | null;
  /** Avancement vers le niveau suivant, 0 à 100. */
  pct: number;
  /** Bonus de rendement dans son métier (0,1 = +10 %). */
  bonus: number;
}

export function skillProgress(xp: number): SkillProgress {
  const level = skillLevel(xp);
  const floor = C.SKILL_LEVEL_XP[level - 1]!;
  const table: readonly number[] = C.SKILL_LEVEL_XP;
  const next = level < table.length ? table[level]! : null;
  const pct = next === null ? 100 : Math.round(((xp - floor) / (next - floor)) * 100);
  return { level, xp, floor, next, pct, bonus: C.SKILL_LEVEL_BONUS[level - 1]! };
}

/** Multiplicateur de rendement d'une action faite dans son propre métier. */
export function skillMultiplier(xp: number): number {
  return 1 + C.SKILL_LEVEL_BONUS[skillLevel(xp) - 1]!;
}

// ---------------------------------------------------------------------------
// Mission du jour
// ---------------------------------------------------------------------------
/**
 * Action conseillée du jour : tirage déterministe dans le métier du joueur, parmi les actions
 * qu'il peut faire ce jour-là (`available`), sinon repli (couper du bois, chantier de la semaine…).
 */
type MissionVillage = Pick<
  VillageState,
  'life' | 'livestock_count' | 'tomatoes_stock' | 'treasury_eur' | 'scrap_stock' | 'iron_stock' | 'stone_stock' | 'tools_stock'
>;

/** Prérequis de stock des missions : on ne conseille pas une action qui serait refusée faute de moyens. */
const MISSION_NEEDS: Record<string, (v: MissionVillage) => boolean> = {
  livestock_care: (v) => v.livestock_count > 0,
  make_preserves: (v) => v.tomatoes_stock >= C.PRESERVES_TOMATOES_KG && v.treasury_eur >= C.PRESERVES_JARS_EUR,
  recycle_scrap: (v) => v.scrap_stock >= 4,
  forge_tools: (v) => v.iron_stock >= C.IRON_PER_TOOL,
  track_maintenance: (v) => v.stone_stock >= 5,
  repair_pipes: (v) => v.treasury_eur >= 120,
  guard_rounds: (v) => v.tools_stock > 0,
  cut_wood: (v) => !lifeOf(v).forest_ban,
  contribute_collective: (v) => {
    const c = lifeOf(v).collective;
    return !!c && !c.completed_at;
  },
};

export function missionFeasible(code: string, v: MissionVillage): boolean {
  const need = MISSION_NEEDS[code];
  return need ? need(v) : true;
}

export function pickMission(player: Pick<Player, 'id' | 'role_code'>, now: Date, available: (code: string) => boolean): string | null {
  const pool = (C.MISSION_POOLS[player.role_code] ?? []).filter(available);
  const list = pool.length > 0 ? pool : C.MISSION_FALLBACK.filter(available);
  if (list.length === 0) return null;
  return createRng(`mission:${dayKey(now)}:${player.id}`).pick(list);
}

/** Action de la mission accomplie aujourd'hui par le joueur (null si pas encore). */
export function missionDoneToday(v: Pick<VillageState, 'life'>, playerId: string, now: Date): string | null {
  const d = lifeOf(v).missions_done?.[playerId];
  return d && d.day === dayKey(now) ? d.code : null;
}

export function missionDone(v: Pick<VillageState, 'life'>, playerId: string, now: Date): boolean {
  return missionDoneToday(v, playerId, now) !== null;
}

// ---------------------------------------------------------------------------
// Bonus d'action à deux
// ---------------------------------------------------------------------------
export function duoGroupOf(code: string): C.DuoGroup | undefined {
  return C.DUO_GROUPS.find((g) => g.codes.includes(code));
}

/** Journal des binômes du jour (vide si la date a changé). */
export function duoDayOf(v: Pick<VillageState, 'life'>, now: Date): DuoDay {
  const d = lifeOf(v).duo_day;
  return d && d.day === dayKey(now) ? d : { day: dayKey(now), acts: [], announced: [] };
}

/** Joueurs (autres que `actorId`) qui ont déjà agi aujourd'hui dans le groupe. */
export function duoPartners(v: Pick<VillageState, 'life'>, actorId: string, groupId: string, now: Date): string[] {
  const ids = duoDayOf(v, now)
    .acts.filter((a) => a.group === groupId && a.player_id !== actorId)
    .map((a) => a.player_id);
  return [...new Set(ids)];
}

/** Note l'action du jour dans le journal des binômes (sur l'état modifiable). */
export function recordDuoAct(life: VillageLife, v: Pick<VillageState, 'life'>, actorId: string, groupId: string, now: Date): DuoDay {
  const day = duoDayOf(v, now);
  const next: DuoDay = { day: day.day, acts: [...day.acts], announced: [...day.announced] };
  if (!next.acts.some((a) => a.player_id === actorId && a.group === groupId)) next.acts.push({ player_id: actorId, group: groupId });
  life.duo_day = next;
  return next;
}
