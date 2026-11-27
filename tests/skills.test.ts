/** Niveaux de métier, mission du jour & bonus d'action à deux (V5.2). */
import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  constants as C,
  dailyMission,
  duoGroupOf,
  lifeOf,
  missionDone,
  performAction,
  skillLevel,
  skillProgress,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const THURSDAY = new Date('2026-11-26T10:00:00Z');
const SUNDAY = new Date('2026-11-29T10:00:00Z');
const ELY = playerId(1);
const JULIO = playerId(5);

function player(s: GameSnapshot, id: string) {
  return s.players.find((p) => p.id === id)!;
}

describe('Niveaux de métier', () => {
  it('seuils 150 / 400 / 800 XP, bonus +10 / +20 / +30 %', () => {
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(149)).toBe(1);
    expect(skillLevel(150)).toBe(2);
    expect(skillLevel(400)).toBe(3);
    expect(skillLevel(5000)).toBe(4);
    expect(skillProgress(275)).toMatchObject({ level: 2, floor: 150, next: 400, pct: 50, bonus: 0.1 });
    expect(skillProgress(900)).toMatchObject({ level: 4, next: null, pct: 100, bonus: 0.3 });
  });

  it('le niveau augmente le rendement dans son métier ; niveau 4 de Julio : fournée double', () => {
    const tools = (xp: number) => {
      const s = seedSnapshot({ iron_stock: 30, tools_stock: 0 });
      player(s, JULIO).skill_xp = xp;
      const out = performAction(s, { action_code: 'forge_tools', actor_id: JULIO }, WEDNESDAY);
      expect(out.ok).toBe(true);
      return out.snapshot.village.tools_stock;
    };
    expect(tools(900)).toBeGreaterThanOrEqual(2 * tools(0));
  });

  it('un passage de niveau est annoncé', () => {
    const s = seedSnapshot();
    player(s, ELY).skill_xp = 145;
    const out = performAction(s, { action_code: 'spanish_lesson', actor_id: ELY }, WEDNESDAY);
    expect(out.ok).toBe(true);
    expect(out.events.some((e) => e.event_type === 'skill_level_up')).toBe(true);
  });
});

describe('Mission du jour', () => {
  it('tirage stable dans le métier du joueur, qui change selon le jour', () => {
    const s = seedSnapshot();
    for (const p of s.players.filter((x) => x.is_active_slot)) {
      const m = dailyMission(s, p, WEDNESDAY);
      expect(m).not.toBeNull();
      expect(dailyMission(s, p, WEDNESDAY)?.code).toBe(m!.code);
      expect([...C.MISSION_POOLS[p.role_code], ...C.MISSION_FALLBACK]).toContain(m!.code);
    }
    const days = new Set(Array.from({ length: 10 }, (_, i) => dailyMission(s, player(s, JULIO), new Date(WEDNESDAY.getTime() + i * 86_400_000))?.code));
    expect(days.size).toBeGreaterThan(1);
  });

  it('jamais une mission impossible faute de moyens (cheptel vide, pas de fer)', () => {
    const s = seedSnapshot({ livestock_count: 0, iron_stock: 0, scrap_stock: 0 });
    for (let i = 0; i < 20; i++) {
      const d = new Date(WEDNESDAY.getTime() + i * 86_400_000);
      expect(dailyMission(s, player(s, ELY), d)?.code).not.toBe('livestock_care');
      expect(['forge_tools', 'recycle_scrap']).not.toContain(dailyMission(s, player(s, JULIO), d)?.code);
    }
  });

  it('jamais la messe en semaine', () => {
    const s = seedSnapshot();
    const brunel = player(s, playerId(7));
    for (let i = 0; i < 6; i++) {
      expect(dailyMission(s, brunel, new Date(WEDNESDAY.getTime() + (i % 4) * 86_400_000))?.code).not.toBe('sunday_mass');
    }
    expect(dailyMission(s, brunel, SUNDAY)).not.toBeNull();
  });

  it('chaque mission tirée existe dans le catalogue des actions', () => {
    const codes = new Set(ACTIONS.map((a) => a.code));
    for (const pool of Object.values(C.MISSION_POOLS)) for (const c of pool) expect(codes.has(c)).toBe(true);
    for (const c of C.MISSION_FALLBACK) expect(codes.has(c)).toBe(true);
    for (const g of C.DUO_GROUPS) for (const c of g.codes) expect(codes.has(c)).toBe(true);
  });

  it('faite : +20 XP et moral +1, une seule fois par jour', () => {
    const s = seedSnapshot({ iron_stock: 50, scrap_stock: 50, medicine_stock: 20, treasury_eur: 5000 });
    // Trouver un jour où la mission de Julio est une action simple de la forge ou de la pêche
    let day = WEDNESDAY;
    for (let i = 0; i < 30; i++) {
      const d = new Date(WEDNESDAY.getTime() + i * 86_400_000);
      const code = dailyMission(s, player(s, JULIO), d)?.code;
      if (code === 'forge_tools' || code === 'recycle_scrap') {
        day = d;
        break;
      }
    }
    const code = dailyMission(s, player(s, JULIO), day)!.code;
    const morale = s.village.morale_pct;
    const first = performAction(s, { action_code: code, actor_id: JULIO }, day);
    expect(first.ok).toBe(true);
    expect(first.narrative).toContain('Mission du jour accomplie');
    expect(player(first.snapshot, JULIO).skill_xp).toBe(10 + C.MISSION_XP_REWARD);
    expect(first.snapshot.village.morale_pct).toBeCloseTo(morale + C.MISSION_MORALE_REWARD, 1);
    expect(missionDone(first.snapshot.village, JULIO, day)).toBe(true);
    const second = performAction(first.snapshot, { action_code: code, actor_id: JULIO }, new Date(day.getTime() + 3_600_000));
    expect(second.narrative).not.toContain('Mission du jour');
    expect(player(second.snapshot, JULIO).skill_xp).toBe(20 + C.MISSION_XP_REWARD);
  });
});

