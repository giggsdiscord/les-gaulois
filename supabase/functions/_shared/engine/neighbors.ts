// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/neighbors.ts
/**
 * Relations avec les voisins [GDD §5.9, V5.8] : trois jauges (Organyà, mairie, Mossos) qui reviennent
 * doucement vers 50, une petite demande de voisinage à la fois (échéance, coups de main, récompense
 * ou sanction sur la jauge) et des effets simples (prix du marché, pression administrative, douanes).
 * État dans `village_state.life` : `neighbors`, `neighbor_mission`, `neighbor_last`, `neighbor_next_day`.
 */
import { addDaysToKey, dayKey } from './calendar.ts';
import * as C from './constants.ts';
import { pushEvent, pushLedger } from './effects.ts';
import { ensureLife, lifeOf, neighborGauge } from './life.ts';
import { gauge, money, round2, stepToward, stock } from './math.ts';
import type { Rng } from './rng.ts';
import type { CalendarSeason, EngineEffects, GameSnapshot, NeighborMission, Player, VillageState } from './types.ts';

/** Préfixe des titres d'événements de voisinage (section « Chez les voisins » de la Gazette). */
export const NEIGHBOR_EVENT_PREFIX = 'Voisins : ';

export function findNeighbor(id: string | null | undefined): C.NeighborDef | undefined {
  return id ? C.NEIGHBORS.find((n) => n.id === id) : undefined;
}

export function findNeighborMission(id: string | null | undefined): C.NeighborMissionDef | undefined {
  return id ? C.NEIGHBOR_MISSIONS.find((m) => m.id === id) : undefined;
}

export type NeighborStanding = 'good' | 'neutral' | 'bad';
export function neighborStanding(value: number): NeighborStanding {
  return value >= C.NEIGHBOR_GOOD ? 'good' : value <= C.NEIGHBOR_BAD ? 'bad' : 'neutral';
}

/** Modifie une jauge (bornée 0–100, deux décimales) ; renvoie la nouvelle valeur. */
export function adjustNeighbor(v: VillageState, id: C.NeighborId, delta: number): number {
  const life = ensureLife(v);
  const next = round2(gauge(neighborGauge(v, id) + delta));
  life.neighbors = { ...(life.neighbors ?? {}), [id]: next };
  return next;
}

/** Demande en cours (avec sa définition) ; null s'il n'y en a pas. */
export function currentNeighborMission(v: Pick<VillageState, 'life'>): { mission: NeighborMission; def: C.NeighborMissionDef } | null {
  const mission = lifeOf(v).neighbor_mission;
  const def = findNeighborMission(mission?.id);
  return mission && def ? { mission, def } : null;
}

/** Mairie fâchée : plus de permis pour un nouveau bâtiment. */
export function permitBlocker(v: Pick<VillageState, 'life'>): string | null {
  const g = neighborGauge(v, 'ayuntamiento');
  return g < C.NEIGHBOR_PERMIT_MIN ? `La mairie refuse tout nouveau permis de construire (relation ${Math.round(g)}/100 : remontez-la d’abord).` : null;
}

type MissionVillage = Pick<VillageState, 'real_snow_cm' | 'real_temp_min_c'>;
/** Une demande a-t-elle du sens selon la saison et la météo réelle ? */
export function missionFits(def: C.NeighborMissionDef, season: CalendarSeason, v: MissionVillage): boolean {
  const cold = season === 'winter' || season === 'autumn' || v.real_snow_cm > 0 || v.real_temp_min_c < 2;
  if (def.when === 'cold') return cold;
  if (def.when === 'warm') return !cold || season === 'spring' || season === 'summer';
  return true;
}

/** Tirage déterministe : demandes de saison, sans répéter la dernière ; le voisin le plus fâché passe d'abord une fois sur deux. */
export function pickNeighborMission(s: GameSnapshot, season: CalendarSeason, rng: Rng): C.NeighborMissionDef | null {
  const last = lifeOf(s.village).neighbor_last?.id ?? null;
  const pool = C.NEIGHBOR_MISSIONS.filter((m) => m.id !== last && missionFits(m, season, s.village));
  if (pool.length === 0) return null;
  if (rng.chance(50)) {
    const worst = [...C.NEIGHBORS].sort((a, b) => neighborGauge(s.village, a.id) - neighborGauge(s.village, b.id))[0]!;
    const theirs = pool.filter((m) => m.from === worst.id);
    if (theirs.length > 0) return theirs[rng.int(0, theirs.length - 1)]!;
  }
  return pool[rng.int(0, pool.length - 1)]!;
}

