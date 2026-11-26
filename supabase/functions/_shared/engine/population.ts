// FICHIER GÉNÉRÉ par scripts/sync-engine.mjs — ne pas modifier. Source : src/engine/population.ts
/** Comptages démographiques (Npop, travailleurs actifs, adultes fertiles...) [GDD §3.2]. */
import { ADULT_AGE, FERTILE_AGE_MAX, FERTILE_AGE_MIN } from './constants.ts';
import type { Child, GameSnapshot, Migrant, Player } from './types.ts';

export function activePlayers(s: GameSnapshot): Player[] {
  return s.players.filter((p) => p.is_active_slot && (p.status === 'active' || p.status === 'forced_labor'));
}

export function residents(s: GameSnapshot): Migrant[] {
  return s.migrants.filter((m) => m.status === 'accepted' || m.status === 'forced_labor');
}

export function candidates(s: GameSnapshot): Migrant[] {
  return s.migrants.filter((m) => m.status === 'candidate');
}

/** Enfant devenu adulte (diplômé, avocat ou majeur). */
export function isAdultChild(c: Child): boolean {
  return c.status === 'graduated' || c.status === 'lawyer' || (c.age_years >= ADULT_AGE && c.status !== 'law_student');
}

/** Enfants présents au hameau (les étudiants en droit sont à Lleida). */
export function presentChildren(s: GameSnapshot): Child[] {
  return s.children.filter((c) => c.status !== 'departed' && c.status !== 'law_student' && !isAdultChild(c));
}

export function adultChildren(s: GameSnapshot): Child[] {
  return s.children.filter((c) => c.status !== 'departed' && isAdultChild(c));
}

export interface PopulationCounts {
  founders: number;
  residents: number;
  adultChildren: number;
  children: number;
  apprentices: number;
  adults: number;
  /** Npop = fondateurs + résidents adultes + enfants et apprentis [GDD §3.2]. */
  total: number;
  /** Travailleurs actifs = joueurs + migrants + apprentis (+ jeunes diplômés) [GDD §2.1 Julio]. */
  workers: number;
  fertileAdults: number;
  seniors: number;
}

export function countPopulation(s: GameSnapshot): PopulationCounts {
  const founders = activePlayers(s).length;
  const res = residents(s);
  const adultKids = adultChildren(s);
  const kids = presentChildren(s);
  const apprentices = kids.filter((c) => c.status === 'apprentice').length;
  const adults = founders + res.length + adultKids.length;
  const fertileResidents = res.filter((m) => m.age >= FERTILE_AGE_MIN && m.age <= FERTILE_AGE_MAX).length;
  const fertileAdultKids = adultKids.filter((c) => c.age_years <= FERTILE_AGE_MAX).length;
  return {
    founders,
    residents: res.length,
    adultChildren: adultKids.length,
    children: kids.length,
    apprentices,
    adults,
    total: adults + kids.length,
    workers: founders + res.length + adultKids.length + apprentices,
    fertileAdults: founders + fertileResidents + fertileAdultKids,
    seniors: res.filter((m) => m.age > 50).length,
  };
}

/** Capacité d'hébergement PLU = lits des bâtisses opérationnelles (le gîte accueille des touristes). */
export function computeHousingCapacity(s: GameSnapshot): number {
  return s.structures
    .filter((st) => st.kind === 'building' && st.status === 'operational')
    .reduce((acc, st) => acc + st.beds_capacity, 0);
}

/** Bâtisses encore en ruine : refuges du marché noir [GDD §5.2]. */
export function countRuins(s: GameSnapshot): number {
  return s.structures.filter(
    (st) => ['building', 'gite', 'school', 'jail', 'lab'].includes(st.kind) && (st.status === 'ruin' || st.status === 'damaged'),
  ).length;
}

export function findPlayer(s: GameSnapshot, id: string | null | undefined): Player | undefined {
  return id ? s.players.find((p) => p.id === id) : undefined;
}

export function findMigrant(s: GameSnapshot, id: string | null | undefined): Migrant | undefined {
  return id ? s.migrants.find((m) => m.id === id) : undefined;
}

export function playerByRole(s: GameSnapshot, role: string): Player | undefined {
  return s.players.find((p) => p.role_code === role && p.is_active_slot);
}

export function holdsPortfolio(s: GameSnapshot, portfolio: string): boolean {
  return activePlayers(s).some((p) => (p.ministerial_portfolios as string[]).includes(portfolio));
}

export function structureByCode(s: GameSnapshot, code: string) {
  return s.structures.find((st) => st.code === code);
}

export function isOperational(s: GameSnapshot, code: string): boolean {
  const st = structureByCode(s, code);
  return st !== undefined && st.status === 'operational';
}
