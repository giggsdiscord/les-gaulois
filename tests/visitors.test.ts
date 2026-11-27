/** Visiteurs imprévus (V5.9) : arrivée la nuit, réponse avant 21 h, conséquence si personne ne répond. */
import { describe, expect, it } from 'vitest';
import {
  applyElapsedTime,
  constants as C,
  createRng,
  lifeOf,
  localParts,
  neighborGauge,
  performAction,
  pickVisitor,
  processVisitors,
  visitorBlocker,
  visitorEffectText,
  type EngineEffects,
  type GameSnapshot,
} from '../src/engine/index.ts';
import { playerId, seedSnapshot } from './fixtures.ts';

const WEDNESDAY = new Date('2026-11-25T10:00:00Z');
const ELY = playerId(1);
const LERME = playerId(2);

function withVisitor(id: string, s: GameSnapshot = seedSnapshot(), due = '2026-11-25T20:00:00Z'): GameSnapshot {
  s.village.life = { ...(s.village.life ?? {}), visitor: { id, day: '2026-11-25', due_at: due } };
  return s;
}
const answer = (s: GameSnapshot, actor: string, choice: unknown, now = WEDNESDAY) =>
  performAction(s, { action_code: 'answer_visitor', actor_id: actor, params: { choice } }, now);
const emptyFx = (): EngineEffects => ({ events: [], ledger: [], screenings: [], approvals: [], triggers: [] }) as unknown as EngineEffects;

describe('Dictionnaire', () => {
  it('4 visiteurs, 2 choix chacun, une conséquence par défaut', () => {
    expect(C.VISITORS.map((d) => d.id)).toEqual(['hiker', 'journalist', 'inspector', 'peddler']);
    for (const d of C.VISITORS) {
      expect(d.choices.length).toBeGreaterThanOrEqual(2);
      expect(d.ignored.result.length).toBeGreaterThan(10);
    }
    expect(visitorEffectText(C.VISITORS[2]!.choices[0]!)).toBe('Mairie +8 · pression administrative −5 %');
  });

  it('tirage déterministe sans répéter le dernier', () => {
    const v = seedSnapshot().village;
    v.life = { visitor_last: { id: 'hiker', choice: 'guide', day: '2026-11-24', by: null } };
    for (let i = 0; i < 20; i++) expect(pickVisitor(v, createRng(`t${i}`))!.id).not.toBe('hiker');
    expect(pickVisitor(v, createRng('x'))!.id).toBe(pickVisitor(v, createRng('x'))!.id);
  });
});

describe('Réponse', () => {
  it('l’inspecteur reçu en règle : mairie +8, pression −5, 1 PA, visite close', () => {
    const s = withVisitor('inspector');
    s.village.admin_pressure_pct = 40;
    const ap = s.players.find((p) => p.id === ELY)!.action_points;
    const out = answer(s, ELY, 'tour');
    expect(out.status).toBe('done');
    const v = out.snapshot.village;
    expect(neighborGauge(v, 'ayuntamiento')).toBe(C.NEIGHBOR_DEFAULT + 8);
    expect(v.admin_pressure_pct).toBe(35);
    expect(out.snapshot.players.find((p) => p.id === ELY)!.action_points).toBe(ap - 1);
    expect(lifeOf(v).visitor).toBeNull();
    expect(lifeOf(v).visitor_last).toMatchObject({ id: 'inspector', choice: 'tour', by: ELY });
    expect(out.events.some((e) => e.title.startsWith('Visiteur : '))).toBe(true);
    // Le second arrive trop tard
    expect(answer(out.snapshot, LERME, 'snack').status).toBe('refused');
  });

  it('vendeur ambulant : coût en caisse, gain en fer et outils, écriture au livre', () => {
    const s = withVisitor('peddler');
    s.village.treasury_eur = 100;
    const iron = s.village.iron_stock;
    const out = answer(s, LERME, 'buy');
    expect(out.status).toBe('done');
    expect(out.snapshot.village.treasury_eur).toBe(60);
    expect(out.snapshot.village.iron_stock).toBe(iron + 5);
    expect(out.ledger.some((l) => l.amount_eur === -40 && l.category === 'visitors')).toBe(true);
  });

  it('refus : sans visiteur, choix inconnu, ressources manquantes, après 21 h', () => {
    expect(answer(seedSnapshot(), ELY, 'tour').status).toBe('refused');
    expect(answer(withVisitor('hiker'), ELY, 'dance').status).toBe('refused');
    const poor = withVisitor('peddler');
    poor.village.tomatoes_stock = 2;
    expect(visitorBlocker(poor.village, WEDNESDAY, 'sell')).toMatch(/tomates/);
    expect(answer(withVisitor('hiker'), ELY, 'guide', new Date('2026-11-25T21:30:00Z')).status).toBe('refused');
  });
});

describe('Nuit', () => {
  it('visite ignorée : conséquence appliquée, pause d’une nuit', () => {
    const s = withVisitor('hiker');
    s.village.last_tick_at = WEDNESDAY.toISOString();
    const out = applyElapsedTime(s, new Date('2026-11-26T08:00:00Z'));
    const v = out.snapshot.village;
    expect(lifeOf(v).visitor_last).toMatchObject({ id: 'hiker', choice: 'ignored' });
    expect(lifeOf(v).visitor).toBeNull();
    expect(neighborGauge(v, 'mossos')).toBeLessThan(C.NEIGHBOR_DEFAULT);
    expect(lifeOf(v).visitor_next_day).toBe('2026-11-27');
    expect(out.events.some((e) => e.title === 'Visiteur : un randonneur perdu, sans réponse')).toBe(true);
  });

  it('un visiteur arrive certaines nuits, avec une échéance à 21 h locales', () => {
    let arrivals = 0;
    for (let d = 1; d <= 30; d++) {
      const s = seedSnapshot();
      const fx = emptyFx();
      processVisitors(s, fx, `2026-10-${String(d).padStart(2, '0')}`, createRng(`n${d}`));
      const visit = lifeOf(s.village).visitor;
      if (visit) {
        arrivals++;
        expect(localParts(new Date(visit.due_at)).hour).toBe(C.VISITOR_DUE_HOUR);
      }
    }
    expect(arrivals).toBeGreaterThan(3);
    expect(arrivals).toBeLessThan(25);
  });
});
