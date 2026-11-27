/**
 * Niveaux de métier, mission du jour et binômes (V5.2) côté interface : relit les règles du
 * moteur (`skillProgress`, `dailyMission`, `duoDayOf`) sur l'état public. Pur : testé dans
 * tests/app/jobLevel.test.ts.
 */
import { constants as C, dailyMission, duoDayOf, getAction, missionDoneToday, skillProgress, type ActionDef, type GameSnapshot, type SkillProgress } from '../engine.ts';
import type { GameData } from '../api/types.ts';
import { availableActions } from './game.ts';

export type JobData = Pick<GameData, 'me' | 'village' | 'players'>;

export interface MissionView {
  def: ActionDef;
  done: boolean;
  reward: string;
}

export interface DuoHint {
  group: C.DuoGroup;
  /** Prénoms des autres joueurs qui ont déjà agi dans ce groupe aujourd'hui. */
  partners: string[];
  /** Le joueur a déjà fait sa part : le binôme est formé. */
  formed: boolean;
  /** Première action du groupe que le joueur peut faire (pour le bouton). */
  action: ActionDef | null;
}

export interface JobView {
  progress: SkillProgress;
  /** « +10 % de rendement dans votre métier ». */
  perk: string;
  /** Ce que donne le niveau suivant (null au niveau 4). */
  nextPerk: string | null;
  mission: MissionView | null;
  duos: DuoHint[];
}

export function perkText(level: number, role: string | null): string {
  const bonus = C.SKILL_LEVEL_BONUS[level - 1] ?? 0;
  if (bonus === 0) return 'Rendement normal ; chaque action rapporte de l\'expérience.';
  const forge = role === 'smith_diplo' && level >= C.SKILL_FORGE_DOUBLE_LEVEL ? ', fournée double à la forge' : '';
  return `+${Math.round(bonus * 100)} % de rendement dans votre métier${forge}.`;
}

export const MISSION_REWARD_TEXT = `+${C.MISSION_XP_REWARD} XP et moral du village +${C.MISSION_MORALE_REWARD} %`;
export const DUO_REWARD_TEXT = `+${Math.round(C.DUO_BONUS * 100)} % de rendement et +${C.DUO_XP} XP chacun`;

export function jobView(data: JobData, now: Date): JobView {
  const me = data.me;
  const progress = skillProgress(me.skill_xp);
  const s = { village: data.village } as unknown as GameSnapshot;
  const doneCode = missionDoneToday(data.village, me.id, now);
  const doneDef = doneCode ? getAction(doneCode) : undefined;
  const def = doneDef ?? dailyMission(s, me as unknown as GameSnapshot['players'][number], now);
  const mission = def ? { def, done: doneDef !== undefined, reward: MISSION_REWARD_TEXT } : null;

  const mine = availableActions(me, data.village.act_number);
  const day = duoDayOf(data.village, now);
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.display_name ?? '?';
  const duos: DuoHint[] = [];
  for (const group of C.DUO_GROUPS) {
    const others = [...new Set(day.acts.filter((a) => a.group === group.id && a.player_id !== me.id).map((a) => a.player_id))];
    if (others.length === 0) continue;
    const action = mine.find((a) => group.codes.includes(a.code)) ?? null;
    const formed = day.acts.some((a) => a.group === group.id && a.player_id === me.id);
    if (!action && !formed) continue;
    duos.push({ group, partners: others.map(nameOf), formed, action });
  }
  return {
    progress,
    perk: perkText(progress.level, me.role_code),
    nextPerk: progress.next === null ? null : perkText(progress.level + 1, me.role_code),
    mission,
    duos,
  };
}
