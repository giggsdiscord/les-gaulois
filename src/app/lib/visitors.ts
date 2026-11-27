/**
 * Visiteurs imprévus vus par l'interface (V5.9) : visiteur présent, temps restant avant 21 h,
 * réponses possibles (coût, effets, blocage) et ce que coûterait le silence ; dernière visite close.
 * Pur (aucun DOM) : testé dans tests/app/visitors.test.ts.
 */
import { constants as C, currentVisitor, findVisitor, lifeOf, visitorBlocker, visitorCostText, visitorEffectText } from '../engine.ts';
import type { GameData } from '../api/types.ts';

export interface VisitorChoiceView {
  def: C.VisitorChoiceDef;
  cost: string;
  effects: string;
  /** Raison de ne pas pouvoir choisir cette réponse (null = possible, hors PA). */
  blocked: string | null;
}

export interface VisitorView {
  def: C.VisitorDef;
  /** Minutes restantes avant le départ (0 = parti). */
  minutesLeft: number;
  deadline: string;
  urgent: boolean;
  choices: VisitorChoiceView[];
  ignored: { label: string; effects: string };
  /** Raison générale (visiteur reparti…), null si on peut répondre. */
  blocked: string | null;
}

export interface VisitorsView {
  visit: VisitorView | null;
  /** Dernière visite close, en une phrase (null s'il n'y en a pas). */
  last: string | null;
}

export function visitorsView(data: Pick<GameData, 'village' | 'players'>, now: Date): VisitorsView {
  const v = data.village;
  const cur = currentVisitor(v);
  let visit: VisitorView | null = null;
  if (cur) {
    const minutesLeft = Math.max(0, Math.floor((Date.parse(cur.visit.due_at) - now.getTime()) / 60_000));
    const h = Math.floor(minutesLeft / 60);
    const deadline = minutesLeft <= 0 ? 'reparti' : h > 0 ? `encore ${h} h ${String(minutesLeft % 60).padStart(2, '0')}` : `encore ${minutesLeft} min`;
    visit = {
      def: cur.def,
      minutesLeft,
      deadline,
      urgent: minutesLeft <= 180,
      choices: cur.def.choices.map((def) => ({ def, cost: visitorCostText(def), effects: visitorEffectText(def), blocked: visitorBlocker(v, now, def.id) })),
      ignored: { label: cur.def.ignored.label, effects: visitorEffectText(cur.def.ignored) },
      blocked: visitorBlocker(v, now),
    };
  }
  const res = lifeOf(v).visitor_last;
  const def = findVisitor(res?.id);
  let last: string | null = null;
  if (res && def) {
    const choice = def.choices.find((c) => c.id === res.choice);
    const who = data.players.find((p) => p.id === res.by)?.display_name;
    last = choice ? `${def.icon} ${def.title} : ${choice.label.toLowerCase()}${who ? ` (${who})` : ''}.` : `${def.icon} ${def.title} : ${def.ignored.label.toLowerCase()}.`;
  }
  return { visit, last };
}

/** Un visiteur qui attend mérite-t-il une place dans « À faire en priorité » ? Score selon l'urgence. */
export function visitorPriorityScore(view: VisitorsView): number | null {
  const m = view.visit;
  if (!m || m.blocked || m.choices.every((c) => c.blocked)) return null;
  return m.urgent ? 70 : 60;
}
