/** Résidents avec une personnalité (V5.7) : caractère, humeur, relations, petites histoires, encouragement. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  assignRelations,
  constants as C,
  createRng,
  lifeOf,
  moodOf,
  performAction,
  personalityFactor,
  pickStory,
  planMoods,
  planResidentWork,
  temperOf,
  traitsOf,
  type GameSnapshot,
  type Migrant,
} from '../src/engine/index.ts';
import { makeMigrant, playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const LERME = playerId(2);

function withResidents(list: Partial<Migrant>[], overrides: Parameters<typeof seedSnapshot>[0] = {}): GameSnapshot {
  const s = seedSnapshot(overrides);
  s.migrants = list.map((m, i) => makeMigrant(`m${i + 1}`, m));
  return s;
}

const night = { hungry: false, cold: false, cheese: false };

describe('Caractère et humeur', () => {
  it('le caractère est stable (tiré de l’identifiant) et l’humeur part de la valeur par défaut', () => {
    const m = makeMigrant('abc');
    expect(temperOf(m).code).toBe(temperOf(makeMigrant('abc')).code);
    expect(C.TEMPERS.map((t) => t.code)).toContain(temperOf(m).code);
    expect(moodOf(m)).toBe(C.MOOD_DEFAULT);
    expect(temperOf(makeMigrant('abc', { traits: { temper: 'chilly' } })).code).toBe('chilly');
  });

  it('l’humeur agit sur le rendement : joyeux +10 %, maussade −15 %, bosseur +10 %', () => {
    expect(personalityFactor(makeMigrant('a', { traits: { temper: 'loner', mood: 60 } }))).toBe(1);
    expect(personalityFactor(makeMigrant('a', { traits: { temper: 'loner', mood: 80 } }))).toBeCloseTo(C.MOOD_HAPPY_FACTOR);
    expect(personalityFactor(makeMigrant('a', { traits: { temper: 'loner', mood: 10 } }))).toBeCloseTo(C.MOOD_SULK_FACTOR);
    expect(personalityFactor(makeMigrant('a', { traits: { temper: 'hard_worker', mood: 60 } }))).toBeCloseTo(C.TEMPER_WORKER_FACTOR);
    const s = withResidents([{ work_post: 'water', specialty_code: 'unskilled', traits: { temper: 'loner', mood: 10 } }], { water_network_condition_pct: 50 });
    expect(planResidentWork(s, 'autumn', WEDNESDAY).totals.water).toBeCloseTo(C.RESIDENT_WATER_POINTS * C.MOOD_SULK_FACTOR, 2);
  });

  it('le travail fait monter l’humeur, l’inactivité, la faim et le froid la font baisser', () => {
    const s = withResidents(
      [
        { work_post: 'water', specialty_code: 'unskilled', traits: { temper: 'loner', mood: 60 } },
        { work_post: null, traits: { temper: 'loner', mood: 60 } },
        { work_post: null, traits: { temper: 'chilly', mood: 60 } },
      ],
      { water_network_condition_pct: 50 },
    );
    const plan = planResidentWork(s, 'autumn', WEDNESDAY);
    const [worker, idle] = planMoods(s, plan, night);
    expect(worker!.delta).toBe(C.MOOD_WORKING + 1 + C.MOOD_FED);
    expect(idle!.delta).toBe(C.MOOD_IDLE + C.MOOD_FED);
    const cold = planMoods(s, plan, { hungry: true, cold: true, cheese: false });
    expect(cold[1]!.delta).toBe(C.MOOD_IDLE + C.MOOD_HUNGRY + C.MOOD_COLD);
    expect(cold[2]!.delta).toBe(C.MOOD_IDLE + C.MOOD_HUNGRY + 2 * C.MOOD_COLD);
    expect(cold[2]!.reason).toBe('le froid');
  });
});

describe('Relations', () => {
  it('chacun se fait un ami (sauf le solitaire), mutuellement ; un ronchon se trouve un rival', () => {
    const s = withResidents([
      { traits: { temper: 'joker' } },
      { traits: { temper: 'grumpy' } },
      { traits: { temper: 'loner' } },
      { traits: { temper: 'chatty' } },
      { traits: { temper: 'gourmand' } },
    ]);
    const formed = assignRelations(s);
    expect(formed).toHaveLength(2);
    for (const [a, b] of formed) {
      expect(traitsOf(s.migrants.find((m) => m.id === a)!).friend_id).toBe(b);
      expect(traitsOf(s.migrants.find((m) => m.id === b)!).friend_id).toBe(a);
    }
    expect(traitsOf(s.migrants[2]!).friend_id ?? null).toBeNull();
    const grumpy = traitsOf(s.migrants[1]!);
    expect(grumpy.rival_id).toBeTruthy();
    expect(grumpy.rival_id).not.toBe(grumpy.friend_id);
    expect(grumpy.rival_id).not.toBe('m3');
    // Un résident parti : le lien est oublié
    s.migrants = s.migrants.filter((m) => m.id !== formed[0]![1]);
    assignRelations(s);
    expect(traitsOf(s.migrants.find((m) => m.id === formed[0]![0])!).friend_id ?? null).toBeNull();
  });
});

describe('Petites histoires et nuit', () => {
  it('une amitié neuve fait toujours l’histoire de la nuit', () => {
    const s = withResidents([{ full_name: 'Aitor Etxeberria', traits: { temper: 'joker' } }, { full_name: 'Mamadou Diallo', traits: { temper: 'chatty' } }]);
    const formed = assignRelations(s);
    const story = pickStory(s, createRng('x'), '2026-11-24', night, formed);
    expect(story?.title).toBe('Une amitié au hameau');
    expect(story?.text).toMatch(/Aitor/);
    expect(story?.text).toMatch(/Mamadou/);
  });

  it('la nuit écrit l’humeur, les relations et parfois une petite histoire publique (déterministe)', () => {
    const s = withResidents([
      { work_post: 'water', traits: { temper: 'joker' } },
      { work_post: 'track', traits: { temper: 'grumpy' } },
    ], { water_network_condition_pct: 50, track_condition_pct: 50 });
    const a = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    const b = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    const m1 = a.snapshot.migrants[0]!;
    expect(traitsOf(m1).friend_id).toBe('m2');
    expect(typeof traitsOf(m1).mood).toBe('number');
    expect(traitsOf(m1).mood_reason).toBeTruthy();
    const story = lifeOf(a.snapshot.village).story_last;
    expect(story?.title).toBe('Une amitié au hameau');
    expect(a.events.some((e) => e.event_type === 'resident_story' && e.visibility === 'public' && e.body === story!.text)).toBe(true);
    expect(JSON.stringify(b.snapshot.migrants)).toBe(JSON.stringify(a.snapshot.migrants));
  });

  it('sans résident, rien ne change', () => {
    const s = withResidents([]);
    const out = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    expect(lifeOf(out.snapshot.village).story_last ?? null).toBeNull();
  });
});

describe('Encourager un résident', () => {
  it('1 PA, +15 d’humeur, une fois par jour ; refusé pour un candidat', () => {
    const s = withResidents([{ traits: { temper: 'loner', mood: 20 } }, { status: 'candidate' }]);
    const ap = s.players.find((p) => p.id === LERME)!.action_points;
    const out = performAction(s, { action_code: 'cheer_resident', actor_id: LERME, target_migrant_id: 'm1' }, WEDNESDAY);
    expect(out.status).toBe('done');
    expect(moodOf(out.snapshot.migrants[0]!)).toBe(20 + C.CHEER_MOOD);
    expect(out.snapshot.players.find((p) => p.id === LERME)!.action_points).toBe(ap - C.CHEER_AP);
    const again = performAction(out.snapshot, { action_code: 'cheer_resident', actor_id: LERME, target_migrant_id: 'm1' }, WEDNESDAY);
    expect(again.status).toBe('refused');
    expect(again.narrative).toMatch(/aujourd'hui/);
    const cand = performAction(s, { action_code: 'cheer_resident', actor_id: LERME, target_migrant_id: 'm2' }, WEDNESDAY);
    expect(cand.status).toBe('refused');
  });
});
