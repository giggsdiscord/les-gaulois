/**
 * Niveaux & usure d'une bâtisse vus par l'interface (V5.5) : pur, testé dans
 * `tests/app/upkeep.test.ts`. Relit les règles du moteur (`wearPerNight`, `nextUpgrade`,
 * `upgradeGains`, `upgradeBlocker`, `maintainBlocker`) pour la fiche d'un ouvrage.
 */
import {
  calendarSeasonOfKey,
  constants as C,
  dayKey,
  maintainBlocker,
  nextUpgrade,
  nightsBeforeDamage,
  structureLevel,
  UPGRADABLE_KINDS,
  upgradeBlocker,
  upgradeGains,
  wearPerNight,
  WEARING_KINDS,
  type MapStructure,
  type VillageState,
} from '../engine.ts';

export interface UpkeepView {
  level: number;
  maxLevel: number;
  upgradable: boolean;
  /** Points d'état perdus par nuit en ce moment (0 si la bâtisse ne s'use pas). */
  wear: number;
  /** Nuits avant de passer « endommagée » sans entretien. */
  nightsLeft: number | null;
  /** À entretenir (sous le seuil conseillé). */
  worn: boolean;
  next: C.UpgradeStep | undefined;
  gains: string[];
  upgradeBlocked: string | null;
  maintainBlocked: string | null;
}

type Village = Pick<VillageState, 'real_temp_min_c' | 'stone_stock' | 'iron_stock' | 'wood_stock' | 'treasury_eur'>;

/** Vue d'entretien d'un ouvrage ; null si ce n'est pas une bâtisse. */
export function upkeepView(st: MapStructure, v: Village, now: Date): UpkeepView | null {
  if (!WEARING_KINDS.includes(st.kind)) return null;
  const season = calendarSeasonOfKey(dayKey(now));
  const next = nextUpgrade(st);
  return {
    level: structureLevel(st),
    maxLevel: C.UPGRADE_MAX_LEVEL,
    upgradable: UPGRADABLE_KINDS.includes(st.kind),
    wear: wearPerNight(st, season, v.real_temp_min_c),
    nightsLeft: nightsBeforeDamage(st, season, v.real_temp_min_c),
    worn: st.status === 'operational' && st.condition_pct < C.WEAR_WARN_AT,
    next,
    gains: upgradeGains(st),
    upgradeBlocked: next ? upgradeBlocker(st, v) : null,
    maintainBlocked: maintainBlocker(st, v),
  };
}

/** Texte court du rythme d'usure (« −0,4 % par nuit · endommagée dans ~25 nuits »). */
export function wearText(u: UpkeepView): string {
  if (u.wear <= 0) return 'Pas d\'usure tant qu\'elle n\'est pas en service.';
  const rate = `−${String(u.wear).replace('.', ',')} % d'état par nuit`;
  if (u.nightsLeft === null) return rate;
  return u.nightsLeft <= 0 ? `${rate} · à entretenir tout de suite` : `${rate} · endommagée dans ~${u.nightsLeft} nuit${u.nightsLeft > 1 ? 's' : ''} sans entretien`;
}
