import { describe, expect, it } from 'vitest';
import { decideApproval, emptyEffects, performAction } from '../src/engine/index.ts';
import { playerId, seedSnapshot, structureId } from './fixtures.ts';

const NOW = new Date('2026-11-25T10:00:00Z'); // mercredi
const ELY = playerId(1);
const LERME = playerId(2);
const TIPH = playerId(3);
const ALEX = playerId(4);

describe('performAction — prérogatives & PA', () => {
  it('consomme 1 PA et applique l\'effet', () => {
    const s = seedSnapshot();
    const out = performAction(s, { action_code: 'spanish_lesson', actor_id: ALEX }, NOW);
    expect(out.status).toBe('done');
    expect(out.snapshot.village.spanish_fluency_pct).toBe(17);
    expect(out.snapshot.players[3]!.action_points).toBe(2);
    expect(s.players[3]!.action_points).toBe(3); // entrée intacte
  });

  it('refuse sans PA', () => {
    const s = seedSnapshot();
    s.players[3]!.action_points = 0;
    const out = performAction(s, { action_code: 'rest', actor_id: ALEX }, NOW);
    expect(out.status).toBe('refused');
    expect(out.error).toMatch(/Points d'Action/);
  });

  it('refuse une action hors métier', () => {
    const out = performAction(seedSnapshot(), { action_code: 'forge_tools', actor_id: ALEX }, NOW);
    expect(out.status).toBe('refused');
  });

  it('refuse un joueur au cachot', () => {
    const s = seedSnapshot();
    s.players[3]!.is_detained_until = '2026-11-26T10:00:00Z';
    const out = performAction(s, { action_code: 'rest', actor_id: ALEX }, NOW);
    expect(out.error).toMatch(/cachot/);
  });

  it('portefeuille non débloqué à l\'Acte I', () => {
    const s = seedSnapshot();
    s.players[4]!.ministerial_portfolios = ['customs'];
    const out = performAction(s, { action_code: 'smuggling_run', actor_id: playerId(5) }, NOW);
    expect(out.status).toBe('refused');
  });

  it('lancer de tomates : moral +15 %, une fois par saison', () => {
    const first = performAction(seedSnapshot(), { action_code: 'throw_tomatoes', actor_id: playerId(5) }, NOW);
    expect(first.snapshot.village.morale_pct).toBe(90);
    expect(first.snapshot.village.tomatoes_stock).toBe(60);
    expect(first.snapshot.village.food_rations).toBe(145);
    const second = performAction(first.snapshot, { action_code: 'throw_tomatoes', actor_id: playerId(6) }, NOW);
    expect(second.status).toBe('refused');
  });

  it('Action Libre IA : déclenche un appel au Maître du Jeu', () => {
    const out = performAction(seedSnapshot(), { action_code: 'free_ai_action', actor_id: ELY, free_text: 'Je négocie un tarif de groupe chez BigMat.' }, NOW);
    expect(out.status).toBe('done');
    expect(out.triggers[0]).toMatchObject({ type: 'needs_ai', reason: 'free_action' });
  });

  it('est déterministe', () => {
    const req = { action_code: 'fish_hunt', actor_id: playerId(5) };
    expect(JSON.stringify(performAction(seedSnapshot(), req, NOW))).toBe(JSON.stringify(performAction(seedSnapshot(), req, NOW)));
  });
});

describe('Verrous réglementaires [GDD §2.1]', () => {
  it('PLU : Alex doit obtenir l\'accord de Tiphaine, puis le chantier s\'exécute sans PA supplémentaire', () => {
    const s = seedSnapshot();
    const borda = structureId(s, 'borda_alta');
    const req = { action_code: 'renovate_building', actor_id: ALEX, target_structure_id: borda };
    const pending = performAction(s, req, NOW);
    expect(pending.status).toBe('pending_approval');
    expect(pending.approvals).toHaveLength(1);
    expect(pending.approvals[0]!.kind).toBe('plu');
    expect(pending.snapshot.players[3]!.action_points).toBe(2);

    const fx = emptyEffects();
    const decision = decideApproval(pending.snapshot, fx, pending.approvals[0]!.id, TIPH, true, null, NOW);
    expect(decision.ok).toBe(true);
    expect(decision.ready).not.toBeNull();

    const group = (decision.ready!.params as Record<string, string>).approval_group;
    const done = performAction(decision.snapshot, decision.ready!, NOW, { executingApprovalGroup: group });
    expect(done.status).toBe('done');
    expect(done.snapshot.players[3]!.action_points).toBe(2);
    expect(done.snapshot.structures.find((x) => x.id === borda)!.progress_pct).toBeGreaterThan(0);
    expect(done.snapshot.village.treasury_eur).toBe(49700);
    expect(done.snapshot.approvals[0]!.status).toBe('executed');
  });

  it('Seul Tiphaine (ou son délégataire) tranche un PLU', () => {
    const s = seedSnapshot();
    const pending = performAction(s, { action_code: 'renovate_building', actor_id: ALEX, target_structure_id: structureId(s, 'borda_alta') }, NOW);
    const decision = decideApproval(pending.snapshot, emptyEffects(), pending.approvals[0]!.id, ELY, true, null, NOW);
    expect(decision.ok).toBe(false);
  });

  it('Budget > 500 € : validation de M. Lerme requise (même pour Tiphaine)', () => {
    const s = seedSnapshot();
    const req = { action_code: 'install_generator', actor_id: TIPH, target_structure_id: structureId(s, 'grup_electrogen') };
    const pending = performAction(s, req, NOW);
    expect(pending.status).toBe('pending_approval');
    expect(pending.approvals.map((a) => a.kind)).toEqual(['budget']);
    const decision = decideApproval(pending.snapshot, emptyEffects(), pending.approvals[0]!.id, LERME, true, 'OK', NOW);
    const group = (decision.ready!.params as Record<string, string>).approval_group;
    const done = performAction(decision.snapshot, decision.ready!, NOW, { executingApprovalGroup: group });
    expect(done.snapshot.village.energy_tier).toBe(2);
    expect(done.snapshot.village.treasury_eur).toBe(47200);
  });

  it('M. Lerme engage seul plus de 500 € ; un refus annule tout le groupe', () => {
    const s = seedSnapshot();
    const pending = performAction(s, { action_code: 'install_generator', actor_id: ALEX, target_structure_id: structureId(s, 'grup_electrogen') }, NOW);
    expect(pending.approvals.map((a) => a.kind).sort()).toEqual(['budget', 'plu']);
    const plu = pending.approvals.find((a) => a.kind === 'plu')!;
    const rejected = decideApproval(pending.snapshot, emptyEffects(), plu.id, TIPH, false, 'Non conforme', NOW);
    expect(rejected.ready).toBeNull();
    expect(rejected.snapshot.approvals.every((a) => a.status === 'rejected')).toBe(true);
  });

  it('Veto écologique d\'Ely : chantier suspendu', () => {
    const s = seedSnapshot();
    const borda = structureId(s, 'borda_alta');
    const veto = performAction(s, { action_code: 'eco_veto', actor_id: ELY, target_structure_id: borda, params: { reason: 'Nid de chouettes effraies' } }, NOW);
    expect(veto.status).toBe('done');
    const blocked = performAction(veto.snapshot, { action_code: 'renovate_building', actor_id: TIPH, target_structure_id: borda }, NOW);
    expect(blocked.status).toBe('refused');
    expect(blocked.error).toMatch(/Veto écologique/);
  });

  it('Livraison retenue en attente de raccordement électrique', () => {
    const s = seedSnapshot();
    const borda = s.structures.find((x) => x.code === 'borda_alta')!;
    borda.progress_pct = 95;
    borda.plu_approved = true;
    const out = performAction(s, { action_code: 'renovate_building', actor_id: TIPH, target_structure_id: borda.id }, NOW);
    expect(out.snapshot.structures.find((x) => x.id === borda.id)!.status).toBe('awaiting_power');
    expect(out.snapshot.village.housing_capacity).toBe(12);
  });
});

describe('Délégation temporaire de poste', () => {
  it('le délégataire agit avec les PA du titulaire', () => {
    const s = seedSnapshot();
    s.players[2]!.delegated_to = ALEX;
    s.players[2]!.delegation_until = '2026-12-01T00:00:00Z';
    const out = performAction(s, { action_code: 'plu_inspection', actor_id: ALEX, on_behalf_of_id: TIPH }, NOW);
    expect(out.status).toBe('done');
    expect(out.snapshot.players[2]!.action_points).toBe(2);
    expect(out.snapshot.players[3]!.action_points).toBe(3);
  });

  it('refuse une délégation inexistante ou une action non délégable', () => {
    const s = seedSnapshot();
    expect(performAction(s, { action_code: 'plu_inspection', actor_id: ALEX, on_behalf_of_id: TIPH }, NOW).status).toBe('refused');
    s.players[0]!.delegated_to = ALEX;
    s.players[0]!.delegation_until = '2026-12-01T00:00:00Z';
    const veto = performAction(s, { action_code: 'eco_veto', actor_id: ALEX, on_behalf_of_id: ELY, target_structure_id: structureId(s, 'borda_alta'), params: { reason: 'raison suffisante' } }, NOW);
    expect(veto.error).toMatch(/non délégable/);
  });
});

describe('Commandes fournisseurs', () => {
  it('prix catalogue sans surcoût quand la piste est praticable', () => {
    const out = performAction(seedSnapshot(), { action_code: 'buy_supplies', actor_id: ELY, catalog_item_id: 'bigmat_chaux', quantity: 1 }, NOW);
    expect(out.snapshot.village.treasury_eur).toBe(49850);
    expect(out.snapshot.village.stone_stock).toBe(58);
    expect(out.ledger[0]).toMatchObject({ supplier: 'BigMat', amount_eur: -150 });
  });

  it('piste < 40 % : surcoût de 40 % ou embourbement', () => {
    const out = performAction(seedSnapshot({ track_condition_pct: 30 }), { action_code: 'buy_supplies', actor_id: ELY, catalog_item_id: 'bigmat_chaux' }, NOW);
    if (out.narrative.includes('embourbe')) {
      expect(out.snapshot.village.treasury_eur).toBe(50000);
      expect(out.snapshot.village.track_blocked_until).not.toBeNull();
    } else {
      expect(out.snapshot.village.treasury_eur).toBe(49790);
    }
  });
});
