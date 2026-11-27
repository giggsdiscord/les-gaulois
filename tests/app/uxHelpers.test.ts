/** Ergonomie téléphone (V4.4) : menu d'actions par type, raisons de blocage, « À faire », fil des événements. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, getAction, type ActionDef } from '../../src/app/engine.ts';
import { DemoApi } from '../../src/app/api/demo.ts';
import { demoPlayerId } from '../../src/app/demo/seed.ts';
import type { GameEventRow, UnreadCounts } from '../../src/app/api/types.ts';
import { ACTION_CATEGORIES, FREE_ACTION_CODE, categoryOf, groupByCategory } from '../../src/app/lib/actionCategories.ts';
import { actionBlockReason, actionLabel, fold, lockNotes, matchesQuery, pushRecent, situationFor, type ActionSituation } from '../../src/app/lib/actionHints.ts';
import { DUEL_EVENT_TYPES, isMajorEvent, splitPublicEvents } from '../../src/app/lib/events.ts';
import { availableActions } from '../../src/app/lib/game.ts';
import { agoraTabOf, todoItems } from '../../src/app/lib/todo.ts';

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

const THURSDAY = new Date('2026-11-26T10:00:00Z');
const SUNDAY = new Date('2026-11-29T10:00:00Z');
const def = (code: string) => getAction(code) as ActionDef;
const situation = (over: Partial<ActionSituation> = {}, holder: Partial<ActionSituation['holder']> = {}): ActionSituation => ({
  holder: { id: 'p1', display_name: 'Ely', action_points: 3, status: 'active', role_code: 'mayor_agri', ...holder },
  actorBlocked: null,
  viaDelegation: false,
  defeated: false,
  now: THURSDAY,
  ...over,
});

describe('Menu des actions par type', () => {
  it('classe chaque action du moteur (hors Action libre) dans une seule catégorie', () => {
    for (const a of ACTIONS) {
      if (a.code === FREE_ACTION_CODE) continue;
      const owners = ACTION_CATEGORIES.filter((c) => c.codes.includes(a.code));
      expect(owners.map((c) => c.id), a.code).toHaveLength(1);
    }
    const known = new Set(ACTIONS.map((a) => a.code));
    for (const c of ACTION_CATEGORIES) for (const code of c.codes) expect(known.has(code), code).toBe(true);
    expect(categoryOf('garden_tend')?.id).toBe('vivres');
  });

  it('met en tête les catégories du métier du joueur et retire les vides', () => {
    const lerme = { role_code: 'treasurer_physio', ministerial_portfolios: [] as string[] };
    const groups = groupByCategory(availableActions(lerme as never, 1));
    expect(groups[0]!.category.id).toBe('argent');
    expect(groups.some((g) => g.category.id === 'ordre')).toBe(false); // aucune action de sécurité en Acte I
    expect(groups.every((g) => g.actions.length > 0)).toBe(true);
    const total = groups.reduce((n, g) => n + g.actions.length, 0);
    expect(total).toBe(availableActions(lerme as never, 1).filter((a) => a.code !== FREE_ACTION_CODE).length);
  });
});

describe('Raisons de blocage et verrous', () => {
  it('filières (V5.6) : fromage sans troupeau, ratafia sans prunes', () => {
    const supply = { livestock: 0, rations: 100, plums: 0 };
    expect(actionBlockReason(def('make_cheese'), situation({ supply }))).toMatch(/bêtes/);
    expect(actionBlockReason(def('make_cheese'), situation({ supply: { ...supply, livestock: 3, rations: 1 } }))).toMatch(/rations/);
    expect(actionBlockReason(def('make_cheese'), situation({ supply: { ...supply, livestock: 3 } }))).toBeNull();
    expect(actionBlockReason(def('make_ratafia'), situation({ supply }))).toMatch(/prunes/);
    expect(actionBlockReason(def('make_ratafia'), situation({ supply: { ...supply, plums: 12 } }))).toBeNull();
  });

  it('suit l’ordre du moteur', () => {
    expect(actionBlockReason(def('garden_tend'), situation())).toBeNull();
    expect(actionBlockReason(def('garden_tend'), situation({ defeated: true }))).toMatch(/terminée/);
    expect(actionBlockReason(def('garden_tend'), situation({ actorBlocked: 'Vous êtes au cachot.' }))).toMatch(/cachot/);
    expect(actionBlockReason(def('sunday_mass'), situation())).toMatch(/dimanche/);
    expect(actionBlockReason(def('sunday_mass'), situation({ now: SUNDAY }))).toBeNull();
    expect(actionBlockReason(def('garden_tend'), situation({}, { action_points: 0 }))).toMatch(/Plus de PA/);
    expect(actionBlockReason(def('eco_veto'), situation({}, { action_points: 0 }))).toBeNull(); // gratuite
    expect(actionBlockReason(def('eco_veto'), situation({ viaDelegation: true }))).toMatch(/Non délégable/);
    expect(actionBlockReason(def('family_allowance'), situation({}, { status: 'forced_labor' }))).toMatch(/physiques/);
    expect(actionBlockReason(def('garden_tend'), situation({}, { status: 'forced_labor' }))).toBeNull(); // tâche physique
  });

  it('explique les verrous selon le rôle', () => {
    expect(lockNotes(def('renovate_building'), 'water_eng').join(' ')).toMatch(/accord PLU de Tiphaine/);
    expect(lockNotes(def('renovate_building'), 'civil_eng').join(' ')).not.toMatch(/accord PLU/);
    expect(lockNotes(def('buy_supplies'), 'druid').join(' ')).toMatch(/M\. Lerme doit valider/);
    expect(lockNotes(def('buy_supplies'), 'treasurer_physio').join(' ')).toMatch(/vous la validez/);
    expect(lockNotes(def('eco_veto'), 'mayor_agri')).toContain('Gratuite : ne coûte aucun PA.');
  });

  it('situation : délégation et cachot', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const api = new DemoApi();
    api.setToken(await api.login(demoPlayerId(1), '0000'));
    const data = await api.loadAll();
    const self = situationFor(data, null, api.now());
    expect(self.viaDelegation).toBe(false);
    expect(self.holder.id).toBe(data.me.id);
    const other = data.players.find((p) => p.id !== data.me.id)!;
    expect(situationFor(data, other.id, api.now()).viaDelegation).toBe(true);
    const jailed = { ...data, me: { ...data.me, is_detained_until: new Date(api.now().getTime() + 3_600_000).toISOString() } };
    expect(situationFor(jailed, null, api.now()).actorBlocked).toMatch(/cachot/);
  });
});

describe('Recherche et récentes', () => {
  it('cherche sans accents ni casse, tous les mots', () => {
    expect(fold('Déblayer les GRAVATS')).toBe('deblayer les gravats');
    expect(matchesQuery(def('clear_rubble'), 'deblayer')).toBe(true);
    expect(matchesQuery(def('clear_rubble'), 'gravats pierre')).toBe(true);
    expect(matchesQuery(def('clear_rubble'), 'gravats potager')).toBe(false);
    expect(matchesQuery(def('clear_rubble'), '  ')).toBe(true);
  });

  it('garde les 4 dernières actions, sans doublon', () => {
    let list: string[] = [];
    for (const c of ['a', 'b', 'c', 'a', 'd', 'e']) list = pushRecent(list, c);
    expect(list).toEqual(['e', 'd', 'a', 'c']);
    expect(actionLabel('garden_tend')).toBe('Entretenir le potager');
    expect(actionLabel('inconnue')).toBe('inconnue');
  });
});

describe('Liste « À faire » de l’accueil', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
  const zero: UnreadCounts = { village_square: 0, agora_hall: 0, whisper: 0, gazette: 0, votes: 0, approvals: 0, duels: 0, total: 0 };

  it('PA restants, non-lus et candidats, avec l’écran où agir', async () => {
    const api = new DemoApi();
    api.setToken(await api.login(demoPlayerId(2), '0000'));
    const data = await api.loadAll();
    const items = todoItems(data, api.now(), { ...zero, whisper: 2, gazette: 1, agora_hall: 1 });
    const keys = items.map((i) => i.key);
    expect(keys).toContain('ap');
    expect(items.find((i) => i.key === 'whisper')).toMatchObject({ route: 'gazette', param: 'chuchotements', text: '2 chuchotements non lus' });
    expect(items.find((i) => i.key === 'tavern')).toMatchObject({ param: 'agora' });
    expect(keys.indexOf('ap')).toBeLessThan(keys.indexOf('gazette'));
    // Au cachot : ni PA ni vote proposés
    const jailed = { ...data, me: { ...data.me, is_detained_until: new Date(api.now().getTime() + 3_600_000).toISOString() } };
    expect(todoItems(jailed, api.now(), zero).some((i) => i.key === 'ap')).toBe(false);
  });

  it('sous-onglet de l’Agora selon le scrutin', () => {
    expect(agoraTabOf('tribunal')).toBe('tribunal');
    expect(agoraTabOf('migrant_admission')).toBe('immigration');
    expect(agoraTabOf('constitution_article')).toBe('constitution');
    expect(agoraTabOf('prohibition')).toBe('initiatives');
  });
});

describe('Fil des événements : duels à part', () => {
  const ev = (i: number, event_type: string, visibility: GameEventRow['visibility'] = 'public') => ({ id: String(i), event_type, visibility });

  it('sépare les duels des faits de jeu, avant la limite', () => {
    const events = [
      ...Array.from({ length: 40 }, (_, i) => ev(i, i % 2 ? 'carlage_started' : 'carlage_result')),
      ev(100, 'sentence_execution'),
      ev(101, 'action', 'private'),
      ev(102, 'veto_overturned'),
    ];
    const { facts, duels } = splitPublicEvents(events, 30);
    expect(facts.map((e) => e.event_type)).toEqual(['sentence_execution', 'veto_overturned']); // conséquence d'un duel = fait de jeu
    expect(duels).toHaveLength(30);
    expect(duels.every((e) => DUEL_EVENT_TYPES.includes(e.event_type))).toBe(true);
    expect(isMajorEvent({ event_type: 'sentence_execution' })).toBe(true);
    expect(isMajorEvent({ event_type: 'birth' })).toBe(false);
  });
});
