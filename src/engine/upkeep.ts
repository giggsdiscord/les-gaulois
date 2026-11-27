/**
 * Niveaux & usure des bâtisses (V5.5) [GDD §5.7].
 *
 * Usure : chaque nuit, une bâtisse en service perd un peu d'état (plus l'hiver et les nuits de
 * gel, moins aux niveaux supérieurs). `condition_pct` est entier : la part fractionnaire attend
 * dans `life.wear_acc`. Sous WEAR_DAMAGED_AT, la bâtisse devient « endommagée » : ses lits et
 * son effet sont perdus jusqu'à la réparation (rénovation ou résidents du chantier).
 * Entretien : action `maintain_building` (pierre + fer) ou résidents du poste « chantier ».
 * Amélioration : action `upgrade_building` (colonne `upgrade_level`, 1 à UPGRADE_MAX_LEVEL) :
 * +2 lits (logements, gîte), meilleure isolation (moins de bois brûlé), +50 % de production
 * (nouveaux bâtiments), usure plus lente.
 */
import * as C from './constants.ts';
import { pushEvent } from './effects.ts';
import { ensureLife, lifeOf, structureLevel } from './life.ts';
import type { CalendarSeason, EngineEffects, GameSnapshot, MapStructure, VillageState } from './types.ts';

/** Bâtisses qui s'usent et s'entretiennent (mêmes types que les chantiers de bâtisse). */
export const WEARING_KINDS: readonly MapStructure['kind'][] = ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'];
/** Bâtisses améliorables par niveaux : logements, nouveaux bâtiments et gîte. */
export const UPGRADABLE_KINDS: readonly MapStructure['kind'][] = ['building', 'gite'];

type WearView = Pick<MapStructure, 'kind' | 'status' | 'upgrade_level'>;

/** Usure de cette nuit (points d'état), 0 si la bâtisse ne s'use pas. */
export function wearPerNight(st: WearView, season: CalendarSeason, tempMinC: number): number {
  if (!WEARING_KINDS.includes(st.kind) || st.status !== 'operational') return 0;
  const base = C.WEAR_PER_NIGHT[season] + (Number.isFinite(tempMinC) && tempMinC < 0 ? C.WEAR_FROST_EXTRA : 0);
  const slow = Math.max(0.2, 1 - C.WEAR_LEVEL_REDUCTION * (structureLevel(st) - 1));
  return Math.round(base * slow * 100) / 100;
}

/** Nombre de nuits avant que la bâtisse ne passe « endommagée » à ce rythme (null : pas d'usure). */
export function nightsBeforeDamage(st: WearView & Pick<MapStructure, 'condition_pct'>, season: CalendarSeason, tempMinC: number): number | null {
  const rate = wearPerNight(st, season, tempMinC);
  if (rate <= 0) return null;
  return Math.max(0, Math.ceil((st.condition_pct - C.WEAR_DAMAGED_AT) / rate));
}

/** Chaque nuit (closeDay, après les bâtiments) : usure des bâtisses en service. */
export function processWear(s: GameSnapshot, fx: EngineEffects, season: CalendarSeason): void {
  const v = s.village;
  const acc: Record<string, number> = { ...(lifeOf(v).wear_acc ?? {}) };
  let changed = false;
  for (const st of s.structures) {
    const rate = wearPerNight(st, season, v.real_temp_min_c);
    if (rate <= 0) continue;
    const total = (acc[st.id] ?? 0) + rate;
    const whole = Math.floor(total);
    acc[st.id] = Math.round((total - whole) * 100) / 100;
    changed = true;
    if (whole <= 0) continue;
    st.condition_pct = Math.max(0, st.condition_pct - whole);
    if (st.condition_pct < C.WEAR_DAMAGED_AT) {
      st.status = 'damaged';
      delete acc[st.id];
      pushEvent(fx, s, {
        event_type: 'structure_worn_out',
        title: 'Bâtisse usée',
        body: `Faute d'entretien, « ${st.name} » est endommagée (état ${st.condition_pct} %) : ${st.beds_capacity > 0 ? `${st.beds_capacity} lits perdus` : 'elle ne sert plus'} jusqu'à la réparation.`,
        data: { structure_id: st.id, condition_pct: st.condition_pct },
      });
    }
  }
  if (changed) ensureLife(v).wear_acc = acc;
}

/** Bâtisses en service à entretenir (état sous le seuil), les plus abîmées d'abord. */
export function wornStructures<T extends MapStructure>(s: { structures: readonly T[] }, below: number = C.WEAR_WARN_AT): T[] {
  return s.structures
    .filter((st) => WEARING_KINDS.includes(st.kind) && st.status === 'operational' && st.condition_pct < below)
    .sort((a, b) => a.condition_pct - b.condition_pct || a.id.localeCompare(b.id));
}

