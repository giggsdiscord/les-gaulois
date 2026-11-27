/** Chantier collectif de la semaine (V5.0) : vote, contributions, bonus avant dimanche, bilan du lundi. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  collectiveGoal,
  constants as C,
  createRng,
  drawCandidates,
  emptyEffects,
  lifeOf,
  performAction,
  startWeeklyProject,
  tallyCollectiveVotes,
  type CollectiveProject,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const SUNDAY = new Date('2026-11-29T10:00:00Z');
const ELY = playerId(1); // mayor_agri
const LERME = playerId(2); // treasurer_physio

function withProject(id: string, extra: Partial<CollectiveProject> = {}, s: GameSnapshot = seedSnapshot()): GameSnapshot {
  s.village.life = {
    ...(s.village.life ?? {}),
    collective: { id, started_at: '2026-11-23T00:00:00Z', goal: 14, points: 0, contributions: {}, completed_at: null, early: false, ...extra },
    collective_candidates: ['woodpile', 'village_feast', 'water_works'],
  };
  return s;
}

const contribute = (s: GameSnapshot, actor: string, now = WEDNESDAY) =>
  performAction(s, { action_code: 'contribute_collective', actor_id: actor }, now);

describe('Contributions', () => {
  it('1 PA = 1 point, 2 pour le métier du projet ; contributions par joueur', () => {
    let s = withProject('garden_extension');
    const a = contribute(s, LERME);
    expect(a.status).toBe('done');
    expect(a.ap_spent).toBe(1);
    s = a.snapshot;
    const b = contribute(s, ELY);
    const p = lifeOf(b.snapshot.village).collective!;
    expect(p.points).toBe(1 + C.COLLECTIVE_POLE_POINTS);
    expect(p.contributions).toEqual({ [LERME]: 1, [ELY]: C.COLLECTIVE_POLE_POINTS });
  });

  it('achevé avant dimanche : effet ×1,5 et moral en plus', () => {
    const s = withProject('woodpile', { points: 13 });
    const wood = s.village.wood_stock;
    const morale = s.village.morale_pct;
    const out = contribute(s, LERME);
    const p = lifeOf(out.snapshot.village).collective!;
    expect(p.completed_at).not.toBeNull();
    expect(p.early).toBe(true);
    expect(out.snapshot.village.wood_stock).toBe(wood + Math.round(C.COLLECTIVE_WOOD * C.COLLECTIVE_EARLY_FACTOR));
    expect(out.snapshot.village.morale_pct).toBeGreaterThan(morale);
    expect(out.events.some((e) => e.event_type === 'collective_completed')).toBe(true);
    // Plus de contribution une fois achevé
    expect(contribute(out.snapshot, ELY).status).toBe('refused');
  });

  it('achevé le dimanche : effet simple, sans bonus ; les points ne dépassent pas l\'objectif', () => {
    const s = withProject('woodpile', { points: 13 });
    const wood = s.village.wood_stock;
    const out = contribute(s, playerId(5), SUNDAY); // smith_diplo : 2 points, plafonnés à 1
    const p = lifeOf(out.snapshot.village).collective!;
    expect(p.points).toBe(14);
    expect(p.early).toBe(false);
    expect(out.snapshot.village.wood_stock).toBe(wood + C.COLLECTIVE_WOOD);
  });

  it('refusé sans chantier ouvert', () => {
    expect(contribute(seedSnapshot(), LERME).status).toBe('refused');
  });
});

describe('Vote pour la semaine suivante', () => {
  it('vote parmi les candidats seulement, une voix par joueur (modifiable)', () => {
    const s = withProject('garden_extension');
    const vote = (snap: GameSnapshot, actor: string, project: string) =>
      performAction(snap, { action_code: 'vote_collective_project', actor_id: actor, params: { project } }, WEDNESDAY);
    expect(vote(s, LERME, 'site_rush').status).toBe('refused');
    const a = vote(s, LERME, 'village_feast');
    expect(a.status).toBe('done');
    expect(a.ap_spent).toBe(0);
    const b = vote(a.snapshot, LERME, 'water_works');
    expect(lifeOf(b.snapshot.village).collective_votes).toEqual({ [LERME]: 'water_works' });
  });

  it('dépouillement : le plus voté, sinon la proposition du hameau (premier candidat)', () => {
    expect(tallyCollectiveVotes(['a', 'b', 'c'], {}).winner).toBe('a');
    expect(tallyCollectiveVotes(['a', 'b', 'c'], { p1: 'c', p2: 'c', p3: 'b' }).winner).toBe('c');
    expect(tallyCollectiveVotes(['a', 'b', 'c'], { p1: 'b', p2: 'c' }).winner).toBe('b');
  });

  it('candidats : le plus utile d\'abord, sans le projet exclu, déterministes', () => {
    const s = seedSnapshot({ wood_stock: 0 });
    const a = drawCandidates(s, createRng('x'), null);
    expect(a[0]).toBe('woodpile');
    expect(a).toHaveLength(C.COLLECTIVE_CANDIDATES);
    expect(drawCandidates(s, createRng('x'), null)).toEqual(a);
    expect(drawCandidates(s, createRng('x'), 'woodpile')).not.toContain('woodpile');
  });

  it('ouverture : le projet voté, objectif selon les fondateurs actifs, nouveaux candidats', () => {
    const s = withProject('garden_extension');
    s.village.life!.collective_votes = { [LERME]: 'water_works', [ELY]: 'water_works' };
    const fx = emptyEffects();
    const p = startWeeklyProject(s, fx, createRng('w'), WEDNESDAY)!;
    expect(p.id).toBe('water_works');
    expect(p.goal).toBe(collectiveGoal(s));
    expect(p.goal).toBe(7 * C.COLLECTIVE_POINTS_PER_PLAYER);
    const life = lifeOf(s.village);
    expect(life.collective_votes).toEqual({});
    expect(life.collective_candidates).not.toContain('water_works');
    expect(fx.events[0]!.body).toMatch(/2 voix/);
  });
});

describe('Cycle de la semaine', () => {
  it('première nuit : un chantier s\'ouvre tout seul', () => {
    const s = seedSnapshot();
    s.village.last_tick_at = WEDNESDAY.toISOString();
    const out = applyElapsedTime(s, new Date('2026-11-26T08:00:00Z'));
    const life = lifeOf(out.snapshot.village);
    expect(life.collective?.id).toBeTruthy();
    expect(life.collective_candidates?.length).toBeGreaterThan(0);
  });

  it('lundi : chantier inachevé = moral en baisse, bilan gardé, le voté s\'ouvre', () => {
    const s = withProject('garden_extension', { points: 5 });
    s.village.last_tick_at = '2026-11-29T20:00:00Z';
    s.village.life!.collective_votes = { [LERME]: 'village_feast' };
    const out = applyElapsedTime(s, new Date('2026-11-30T08:00:00Z'));
    const life = lifeOf(out.snapshot.village);
    expect(life.collective_last?.id).toBe('garden_extension');
    expect(life.collective?.id).toBe('village_feast');
    expect(life.collective?.points).toBe(0);
    expect(out.events.some((e) => e.event_type === 'collective_failed')).toBe(true);
  });
});
