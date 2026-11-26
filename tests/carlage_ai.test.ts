import { describe, expect, it } from 'vitest';
import {
  applyAiDeltas,
  createRng,
  extractJson,
  newDuelState,
  resolveRound,
  rollCarlageInjuries,
  sanitizeAiResponse,
  type FighterStats,
} from '../src/engine/index.ts';
import { seedSnapshot } from './fixtures.ts';

const STATS: { a: FighterStats; b: FighterStats } = { a: { strength: 1, impaired: false }, b: { strength: 1, impaired: false } };

describe('Carlage 2×2 [GDD §6.1]', () => {
  it('départ en diagonale avec 100 points d\'équilibre', () => {
    const d = newDuelState();
    expect([d.a_pos, d.b_pos, d.a_balance, d.b_balance]).toEqual(['TL', 'BR', 100, 100]);
  });

  it('poussée contre un adversaire figé : sortie du carré, défaite immédiate', () => {
    const d = resolveRound(newDuelState(), { move: 'push' }, { move: null }, STATS, createRng('x'));
    expect(d.finished).toBe(true);
    expect(d.winner_side).toBe('a');
    expect(d.shocks.b).toBe(true);
  });

  it('pivot : la poussée adverse part dans le vide (−30)', () => {
    const d = resolveRound(newDuelState(), { move: 'push' }, { move: 'pivot', pivotTarget: 'TR' }, STATS, createRng('x'));
    expect(d.a_balance).toBe(70);
    expect(d.b_balance).toBe(95);
    expect(d.b_pos).toBe('TR');
    expect(d.finished).toBe(false);
  });

  it('ancrage : recul divisé par deux et contre-poussée', () => {
    const d = resolveRound(newDuelState(), { move: 'push' }, { move: 'anchor' }, STATS, createRng('x'));
    expect(d.b_balance).toBe(85);
    expect(d.a_balance).toBe(80);
  });

  it('pivot vers un carreau non adjacent : coup perdu', () => {
    const d = resolveRound(newDuelState(), { move: 'pivot', pivotTarget: 'BR' }, { move: 'anchor' }, STATS, createRng('x'));
    expect(d.log[0]!.a_move).toBe('none');
    expect(d.a_pos).toBe('TL');
  });

  it('5 manches sans vainqueur : égalité tranchée en faveur du statu quo', () => {
    let d = newDuelState('b');
    for (let i = 0; i < 5; i++) d = resolveRound(d, { move: 'anchor' }, { move: 'anchor' }, STATS, createRng(`r${i}`));
    expect(d.finished).toBe(true);
    expect(d.winner_side).toBe('b');
  });

  it('coup d\'épaule : une issue décisive (glissade 35 % ou double projection)', () => {
    const d = resolveRound(newDuelState(), { move: 'shoulder' }, { move: 'anchor' }, STATS, createRng('epaule'));
    const slipped = d.log[0]!.a_slip;
    if (slipped) expect(d.a_balance).toBe(70);
    else expect(d.winner_side).toBe('a');
  });

  it('blessures post-duel : seulement après choc ou glissade', () => {
    const d = resolveRound(newDuelState(), { move: 'push' }, { move: null }, STATS, createRng('x'));
    const injuries = rollCarlageInjuries(d, { a: STATS.a, b: { strength: 1, impaired: true } }, createRng('inj'));
    expect(injuries).toHaveLength(1);
    expect(injuries[0]!.side).toBe('b');
    expect(injuries[0]!.risk_pct).toBe(65);
  });
});

describe('Bornage des réponses IA [GDD §7.2]', () => {
  it('extrait le JSON même entouré de Markdown', () => {
    expect(extractJson('Voici :\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('pas de json')).toBeNull();
  });

  it('ignore les clés inconnues et plafonne chaque delta', () => {
    const r = sanitizeAiResponse(
      JSON.stringify({ gazette_headline: 'Titre', narrative_text: 'Récit', deltas: { morale_pct: 50, treasury_eur: -10000, iron_stock: 99 } }),
      'free_action',
    );
    expect(r.ok).toBe(true);
    expect(r.deltas).toEqual({ morale_pct: 12, treasury_eur: -3000 });
    expect(r.warnings.some((w) => w.includes('iron_stock'))).toBe(true);
  });

  it('les initiatives adoptées à l\'Agora ont un plafond doublé', () => {
    const r = sanitizeAiResponse({ deltas: { morale_pct: 50 } }, 'initiative');
    expect(r.deltas.morale_pct).toBe(24);
  });

  it('réponse illisible : fallback requis', () => {
    expect(sanitizeAiResponse('erreur 500', 'free_action').ok).toBe(false);
  });

  it('fonds souverain abondé depuis la caisse (pas de création monétaire)', () => {
    const out = applyAiDeltas(seedSnapshot(), { sovereign_fund_eur: 5000 }, 'Fonds norvégien', new Date('2026-11-29T12:00:00Z'));
    expect(out.snapshot.village.sovereign_fund_eur).toBe(5000);
    expect(out.snapshot.village.treasury_eur).toBe(45000);
  });

  it('la caisse ne devient jamais négative', () => {
    const out = applyAiDeltas(seedSnapshot({ treasury_eur: 1000 }), { treasury_eur: -3000 }, 'Amende', new Date('2026-11-29T12:00:00Z'));
    expect(out.snapshot.village.treasury_eur).toBe(0);
  });

  it('l\'insécurité passe par la part événementielle amortie', () => {
    const out = applyAiDeltas(seedSnapshot(), { insecurity_pct: 10 }, 'Rixe', new Date('2026-11-29T12:00:00Z'));
    expect(out.snapshot.village.insecurity_offset).toBe(10);
    expect(out.snapshot.village.insecurity_pct).toBe(15);
  });

  it('valide les dossiers migrants générés', () => {
    const r = sanitizeAiResponse(
      {
        deltas: {},
        new_migrant_candidate: {
          full_name: 'Sergio Martínez',
          age: 41,
          origin: 'Amérique latine (Colombie)',
          religion: 'Catholique',
          political_leaning: 'Gauche syndicale',
          physical_strength: 120,
          specialty: 'Mécanicien diesel',
          specialty_level: 4,
          children_count: 2,
          value_proposition: 'Remet en route n\'importe quel tracteur.',
        },
      },
      'world_event',
    );
    expect(r.new_migrant_candidate).toMatchObject({
      political_leaning: 'Gauche sociale',
      specialty_code: 'mechanic',
      physical_strength: 100,
      spanish_speaker: true,
      left_wing_score: 65,
    });
  });
});
