/**
 * Liste « À faire » de l'écran d'accueil (V4.4) : ce qui attend le joueur, du plus urgent au
 * simple rappel, avec l'écran où agir. Pur (aucun DOM) : testé dans tests/app/todo.test.ts.
 */
import { isAfter, nextAgoraSession } from '../engine.ts';
import type { GameData, Proposal, UnreadCounts } from '../api/types.ts';

export interface TodoItem {
  key: string;
  emoji: string;
  text: string;
  /** Écran et sous-onglet où agir (#/route/param). */
  route: string;
  param?: string;
  tone: 'urgent' | 'normal' | 'info';
}

/** Demandes de validation que le joueur doit trancher (son rôle, ou un poste qui lui est délégué). */
export function approvalsToDecide(data: Pick<GameData, 'approvals' | 'players' | 'me'>, now: Date) {
  const role = data.me.role_code;
  const delegatedRoles = data.players.filter((p) => p.delegated_to === data.me.id && isAfter(p.delegation_until, now)).map((p) => p.role_code);
  return data.approvals.filter((a) => a.status === 'pending' && (a.required_role === role || delegatedRoles.includes(a.required_role)));
}

/** Scrutins ouverts où le joueur n'a pas encore voté. */
export function unvotedProposals(data: Pick<GameData, 'proposals' | 'me'>, now: Date): Proposal[] {
  const me = data.me.id;
  return data.proposals.filter((p) => p.status === 'open' && new Date(p.closes_at) > now && !p.votes_yes.includes(me) && !p.votes_no.includes(me));
}

/** Sous-onglet de l'Agora où se vote une proposition. */
export function agoraTabOf(kind: string): string {
  if (kind === 'tribunal') return 'tribunal';
  if (kind === 'migrant_admission') return 'immigration';
  if (kind === 'constitution_article') return 'constitution';
  return 'initiatives';
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export function todoItems(
  data: Pick<GameData, 'me' | 'players' | 'approvals' | 'proposals' | 'migrants' | 'temptations' | 'village'>,
  now: Date,
  counts: UnreadCounts | null,
): TodoItem[] {
  const me = data.me;
  const items: TodoItem[] = [];
  const blocked = isAfter(me.is_detained_until, now) || me.status === 'banished' || me.status === 'executed' || data.village.is_defeated;

  if (data.temptations.some((t) => t.choice === 'pending' && new Date(t.expires_at) > now)) {
    items.push({ key: 'temptation', emoji: '🕯️', text: 'Une proposition discrète attend votre réponse', route: 'tentation', tone: 'urgent' });
  }
  const approvals = approvalsToDecide(data, now).length;
  if (approvals > 0) {
    items.push({ key: 'approvals', emoji: '✅', text: `${approvals} ${plural(approvals, 'demande attend', 'demandes attendent')} votre validation`, route: 'metier', tone: 'urgent' });
  }
  if (!blocked) {
    const votes = unvotedProposals(data, now);
    if (votes.length > 0) {
      items.push({
        key: 'votes',
        emoji: '🗳️',
        text: `${votes.length} ${plural(votes.length, 'scrutin attend', 'scrutins attendent')} votre vote`,
        route: 'agora',
        param: agoraTabOf(votes[0]!.kind),
        tone: 'urgent',
      });
    }
    if (me.action_points > 0) {
      items.push({ key: 'ap', emoji: '⚡', text: `Il vous reste ${me.action_points} PA aujourd'hui`, route: 'metier', tone: 'normal' });
    }
  }
  if (counts) {
    if (counts.whisper > 0) {
      items.push({ key: 'whisper', emoji: '🤫', text: `${counts.whisper} ${plural(counts.whisper, 'chuchotement non lu', 'chuchotements non lus')}`, route: 'gazette', param: 'chuchotements', tone: 'normal' });
    }
    if (counts.gazette > 0) items.push({ key: 'gazette', emoji: '📰', text: 'La Gazette du jour est parue', route: 'gazette', tone: 'normal' });
    const tavern = counts.village_square + counts.agora_hall;
    if (tavern > 0) {
      items.push({
        key: 'tavern',
        emoji: '🍺',
        text: `${tavern} ${plural(tavern, 'message non lu', 'messages non lus')} à la Taverne`,
        route: 'gazette',
        param: counts.village_square > 0 ? 'taverne' : 'agora',
        tone: 'normal',
      });
    }
  }
  const candidates = data.migrants.filter((m) => m.status === 'candidate').length;
  if (candidates > 0) {
    items.push({ key: 'candidates', emoji: '🧳', text: `${candidates} ${plural(candidates, 'candidat attend', 'candidats attendent')} à la porte du hameau`, route: 'agora', param: 'immigration', tone: 'info' });
  }
  return items;
}

/** Prochaine séance de l'Agora (dimanche 11:00, Madrid). */
export function nextAgora(now: Date): Date {
  return nextAgoraSession(now);
}
