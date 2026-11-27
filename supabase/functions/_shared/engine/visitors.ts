// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/visitors.ts
/**
 * Visiteurs imprévus [GDD §5.10, V5.9] : certaines nuits, un visiteur se présente (randonneur perdu,
 * journaliste, inspecteur, vendeur ambulant). Il attend une réponse le jour même avant 21 h : 2 choix,
 * 1 PA (+ parfois des ressources) pour le premier qui répond. Sans réponse, la nuit applique la
 * conséquence « ignoré ». Une visite à la fois. État dans `village_state.life` : `visitor`,
 * `visitor_last`, `visitor_next_day`.
 */
import { addDaysToKey, dayKey, localTimeToUtc } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent, pushLedger } from './effects.ts';
import { ensureLife, lifeOf } from './life.ts';
import { gauge, money, stock } from './math.ts';
import { adjustNeighbor, findNeighbor, missionCostText } from './neighbors.ts';
import type { Rng } from './rng.ts';
import type { EngineEffects, GameSnapshot, Player, VillageState, VisitorVisit } from './types.ts';

/** Préfixe des titres d'événements de visite (section « Visiteurs de passage » de la Gazette). */
export const VISITOR_EVENT_PREFIX = 'Visiteur : ';

export function findVisitor(id: string | null | undefined): C.VisitorDef | undefined {
  return id ? C.VISITORS.find((d) => d.id === id) : undefined;
}

/** Visite en cours (avec sa définition) ; null s'il n'y en a pas. */
export function currentVisitor(v: Pick<VillageState, 'life'>): { visit: VisitorVisit; def: C.VisitorDef } | null {
  const visit = lifeOf(v).visitor;
  const def = findVisitor(visit?.id);
  return visit && def ? { visit, def } : null;
}

const STAT_LABEL: Record<C.VisitorStat, (n: number) => string> = {
  treasury_eur: (n) => `caisse ${n > 0 ? '+' : '−'}${Math.abs(n)} €`,
  morale_pct: (n) => `moral ${n > 0 ? '+' : '−'}${Math.abs(n)} %`,
  admin_pressure_pct: (n) => `pression administrative ${n > 0 ? '+' : '−'}${Math.abs(n)} %`,
  customs_alert_pct: (n) => `alerte des douanes ${n > 0 ? '+' : '−'}${Math.abs(n)} %`,
  international_notoriety_pct: (n) => `notoriété ${n > 0 ? '+' : '−'}${Math.abs(n)} %`,
  food_rations: (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)} rations`,
  iron_stock: (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)} fer`,
  tools_stock: (n) => `${n > 0 ? '+' : '−'}${Math.abs(n)} outils`,
};

