/** Carte interactive du hameau (V4.7) : cadrage, calques, liste, prochaine étape de chaque ouvrage. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAction, type ActionDef } from '../../src/app/engine.ts';
import { DemoApi } from '../../src/app/api/demo.ts';
import type { GameData, Structure } from '../../src/app/api/types.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { availableActions } from '../../src/app/lib/game.ts';
import {
  centerOn,
  clampView,
  fitView,
  groupStructures,
  inLayer,
  KIND_ICON,
  KIND_LABEL,
  LAYERS,
  MAP_H,
  MAP_W,
  MIN_VIEW_W,
  nextStepFor,
  sessionsLeft,
  structurePreset,
  zoomAt,
} from '../../src/app/lib/mapView.ts';

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

async function load(slot: number): Promise<GameData> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(slot), '0000'));
  return api.loadAll();
}

const byCode = (data: GameData, code: string) => data.structures.find((s) => s.code === code)!;
const patch = (s: Structure, p: Partial<Structure>): Structure => ({ ...s, ...p });

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('Cadrage de la carte', () => {
  it('vue d\'ensemble : tout le plan au format paysage, la pleine hauteur en portrait', () => {
    expect(fitView(MAP_H / MAP_W)).toEqual({ x: 0, y: 0, w: 1000 });
    const portrait = fitView(1.6);
    expect(portrait.w).toBeCloseTo(MAP_H / 1.6);
    expect(portrait.y).toBe(0);
    expect(portrait.x).toBeCloseTo((MAP_W - portrait.w) / 2);
  });

  it('zoom autour d\'un point : le point reste au même endroit de l\'écran', () => {
    const v = { x: 100, y: 50, w: 600 };
    const z = zoomAt(v, 2, 400, 300, 0.7);
    expect(z.w).toBe(300);
    // Position relative du point (400, 300) inchangée
    expect((400 - z.x) / z.w).toBeCloseTo((400 - v.x) / v.w);
    expect((300 - z.y) / (z.w * 0.7)).toBeCloseTo((300 - v.y) / (v.w * 0.7));
  });

  it('borne le zoom et les bords du plan', () => {
    expect(zoomAt({ x: 0, y: 0, w: 400 }, 10, 500, 350, 1).w).toBe(MIN_VIEW_W);
    expect(clampView({ x: -200, y: -50, w: 5000 }, 0.7)).toEqual({ x: 0, y: 0, w: 1000 });
    const edge = centerOn(990, 690, 300, 1.5);
    expect(edge.x + edge.w).toBeLessThanOrEqual(MAP_W);
    expect(edge.y + edge.w * 1.5).toBeLessThanOrEqual(MAP_H + 1e-9);
  });
});

describe('Ouvrages : icônes, calques, liste', () => {
  it('chaque ouvrage a une icône et un libellé', async () => {
    const data = await load(2);
    for (const s of data.structures) {
      expect(KIND_ICON[s.kind], s.kind).toBeDefined();
      expect(KIND_LABEL[s.kind], s.kind).toBeDefined();
    }
  });

  it('calques : logements, priorités du moment, raccordements en attente', async () => {
    const data = await load(2);
    const mas = byCode(data, 'mas_era');
    const casa = byCode(data, 'casa_gran');
    const none = new Set<string>();
    expect(inLayer(casa, 'housing', none)).toBe(true);
    expect(inLayer(byCode(data, 'cal_ferrer'), 'housing', none)).toBe(false);
    expect(inLayer(mas, 'todo', none)).toBe(false);
    expect(inLayer(mas, 'todo', new Set([mas.id]))).toBe(true);
    expect(inLayer(patch(casa, { status: 'awaiting_power' }), 'todo', none)).toBe(true);
    expect(inLayer(patch(casa, { status: 'awaiting_power' }), 'energy', none)).toBe(true);
    expect(inLayer(byCode(data, 'conduite_principale'), 'water', none)).toBe(true);
    expect(LAYERS.map((l) => l.id)).toEqual(['all', 'todo', 'housing', 'works', 'energy', 'water']);
  });

  it('la liste range chaque ouvrage une seule fois, les priorités en tête', async () => {
    const data = await load(2);
    const mas = byCode(data, 'mas_era');
    const groups = groupStructures(data.structures, new Set([mas.id]));
    const all = groups.flatMap((g) => g.items.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(data.structures.filter((s) => s.status !== 'demolished').length);
    expect(groups[0]!.id).toBe('attention');
    expect(groups[0]!.items.map((s) => s.id)).toContain(mas.id);
  });
});

describe('Prochaine étape d\'un ouvrage', () => {
  it('suit l\'avancement : ruine → rénover, terminée → raccorder (ou d\'abord le groupe), prête → ouvrir le gîte', async () => {
    const data = await load(2);
    const mas = byCode(data, 'mas_era');
    const ruin = nextStepFor(mas, data);
    expect(ruin.actionCode).toBe('renovate_building');
    expect(ruin.text).toMatch(/séances de 300 €/);
    expect(ruin.text).toMatch(/accord PLU de Tiphaine/);
    expect(ruin.mine).toBe(true);

    const waiting = patch(mas, { status: 'awaiting_power', progress_pct: 100 });
    expect(nextStepFor(waiting, data).actionCode).toBe('install_generator');
    const powered = { ...data, village: { ...data.village, energy_tier: 2 } };
    expect(nextStepFor(waiting, powered).actionCode).toBe('connect_power');
    expect(nextStepFor(patch(mas, { status: 'operational' }), data).actionCode).toBe('open_gite');
  });

  it('dit qui peut agir, et ce qui attend un Acte suivant', async () => {
    const data = await load(2);
    const gen = nextStepFor(byCode(data, 'grup_electrogen'), data);
    expect(gen.actionCode).toBe('install_generator');
    expect(gen.who).toBe('Tiphaine ou Alex');
    expect(gen.mine).toBe(false);
    const solar = nextStepFor(byCode(data, 'camp_solar'), data);
    expect(solar.actionCode).toBeNull();
    expect(solar.text).toMatch(/Acte II/);
  });

  it('donne une étape cohérente pour tous les ouvrages et tous les fondateurs', async () => {
    for (const slot of [1, 2, 3, 4, 5, 6, 7]) {
      const data = await load(slot);
      const mine = new Set(availableActions(data.me, data.village.act_number).map((a) => a.code));
      for (const s of data.structures) {
        const step = nextStepFor(s, data);
        expect(step.text.length, s.code).toBeGreaterThan(10);
        expect(step.text, s.code).not.toMatch(/undefined|NaN/);
        if (step.actionCode) {
          expect(getAction(step.actionCode), s.code).toBeDefined();
          expect(step.mine, `${s.code} / ${slot}`).toBe(mine.has(step.actionCode));
        }
      }
    }
  });

  it('compte les séances restantes selon la productivité', () => {
    expect(sessionsLeft({ progress_pct: 0 }, 100)).toBe(9);
    expect(sessionsLeft({ progress_pct: 0 }, 75)).toBe(12);
    expect(sessionsLeft({ progress_pct: 95 }, 100)).toBe(1);
  });

  it('une action lancée depuis une fiche vise le bon ouvrage', async () => {
    const data = await load(3);
    const mas = byCode(data, 'mas_era');
    const gen = byCode(data, 'grup_electrogen');
    const def = (code: string) => getAction(code) as ActionDef;
    expect(structurePreset(def('renovate_building'), mas, data.structures)).toEqual({ target_structure_id: mas.id });
    expect(structurePreset(def('install_generator'), mas, data.structures)).toEqual({ target_structure_id: gen.id });
    expect(structurePreset(def('open_gite'), mas, data.structures)).toEqual({});
  });
});
