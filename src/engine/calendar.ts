/**
 * Calendrier réel (1 jour réel = 1 jour de jeu) — fuseau Europe/Madrid.
 * Une « saison de jeu » = 7 jours réels, du lundi 00:00 au dimanche 23:59 [GDD §1.2, §3.2].
 * La « saison calendaire » (printemps, été...) pilote les rendements agricoles.
 */
import { AGORA_HOUR_LOCAL, TIMEZONE } from './constants.ts';
import type { CalendarSeason } from './types.ts';

export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 1 = lundi ... 7 = dimanche */
  weekday: number;
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(date: Date): LocalParts {
  const parts: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? 'Mon'] ?? 1,
  };
}

/** Clé de jour local 'YYYY-MM-DD'. */
export function dayKey(date: Date): string {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

export function addDaysToKey(key: string, days: number): string {
  const ms = keyToUtcMs(key) + days * 86_400_000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Nombre de minuits locaux franchis entre deux instants (0 si même jour). */
export function midnightsBetween(from: Date, to: Date): number {
  if (to.getTime() <= from.getTime()) return 0;
  return Math.round((keyToUtcMs(dayKey(to)) - keyToUtcMs(dayKey(from))) / 86_400_000);
}

/** Jour de la semaine (1 = lundi ... 7 = dimanche) d'une clé de jour. */
export function weekdayOfKey(key: string): number {
  const js = new Date(keyToUtcMs(key)).getUTCDay(); // 0 = dimanche
  return js === 0 ? 7 : js;
}

/** Clé du lundi de la semaine locale contenant `date`. */
export function weekStartKey(date: Date): string {
  const key = dayKey(date);
  return addDaysToKey(key, 1 - weekdayOfKey(key));
}

/** Nombre de semaines (lundi→dimanche) séparant deux instants. */
export function weeksBetween(from: Date, to: Date): number {
  return Math.round((keyToUtcMs(weekStartKey(to)) - keyToUtcMs(weekStartKey(from))) / (7 * 86_400_000));
}

/** Décalage (minutes) entre l'heure murale de Madrid et UTC à un instant donné. */
function offsetMinutes(atUtcMs: number): number {
  const p = localParts(new Date(atUtcMs));
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((wall - atUtcMs) / 60_000);
}

/** Instant UTC correspondant à une heure locale de Madrid pour un jour donné. */
export function localTimeToUtc(key: string, hour = 0, minute = 0): Date {
  const guess = keyToUtcMs(key) + (hour * 60 + minute) * 60_000;
  let utc = guess - offsetMinutes(guess) * 60_000;
  utc = guess - offsetMinutes(utc) * 60_000; // second passage : changements d'heure
  return new Date(utc);
}

export function startOfLocalDay(key: string): Date {
  return localTimeToUtc(key, 0, 0);
}

export function calendarSeasonOf(month: number, day: number): CalendarSeason {
  const md = month * 100 + day;
  if (md >= 320 && md < 621) return 'spring';
  if (md >= 621 && md < 923) return 'summer';
  if (md >= 923 && md < 1221) return 'autumn';
  return 'winter';
}

export function calendarSeasonOfKey(key: string): CalendarSeason {
  const [, m, d] = key.split('-').map(Number) as [number, number, number];
  return calendarSeasonOf(m, d);
}

export function isSunday(date: Date): boolean {
  return localParts(date).weekday === 7;
}

/** Prochaine séance de l'Agora (dimanche 11:00, heure de Madrid), strictement après `from`. */
export function nextAgoraSession(from: Date): Date {
  const key = dayKey(from);
  const weekday = weekdayOfKey(key);
  const sundayKey = addDaysToKey(key, 7 - weekday);
  const session = localTimeToUtc(sundayKey, AGORA_HOUR_LOCAL, 0);
  return session.getTime() > from.getTime() ? session : localTimeToUtc(addDaysToKey(sundayKey, 7), AGORA_HOUR_LOCAL, 0);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isAfter(iso: string | null | undefined, now: Date): boolean {
  return iso != null && new Date(iso).getTime() > now.getTime();
}

export function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}
