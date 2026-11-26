import { describe, expect, it } from 'vitest';
import { npcTargetTaps, sanitizeTaps, scoreTargetTrial, targetSequence, targetWinner } from '../src/engine/index.ts';

const DUEL = '40000000-0000-4000-8000-000000000001';

describe('Épreuve de la cible (V4.0)', () => {
  it('séquence déterministe de 5 cibles, identique pour les deux joueurs', () => {
    const a = targetSequence(DUEL);
    expect(a).toHaveLength(5);
    expect(targetSequence(DUEL)).toEqual(a);
    expect(targetSequence('autre-duel')).not.toEqual(a);
    for (const t of a) {
      expect(t.x).toBeGreaterThan(0.1);
      expect(t.x).toBeLessThan(0.9);
      expect(t.delay_ms).toBeGreaterThanOrEqual(800);
      expect(t.delay_ms).toBeLessThanOrEqual(2500);
    }
  });

  it('tap parfait et rapide : 100 points par cible', () => {
    const taps = targetSequence(DUEL).map((t) => ({ index: t.index, x: t.x, y: t.y, reaction_ms: 200 }));
    expect(scoreTargetTrial(DUEL, taps).total).toBe(500);
  });

  it('précision et rapidité comptent chacune pour moitié', () => {
    const t = targetSequence(DUEL)[0]!;
    const score = scoreTargetTrial(DUEL, [{ index: 0, x: t.x + 0.15, y: t.y, reaction_ms: 1100 }]);
    expect(score.lines[0]).toMatchObject({ distance_points: 50, speed_points: 50, points: 50 });
  });

  it('faux départ, cible manquée ou trop tardive : 0 point', () => {
    const [t0, t1] = targetSequence(DUEL);
    const score = scoreTargetTrial(DUEL, [
      { index: 0, x: t0!.x, y: t0!.y, reaction_ms: 80 },
      { index: 1, x: t1!.x, y: t1!.y, reaction_ms: 3500 },
    ]);
    expect(score.lines.map((l) => l.foul)).toEqual(['false_start', 'too_late', 'missing', 'missing', 'missing']);
    expect(score.total).toBe(0);
  });

  it('refuse les résultats malformés ou dupliqués', () => {
    expect(sanitizeTaps([{ index: 0, x: 0.5, y: 0.5, reaction_ms: 300 }, { index: 0, x: 0.5, y: 0.5, reaction_ms: 300 }])).toBeNull();
    expect(sanitizeTaps([{ index: 7, x: 0.5, y: 0.5, reaction_ms: 300 }])).toBeNull();
    expect(sanitizeTaps('triche')).toBeNull();
    expect(sanitizeTaps([])).toEqual([]);
  });

  it('PNJ (meneur de putsch) : score plausible et déterministe', () => {
    const score = scoreTargetTrial(DUEL, npcTargetTaps(DUEL)).total;
    expect(score).toBeGreaterThan(200);
    expect(score).toBeLessThan(500);
    expect(scoreTargetTrial(DUEL, npcTargetTaps(DUEL)).total).toBe(score);
  });

  it('égalité au profit du statu quo', () => {
    expect(targetWinner(300, 300, 'b')).toBe('b');
    expect(targetWinner(301, 300, 'b')).toBe('a');
  });
});