/** Effets d'une réponse en texte (« Mossos +6 · moral +2 % »), vide s'il n'y en a pas. */
export function visitorEffectText(o: C.VisitorOutcomeDef): string {
  const parts: string[] = [];
  for (const [id, n] of Object.entries(o.neighbors ?? {}) as [C.NeighborId, number][]) {
    if (n) parts.push(`${findNeighbor(id)?.short ?? id} ${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }
  for (const [key, n] of Object.entries(o.effects ?? {}) as [C.VisitorStat, number][]) if (n) parts.push(STAT_LABEL[key](n));
  return parts.join(' · ');
}

/** Coût d'une réponse en texte (réutilise celui des coups de main aux voisins). */
export function visitorCostText(o: C.VisitorOutcomeDef): string {
  return missionCostText({ cost: o.cost } as C.NeighborMissionDef);
}

/** Raison de ne pas pouvoir répondre (null = possible). Sans `choice`, vérifie seulement la visite ; sans `now`, pas l'heure. */
export function visitorBlocker(v: Pick<VillageState, 'life' | C.NeighborCostKey>, now: Date | null, choice?: string | null): string | null {
  const cur = currentVisitor(v);
  if (!cur) return 'Aucun visiteur n’attend au hameau.';
  if (now && now.getTime() > Date.parse(cur.visit.due_at)) return `${cur.def.title} est déjà reparti (réponse attendue avant ${C.VISITOR_DUE_HOUR} h).`;
  if (choice === undefined) return null;
  const def = cur.def.choices.find((c) => c.id === choice);
  if (!def) return `Choisissez une réponse : ${cur.def.choices.map((c) => c.label.toLowerCase()).join(' ou ')}.`;
  for (const [key, n] of Object.entries(def.cost ?? {}) as [C.NeighborCostKey, number][]) {
    if (n && Number(v[key]) < n) return `Il faut ${visitorCostText(def)} pour « ${def.label.toLowerCase()} ».`;
  }
  return null;
}

/** Applique coût + effets d'une réponse (ou de la conséquence « ignoré »). */
function applyOutcome(s: GameSnapshot, fx: EngineEffects, o: C.VisitorOutcomeDef, title: string, actorId: string | null): void {
  const v = s.village;
  const ledger = (amount: number) => pushLedger(fx, s, { account: 'treasury', amount_eur: amount, label: `${VISITOR_EVENT_PREFIX}${title}`, category: 'visitors', created_by: actorId });
  for (const [key, n] of Object.entries(o.cost ?? {}) as [C.NeighborCostKey, number][]) {
    if (!n) continue;
    if (key === 'treasury_eur') {
      v.treasury_eur = money(v.treasury_eur - n);
      ledger(-n);
    } else if (key === 'food_rations') v.food_rations = money(v.food_rations - n);
    else v[key] = stock(v[key] - n);
  }
  for (const [key, n] of Object.entries(o.effects ?? {}) as [C.VisitorStat, number][]) {
    if (!n) continue;
    if (key === 'treasury_eur') {
      v.treasury_eur = money(v.treasury_eur + n);
      ledger(n);
    } else if (key === 'food_rations') v.food_rations = money(v.food_rations + n);
    else if (key === 'iron_stock' || key === 'tools_stock') v[key] = stock(v[key] + n);
    else v[key] = gauge(v[key] + n);
  }
  for (const [id, n] of Object.entries(o.neighbors ?? {}) as [C.NeighborId, number][]) if (n) adjustNeighbor(v, id, n);
}

function closeVisit(v: VillageState, def: C.VisitorDef, choice: string, day: string, by: string | null): void {
  const life = ensureLife(v);
  life.visitor_last = { id: def.id, choice, day, by };
  life.visitor = null;
  life.visitor_next_day = addDaysToKey(day, C.VISITOR_GAP + 1);
}

export interface VisitorAnswer {
  def: C.VisitorDef;
  choice: C.VisitorChoiceDef;
  effects: string;
}

/** Réponse d'un joueur (l'action paie le PA). Lève une Error si impossible. */
export function answerVisitor(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'id' | 'display_name'>, choiceId: unknown, now: Date): VisitorAnswer {
  const v = s.village;
  const id = typeof choiceId === 'string' ? choiceId : null;
  const blocked = visitorBlocker(v, now, id);
  if (blocked) throw new Error(blocked);
  const { def } = currentVisitor(v)!;
  const choice = def.choices.find((c) => c.id === id)!;
  applyOutcome(s, fx, choice, def.title.toLowerCase(), actor.id);
  closeVisit(v, def, choice.id, dayKey(now), actor.id);
  const effects = visitorEffectText(choice);
  pushEvent(fx, s, {
    event_type: 'visitor_answered',
    title: `${VISITOR_EVENT_PREFIX}${def.title.toLowerCase()}`,
    body: `${def.icon} ${def.arrival} ${actor.display_name} a choisi : ${choice.label.toLowerCase()}. ${choice.result}${effects ? ` (${effects})` : ''}`,
    data: { visitor: def.id, choice: choice.id, by: actor.id },
  });
  return { def, choice, effects };
}

/** Tirage déterministe d'un visiteur, sans répéter le dernier. */
export function pickVisitor(v: Pick<VillageState, 'life'>, rng: Rng): C.VisitorDef | null {
  const last = lifeOf(v).visitor_last?.id ?? null;
  const pool = C.VISITORS.filter((d) => d.id !== last);
  return pool.length > 0 ? pool[rng.int(0, pool.length - 1)]! : null;
}

/** Nuit (dans closeDay) : visite restée sans réponse → conséquence ; puis peut-être un nouveau visiteur. */
export function processVisitors(s: GameSnapshot, fx: EngineEffects, endedKey: string, rng: Rng): void {
  const v = s.village;
  const life = ensureLife(v);
  const cur = currentVisitor(v);
  if (cur && cur.visit.day <= endedKey) {
    applyOutcome(s, fx, cur.def.ignored, cur.def.title.toLowerCase(), null);
    closeVisit(v, cur.def, 'ignored', endedKey, null);
    const effects = visitorEffectText(cur.def.ignored);
    pushEvent(fx, s, {
      event_type: 'visitor_ignored',
      title: `${VISITOR_EVENT_PREFIX}${cur.def.title.toLowerCase()}, sans réponse`,
      body: `${cur.def.icon} ${cur.def.arrival} ${cur.def.ignored.label}. ${cur.def.ignored.result}${effects ? ` (${effects})` : ''}`,
      data: { visitor: cur.def.id, choice: 'ignored' },
    });
  } else if (!cur && lifeOf(v).visitor) {
    life.visitor = null; // visiteur inconnu (dictionnaire changé)
  }

  const today = addDaysToKey(endedKey, 1);
  if (currentVisitor(v) || (life.visitor_next_day && life.visitor_next_day > today)) return;
  if (!rng.chance(C.VISITOR_CHANCE_PCT)) return;
  const def = pickVisitor(v, rng);
  if (!def) return;
  life.visitor = { id: def.id, day: today, due_at: localTimeToUtc(today, C.VISITOR_DUE_HOUR).toISOString() };
  pushEvent(fx, s, {
    event_type: 'visitor_arrived',
    title: `${VISITOR_EVENT_PREFIX}${def.title.toLowerCase()} au hameau`,
    body: `${def.icon} ${def.arrival} Réponse attendue avant ${C.VISITOR_DUE_HOUR} h : ${def.choices.map((c) => c.label.toLowerCase()).join(' ou ')} (1 PA). Sinon : ${def.ignored.label.toLowerCase()}.`,
    data: { visitor: def.id, due_at: life.visitor.due_at },
  });
}
