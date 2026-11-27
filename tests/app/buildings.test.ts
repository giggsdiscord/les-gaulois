/** Nouveaux bâtiments & parcelles libres (V5.4) : choix d'une parcelle, carte, priorité, démo. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoApi } from '../../src/app/api/demo.ts';
import type { Structure } from '../../src/app/api/types.ts';
import { actionBlockReason, situationFor } from '../../src/app/lib/actionHints.ts';
import { buildingsOverview, parcelChoices } from '../../src/app/lib/buildings.ts';
import { inLayer, nextStepFor, structureIcon, structureLabel } from '../../src/app/lib/mapView.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';
import { reserveReport } from '../../src/app/lib/reserves.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { constants as C, getAction } from '../../src/engine/index.ts';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  };
}

async function demo(slot = 3): Promise<DemoApi> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(slot), '0000'));
  await api.loadAll();
  return api;
}

describe('Nouveaux bâtiments (interface + démo)', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('parcelle en bord de rivière : moulin et lavoir possibles ; ailleurs, refusés avec la raison', async () => {
    const data = await (await demo()).loadAll();
    const riba = parcelChoices(data, 'riba')!;
    expect(riba.free).toBe(true);
    expect(riba.choices.find((c) => c.type.id === 'water_mill')!.blocker).toBeNull();
    const era = parcelChoices(data, 'era_baixa')!;
    expect(era.choices.find((c) => c.type.id === 'washhouse')!.blocker).toMatch(/rivière/);
    expect(era.choices.at(-1)!.blocker).not.toBeNull();
    expect(era.choices.find((c) => c.type.id === 'infirmary')!.needsBudget).toBe(true);
    expect(parcelChoices(data, 'nulle_part')).toBeNull();
  });

  it('plan posé par la démo : ouvrage sur la carte, parcelle prise, prochaine étape « Lancer le chantier »', async () => {
    const api = await demo();
    const r = await api.action({ action_code: 'plan_building', params: { variant: 'beehives', parcel: 'camp_pla' } });
    expect(r.ok, r.error ?? '').toBe(true);
    const data = await api.loadAll();
    const st = data.structures.find((s) => s.variant === 'beehives')!;
    expect(st).toMatchObject({ x: 360, y: 180, status: 'planned' });
    expect(structureIcon(st)).toBe('🐝');
    expect(structureLabel(st)).toBe('Ruches');
    expect(parcelChoices(data, 'camp_pla')!.free).toBe(false);
    const step = nextStepFor(st, data);
    expect(step.text).toMatch(/Lancer le chantier/);
    expect(step.actionCode).toBe('renovate_building');
    expect(buildingsOverview(data, 'winter')).toMatchObject({ openProjects: 1, freeParcels: C.PARCELS.length - 1 });
  });

  it('chaque bâtiment a icône, libellé, toit de calque et étape « en service »', async () => {
    const data = await (await demo()).loadAll();
    const base = data.structures.find((s) => s.code === 'casa_gran')!;
    for (const type of C.BUILDING_TYPES) {
      const st: Structure = { ...base, id: `x-${type.id}`, code: `nb_${type.id}`, variant: type.id, beds_capacity: 0, status: 'operational' };
      expect(structureIcon(st)).toBe(type.icon);
      expect(structureLabel(st)).toBe(type.label);
      expect(nextStepFor(st, data).text).toContain(type.effect);
      expect(inLayer(st, 'housing', new Set())).toBe(false);
    }
  });

  it('bâtiments en service : rations par nuit dans les Réserves, priorité « bâtir » sinon', async () => {
    const api = await demo();
    const data = await api.loadAll();
    const plan = priorityPlan(data, api.now());
    const item = plan.items.find((i) => i.key === 'build:plan');
    if (data.village.treasury_eur >= 1500) expect(item?.actionCode).toBe('plan_building');
    const base = data.structures.find((s) => s.code === 'casa_gran')!;
    const built = { ...data, structures: [...data.structures, { ...base, id: 'x-hen', code: 'nb_henhouse', variant: 'henhouse', beds_capacity: 0, status: 'operational' as const }] };
    const food = reserveReport(built, api.now()).find((l) => l.key === 'food')!;
    expect(food.daily.join(' ')).toMatch(/Nouveaux bâtiments.*\+3 par nuit/);
  });

  it('action classée, et grisée quand deux projets sont déjà ouverts', async () => {
    const api = await demo();
    await api.action({ action_code: 'plan_building', params: { variant: 'henhouse', parcel: 'era_baixa' } });
    await api.action({ action_code: 'plan_building', params: { variant: 'beehives', parcel: 'coll' } });
    const data = await api.loadAll();
    const reason = actionBlockReason(getAction('plan_building')!, situationFor(data, null, api.now()));
    expect(reason).toMatch(/Deux nouveaux bâtiments/);
  });
});
