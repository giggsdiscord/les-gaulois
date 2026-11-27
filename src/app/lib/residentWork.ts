/**
 * Travail des résidents vu par l'interface (V4.9) : aperçu de la nuit à venir (planResidentWork du
 * moteur sur l'état public), résumé de la nuit passée (`life.work_last`) et choix de poste.
 * Pur (aucun DOM) : testé dans tests/app/residentWork.test.ts.
 */
import {
  calendarSeasonOfKey,
  constants as C,
  dayKey,
  forestBan,
  lifeOf,
  planResidentWork,
  residentSkill,
  suggestedPost,
  type ForestBan,
  type GameSnapshot,
  type ResidentWorkLine,
  type ResidentWorkTotals,
} from '../engine.ts';
import type { GameData, PublicMigrant } from '../api/types.ts';

export type WorkData = Pick<GameData, 'village' | 'players' | 'migrants' | 'children' | 'structures' | 'constitution'>;

function snapshotOf(data: WorkData): GameSnapshot {
  return {
    village: data.village,
    players: data.players,
    migrants: data.migrants,
    children: data.children,
    structures: data.structures,
    unions: [],
    approvals: [],
    temptations: [],
    constitution: data.constitution,
  } as unknown as GameSnapshot;
}

export interface WorkView {
  /** Résidents qui peuvent recevoir un poste (acceptés ou aux travaux forcés). */
  workforce: PublicMigrant[];
  /** Aperçu de la nuit à venir, par résident. */
  lines: Record<string, ResidentWorkLine>;
  tonight: ResidentWorkTotals;
  /** Nuit passée (null avant la première nuit de travail). */
  lastNight: ResidentWorkTotals | null;
  ban: ForestBan | null;
}

export function residentWorkView(data: WorkData, now: Date): WorkView {
  const s = snapshotOf(data);
  const plan = planResidentWork(s, calendarSeasonOfKey(dayKey(now)), now);
  const lines: Record<string, ResidentWorkLine> = {};
  for (const l of plan.lines) lines[l.migrant_id] = l;
  const workforce = data.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor');
  return { workforce, lines, tonight: plan.totals, lastNight: lifeOf(data.village).work_last ?? null, ban: forestBan(data.village) };
}

const n1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

/** Production en clair : « +4,5 rations », « +6 stères de bois »… (vide si rien). */
export function totalsParts(t: ResidentWorkTotals): string[] {
  const out: string[] = [];
  if (t.rations > 0) out.push(`+${n1(t.rations)} rations`);
  if (t.tomatoes > 0) out.push(`+${n1(t.tomatoes)} kg de tomates`);
  if (t.wood > 0) out.push(`+${n1(t.wood)} stères de bois`);
  if (t.build > 0) out.push(`chantiers +${t.build} %`);
  if (t.repair > 0) out.push(`réparations +${t.repair} %`);
  if (t.tools_wear > 0) out.push(`usure des outils −${n1(t.tools_wear)} %`);
  if (t.iron > 0) out.push(`+${t.iron} fer`);
  if (t.water > 0) out.push(`réseau d'eau +${n1(t.water)} %`);
  if (t.track > 0) out.push(`piste +${n1(t.track)} %`);
  if (t.ecology > 0) out.push(`écologie +${n1(t.ecology)}`);
  if (t.ecology < 0) out.push(`écologie −${n1(-t.ecology)}`);
  if (t.stone_used > 0) out.push(`−${t.stone_used} pierre${t.stone_used > 1 ? 's' : ''}`);
  return out;
}

export interface PostChoice {
  post: C.WorkPost;
  /** Multiplicateur de spécialité (1 = pas sa spécialité). */
  skill: number;
  suggested: boolean;
  current: boolean;
}

/** Postes proposés pour un résident : ceux de sa spécialité d'abord. */
export function postChoices(m: Pick<PublicMigrant, 'specialty_code' | 'specialty_level' | 'work_post'>): PostChoice[] {
  const best = suggestedPost(m).code;
  return C.WORK_POSTS.map((post) => ({ post, skill: residentSkill(m, post), suggested: post.code === best, current: m.work_post === post.code }))
    .sort((a, b) => b.skill - a.skill || C.WORK_POSTS.indexOf(a.post) - C.WORK_POSTS.indexOf(b.post));
}

export function skillLabel(skill: number): string {
  return `×${String(Math.round(skill * 100) / 100).replace('.', ',')}`;
}
