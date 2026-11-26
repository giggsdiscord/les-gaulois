import { describe, expect, it } from 'vitest';
import {
  applySentence,
  closeProposal,
  createRng,
  emptyEffects,
  executeProposal,
  isReadyForExecution,
  tallyProposal,
  type AgoraProposal,
} from '../src/engine/index.ts';
import { makeMigrant, playerId, seedSnapshot } from './fixtures.ts';

const NOW = new Date('2026-11-29T10:00:00Z');
const ids = (...slots: number[]) => slots.map(playerId);

function proposal(overrides: Partial<AgoraProposal> = {}): AgoraProposal {
  return {
    id: 'p1',
    week_number: 1,
    proposer_id: playerId(2),
    kind: 'initiative',
    title: 'Fonds souverain norvégien',
    detailed_explanation: 'Placer 10 % de la caisse chaque saison dans un fonds intergénérationnel.',
    category: 'economy',
    payload: {},
    target_migrant_id: null,
    target_player_id: null,
    required_majority: 'simple',
    votes_yes: [],
    votes_no: [],
    status: 'open',
    vetoed_by: null,
    closes_at: NOW.toISOString(),
    ai_execution_summary: null,
    executed_at: null,
    closed_at: null,
    ...overrides,
  };
}

describe('Dépouillement [GDD §1.2, §4.5]', () => {
  it('majorité simple', () => {
    const t = tallyProposal(seedSnapshot(), proposal({ votes_yes: ids(1, 2, 3, 4), votes_no: ids(5, 6, 7) }));
    expect(t.passed).toBe(true);
    expect(t.yes).toBe(4);
  });

  it('égalité : voix prépondérante de la Présidente (Ely)', () => {
    const s = seedSnapshot();
    expect(tallyProposal(s, proposal({ votes_yes: ids(1, 2, 3), votes_no: ids(4, 5, 6) })).passed).toBe(true);
    expect(tallyProposal(s, proposal({ votes_yes: ids(2, 3, 4), votes_no: ids(1, 5, 6) })).passed).toBe(false);
  });

  it('exécution publique : majorité qualifiée des deux tiers', () => {
    const s = seedSnapshot();
    expect(tallyProposal(s, proposal({ required_majority: 'two_thirds', votes_yes: ids(1, 2, 3, 4, 5), votes_no: ids(6, 7) })).passed).toBe(true);
    expect(tallyProposal(s, proposal({ required_majority: 'two_thirds', votes_yes: ids(1, 2, 3, 4), votes_no: ids(5, 6, 7) })).passed).toBe(false);
  });

  it('Acte III : les naturalisés votent comme leur protecteur', () => {
    const s = seedSnapshot({ act_number: 3 });
    s.migrants.push(makeMigrant('m1', { is_naturalized: true, patron_player_id: playerId(2) }));
    s.migrants.push(makeMigrant('m2', { is_naturalized: true, patron_player_id: playerId(2) }));
    const t = tallyProposal(s, proposal({ votes_yes: ids(2), votes_no: ids(5, 6) }));
    expect(t.naturalizedYes).toBe(2);
    expect(t.passed).toBe(true);
  });

  it('les votes des bannis ne comptent plus', () => {
    const s = seedSnapshot();
    s.players[4]!.status = 'banished';
    const t = tallyProposal(s, proposal({ votes_yes: ids(1), votes_no: ids(5) }));
    expect(t.no).toBe(0);
  });
});

