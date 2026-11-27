/**
 * Aides d'affichage des actions métiers (V4.4) : raison de blocage, explications des verrous,
 * recherche et actions récentes. Pur (aucun DOM) : testé dans tests/app/actionHints.test.ts.
 * La validation qui fait foi reste celle du moteur (performAction).
 */
import { forestBan, getAction, isAfter, isSunday, type ActionDef } from '../engine.ts';
import type { GameData, PublicPlayer } from '../api/types.ts';

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
}

/** Situation du joueur qui agit, pour lui-même (`holderId` null) ou pour un poste délégué. */
export function situationFor(data: Pick<GameData, 'me' | 'players' | 'village'>, holderId: string | null, now: Date): ActionSituation {
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
