/** Règles côté interface (affichage) — la validation qui fait foi reste celle du moteur. */
import {
  ACTIONS,
  canFightCarlage,
  holderHasPortfolio,
  holderHasRole,
  isAfter,
  nextAgoraSession,
  weeksBetween,
  type ActionDef,
  type Player,
} from '../engine.ts';
import type { GameData, MyPlayer, PublicPlayer, PublicVillage } from '../api/types.ts';

export const PILLAR_ROLES = ['mayor_agri', 'treasurer_physio', 'civil_eng'];

/** Actions qu'un titulaire de poste peut faire selon son métier, ses portefeuilles et l'Acte. */
export function availableActions(holder: PublicPlayer, act: number): ActionDef[] {
  const p = holder as unknown as Player;
  return ACTIONS.filter((a) => {
    if (a.minAct && act < a.minAct) return false;
    return a.anyone === true || holderHasRole(p, a.roles) || holderHasPortfolio(p, a.portfolio, act);
  });
}

/** Joueurs ayant délégué leur poste au joueur courant (délégation en cours). */
export function delegatorsOf(players: PublicPlayer[], meId: string, now: Date): PublicPlayer[] {
  return players.filter((p) => p.delegated_to === meId && isAfter(p.delegation_until, now));
}

export function isDetained(p: { is_detained_until: string | null }, now: Date): boolean {
  return isAfter(p.is_detained_until, now);
}

export function canFight(me: MyPlayer, now: Date): boolean {
  return canFightCarlage(me as unknown as Player, now);
}

export function population(data: GameData): { founders: number; residents: number; children: number; total: number } {
  const founders = data.players.filter((p) => p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor')).length;
  const residents = data.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor').length;
  const children = data.children.filter((c) => c.status !== 'departed' && c.status !== 'law_student' && c.age_years < 18).length;
  return { founders, residents, children, total: founders + residents + children };
}

/** Semaine de la prochaine séance (même règle que la fonction SQL agora_week_for). */
export function nextAgoraWeek(village: PublicVillage, now: Date): number {
  return village.season_number + weeksBetween(now, nextAgoraSession(now));
}

export function playerName(players: PublicPlayer[], id: string | null | undefined): string {
  if (!id) return '—';
  return players.find((p) => p.id === id)?.display_name ?? '?';
}

/** Types d'ouvrages pertinents pour une action ciblant la carte (confort de saisie). */
export const STRUCTURE_ACTION_KINDS: Record<string, string[]> = {
  renovate_building: ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'],
  maintain_building: ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'],
  upgrade_building: ['building', 'gite'],
  improve_own_housing: ['building'],
  clear_rubble: ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'],
  demolish_building: ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'],
  build_livestock_pen: ['livestock_pen'],
  install_generator: ['generator'],
  build_power_line: ['power_line'],
  build_solar: ['solar'],
  lay_pipes: ['pipe'],
  build_septic: ['septic_tank'],
  build_dam: ['dam'],
  connect_mining_farm: ['mining_farm'],
  build_watchtower: ['watchtower', 'gate'],
  build_microreactor: ['dam', 'solar', 'lab'],
};

/** Actions qui demandent un montant (€) ou une quantité. */
export const AMOUNT_ACTIONS: Record<string, { label: string; min: number; max: number; step: number; initial: number }> = {
  pay_land_debt: { label: 'Montant à rembourser (€)', min: 100, max: 100000, step: 100, initial: 1000 },
  transfer_sovereign_fund: { label: 'Montant (€) — négatif pour rapatrier', min: -100000, max: 100000, step: 100, initial: 1000 },
  buy_etf: { label: 'Montant à placer (€), pris sur le fonds souverain', min: 50, max: 100000, step: 50, initial: 500 },
  sell_etf: { label: 'Montant à vendre (€) — 0 pour tout vendre', min: 0, max: 100000, step: 50, initial: 0 },
  set_carlage_fee: { label: 'Franchise Carlage (€)', min: 0, max: 500, step: 10, initial: 50 },
  hire_resident: { label: 'Salaire hebdomadaire (€)', min: 50, max: 400, step: 10, initial: 120 },
};

export const QUANTITY_ACTIONS: Record<string, { label: string; max: number }> = {
  buy_livestock: { label: 'Nombre de bêtes', max: 20 },
  buy_supplies: { label: 'Quantité', max: 20 },
};
