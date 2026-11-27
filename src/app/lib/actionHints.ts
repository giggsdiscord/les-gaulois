/**
 * Aides d'affichage des actions métiers (V4.4) : raison de blocage, explications des verrous,
 * recherche et actions récentes. Pur (aucun DOM) : testé dans tests/app/actionHints.test.ts.
 * La validation qui fait foi reste celle du moteur (performAction).
 */
import { constants as C, currentCollective, forestBan, neighborHelpBlocker, permitBlocker, freeParcels, openBuildingProjects, getAction, isAfter, isSunday, lifeOf, pantryAmount, type ActionDef } from '../engine.ts';
import type { GameData, PublicPlayer } from '../api/types.ts';
import { electionView } from './election.ts';

export interface ActionSituation {
  /** Titulaire du poste dont les PA sont dépensés (soi-même ou un délégant). */
  holder: Pick<PublicPlayer, 'id' | 'display_name' | 'action_points' | 'status' | 'role_code'>;
  /** Raison pour laquelle le joueur qui agit ne peut rien faire (cachot, bannissement), sinon null. */
  actorBlocked: string | null;
  viaDelegation: boolean;
  defeated: boolean;
  now: Date;
  /** Coupes de bois interdites par Ely jusqu'à lundi (V4.9). */
  forestBanned?: boolean;
  /** Chantier collectif de la semaine (V5.0) : absent, ouvert ou achevé ; projets soumis au vote. */
  collective?: 'none' | 'open' | 'done';
  collectiveVotable?: boolean;
  /** Nouveaux bâtiments (V5.4) : pourquoi aucun plan n'est possible (null = possible). */
  buildBlocked?: string | null;
  /** Filières (V5.6) : troupeau, rations et prunes disponibles. */
  supply?: { livestock: number; rations: number; plums: number };
  /** Voisins (V5.8) : pourquoi aucun coup de main n'est possible (null = possible). */
  neighborHelp?: string | null;
  /** Élection vivante (V5.3) : gestes possibles maintenant. */
  election?: { open: boolean; canStand: boolean; canSpeak: boolean; canVote: boolean; phase: string | null };
}

/** Situation du joueur qui agit, pour lui-même (`holderId` null) ou pour un poste délégué. */
export function situationFor(data: Pick<GameData, 'me' | 'players' | 'village'> & Partial<Pick<GameData, 'structures'>>, holderId: string | null, now: Date): ActionSituation {
  const me = data.me;
  const holder = (holderId ? data.players.find((p) => p.id === holderId) : undefined) ?? me;
  return {
    holder,
    actorBlocked:
      me.status === 'banished' || me.status === 'executed'
        ? 'Vous ne faites plus partie du hameau.'
        : isAfter(me.is_detained_until, now)
          ? 'Vous êtes au cachot.'
          : null,
    viaDelegation: holder.id !== me.id,
    defeated: data.village.is_defeated,
    now,
    forestBanned: forestBan(data.village) !== null,
    collective: collectiveState(data.village),
    collectiveVotable: (lifeOf(data.village).collective_candidates ?? []).length > 0,
    buildBlocked: !data.structures
      ? null
      : freeParcels({ structures: data.structures, village: data.village }).length === 0
        ? 'Plus aucune parcelle libre.'
        : openBuildingProjects({ structures: data.structures }).length >= C.BUILDING_MAX_OPEN_PROJECTS
          ? 'Deux nouveaux bâtiments déjà en projet : finissez-en un.'
          : permitBlocker(data.village),
    neighborHelp: neighborHelpBlocker(data.village),
    election: electionSituation(data, holder.id === me.id, now),
    supply: { livestock: data.village.livestock_count, rations: data.village.food_rations, plums: pantryAmount(data.village, 'plums_kg') },
  };
}

