/** Nouveaux bâtiments & parcelles libres (V5.4) : plan, règles, chantier, électricité, effets de nuit. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  freeParcels,
  lifeOf,
  needsPower,
  parcelOccupant,
  performAction,
  planBlocker,
  planBuildingsNight,
  type GameSnapshot,
  type MapStructure,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const NOW = new Date('2026-11-26T10:00:00Z');
const ELY = playerId(1);
const TIPH = playerId(3);
const JULIO = playerId(5);

const plan = (s: GameSnapshot, actor: string, variant: string, parcel: string) =>
  performAction(s, { action_code: 'plan_building', actor_id: actor, params: { variant, parcel } }, NOW);

/** Pose directement un bâtiment en service (sans passer par le chantier). */
function withBuilt(s: GameSnapshot, ...variants: string[]): GameSnapshot {
  variants.forEach((variant, i) => {
    const st: MapStructure = {
      id: `b0000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
      code: `nb_${variant}`,
      kind: 'building',
      name: variant,
      status: 'operational',
      condition_pct: 100,
      progress_pct: 100,
      beds_capacity: 0,
      is_power_connected: true,
      plu_approved: true,
      eco_veto_active: false,
      owner_player_id: null,
      leak_alert: false,
      variant,
      upgrade_level: 1,
    };
    s.structures.push(st);
  });
  return s;
}

function night(s: GameSnapshot): GameSnapshot {
  s.village.last_tick_at = '2026-11-25T20:00:00Z';
  return applyElapsedTime(s, new Date('2026-11-26T08:00:00Z')).snapshot;
}

describe('Plan sur une parcelle libre', () => {
  it('Tiphaine pose un poulailler : ouvrage « planned » sur la parcelle, PLU d\'office, caisse débitée', () => {
    const s = seedSnapshot();
    const before = s.village.treasury_eur;
    const r = plan(s, TIPH, 'henhouse', 'era_baixa');
    expect(r.ok, r.error ?? '').toBe(true);
    const st = r.snapshot.structures.find((x) => x.variant === 'henhouse')!;
    expect(st).toMatchObject({ kind: 'building', code: 'nb_henhouse', status: 'planned', plu_approved: true, x: 135, y: 245, beds_capacity: 0 });
    expect(r.snapshot.village.treasury_eur).toBe(before - 250);
    expect(lifeOf(r.snapshot.village).parcels).toEqual({ era_baixa: st.id });
    expect(parcelOccupant(r.snapshot, 'era_baixa')?.id).toBe(st.id);
    expect(freeParcels(r.snapshot).map((p) => p.id)).not.toContain('era_baixa');
    expect(r.events.some((e) => e.event_type === 'building_planned')).toBe(true);
  });

  it('un autre joueur pose le plan : l\'accord PLU de Tiphaine sera demandé au chantier', () => {
    const r = plan(seedSnapshot(), ELY, 'beehives', 'camp_pla');
    expect(r.ok, r.error ?? '').toBe(true);
    const st = r.snapshot.structures.find((x) => x.variant === 'beehives')!;
    expect(st.plu_approved).toBe(false);
    const reno = performAction(r.snapshot, { action_code: 'renovate_building', actor_id: ELY, target_structure_id: st.id }, NOW);
    expect(reno.status).toBe('pending_approval');
  });

  it('règles : bord de rivière, parcelle prise, un seul de chaque, deux projets au plus', () => {
    const s = seedSnapshot();
    expect(planBlocker(s, 'water_mill', 'era_baixa')).toMatch(/rivière/);
    expect(planBlocker(s, 'water_mill', 'riba')).toBeNull();
    expect(planBlocker(s, 'castle', 'riba')).toMatch(/inconnu/);
    const a = plan(s, TIPH, 'henhouse', 'era_baixa').snapshot;
    expect(planBlocker(a, 'bakery', 'era_baixa')).toMatch(/déjà prise/);
    expect(planBlocker(a, 'henhouse', 'coll')).toMatch(/déjà son poulailler/);
    const b = plan(a, TIPH, 'washhouse', 'riba').snapshot;
    expect(planBlocker(b, 'bakery', 'coll')).toMatch(/2 nouveaux bâtiments/);
    const refused = plan(b, TIPH, 'bakery', 'coll');
    expect(refused.ok).toBe(false);
  });

  it('une démolition libère la parcelle et le même bâtiment peut renaître ailleurs', () => {
    const s = plan(seedSnapshot(), TIPH, 'henhouse', 'era_baixa').snapshot;
    const st = s.structures.find((x) => x.variant === 'henhouse')!;
    st.status = 'demolished';
    expect(freeParcels(s).map((p) => p.id)).toContain('era_baixa');
    const r = plan(s, TIPH, 'henhouse', 'coll');
    expect(r.ok, r.error ?? '').toBe(true);
    const again = r.snapshot.structures.filter((x) => x.code === 'nb_henhouse');
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ status: 'planned', x: 700, progress_pct: 0 });
  });
});

describe('Chantier et électricité', () => {
  it('un petit bâtiment avance plus vite qu\'une bâtisse ordinaire', () => {
    const s = plan(seedSnapshot(), TIPH, 'beehives', 'camp_pla').snapshot;
    const st = s.structures.find((x) => x.variant === 'beehives')!;
    const r = performAction(s, { action_code: 'renovate_building', actor_id: TIPH, target_structure_id: st.id }, NOW);
    expect(r.ok, r.error ?? '').toBe(true);
    const ruin = s.structures.find((x) => x.code === 'borda_alta')!;
    ruin.plu_approved = true;
    const r2 = performAction(s, { action_code: 'renovate_building', actor_id: TIPH, target_structure_id: ruin.id }, NOW);
    const gainNew = r.snapshot.structures.find((x) => x.id === st.id)!.progress_pct;
    const gainOld = r2.snapshot.structures.find((x) => x.id === ruin.id)!.progress_pct;
    expect(gainNew).toBeGreaterThanOrEqual(gainOld * 2.5);
  });

  it('chambre froide et scierie attendent le courant ; le poulailler non', () => {
    expect(needsPower({ kind: 'building', variant: 'cold_room' })).toBe(true);
    expect(needsPower({ kind: 'building', variant: 'sawmill' })).toBe(true);
    expect(needsPower({ kind: 'building', variant: 'henhouse' })).toBe(false);
    expect(needsPower({ kind: 'building', variant: null })).toBe(true);
    const s = plan(seedSnapshot(), TIPH, 'henhouse', 'era_baixa').snapshot;
    const st = s.structures.find((x) => x.variant === 'henhouse')!;
    st.progress_pct = 95;
    const r = performAction(s, { action_code: 'renovate_building', actor_id: TIPH, target_structure_id: st.id }, NOW);
    expect(r.snapshot.structures.find((x) => x.id === st.id)!.status).toBe('operational');
  });

  it('on n\'améliore pas « son logement » dans un four à pain', () => {
    const s = withBuilt(seedSnapshot(), 'bakery');
    const st = s.structures.find((x) => x.variant === 'bakery')!;
    const r = performAction(s, { action_code: 'improve_own_housing', actor_id: ELY, target_structure_id: st.id }, NOW);
    expect(r.ok).toBe(false);
  });
});

describe('Effets de nuit', () => {
  it('four + moulin + poulailler : rations en plus, 1 stère brûlé, bilan dans life', () => {
    const base = night(seedSnapshot());
    const out = night(withBuilt(seedSnapshot(), 'bakery', 'water_mill', 'henhouse'));
    const extra = C.BAKERY_RATIONS + C.MILL_BAKERY_BONUS + C.MILL_RATIONS + C.HENHOUSE_RATIONS;
    expect(out.village.food_rations - base.village.food_rations).toBeCloseTo(extra, 1);
    expect(base.village.wood_stock - out.village.wood_stock).toBe(C.BAKERY_WOOD);
    expect(lifeOf(out.village).buildings_last).toMatchObject({ rations: extra, wood: 1 });
  });

  it('sans bois, le four ne cuit pas ; la fromagerie demande 2 bêtes', () => {
    const s = withBuilt(seedSnapshot(), 'bakery', 'cheese_dairy');
    s.village.wood_stock = 0;
    s.village.livestock_count = 1;
    expect(planBuildingsNight(s, 'winter').rations).toBe(0);
    s.village.livestock_count = 2;
    s.village.wood_stock = 5;
    expect(planBuildingsNight(s, 'winter').rations).toBe(C.BAKERY_RATIONS + C.CHEESE_RATIONS);
  });

  it('serre : plus de légumes en hiver ; bar : recettes et moral ; infirmerie : santé des blessés', () => {
    const s = withBuilt(seedSnapshot(), 'greenhouse', 'village_bar', 'infirmary');
    expect(planBuildingsNight(s, 'winter').rations).toBe(C.GREENHOUSE_RATIONS_COLD);
    expect(planBuildingsNight(s, 'summer').rations).toBe(C.GREENHOUSE_RATIONS_WARM);
    const p = s.players.find((x) => x.id === JULIO)!;
    p.injury_type = 'muscular';
    p.health_pct = 50;
    const base = night(seedSnapshot());
    const out = night(s);
    expect(out.village.treasury_eur - base.village.treasury_eur).toBeCloseTo(C.BAR_INCOME_EUR, 2);
    expect(out.players.find((x) => x.id === JULIO)!.health_pct).toBeGreaterThan(50);
  });

  it('scierie : +3 stères à chaque coupe', () => {
    const cut = (s: GameSnapshot) => performAction(s, { action_code: 'cut_wood', actor_id: JULIO }, NOW).snapshot.village.wood_stock;
    const s = seedSnapshot();
    expect(cut(withBuilt(seedSnapshot(), 'sawmill')) - cut(s)).toBe(C.SAWMILL_WOOD_BONUS);
  });

  it('un bâtiment en chantier ne produit rien', () => {
    const s = withBuilt(seedSnapshot(), 'henhouse');
    s.structures.find((x) => x.variant === 'henhouse')!.status = 'in_progress';
    expect(planBuildingsNight(s, 'summer').active).toEqual([]);
  });
});