type Stocks = Pick<VillageState, 'stone_stock' | 'iron_stock' | 'wood_stock' | 'treasury_eur'>;

/** Raison pour laquelle l'entretien est impossible (null : possible), hors PA. */
export function maintainBlocker(st: MapStructure | undefined, v: Stocks): string | null {
  if (!st) return 'Choisissez une bâtisse.';
  if (!WEARING_KINDS.includes(st.kind)) return 'Seule une bâtisse s\'entretient.';
  if (st.status === 'damaged') return `« ${st.name} » est endommagée : il faut la réparer (rénovation).`;
  if (st.status !== 'operational') return `« ${st.name} » n'est pas en service.`;
  if (st.condition_pct >= 100) return `« ${st.name} » est en parfait état.`;
  if (v.stone_stock < C.MAINTAIN_STONE || v.iron_stock < C.MAINTAIN_IRON) {
    return `L'entretien demande ${C.MAINTAIN_STONE} pierres et ${C.MAINTAIN_IRON} fer (réserve : ${Math.floor(v.stone_stock)} pierres, ${Math.floor(v.iron_stock)} fer).`;
  }
  return null;
}

/** Prochain niveau de cette bâtisse (undefined : niveau maximal ou non améliorable). */
export function nextUpgrade(st: Pick<MapStructure, 'kind' | 'upgrade_level'>): C.UpgradeStep | undefined {
  if (!UPGRADABLE_KINDS.includes(st.kind)) return undefined;
  return C.UPGRADE_STEPS.find((u) => u.level === structureLevel(st) + 1);
}

/** Ce que le prochain niveau apporte, en clair. */
export function upgradeGains(st: Pick<MapStructure, 'kind' | 'variant' | 'upgrade_level' | 'beds_capacity'>): string[] {
  const next = nextUpgrade(st);
  if (!next) return [];
  const out: string[] = [];
  const isNew = st.kind === 'building' && !!st.variant;
  if (!isNew && (st.kind === 'gite' || st.beds_capacity > 0)) out.push(`+${C.UPGRADE_BEDS_PER_LEVEL} lits`);
  if (isNew) out.push(`production +${Math.round(C.UPGRADE_OUTPUT_BONUS * 100)} %`);
  const heat = C.UPGRADE_HEATING_FACTOR[next.level - 1];
  if (!isNew && heat !== undefined) out.push(`isolation : ${Math.round((1 - heat) * 100)} % de bois de chauffage en moins`);
  out.push(`usure −${Math.round(C.WEAR_LEVEL_REDUCTION * (next.level - 1) * 100)} %`);
  return out;
}

/** Raison pour laquelle l'amélioration est impossible (null : possible), hors PA, PLU et budget. */
export function upgradeBlocker(st: MapStructure | undefined, v: Stocks): string | null {
  if (!st) return 'Choisissez une bâtisse.';
  if (!UPGRADABLE_KINDS.includes(st.kind)) return 'Seuls les logements, le gîte et les nouveaux bâtiments s\'améliorent.';
  if (st.status !== 'operational') return `« ${st.name} » doit être en service pour être améliorée.`;
  const next = nextUpgrade(st);
  if (!next) return `« ${st.name} » est déjà au niveau maximal (${C.UPGRADE_MAX_LEVEL}).`;
  if (st.condition_pct < C.UPGRADE_MIN_CONDITION) return `État ${st.condition_pct} % : entretenez d'abord la bâtisse (${C.UPGRADE_MIN_CONDITION} % minimum).`;
  const missing: string[] = [];
  if (v.stone_stock < next.stone) missing.push(`${next.stone} pierres`);
  if (v.iron_stock < next.iron) missing.push(`${next.iron} fer`);
  if (v.wood_stock < next.wood) missing.push(`${next.wood} bois`);
  if (missing.length > 0) return `Niveau ${next.level} : il manque des matériaux (${missing.join(', ')}).`;
  return null;
}

/** Applique le niveau suivant (matériaux et argent payés par l'appelant) ; renvoie le nouveau niveau. */
export function applyUpgrade(st: MapStructure): number {
  const next = nextUpgrade(st);
  if (!next) throw new Error('Niveau maximal atteint.');
  const isNew = st.kind === 'building' && !!st.variant;
  if (!isNew && (st.kind === 'gite' || st.beds_capacity > 0)) st.beds_capacity += C.UPGRADE_BEDS_PER_LEVEL;
  st.upgrade_level = next.level;
  return next.level;
}

/** Multiplicateur de production d'un nouveau bâtiment selon son niveau. */
export function outputFactor(st: Pick<MapStructure, 'upgrade_level'> | undefined): number {
  return st ? 1 + C.UPGRADE_OUTPUT_BONUS * (structureLevel(st) - 1) : 1;
}