/** Pourquoi l'action ne peut pas être jouée maintenant (null = jouable). Même ordre que le moteur. */
export function actionBlockReason(def: ActionDef, s: ActionSituation): string | null {
  if (s.defeated) return 'La partie est terminée.';
  if (s.actorBlocked) return s.actorBlocked;
  if (s.viaDelegation && def.delegable === false) return 'Non délégable : seul le titulaire peut la jouer.';
  if (def.sundayOnly && !isSunday(s.now)) return 'Uniquement le dimanche.';
  if (s.holder.action_points < def.apCost) return s.holder.action_points === 0 ? "Plus de PA aujourd'hui." : `Il faut ${def.apCost} PA.`;
  if (s.holder.status === 'forced_labor' && !def.physical && def.apCost > 0) return 'Travaux forcés : tâches physiques seulement.';
  // Droit de regard d'Ely sur la forêt (V4.9)
  if (s.forestBanned && (def.code === 'cut_wood' || def.code === 'forest_ban')) return 'Coupes interdites par Ely jusqu\'à lundi.';
  if (s.forestBanned === false && def.code === 'lift_forest_ban') return 'La forêt est ouverte : rien à lever.';
  // Chantier collectif de la semaine (V5.0)
  if (def.code === 'contribute_collective' && s.collective === 'none') return "Le premier chantier commun s'ouvrira cette nuit.";
  if (def.code === 'contribute_collective' && s.collective === 'done') return 'Chantier de la semaine achevé : rendez-vous lundi.';
  if (def.code === 'vote_collective_project' && s.collectiveVotable === false) return "Aucun projet à voter pour l'instant.";
  if (def.code === 'plan_building' && s.buildBlocked) return s.buildBlocked;
  if (def.code === 'help_neighbors' && s.neighborHelp) return s.neighborHelp;
  // Filières (V5.6)
  if (s.supply && def.code === 'make_cheese' && s.supply.livestock < C.CHEESE_MIN_LIVESTOCK) return `Il faut au moins ${C.CHEESE_MIN_LIVESTOCK} bêtes à l’enclos.`;
  if (s.supply && def.code === 'make_cheese' && s.supply.rations < C.CHEESE_MAKE_RATIONS) return `Il faut ${C.CHEESE_MAKE_RATIONS} rations de lait.`;
  if (s.supply && def.code === 'make_ratafia' && s.supply.plums < C.RATAFIA_PLUMS_KG) return `Il faut ${C.RATAFIA_PLUMS_KG} kg de prunes (verger : été et automne).`;
  // Élection vivante d'un portefeuille (V5.3)
  if (s.election && (def.code === 'run_for_office' || def.code === 'campaign_speech' || def.code === 'vote_election')) {
    const e = s.election;
    if (!e.open) return 'Aucune élection en cours.';
    if (def.code === 'run_for_office' && !e.canStand) return e.phase === 'candidacy' ? 'Déjà candidat·e (ou titulaire du portefeuille).' : 'Candidatures closes.';
    if (def.code === 'campaign_speech' && !e.canSpeak) return 'Réservé aux candidats, une intervention par jour.';
    if (def.code === 'vote_election' && !e.canVote) return e.phase === 'candidacy' ? 'Le vote ouvrira après les candidatures.' : 'Pas de vote possible maintenant.';
  }
  return null;
}

/** Explications en clair des verrous, pour le titulaire du poste. */
export function lockNotes(def: ActionDef, holderRole: string): string[] {
  const notes: string[] = [];
  if (def.apCost === 0) notes.push('Gratuite : ne coûte aucun PA.');
  if (def.sundayOnly) notes.push('Se joue uniquement le dimanche.');
  if (def.requiresPlu && holderRole !== 'civil_eng') {
    notes.push("Ouvrage sans permis : il faut l'accord PLU de Tiphaine. Vos PA sont dépensés tout de suite, l'action s'exécute dès son accord.");
  }
  if (def.cost) {
    notes.push(
      holderRole === 'treasurer_physio'
        ? 'Dépense sur la caisse commune (vous la validez vous-même).'
        : 'Dépense sur la caisse commune : au-delà de 500 €, M. Lerme doit valider.',
    );
  }
  if (def.ecoSensitive) notes.push("Impossible si Ely a posé un veto écologique sur l'ouvrage.");
  if (def.physical) notes.push('Effort physique : risque de blessure.');
  if (def.delegable === false) notes.push('Non délégable.');
  return notes;
}

/** Minuscules sans accents, pour une recherche tolérante (« deblayer » trouve « Déblayer »). */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Tous les mots de la recherche doivent apparaître dans le libellé ou la description. */
export function matchesQuery(def: Pick<ActionDef, 'label' | 'description'>, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = fold(`${def.label} ${def.description}`);
  return words.every((w) => hay.includes(w));
}

export const RECENT_MAX = 4;

/** Ajoute une action en tête des récentes (sans doublon, au plus RECENT_MAX). */
export function pushRecent(list: readonly string[], code: string, max = RECENT_MAX): string[] {
  return [code, ...list.filter((c) => c !== code)].slice(0, max);
}

/** Libellé français d'un code d'action (repli : le code). */
export function actionLabel(code: string): string {
  return getAction(code)?.label ?? code;
}

function collectiveState(v: GameData['village']): 'none' | 'open' | 'done' {
  const p = currentCollective(v);
  return !p ? 'none' : p.completed_at ? 'done' : 'open';
}

function electionSituation(data: Pick<GameData, 'me' | 'players' | 'village'>, self: boolean, now: Date): ActionSituation['election'] {
  const v = electionView(data, now);
  if (!v.election) return { open: false, canStand: false, canSpeak: false, canVote: false, phase: null };
  return { open: true, canStand: self && v.canStand, canSpeak: self && v.canSpeak, canVote: self && v.canVote, phase: v.phase };
}
