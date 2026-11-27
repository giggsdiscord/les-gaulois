// ============================================================================
// Bilan de la semaine & frise du hameau [GDD §5.11, V6.0]
// - Compteurs par joueur dans `life.week_stats` (actions, PA, missions, coups de main, binômes).
// - Bilan au lundi (`closeWeekReview`, appelé par `closeSeason`) : classement, habitant de la
//   semaine (déterministe), records ; événement public « Bilan de la semaine : … ».
// - Frise : les grands événements du moteur (`TIMELINE_EVENTS`) sont datés dans `life.timeline`.
// ============================================================================
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { gauge } from './math.ts';
import type { EngineEffects, EngineEvent, GameSnapshot, PlayerWeek, TimelineEntry, VillageRecord, VillageState, WeekRank, WeekReview } from './types.ts';

/** Titre des bilans hebdomadaires (repris par la Gazette). */
export const WEEK_REVIEW_PREFIX = 'Bilan de la semaine : ';

function emptyWeek(): PlayerWeek {
  return { actions: 0, ap: 0, missions: 0, helps: 0, duos: 0, codes: {} };
}

/** Compte une action réussie dans la semaine en cours. */
export function recordWeekAction(
  v: VillageState,
  playerId: string,
  code: string,
  apSpent: number,
  flags: { mission?: boolean; duo?: boolean },
  today: string,
): void {
  const life = ensureLife(v);
  if (!life.week_stats) life.week_stats = { since: today, players: {} };
  const w = (life.week_stats.players[playerId] ??= emptyWeek());
  w.actions += 1;
  w.ap += apSpent;
  if (flags.mission) w.missions += 1;
  if (flags.duo) w.duos += 1;
  if (C.WEEK_HELP_ACTIONS.includes(code)) w.helps += 1;
  w.codes[code] = (w.codes[code] ?? 0) + 1;
}

export function weekScore(w: PlayerWeek): number {
  const k = C.WEEK_SCORE;
  return w.ap * k.ap + w.actions * k.action + w.missions * k.mission + w.helps * k.help + w.duos * k.duo;
}

function favoriteOf(w: PlayerWeek): string | null {
  let best: string | null = null;
  for (const [code, n] of Object.entries(w.codes).sort(([a], [b]) => a.localeCompare(b))) {
    if (best === null || n > w.codes[best]!) best = code;
  }
  return best;
}

/** Classement de la semaine (pur) : score, puis PA, puis missions, puis ordre des joueurs. */
export function weekRanking(s: { players: readonly { id: string; display_name: string }[]; village: Pick<VillageState, 'life'> }): WeekRank[] {
  const stats = lifeOf(s.village).week_stats?.players ?? {};
  const order = new Map(s.players.map((p, i) => [p.id, i]));
  return Object.entries(stats)
    .filter(([id, w]) => order.has(id) && w.actions > 0)
    .map(([id, w]) => ({
      player_id: id,
      name: s.players[order.get(id)!]!.display_name,
      actions: w.actions,
      ap: w.ap,
      missions: w.missions,
      helps: w.helps,
      score: weekScore(w),
      favorite: favoriteOf(w),
    }))
    .sort((a, b) => b.score - a.score || b.ap - a.ap || b.missions - a.missions || order.get(a.player_id)! - order.get(b.player_id)!);
}

function beat(cur: VillageRecord | undefined, value: number): boolean {
  return value > 0 && (!cur || value > cur.value);
}

