/** Bilan de la semaine & frise du hameau (V6.0). */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  lifeOf,
  performAction,
  recordMilestones,
  recordWeekAction,
  weekRanking,
  weekScore,
  type EngineEffects,
  type EngineEvent,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const SUNDAY_NOON = '2026-11-29T12:00:00.000Z';
const MONDAY = new Date('2026-11-30T08:00:00Z');
const emptyFx = (): EngineEffects => ({ events: [], ledger: [], screenings: [], approvals: [], triggers: [] }) as unknown as EngineEffects;

function played(s: GameSnapshot, id: string, n: number, code = 'cut_wood', ap = 1): void {
  for (let i = 0; i < n; i++) recordWeekAction(s.village, id, code, ap, {}, '2026-11-24');
}

describe('Compteurs de la semaine', () => {
  it('une action réussie compte action, PA et code pour l’acteur', () => {
    const s = seedSnapshot();
    const out = performAction(s, { action_code: 'cut_wood', actor_id: playerId(1) }, WEDNESDAY);
    expect(out.status).toBe('done');
    const w = lifeOf(out.snapshot.village).week_stats!;
    expect(w.since).toBe('2026-11-25');
    expect(w.players[playerId(1)]).toMatchObject({ actions: 1, ap: 1, codes: { cut_wood: 1 } });
  });

  it('une action refusée ne compte pas', () => {
    const s = seedSnapshot();
    s.players[0]!.action_points = 0;
    const out = performAction(s, { action_code: 'cut_wood', actor_id: s.players[0]!.id }, WEDNESDAY);
    expect(out.ok).toBe(false);
    expect(lifeOf(out.snapshot.village).week_stats).toBeUndefined();
  });

  it('coups de main et score', () => {
    const s = seedSnapshot();
    recordWeekAction(s.village, playerId(1), 'help_neighbors', 1, { mission: true, duo: true }, '2026-11-24');
    const w = lifeOf(s.village).week_stats!.players[playerId(1)]!;
    expect(w.helps).toBe(1);
    expect(weekScore(w)).toBe(C.WEEK_SCORE.ap + C.WEEK_SCORE.action + C.WEEK_SCORE.mission + C.WEEK_SCORE.help + C.WEEK_SCORE.duo);
  });

  it('classement : score, puis PA, puis ordre des joueurs', () => {
    const s = seedSnapshot();
    played(s, playerId(3), 2);
    played(s, playerId(2), 2);
    played(s, playerId(1), 1, 'cut_wood', 3);
    const r = weekRanking(s);
    expect(r.map((x) => x.player_id)).toEqual([playerId(1), playerId(2), playerId(3)]);
    expect(r[0]!.favorite).toBe('cut_wood');
  });
});

describe('Bilan du lundi', () => {
  function sundayWith(fn: (s: GameSnapshot) => void): GameSnapshot {
    const s = seedSnapshot();
    s.village.last_tick_at = SUNDAY_NOON;
    fn(s);
    return s;
  }

  it('habitant de la semaine récompensé, compteurs remis à zéro, records posés', () => {
    const s = sundayWith((x) => {
      played(x, playerId(2), 3);
      played(x, playerId(1), 1);
    });
    const xp = s.players.find((p) => p.id === playerId(2))!.skill_xp;
    const r = applyElapsedTime(s, MONDAY);
    const life = lifeOf(r.snapshot.village);
    expect(life.week_stats).toBeNull();
    expect(life.week_last).toMatchObject({ hero_id: playerId(2), total_actions: 4, total_ap: 4, to: '2026-11-29' });
    expect(life.records?.week_ap).toMatchObject({ value: 3, player_id: playerId(2) });
    expect(life.records?.week_actions?.value).toBe(4);
    expect(life.week_last!.records).toEqual([]);
    expect(r.snapshot.players.find((p) => p.id === playerId(2))!.skill_xp).toBe(xp + C.WEEK_HERO_XP);
    const ev = r.events.find((e) => e.event_type === 'week_review')!;
    expect(ev.title.startsWith('Bilan de la semaine : ')).toBe(true);
    expect(ev.body).toContain('1. ');
  });

  it('un record battu est annoncé', () => {
    const s = sundayWith((x) => {
      x.village.life = { ...(x.village.life ?? {}), records: { week_actions: { value: 2, week: 1 } } };
      played(x, playerId(1), 5);
    });
    const r = applyElapsedTime(s, MONDAY);
    expect(lifeOf(r.snapshot.village).week_last!.records.join(' ')).toContain('Semaine record pour le hameau : 5 actions (ancien : 2)');
  });

  it('semaine sans action : bilan calme, sans habitant', () => {
    const r = applyElapsedTime(sundayWith(() => {}), MONDAY);
    expect(lifeOf(r.snapshot.village).week_last!.hero_id).toBeNull();
    expect(r.events.find((e) => e.event_type === 'week_review')!.title).toBe('Bilan de la semaine : semaine calme');
  });
});

describe('Frise', () => {
  const ev = (event_type: string, title: string, data: Record<string, unknown> = {}, visibility: EngineEvent['visibility'] = 'public') =>
    ({ event_type, title, body: '', data, visibility, game_day: 0 }) as EngineEvent;

  it('date les grands événements publics, une seule fois', () => {
    const s = seedSnapshot();
    const st = s.structures[0]!;
    const fx = emptyFx();
    fx.events.push(ev('structure_completed', 'Chantier achevé', { structure_id: st.id }), ev('action', 'Couper du bois'), ev('act_changed', 'Acte II', {}, 'private'));
    recordMilestones(s, fx, '2026-11-25');
    recordMilestones(s, fx, '2026-11-26');
    expect(lifeOf(s.village).timeline).toEqual([{ day: '2026-11-25', kind: 'structure_completed', icon: '🏗️', title: `« ${st.name} » livré` }]);
    // Le même événement recopié dans un autre lot (fusion des effets) n'est pas doublé
    const fx2 = emptyFx();
    fx2.events.push(ev('structure_completed', 'Chantier achevé', { structure_id: st.id }));
    recordMilestones(s, fx2, '2026-11-26');
    expect(lifeOf(s.village).timeline).toHaveLength(1);
  });

  it('bornée à TIMELINE_MAX étapes', () => {
    const s = seedSnapshot();
    const fx = emptyFx();
    for (let i = 0; i < C.TIMELINE_MAX + 5; i++) fx.events.push(ev('birth', `Naissance ${i}`));
    recordMilestones(s, fx, '2026-11-25');
    const t = lifeOf(s.village).timeline!;
    expect(t).toHaveLength(C.TIMELINE_MAX);
    expect(t[0]!.title).toBe('Naissance 5');
  });

  it('une étape de la nuit est datée du jour écoulé', () => {
    const s = seedSnapshot();
    s.village.life = { act_goals: {} };
    s.village.last_tick_at = '2026-11-25T12:00:00.000Z';
    s.village.autonomy_pct = 0;
    const r = applyElapsedTime(s, new Date('2026-11-26T08:00:00Z'));
    for (const e of lifeOf(r.snapshot.village).timeline ?? []) expect(['2026-11-25', '2026-11-26']).toContain(e.day);
  });
});