/** Coût d'un coup de main en texte (« 10 stères de bois »), vide s'il n'y en a pas. */
export function missionCostText(def: C.NeighborMissionDef): string {
  const parts: string[] = [];
  for (const [key, n] of Object.entries(def.cost ?? {}) as [C.NeighborCostKey, number][]) {
    if (!n) continue;
    if (key === 'treasury_eur') parts.push(`${n} € de la caisse`);
    else {
      const meta = C.STORAGE_LABEL[key];
      if (meta && meta.unit.toLowerCase() === meta.label.toLowerCase()) parts.push(`${n} ${meta.unit}`);
      else parts.push(`${n} ${meta?.unit ?? ''} de ${meta?.label.toLowerCase() ?? key}`.replace(/\s+/g, ' '));
    }
  }
  return parts.join(' + ');
}

/** Raison de refuser un coup de main (null = possible). */
export function neighborHelpBlocker(v: Pick<VillageState, 'life' | C.NeighborCostKey>): string | null {
  const cur = currentNeighborMission(v);
  if (!cur) return 'Les voisins ne demandent rien pour l’instant.';
  for (const [key, n] of Object.entries(cur.def.cost ?? {}) as [C.NeighborCostKey, number][]) {
    if (n && Number(v[key]) < n) return `Il faut ${missionCostText(cur.def)} pour ce coup de main.`;
  }
  return null;
}

/** Bonus concret d'une demande remplie ; renvoie le texte. */
function applyMissionBonus(s: GameSnapshot, def: C.NeighborMissionDef): string {
  const v = s.village;
  switch (def.id) {
    case 'snow_road':
      v.track_condition_pct = gauge(v.track_condition_pct + 5);
      break;
    case 'clear_path':
    case 'clear_track':
      v.track_condition_pct = gauge(v.track_condition_pct + 3);
      break;
    case 'firewood_elders':
    case 'fiesta_tomatoes':
      v.morale_pct = gauge(v.morale_pct + 3);
      break;
    case 'harvest_hands':
      v.food_rations = money(v.food_rations + 15);
      break;
    case 'census':
      v.admin_pressure_pct = gauge(v.admin_pressure_pct - 5);
      break;
    case 'snowplough_fund':
      v.admin_pressure_pct = gauge(v.admin_pressure_pct - 3);
      break;
    case 'patrol_report':
      v.customs_alert_pct = gauge(v.customs_alert_pct - 5);
      break;
    case 'open_house':
      v.security_reduction_pct = gauge(v.security_reduction_pct + 3);
      break;
  }
  return def.bonus;
}

export interface NeighborHelp {
  def: C.NeighborMissionDef;
  mission: NeighborMission;
  finished: boolean;
  gauge: number;
}

/** Un coup de main (l'action paie le PA ; ici le coût en ressources). Lève une Error si impossible. */
export function helpNeighbors(s: GameSnapshot, fx: EngineEffects, actor: Pick<Player, 'id'>, now: Date): NeighborHelp {
  const v = s.village;
  const blocked = neighborHelpBlocker(v);
  if (blocked) throw new Error(blocked);
  const { mission, def } = currentNeighborMission(v)!;
  for (const [key, n] of Object.entries(def.cost ?? {}) as [C.NeighborCostKey, number][]) {
    if (!n) continue;
    if (key === 'treasury_eur') {
      v.treasury_eur = money(v.treasury_eur - n);
      pushLedger(fx, s, { account: 'treasury', amount_eur: -n, label: `Voisins : ${def.title}`, category: 'neighbors' });
    } else if (key === 'food_rations') v.food_rations = money(v.food_rations - n);
    else v[key] = stock(v[key] - n);
  }
  mission.done_steps += 1;
  mission.helpers = { ...mission.helpers, [actor.id]: (mission.helpers[actor.id] ?? 0) + 1 };
  const finished = mission.done_steps >= def.steps;
  let value = neighborGauge(v, def.from);
  if (finished) {
    value = adjustNeighbor(v, def.from, def.reward);
    const bonus = applyMissionBonus(s, def);
    const life = ensureLife(v);
    const today = dayKey(now);
    life.neighbor_last = { id: def.id, outcome: 'done', day: today, delta: def.reward };
    life.neighbor_mission = null;
    life.neighbor_next_day = addDaysToKey(today, C.NEIGHBOR_MISSION_GAP + 1);
    const who = findNeighbor(def.from)!;
    pushEvent(fx, s, {
      event_type: 'neighbor_mission_done',
      title: `${NEIGHBOR_EVENT_PREFIX}${def.title.toLowerCase()}, c’est fait`,
      body: `${def.icon} ${def.ask} Le hameau a répondu présent (${Object.keys(mission.helpers).length} volontaire${Object.keys(mission.helpers).length > 1 ? 's' : ''}). ${who.short} : relation +${def.reward} (${Math.round(value)}/100) ; ${bonus}.`,
      data: { mission: def.id, from: def.from, gauge: value, helpers: mission.helpers },
    });
  }
  return { def, mission, finished, gauge: value };
}

