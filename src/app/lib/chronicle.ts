/**
 * Bilan de la semaine & frise du hameau vus par l'interface (V6.0) : classement de la semaine
 * en cours, dernier bilan (habitant de la semaine, records), records du hameau, frise datée.
 * Pur (aucun DOM) : testé dans tests/app/chronicle.test.ts.
 */
import { constants as C, getAction, lifeOf, weekRanking, type WeekRank } from '../engine.ts';
import type { GameData } from '../api/types.ts';

export interface WeekLine {
  id: string;
  name: string;
  me: boolean;
  rank: number;
  actions: number;
  ap: number;
  missions: number;
  helps: number;
  score: number;
  /** Libellé de l'action la plus faite. */
  favorite: string | null;
}

export interface ChronicleView {
  /** Premier jour compté de la semaine en cours (null si personne n'a encore agi). */
  since: string | null;
  live: WeekLine[];
  /** Mon rang cette semaine (null si je n'ai rien fait). */
  myRank: number | null;
  /** Points de score gagnés par geste, en clair. */
  scoring: string;
  /** Récompense de l'habitant de la semaine, en clair. */
  heroReward: string;
  last: {
    week: number;
    from: string;
    to: string;
    hero: string | null;
    heroIsMe: boolean;
    podium: WeekLine[];
    totalActions: number;
    totalAp: number;
    records: string[];
  } | null;
  records: { icon: string; label: string; value: string }[];
  /** Frise, de la plus récente à la plus ancienne. */
  timeline: { day: string; icon: string; title: string }[];
}

type Data = Pick<GameData, 'village' | 'players' | 'me'>;

function line(r: WeekRank, i: number, meId: string): WeekLine {
  return {
    id: r.player_id,
    name: r.name,
    me: r.player_id === meId,
    rank: i + 1,
    actions: r.actions,
    ap: r.ap,
    missions: r.missions,
    helps: r.helps,
    score: r.score,
    favorite: r.favorite ? getAction(r.favorite)?.label ?? r.favorite : null,
  };
}

export function chronicleView(data: Data): ChronicleView {
  const v = data.village;
  const life = lifeOf(v);
  const meId = data.me.id;
  const live = weekRanking(data).map((r, i) => line(r, i, meId));
  const last = life.week_last ?? null;
  const k = C.WEEK_SCORE;
  const rec = life.records ?? {};
  const records: ChronicleView['records'] = [];
  if (rec.week_ap) records.push({ icon: '⚡', label: 'PA en une semaine', value: `${rec.week_ap.value} — ${rec.week_ap.name ?? '?'} (semaine ${rec.week_ap.week})` });
  if (rec.week_helps) records.push({ icon: '🤝', label: 'Coups de main en une semaine', value: `${rec.week_helps.value} — ${rec.week_helps.name ?? '?'} (semaine ${rec.week_helps.week})` });
  if (rec.week_actions) records.push({ icon: '🏘️', label: 'Actions du hameau en une semaine', value: `${rec.week_actions.value} (semaine ${rec.week_actions.week})` });
  return {
    since: life.week_stats?.since ?? null,
    live,
    myRank: live.find((l) => l.me)?.rank ?? null,
    heroReward: `+${C.WEEK_HERO_XP} XP de métier, moral du hameau +${C.WEEK_HERO_MORALE} %`,
    scoring: `${k.ap} pts par PA, ${k.action} par action, ${k.mission} par mission du jour, ${k.help} par coup de main (chantier, voisins, visiteur, résident), ${k.duo} par binôme`,
    last: last
      ? {
          week: last.week,
          from: last.from,
          to: last.to,
          hero: last.ranking.find((r) => r.player_id === last.hero_id)?.name ?? null,
          heroIsMe: last.hero_id === meId,
          podium: last.ranking.slice(0, C.WEEK_PODIUM).map((r, i) => line(r, i, meId)),
          totalActions: last.total_actions,
          totalAp: last.total_ap,
          records: last.records,
        }
      : null,
    records,
    timeline: [...(life.timeline ?? [])].reverse().map((e) => ({ day: e.day, icon: e.icon, title: e.title })),
  };
}
