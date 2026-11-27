/** Travail des résidents (V4.9) : postes, production de nuit, droit de regard d'Ely sur les coupes. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  forestBan,
  lifeOf,
  performAction,
  planResidentWork,
  residentFactor,
  suggestedPost,
  type GameSnapshot,
  type Migrant,
} from '../src/engine/index.ts';
import { makeMigrant, playerId, seedSnapshot, structureId } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const ELY = playerId(1);
const LERME = playerId(2);

function withResidents(list: Partial<Migrant>[], overrides: Parameters<typeof seedSnapshot>[0] = {}): GameSnapshot {
  const s = seedSnapshot(overrides);
  s.migrants = list.map((m, i) => makeMigrant(`m${i + 1}`, m));
  return s;
}

const assign = (s: GameSnapshot, migrantId: string, post: string, actor = LERME) =>
  performAction(s, { action_code: 'assign_work_post', actor_id: actor, target_migrant_id: migrantId, params: { post } }, WEDNESDAY);

describe('Affectation à un poste', () => {
  it('tout fondateur affecte un résident, sans PA ; le spécialiste est signalé', () => {
    const s = withResidents([{ specialty_code: 'mason', specialty_level: 3 }]);
    const out = assign(s, 'm1', 'construction');
    expect(out.status).toBe('done');
    expect(out.snapshot.migrants[0]!.work_post).toBe('construction');
    expect(out.snapshot.players.find((p) => p.id === LERME)!.action_points).toBe(s.players.find((p) => p.id === LERME)!.action_points);
    expect(out.narrative).toMatch(/sa spécialité/);
  });

  it('refuse un poste inconnu, un candidat et un résident au chantier privé ; « none » retire le poste', () => {
    const s = withResidents([{}, { status: 'candidate' }, { private_employer_id: LERME, private_wage_eur_week: 120 }]);
    expect(assign(s, 'm1', 'moon').error).toMatch(/Poste inconnu/);
    expect(assign(s, 'm2', 'garden').status).toBe('refused');
    expect(assign(s, 'm3', 'garden').error).toMatch(/chantier privé/);
    const set = assign(s, 'm1', 'forest');
    const cleared = assign(set.snapshot, 'm1', 'none');
    expect(cleared.snapshot.migrants[0]!.work_post).toBeNull();
  });

  it('embaucher un résident sur un chantier privé lui fait quitter son poste', () => {
    const s = withResidents([{ work_post: 'garden' }]);
    s.players.find((p) => p.id === LERME)!.private_wealth_eur = 1000;
    const out = performAction(s, { action_code: 'hire_resident', actor_id: LERME, target_migrant_id: 'm1', amount_eur: 120 }, WEDNESDAY);
    expect(out.status).toBe('done');
    expect(out.snapshot.migrants[0]!.work_post).toBeNull();
  });

  it('chaque spécialité a un poste conseillé', () => {
    expect(suggestedPost({ specialty_code: 'farmer' }).code).toBe('garden');
    expect(suggestedPost({ specialty_code: 'mason' }).code).toBe('construction');
    expect(suggestedPost({ specialty_code: 'shepherd' }).code).toBe('pasture');
    expect(suggestedPost({ specialty_code: 'unskilled' }).code).toBe('garden');
  });
});

describe('Production de nuit', () => {
  it('le spécialiste produit plus (×1,25 par niveau) ; la grève divise par deux', () => {
    const s = withResidents([
      { specialty_code: 'farmer', specialty_level: 4, work_post: 'garden' },
      { specialty_code: 'unskilled', specialty_level: 1, work_post: 'garden' },
    ], { water_capacity_l_day: 100000 });
    const plan = planResidentWork(s, 'summer', WEDNESDAY);
    const [pro, novice] = ['m1', 'm2'].map((id) => plan.lines.find((l) => l.migrant_id === id)!);
    expect(pro!.factor).toBe(2);
    expect(novice!.factor).toBe(1);
    expect(plan.totals.workers).toBe(2);
    expect(plan.totals.rations + plan.totals.tomatoes / C.TOMATO_KG_PER_RATION).toBeCloseTo(C.RESIDENT_GARDEN_RATIONS * 3, 1);
    const garden = C.WORK_POSTS.find((p) => p.code === 'garden')!;
    s.village.strike_until = '2026-11-30T00:00:00Z';
    expect(residentFactor(s.village, s.migrants[0]!, garden, WEDNESDAY)).toBe(1);
  });

  it('le potager limite le nombre de jardiniers (un par 100 m²)', () => {
    const s = withResidents([{ work_post: 'garden' }, { work_post: 'garden' }], { garden_area_m2: 100, water_capacity_l_day: 100000 });
    const plan = planResidentWork(s, 'summer', WEDNESDAY);
    expect(plan.totals.workers).toBe(1);
    expect(plan.totals.idle).toBe(1);
    expect(plan.lines.some((l) => /Potager trop petit/.test(l.note))).toBe(true);
  });

  it('les blessés, les détenus et les résidents sans poste ne travaillent pas', () => {
    const s = withResidents([
      { work_post: 'forest', injury_type: 'muscular' },
      { work_post: 'forest', is_detained_until: '2026-11-30T00:00:00Z' },
      { work_post: null },
      { work_post: 'forest', status: 'forced_labor' },
    ]);
    const plan = planResidentWork(s, 'autumn', WEDNESDAY);
    expect(plan.totals).toMatchObject({ workers: 1, idle: 2, unassigned: 1 });
  });

  it('le chantier avance le plus avancé des chantiers en cours, une pierre par nuit', () => {
    const s = withResidents([{ specialty_code: 'mason', specialty_level: 2, work_post: 'construction' }], { stone_stock: 3 });
    const target = s.structures.find((st) => st.code === 'borda_alta')!;
    target.status = 'in_progress';
    target.progress_pct = 40;
    const out = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    const after = out.snapshot.structures.find((st) => st.id === target.id)!;
    expect(after.progress_pct).toBe(40 + Math.round(C.RESIDENT_BUILD_POINTS * 1.5));
    expect(out.snapshot.village.stone_stock).toBe(2);
    expect(lifeOf(out.snapshot.village).work_last?.build).toBe(3);

    s.village.stone_stock = 0;
    expect(planResidentWork(s, 'autumn', WEDNESDAY).lines[0]!.note).toMatch(/Plus de pierre/);
  });

  it('sans chantier en cours, il répare une bâtisse abîmée', () => {
    const s = withResidents([{ specialty_code: 'unskilled', work_post: 'construction' }]);
    const plan = planResidentWork(s, 'autumn', WEDNESDAY);
    expect(plan.repair[structureId(s, 'esglesia')]).toBe(C.RESIDENT_REPAIR_POINTS);
  });

  it('la forge répare l\'usure des outils puis recycle la ferraille', () => {
    const s = withResidents([{ specialty_code: 'welder', specialty_level: 1, work_post: 'forge' }], { tools_wear_pct: 5 });
    expect(planResidentWork(s, 'autumn', WEDNESDAY).totals.tools_wear).toBe(5);
    s.village.tools_wear_pct = 0;
    const plan = planResidentWork(s, 'autumn', WEDNESDAY);
    expect(plan.totals).toMatchObject({ iron: 1, scrap_used: C.RESIDENT_FORGE_SCRAP });
  });

  it('pâturage, réseau d\'eau et piste', () => {
    const s = withResidents([{ work_post: 'pasture' }, { work_post: 'water' }, { work_post: 'track' }].map((m) => ({ ...m, specialty_code: 'unskilled' as const, traits: { temper: 'loner' } })), { livestock_count: 12 });
    const plan = planResidentWork(s, 'autumn', WEDNESDAY);
    expect(plan.totals.rations).toBeCloseTo(10 * C.RESIDENT_PASTURE_RATIONS_PER_HEAD, 2);
    expect(plan.totals.water).toBe(C.RESIDENT_WATER_POINTS);
    expect(plan.totals.track).toBe(C.RESIDENT_TRACK_POINTS);
  });

  it('la nuit, les bûcherons remplissent la réserve et comptent dans les coupes de la semaine', () => {
    const s = withResidents([{ work_post: 'forest' }, { work_post: 'forest' }], { wood_stock: 0, real_temp_min_c: 15 });
    const out = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    expect(out.snapshot.village.wood_stock).toBe(2 * C.RESIDENT_FOREST_WOOD);
    expect(lifeOf(out.snapshot.village).wood_cuts).toBe(2 * C.RESIDENT_FOREST_CUT_SHARE);
    expect(lifeOf(out.snapshot.village).work_last?.workers).toBe(2);
  });
});

describe('Droit de regard d\'Ely sur les coupes', () => {
  const ban = (s: GameSnapshot, actor = ELY, reason = 'La forêt a besoin de repos cette semaine.') =>
    performAction(s, { action_code: 'forest_ban', actor_id: actor, params: { reason } }, WEDNESDAY);

  it('Ely seule interdit les coupes, avec un motif', () => {
    const s = seedSnapshot();
    expect(ban(s, LERME).status).toBe('refused');
    expect(ban(s, ELY, 'non').error).toMatch(/Motivez/);
    const out = ban(s);
    expect(out.status).toBe('done');
    expect(forestBan(out.snapshot.village)?.by).toBe(ELY);
    expect(out.events.some((e) => e.event_type === 'forest_ban')).toBe(true);
  });

  it('pendant l\'interdiction : coupe refusée, bûcherons à l\'entretien ; levée possible', () => {
    const s = withResidents([{ work_post: 'forest' }]);
    const banned = ban(s).snapshot;
    const cut = performAction(banned, { action_code: 'cut_wood', actor_id: LERME }, WEDNESDAY);
    expect(cut.status).toBe('refused');
    expect(cut.error).toMatch(/Ely a interdit les coupes/);
    const plan = planResidentWork(banned, 'autumn', WEDNESDAY);
    expect(plan.totals.wood).toBe(0);
    expect(plan.totals.ecology).toBe(C.RESIDENT_FOREST_CARE_ECOLOGY);
    const lifted = performAction(banned, { action_code: 'lift_forest_ban', actor_id: ELY }, WEDNESDAY);
    expect(forestBan(lifted.snapshot.village)).toBeNull();
  });

  it('l\'interdiction tombe le lundi avec la nouvelle semaine', () => {
    const s = ban(seedSnapshot()).snapshot;
    s.village.last_tick_at = '2026-11-29T20:00:00Z';
    const out = applyElapsedTime(s, new Date('2026-11-30T08:00:00Z'));
    expect(forestBan(out.snapshot.village)).toBeNull();
  });
});