/** Bilan de la semaine (lundi minuit, avant la remise à zéro) ; publié même si personne n'a joué. */
export function closeWeekReview(s: GameSnapshot, fx: EngineEffects, endedKey: string): WeekReview {
  const v = s.village;
  const life = ensureLife(v);
  const ranking = weekRanking(s);
  const week = v.season_number;
  const total_actions = ranking.reduce((n, r) => n + r.actions, 0);
  const total_ap = ranking.reduce((n, r) => n + r.ap, 0);
  const records: string[] = [];
  const rec = (life.records ??= {});
  if (ranking.length > 0) {
    const topAp = [...ranking].sort((a, b) => b.ap - a.ap)[0]!;
    if (beat(rec.week_ap, topAp.ap)) {
      if (rec.week_ap) records.push(`${topAp.name} bat le record de PA en une semaine : ${topAp.ap} (ancien : ${rec.week_ap.value}).`);
      rec.week_ap = { value: topAp.ap, week, player_id: topAp.player_id, name: topAp.name };
    }
    const topHelp = [...ranking].sort((a, b) => b.helps - a.helps)[0]!;
    if (beat(rec.week_helps, topHelp.helps)) {
      if (rec.week_helps) records.push(`${topHelp.name} bat le record de coups de main : ${topHelp.helps} (ancien : ${rec.week_helps.value}).`);
      rec.week_helps = { value: topHelp.helps, week, player_id: topHelp.player_id, name: topHelp.name };
    }
    if (beat(rec.week_actions, total_actions)) {
      if (rec.week_actions) records.push(`Semaine record pour le hameau : ${total_actions} actions (ancien : ${rec.week_actions.value}).`);
      rec.week_actions = { value: total_actions, week };
    }
  }
  const hero = ranking[0] ?? null;
  if (hero) {
    const p = s.players.find((x) => x.id === hero.player_id);
    if (p) p.skill_xp += C.WEEK_HERO_XP;
    v.morale_pct = gauge(v.morale_pct + C.WEEK_HERO_MORALE);
  }
  const review: WeekReview = {
    week,
    from: life.week_stats?.since ?? endedKey,
    to: endedKey,
    total_actions,
    total_ap,
    ranking: ranking.slice(0, Math.max(C.WEEK_PODIUM, 7)),
    hero_id: hero?.player_id ?? null,
    records,
  };
  const podium = ranking.slice(0, C.WEEK_PODIUM).map((r, i) => `${i + 1}. ${r.name} (${r.actions} action${r.actions > 1 ? 's' : ''}, ${r.ap} PA)`);
  pushEvent(fx, s, {
    event_type: 'week_review',
    title: hero ? `${WEEK_REVIEW_PREFIX}${hero.name}, habitant de la semaine` : `${WEEK_REVIEW_PREFIX}semaine calme`,
    body: hero
      ? `${total_actions} actions et ${total_ap} PA cette semaine. ${podium.join(' ; ')}. ${hero.name} reçoit +${C.WEEK_HERO_XP} XP et le hameau +${C.WEEK_HERO_MORALE} % de moral.${records.length ? ` ${records.join(' ')}` : ''}`
      : 'Personne n’a rien fait de la semaine. Les poules, elles, ont pondu.',
    data: { week, hero_id: review.hero_id, total_actions, total_ap, records },
  });
  life.week_last = review;
  life.week_stats = null;
  return review;
}

// ---------------------------------------------------------------------------
// Frise
// ---------------------------------------------------------------------------
/** Événements déjà portés dans la frise (les mêmes objets passent d'un lot d'effets à l'autre). */
const recorded = new WeakSet<EngineEvent>();

function timelineTitle(s: GameSnapshot, e: EngineEvent): string {
  if (e.event_type === 'structure_completed') {
    const st = s.structures.find((x) => x.id === (e.data as { structure_id?: string }).structure_id);
    if (st) return `« ${st.name} » livré`;
  }
  return e.title;
}

/** Ajoute à la frise les grands événements publics de `fx` pas encore datés. */
export function recordMilestones(s: GameSnapshot, fx: EngineEffects, day: string): void {
  let life: ReturnType<typeof ensureLife> | null = null;
  for (const e of fx.events) {
    if (recorded.has(e)) continue;
    recorded.add(e);
    const icon = C.TIMELINE_EVENTS[e.event_type];
    if (!icon || e.visibility !== 'public') continue;
    life ??= ensureLife(s.village);
    const entry: TimelineEntry = { day, kind: e.event_type, icon, title: timelineTitle(s, e) };
    const list = (life.timeline ??= []);
    // Même étape déjà notée la veille, le jour même ou le lendemain (effets fusionnés) : on ne la double pas
    const dup = list.slice(-12).some((x) => x.kind === entry.kind && x.title === entry.title && Math.abs(Date.parse(x.day) - Date.parse(day)) <= 86_400_000);
    if (dup) continue;
    list.push(entry);
    if (list.length > C.TIMELINE_MAX) list.splice(0, list.length - C.TIMELINE_MAX);
  }
}
