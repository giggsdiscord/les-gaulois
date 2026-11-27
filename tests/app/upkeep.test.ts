/** Niveaux & usure vus par l'interface (V5.5) : fiche ouvrage, étape suivante, priorité, réserves. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameData, Structure } from '../../src/app/api/types.ts';
import { categoryOf } from '../../src/app/lib/actionCategories.ts';
import { STRUCTURE_ACTION_KINDS } from '../../src/app/lib/game.ts';
import { nextStepFor } from '../../src/app/lib/mapView.ts';
import { priorityPlan } from '../../src/app/lib/priorities.ts';
import { reserveReport } from '../../src/app/lib/reserves.ts';
import { upkeepView, wearText } from '../../src/app/lib/upkeep.ts';
import { DemoApi } from '../../src/app/api/demo.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import { constants as C } from '../../src/engine/index.ts';

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

const NOW = new Date('2026-11-26T10:00:00Z');

async function demoData(): Promise<GameData> {
  const api = new DemoApi();
  api.setToken(await api.login(demoPlayerId(3), '0000'));
  return api.loadAll();
}

describe('Entretien & niveaux dans l\'interface', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  it('fiche : usure en clair et prochain niveau de la Casa Gran', async () => {
    const data = await demoData();
    const casa = data.structures.find((s) => s.code === 'casa_gran')! as Structure;
    const u = upkeepView({ ...casa, condition_pct: 80 }, data.village, NOW)!;
    expect(u).toMatchObject({ level: 1, maxLevel: C.UPGRADE_MAX_LEVEL, upgradable: true, worn: false });
    expect(u.next?.level).toBe(2);
    expect(u.gains[0]).toBe('+2 lits');
    expect(wearText(u)).toMatch(/par nuit · endommagée dans ~\d+ nuits/);
    expect(upkeepView(data.structures.find((s) => s.kind === 'river')!, data.village, NOW)).toBeNull();
  });

  it('étape suivante : entretenir une bâtisse usée, sinon l\'améliorer', async () => {
    const data = await demoData();
    const casa = data.structures.find((s) => s.code === 'casa_gran')!;
    expect(nextStepFor({ ...casa, status: 'operational', condition_pct: 40 }, data).actionCode).toBe('maintain_building');
    expect(nextStepFor({ ...casa, status: 'operational', condition_pct: 80 }, data).actionCode).toBe('upgrade_building');
  });

  it('priorité « Entretenir » et réserves de pierre et de fer', async () => {
    const data = await demoData();
    const casa = data.structures.find((s) => s.code === 'casa_gran')!;
    casa.status = 'operational';
    casa.condition_pct = 35;
    const item = priorityPlan(data, NOW).items.find((i) => i.key === `maintain:${casa.id}`);
    expect(item).toBeDefined();
    expect(item!.urgent).toBe(true);
    expect(item!.short.length).toBeLessThanOrEqual(70);
    const stone = reserveReport(data, NOW).find((l) => l.key === 'stone')!;
    expect(stone.daily.join(' ')).toMatch(/À entretenir : Casa Gran \(35 %\)/);
    expect(stone.uses.join(' ')).toMatch(/Entretenir une bâtisse/);
  });

  it('nouvelles actions classées et ciblant les bâtisses', () => {
    expect(categoryOf('maintain_building')?.id).toBe(categoryOf('renovate_building')?.id);
    expect(categoryOf('upgrade_building')).toBeDefined();
    expect(STRUCTURE_ACTION_KINDS.upgrade_building).toEqual(['building', 'gite']);
  });
});
