/**
 * Prérogatives & délégation temporaire de poste [GDD §1.2, §2].
 * Le délégataire agit avec les PA du titulaire, sur ses actions métier « délégables »,
 * sans veto, sans patrimoine privé du titulaire et avec un plafond de validation budgétaire.
 */
import { DELEGATION_BUDGET_CAP_EUR, PORTFOLIO_UNLOCK_ACT } from './constants.ts';
import { isAfter } from './calendar.ts';
import { isFree } from './health.ts';
import { findPlayer } from './population.ts';
import type { ActionRequest, GameSnapshot, Player, Portfolio, RoleCode } from './types.ts';

export interface ActorResolution {
  actor: Player;
  holder: Player;
  viaDelegation: boolean;
}

export function resolveActor(s: GameSnapshot, req: ActionRequest, now: Date): ActorResolution | string {
  const actor = findPlayer(s, req.actor_id);
  if (!actor || !actor.is_active_slot) return 'Joueur inconnu.';
  if (!isFree(actor, now)) {
    return actor.status === 'banished' || actor.status === 'executed'
      ? 'Vous ne faites plus partie du hameau.'
      : 'Vous êtes à l\'isolement au cachot.';
  }
  if (req.on_behalf_of_id && req.on_behalf_of_id !== actor.id) {
    const holder = findPlayer(s, req.on_behalf_of_id);
    if (!holder) return 'Titulaire du poste introuvable.';
    if (holder.delegated_to !== actor.id || !isAfter(holder.delegation_until, now)) {
      return `${holder.display_name} ne vous a pas délégué son poste.`;
    }
    if (holder.status === 'banished' || holder.status === 'executed') return 'Ce poste n\'existe plus.';
    return { actor, holder, viaDelegation: true };
  }
  return { actor, holder: actor, viaDelegation: false };
}

export function portfolioUnlocked(act: number, portfolio: Portfolio): boolean {
  return act >= PORTFOLIO_UNLOCK_ACT[portfolio];
}

export function holderHasRole(holder: Player, roles: readonly RoleCode[] | undefined): boolean {
  return roles !== undefined && roles.includes(holder.role_code);
}

export function holderHasPortfolio(holder: Player, portfolio: Portfolio | undefined, act: number): boolean {
  return portfolio !== undefined && holder.ministerial_portfolios.includes(portfolio) && portfolioUnlocked(act, portfolio);
}

/** Plafond de validation budgétaire d'un délégataire de M. Lerme. */
export function delegatedBudgetCap(): number {
  return DELEGATION_BUDGET_CAP_EUR;
}

/** Un joueur peut-il trancher une approbation (titulaire du rôle ou délégataire en cours) ? */
export function canDecideFor(s: GameSnapshot, deciderId: string, requiredRole: RoleCode, now: Date): { ok: boolean; viaDelegation: boolean } {
  const decider = findPlayer(s, deciderId);
  if (!decider || !isFree(decider, now)) return { ok: false, viaDelegation: false };
  if (decider.role_code === requiredRole) return { ok: true, viaDelegation: false };
  const holder = s.players.find((p) => p.role_code === requiredRole);
  if (holder && holder.delegated_to === decider.id && isAfter(holder.delegation_until, now)) {
    return { ok: true, viaDelegation: true };
  }
  return { ok: false, viaDelegation: false };
}
