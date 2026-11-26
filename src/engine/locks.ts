/**
 * Verrous réglementaires [GDD §2.1] :
 *  - Urbanisme (Tiphaine) : rien ne se construit, rénove ou démolit sans son accord PLU ;
 *  - Budget (M. Lerme) : aucun achat / location fournisseur > 500 € sans sa validation ;
 *  - Veto écologique (Ely) : suspend tout chantier menaçant la faune locale.
 */
import { BUDGET_LOCK_THRESHOLD_EUR } from './constants.ts';
import { pushEvent } from './effects.ts';
import { canDecideFor, delegatedBudgetCap } from './permissions.ts';
import type { Rng } from './rng.ts';
import type {
  ActionRequest,
  ApprovalDraft,
  EngineEffects,
  GameSnapshot,
  MapStructure,
  PendingApproval,
  Player,
} from './types.ts';

export type LockCheck =
  | { status: 'clear' }
  | { status: 'blocked'; error: string }
  | { status: 'needs_approval'; drafts: ApprovalDraft[] };

export interface LockInput {
  holder: Player;
  viaDelegation: boolean;
  requiresPlu: boolean;
  ecoSensitive: boolean;
  costEur: number;
  structure: MapStructure | undefined;
  request: ActionRequest;
  /** Groupe d'approbations déjà accordées (ré-exécution différée). */
  approvedGroup?: string | null;
}

function groupApprovals(s: GameSnapshot, group: string | null | undefined): PendingApproval[] {
  if (!group) return [];
  return s.approvals.filter((a) => (a.payload.params as Record<string, unknown> | undefined)?.approval_group === group);
}

export function checkLocks(s: GameSnapshot, input: LockInput, rng: Rng): LockCheck {
  const { holder, structure, request } = input;

  if (input.ecoSensitive && structure?.eco_veto_active) {
    return { status: 'blocked', error: `Veto écologique d'Ely sur « ${structure.name} » : chantier suspendu.` };
  }

  const granted = groupApprovals(s, input.approvedGroup);
  const hasGranted = (kind: 'budget' | 'plu') => granted.some((a) => a.kind === kind && a.status === 'approved');

  const needsPlu = input.requiresPlu && structure !== undefined && !structure.plu_approved && holder.role_code !== 'civil_eng';
  const overBudget = input.costEur > BUDGET_LOCK_THRESHOLD_EUR;
  const isTreasurer = holder.role_code === 'treasurer_physio' && (!input.viaDelegation || input.costEur <= delegatedBudgetCap());
  const needsBudget = overBudget && !isTreasurer;

  const missing: ('plu' | 'budget')[] = [];
  if (needsPlu && !hasGranted('plu')) missing.push('plu');
  if (needsBudget && !hasGranted('budget')) missing.push('budget');
  if (missing.length === 0) return { status: 'clear' };
  if (input.approvedGroup) {
    return { status: 'blocked', error: 'Approbations incomplètes pour cette action différée.' };
  }

  const duplicate = s.approvals.some(
    (a) =>
      a.status === 'pending' &&
      a.requested_by === request.actor_id &&
      a.action_code === request.action_code &&
      (a.structure_id ?? null) === (request.target_structure_id ?? null),
  );
  if (duplicate) return { status: 'blocked', error: 'Une demande identique attend déjà une validation.' };

  const group = rng.uuid();
  const payload: ActionRequest = { ...request, params: { ...(request.params ?? {}), approval_group: group } };
  const drafts: ApprovalDraft[] = missing.map((kind) => ({
    id: rng.uuid(),
    kind,
    required_role: kind === 'plu' ? 'civil_eng' : 'treasurer_physio',
    requested_by: request.actor_id,
    structure_id: structure?.id ?? null,
    amount_eur: kind === 'budget' ? input.costEur : null,
    action_code: request.action_code,
    payload,
  }));
  return { status: 'needs_approval', drafts };
}

export interface ApprovalDecision {
  ok: boolean;
  error: string | null;
  snapshot: GameSnapshot;
  /** Requête à ré-exécuter (toutes les approbations du groupe accordées). */
  ready: ActionRequest | null;
}

/** Décision de Tiphaine (PLU) ou de M. Lerme (budget), ou de leur délégataire. */
export function decideApproval(
  s: GameSnapshot,
  fx: EngineEffects,
  approvalId: string,
  deciderId: string,
  approve: boolean,
  reason: string | null,
  now: Date,
): ApprovalDecision {
  const approval = s.approvals.find((a) => a.id === approvalId);
  if (!approval) return { ok: false, error: 'Demande introuvable.', snapshot: s, ready: null };
  if (approval.status !== 'pending') return { ok: false, error: 'Demande déjà tranchée.', snapshot: s, ready: null };
  const rights = canDecideFor(s, deciderId, approval.required_role, now);
  if (!rights.ok) return { ok: false, error: 'Vous n\'avez pas autorité sur ce verrou.', snapshot: s, ready: null };
  if (approve && rights.viaDelegation && approval.kind === 'budget' && (approval.amount_eur ?? 0) > delegatedBudgetCap()) {
    return { ok: false, error: `Un délégataire ne peut valider au-delà de ${delegatedBudgetCap()} €.`, snapshot: s, ready: null };
  }

  approval.status = approve ? 'approved' : 'rejected';
  approval.decided_by = deciderId;
  approval.decided_at = now.toISOString();
  approval.reason = reason;

  if (approve && approval.kind === 'plu' && approval.structure_id) {
    const st = s.structures.find((x) => x.id === approval.structure_id);
    if (st) st.plu_approved = true;
  }
  pushEvent(fx, s, {
    event_type: approve ? 'approval_granted' : 'approval_rejected',
    title: approve ? 'Validation accordée' : 'Validation refusée',
    body: `${approval.kind === 'plu' ? 'Accord PLU' : 'Validation budgétaire'} ${approve ? 'accordé(e)' : 'refusé(e)'} pour « ${approval.action_code} »${reason ? ` : ${reason}` : ''}.`,
    data: { approval_id: approval.id },
  });

  const group = (approval.payload.params as Record<string, unknown> | undefined)?.approval_group as string | undefined;
  const siblings = groupApprovals(s, group);
  if (!approve) {
    for (const sib of siblings) if (sib.status === 'pending') sib.status = 'rejected';
    return { ok: true, error: null, snapshot: s, ready: null };
  }
  const allApproved = siblings.length > 0 && siblings.every((a) => a.status === 'approved');
  return { ok: true, error: null, snapshot: s, ready: allApproved ? approval.payload : null };
}

export function markGroupExecuted(s: GameSnapshot, group: string): void {
  for (const a of groupApprovals(s, group)) if (a.status === 'approved') a.status = 'executed';
}