describe('Clôture & exécution', () => {
  it('candidat refusé : il repart aussitôt', () => {
    const s = seedSnapshot();
    s.migrants.push(makeMigrant('m1', { status: 'candidate' }));
    const fx = emptyEffects();
    const r = closeProposal(s, fx, proposal({ kind: 'migrant_admission', target_migrant_id: 'm1', votes_no: ids(1, 2) }), NOW);
    expect(r.proposal.status).toBe('rejected');
    expect(s.migrants[0]!.status).toBe('rejected');
  });

  it('admission : enfants accueillis (+4 % de pérennité chacun) et idéologie ajustée', () => {
    const s = seedSnapshot();
    s.migrants.push(makeMigrant('m1', { status: 'candidate', children_count: 2, left_wing_score: 90, spanish_speaker: true }));
    const p = proposal({ kind: 'migrant_admission', target_migrant_id: 'm1', status: 'passed', votes_yes: ids(1, 2, 3, 4), closed_at: NOW.toISOString() });
    executeProposal(s, emptyEffects(), createRng('t'), p, NOW);
    expect(s.migrants[0]!.status).toBe('accepted');
    expect(s.children).toHaveLength(2);
    expect(s.village.demographic_viability_pct).toBe(78);
    expect(s.village.left_wing_ideology_pct).toBe(33.13); // 25 + (90 − 25) / 8, jauge arrondie à 2 décimales
    expect(s.village.spanish_fluency_pct).toBe(17);
    expect(s.migrants[0]!.patron_player_id).toBe(playerId(2));
  });

  it('collectivisation : 40 % de l\'épargne s\'évapore vers Andorre', () => {
    const s = seedSnapshot();
    executeProposal(s, emptyEffects(), createRng('t'), proposal({ kind: 'collectivization', status: 'passed' }), NOW);
    expect(s.village.collectivization_active).toBe(true);
    expect(s.village.treasury_eur).toBe(50000 + 7 * 1200);
    expect(s.village.andorra_hidden_capital_eur).toBe(7 * 800);
    expect(s.players[0]!.private_wealth_eur).toBe(0);
  });

  it('initiative libre : transmise à l\'IA, non marquée exécutée', () => {
    const s = seedSnapshot();
    const fx = emptyEffects();
    const r = executeProposal(s, fx, createRng('t'), proposal({ status: 'passed' }), NOW);
    expect(r.needsAi).toBe(true);
    expect(r.proposal.executed_at).toBeNull();
    expect(fx.triggers[0]).toMatchObject({ type: 'needs_ai', reason: 'initiative' });
  });

  it('fenêtre de veto de 6 heures avant exécution', () => {
    const p = proposal({ status: 'passed', closed_at: NOW.toISOString() });
    expect(isReadyForExecution(p, new Date(NOW.getTime() + 3_600_000))).toBe(false);
    expect(isReadyForExecution(p, new Date(NOW.getTime() + 6 * 3_600_000))).toBe(true);
  });
});

describe('Tribunal Public [GDD §4.5]', () => {
  it('exécution : insécurité −35, gauche −20, moral −18, enquête criminelle (+45 %) aux Actes I-II', () => {
    const s = seedSnapshot({ left_wing_ideology_pct: 50 });
    s.migrants.push(makeMigrant('m1'));
    const r = applySentence(s, emptyEffects(), createRng('t'), NOW, { sentence: 'execution', targetMigrantId: 'm1' });
    expect(r.ok).toBe(true);
    expect(s.migrants[0]!.status).toBe('executed');
    expect(s.village.insecurity_offset).toBe(-35);
    expect(s.village.left_wing_ideology_pct).toBe(30);
    expect(s.village.morale_pct).toBe(57);
    expect(s.village.admin_pressure_pct).toBe(65);
    expect(s.village.penance_required).toBe(true);
  });

  it('bannissement : insécurité −10 à −25, gauche −5 à −12', () => {
    const s = seedSnapshot();
    s.migrants.push(makeMigrant('m1', { left_wing_score: 100 }));
    applySentence(s, emptyEffects(), createRng('ban'), NOW, { sentence: 'expulsion', targetMigrantId: 'm1' });
    expect(s.migrants[0]!.status).toBe('expelled');
    expect(s.village.insecurity_offset).toBeLessThanOrEqual(-10);
    expect(s.village.insecurity_offset).toBeGreaterThanOrEqual(-25);
    expect(s.village.left_wing_ideology_pct).toBe(13);
  });
});
