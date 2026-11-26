import { describe, expect, it } from 'vitest';
import { applyElapsedTime, midnightsBetween, nextAgoraSession, weekdayOfKey, dayKey } from '../src/engine/index.ts';
import { START, seedSnapshot } from './fixtures.ts';

describe('Calendrier (Europe/Madrid)', () => {
  it('compte les minuits locaux franchis', () => {
    expect(midnightsBetween(new Date(START), new Date('2026-11-23T22:00:00Z'))).toBe(0); // 23:00 à Madrid
    expect(midnightsBetween(new Date(START), new Date('2026-11-23T23:30:00Z'))).toBe(1); // 00:30 le 24
    expect(midnightsBetween(new Date(START), new Date('2026-11-30T09:00:00Z'))).toBe(7);
  });

  it('gère le passage à l\'heure d\'été', () => {
    expect(midnightsBetween(new Date('2026-03-28T12:00:00Z'), new Date('2026-03-30T12:00:00Z'))).toBe(2);
  });

  it('prochaine Agora : dimanche 11:00 heure de Madrid', () => {
    const session = nextAgoraSession(new Date(START));
    expect(session.toISOString()).toBe('2026-11-29T10:00:00.000Z');
    expect(weekdayOfKey(dayKey(session))).toBe(7);
  });
});

describe('applyElapsedTime()', () => {
  it('ne fait rien sans minuit franchi, hormis le recalcul des grandeurs dérivées', () => {
    const s = seedSnapshot();
    const r = applyElapsedTime(s, new Date('2026-11-23T15:00:00Z'));
    expect(r.daysProcessed).toBe(0);
    expect(r.snapshot.village.game_day).toBe(0);
    expect(r.snapshot.village.productivity_modifier_pct).toBe(75);
    expect(r.snapshot.village.last_tick_at).toBe('2026-11-23T15:00:00.000Z');
  });

  it('régénère 3 PA la nuit pour un joueur en bonne santé', () => {
    const s = seedSnapshot();
    s.players[0]!.action_points = 0;
    const r = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    expect(r.daysProcessed).toBe(1);
    expect(r.snapshot.players[0]!.action_points).toBe(3);
  });

  it('PA réduits à 1 en cas de blessure active ou de santé < 60 %', () => {
    const s = seedSnapshot();
    s.players[1]!.injury_type = 'muscular';
    s.players[2]!.health_pct = 50;
    const r = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    expect(r.snapshot.players[1]!.action_points).toBe(1);
    expect(r.snapshot.players[2]!.action_points).toBe(1);
  });

  it('manque (addiction > 50 %) : −10 % de santé mentale et −1 PA', () => {
    const s = seedSnapshot();
    s.players[3]!.addiction_level_pct = 70;
    const r = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    const p = r.snapshot.players[3]!;
    expect(p.mental_health_pct).toBe(80 + 1 - 10); // moral 75 → +1, manque −10
    expect(p.action_points).toBe(0); // PA réduits à 1 puis −1
  });

  it('lendemain de tentation : −2 PA', () => {
    const s = seedSnapshot();
    s.players[4]!.pending_ap_penalty = 2;
    const r = applyElapsedTime(s, new Date('2026-11-24T08:00:00Z'));
    expect(r.snapshot.players[4]!.action_points).toBe(1);
    expect(r.snapshot.players[4]!.pending_ap_penalty).toBe(0);
  });

  it('une semaine complète clôt la saison : saison 2, jetons de veto rechargés', () => {
    const s = seedSnapshot();
    s.players[0]!.veto_tokens = 0;
    const r = applyElapsedTime(s, new Date('2026-11-30T09:00:00Z'));
    expect(r.daysProcessed).toBe(7);
    expect(r.seasonsProcessed).toBe(1);
    expect(r.snapshot.village.season_number).toBe(2);
    expect(r.snapshot.village.game_day).toBe(7);
    expect(r.snapshot.players[0]!.veto_tokens).toBe(1);
    expect(r.snapshot.players[3]!.veto_tokens).toBe(0);
    expect(r.events.some((e) => e.event_type === 'season_report')).toBe(true);
  });

  it('paie l\'échéance hebdomadaire de l\'emprunt foncier', () => {
    const r = applyElapsedTime(seedSnapshot(), new Date('2026-11-30T09:00:00Z'));
    expect(r.snapshot.village.land_debt_eur).toBeLessThan(295000);
    expect(r.ledger.some((l) => l.category === 'loan')).toBe(true);
  });

  it('est strictement déterministe', () => {
    const now = new Date('2026-12-20T09:00:00Z');
    const a = applyElapsedTime(seedSnapshot(), now);
    const b = applyElapsedTime(seedSnapshot(), now);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('ne modifie jamais l\'instantané reçu', () => {
    const s = seedSnapshot();
    const before = JSON.stringify(s);
    applyElapsedTime(s, new Date('2026-12-05T09:00:00Z'));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('plafonne le rattrapage à 120 jours', () => {
    const r = applyElapsedTime(seedSnapshot(), new Date('2027-06-15T09:00:00Z'));
    expect(r.skippedDays).toBeGreaterThan(0);
    expect(r.daysProcessed + r.skippedDays).toBeLessThanOrEqual(204);
  });

  it('effondrement soviétique après 2 saisons au-delà de 75 % à gauche', () => {
    const s = seedSnapshot({ left_wing_ideology_pct: 95, high_left_seasons: 1, collectivization_active: true });
    const r = applyElapsedTime(s, new Date('2026-11-30T09:00:00Z'));
    expect(r.snapshot.village.is_defeated).toBe(true);
    expect(r.snapshot.village.defeat_reason).toBe('soviet_collapse');
  });

  it('extinction démographique après 2 saisons à 0 % de pérennité', () => {
    const s = seedSnapshot({ demographic_viability_pct: 0, low_viability_seasons: 1, homosexuality_rate_pct: 60 });
    const r = applyElapsedTime(s, new Date('2026-11-30T09:00:00Z'));
    expect(r.snapshot.village.defeat_reason).toBe('demographic_extinction');
  });
});