describe('Bonus d\'action à deux', () => {
  it('les groupes relient Tanguy & Brunel (soins) et Ely & Julio (négociation)', () => {
    expect(duoGroupOf('withdrawal_cure')?.id).toBe('care');
    expect(duoGroupOf('therapy')?.id).toBe('care');
    expect(duoGroupOf('negotiate_spain_andorra')?.id).toBe(duoGroupOf('diplomacy_ayuntamiento')?.id);
    expect(duoGroupOf('rest')).toBeUndefined();
  });

  it('deux joueurs, même groupe, même jour : bonus, XP pour les deux, annonce unique', () => {
    const s0 = seedSnapshot({ treasury_eur: 5000 });
    const a = performAction(s0, { action_code: 'negotiate_spain_andorra', actor_id: ELY }, WEDNESDAY);
    expect(a.ok).toBe(true);
    expect(a.narrative).not.toContain('Binôme');
    const elyXp = player(a.snapshot, ELY).skill_xp;
    const b = performAction(a.snapshot, { action_code: 'diplomacy_ayuntamiento', actor_id: JULIO }, new Date(WEDNESDAY.getTime() + 60_000));
    expect(b.ok).toBe(true);
    expect(b.narrative).toContain('Binôme avec Ely');
    expect(b.events.filter((e) => e.event_type === 'duo_bonus')).toHaveLength(1);
    expect(player(b.snapshot, ELY).skill_xp).toBe(elyXp + C.DUO_XP);
    expect(player(b.snapshot, JULIO).skill_xp).toBeGreaterThanOrEqual(10 + C.DUO_XP);
    // Ely refait une négociation : binôme encore, mais plus d'annonce
    const c = performAction(b.snapshot, { action_code: 'negotiate_spain_andorra', actor_id: ELY }, new Date(WEDNESDAY.getTime() + 120_000));
    expect(c.narrative).toContain('Binôme avec Julio');
    expect(c.events.some((e) => e.event_type === 'duo_bonus')).toBe(false);
    // Le lendemain, le journal repart de zéro
    const d = performAction(c.snapshot, { action_code: 'diplomacy_ayuntamiento', actor_id: JULIO }, THURSDAY);
    expect(d.narrative).not.toContain('Binôme');
    expect(lifeOf(d.snapshot.village).duo_day?.acts).toHaveLength(1);
  });

  it('cure de sevrage à deux : addiction −25 au lieu de −20', () => {
    const s0 = seedSnapshot({ medicine_stock: 10 });
    const target = playerId(3);
    player(s0, target).addiction_level_pct = 60;
    const solo = performAction(s0, { action_code: 'withdrawal_cure', actor_id: playerId(6), target_player_id: target }, WEDNESDAY);
    expect(player(solo.snapshot, target).addiction_level_pct).toBe(40);
    const duo = performAction(solo.snapshot, { action_code: 'withdrawal_cure', actor_id: playerId(7), target_player_id: target }, new Date(WEDNESDAY.getTime() + 60_000));
    expect(duo.ok).toBe(true);
    expect(player(duo.snapshot, target).addiction_level_pct).toBe(15);
  });
});