/** Ouvre une nouvelle demande pour le jour `day`. */
function openMission(s: GameSnapshot, fx: EngineEffects, def: C.NeighborMissionDef, day: string): NeighborMission {
  const mission: NeighborMission = { id: def.id, opened_day: day, due_day: addDaysToKey(day, def.days - 1), done_steps: 0, helpers: {} };
  ensureLife(s.village).neighbor_mission = mission;
  const cost = missionCostText(def);
  pushEvent(fx, s, {
    event_type: 'neighbor_mission',
    title: `${NEIGHBOR_EVENT_PREFIX}${def.title.toLowerCase()}`,
    body: `${def.icon} ${def.ask} ${def.steps} coup${def.steps > 1 ? 's' : ''} de main (1 PA chacun${cost ? ` + ${cost}` : ''}) d’ici ${def.days > 1 ? `${def.days} jours` : 'ce soir'} : relation +${def.reward} et ${def.bonus} ; sinon −${def.penalty}.`,
    data: { mission: def.id, from: def.from, due_day: mission.due_day },
  });
  return mission;
}

/** Nuit (dans closeDay) : jauges qui reviennent vers 50, tensions, effets, échéance et nouvelle demande. */
export function processNeighbors(s: GameSnapshot, fx: EngineEffects, endedKey: string, season: CalendarSeason, rng: Rng): void {
  const v = s.village;
  const life = ensureLife(v);
  // 1. Jauges : retour doux vers 50, puis tensions du quotidien
  const next: Partial<Record<C.NeighborId, number>> = {};
  for (const n of C.NEIGHBORS) next[n.id] = stepToward(neighborGauge(v, n.id), C.NEIGHBOR_DEFAULT, C.NEIGHBOR_DRIFT);
  if (v.admin_pressure_pct > 60) next.ayuntamiento! -= C.NEIGHBOR_STRAIN;
  if (v.customs_alert_pct > 50) next.mossos! -= C.NEIGHBOR_STRAIN;
  if (v.insecurity_pct > 50) next.organya! -= C.NEIGHBOR_STRAIN;
  life.neighbors = Object.fromEntries(Object.entries(next).map(([k, x]) => [k, round2(gauge(x!))]));

  // 2. Effets des jauges
  const mairie = neighborStanding(neighborGauge(v, 'ayuntamiento'));
  if (mairie === 'good') v.admin_pressure_pct = gauge(v.admin_pressure_pct - C.NEIGHBOR_ADMIN_SHIFT);
  if (mairie === 'bad') v.admin_pressure_pct = gauge(v.admin_pressure_pct + C.NEIGHBOR_ADMIN_SHIFT);
  const mossos = neighborStanding(neighborGauge(v, 'mossos'));
  if (mossos === 'good') v.customs_alert_pct = gauge(v.customs_alert_pct - C.NEIGHBOR_CUSTOMS_SHIFT);
  if (mossos === 'bad') v.customs_alert_pct = gauge(v.customs_alert_pct + C.NEIGHBOR_CUSTOMS_SHIFT);

  // 3. Échéance d'une demande en cours : le dernier jour est passé sans réponse
  const cur = currentNeighborMission(v);
  if (cur && cur.mission.due_day <= endedKey) {
    const value = adjustNeighbor(v, cur.def.from, -cur.def.penalty);
    life.neighbor_last = { id: cur.def.id, outcome: 'failed', day: endedKey, delta: -cur.def.penalty };
    life.neighbor_mission = null;
    life.neighbor_next_day = addDaysToKey(endedKey, C.NEIGHBOR_MISSION_GAP + 1);
    const who = findNeighbor(cur.def.from)!;
    pushEvent(fx, s, {
      event_type: 'neighbor_mission_failed',
      title: `${NEIGHBOR_EVENT_PREFIX}${cur.def.title.toLowerCase()}, restée sans réponse`,
      body: `${cur.def.icon} ${cur.def.ask} Personne n’est venu (${cur.mission.done_steps}/${cur.def.steps}). ${who.short} s’en souviendra : relation −${cur.def.penalty} (${Math.round(value)}/100).`,
      data: { mission: cur.def.id, from: cur.def.from, gauge: value },
    });
  } else if (!cur && lifeOf(v).neighbor_mission) {
    life.neighbor_mission = null; // demande inconnue (dictionnaire changé)
  }

  // 4. Nouvelle demande pour le jour qui commence
  const today = addDaysToKey(endedKey, 1);
  if (!currentNeighborMission(v) && (!life.neighbor_next_day || life.neighbor_next_day <= today)) {
    const def = pickNeighborMission(s, season, rng);
    if (def) openMission(s, fx, def, today);
  }
}
