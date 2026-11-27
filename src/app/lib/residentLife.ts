/**
 * Personnalité des résidents vue par l'interface (V5.7) : caractère, humeur, ami / rival, dernière
 * petite histoire. Relit les règles du moteur (`personality.ts`). Pur (aucun DOM) : testé dans
 * tests/app/residentLife.test.ts.
 */
import {
  constants as C,
  dayKey,
  firstName,
  lifeOf,
  MOOD_ICON,
  MOOD_LABEL,
  moodLevel,
  moodOf,
  personalityFactor,
  temperOf,
  traitsOf,
  type MoodLevel,
  type ResidentStory,
} from '../engine.ts';
import type { GameData, PublicMigrant } from '../api/types.ts';

export interface ResidentPersona {
  temper: C.TemperDef;
  mood: number;
  level: MoodLevel;
  moodLabel: string;
  moodIcon: string;
  /** Effet sur le rendement au poste (1 = neutre), en clair : « +10 % », « −15 % » ou ''. */
  yieldText: string;
  /** Variation de la dernière nuit et sa raison principale (null avant la première nuit). */
  lastDelta: number | null;
  lastReason: string | null;
  friend: string | null;
  rival: string | null;
  cheeredToday: boolean;
}

function nameOf(migrants: readonly PublicMigrant[], id: string | null | undefined): string | null {
  const m = id ? migrants.find((x) => x.id === id) : undefined;
  return m ? firstName(m) : null;
}

export function residentPersona(m: PublicMigrant, migrants: readonly PublicMigrant[], now: Date): ResidentPersona {
  const t = traitsOf(m);
  const mood = moodOf(m);
  const level = moodLevel(mood);
  const pct = Math.round((personalityFactor(m) - 1) * 100);
  return {
    temper: temperOf(m),
    mood,
    level,
    moodLabel: MOOD_LABEL[level],
    moodIcon: MOOD_ICON[level],
    yieldText: pct > 0 ? `+${pct} %` : pct < 0 ? `−${-pct} %` : '',
    lastDelta: typeof t.mood_delta === 'number' ? t.mood_delta : null,
    lastReason: t.mood_reason || null,
    friend: nameOf(migrants, t.friend_id),
    rival: nameOf(migrants, t.rival_id),
    cheeredToday: t.cheered_day === dayKey(now),
  };
}

/** Résidents maussades (humeur sous le seuil), les plus tristes d'abord. */
export function sulkingResidents(migrants: readonly PublicMigrant[]): PublicMigrant[] {
  return migrants
    .filter((m) => (m.status === 'accepted' || m.status === 'forced_labor') && moodOf(m) < C.MOOD_SULK_AT)
    .sort((a, b) => moodOf(a) - moodOf(b) || a.id.localeCompare(b.id));
}

/** Dernière petite histoire des résidents (publiée par le moteur), ou null. */
export function lastStory(data: Pick<GameData, 'village'>): ResidentStory | null {
  return lifeOf(data.village).story_last ?? null;
}
