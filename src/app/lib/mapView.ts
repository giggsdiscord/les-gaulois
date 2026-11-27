/**
 * Carte du hameau (V4.7) — logique pure, sans DOM : cadrage (zoom / déplacement bornés au plan
 * 1000 × 700), icônes et calques des ouvrages, regroupement pour la liste, et « prochaine étape »
 * de chaque ouvrage (quoi faire, qui peut le faire). Testé dans tests/app/mapView.test.ts.
 */
import { buildingTypeOf, constants as C, getAction, needsPower, nextUpgrade, structureLevel, upgradeGains, type ActionDef } from '../engine.ts';
import type { GameData, Structure } from '../api/types.ts';
import { STRUCTURE_ACTION_KINDS } from './game.ts';
import { actorsOf } from './priorities.ts';

/**
 * Ouvrage visé par une action lancée depuis la fiche d'un ouvrage : lui-même si l'action le
 * concerne, sinon le bon ouvrage (ex. le groupe électrogène depuis une bâtisse sans courant).
 */
export function structurePreset(def: Pick<ActionDef, 'code' | 'target'>, s: Structure, structures: Structure[]): { target_structure_id?: string } {
  if (def.target !== 'structure') return {};
  const kinds = STRUCTURE_ACTION_KINDS[def.code];
  if (!kinds || kinds.includes(s.kind)) return { target_structure_id: s.id };
  const other = structures.find((x) => kinds.includes(x.kind) && x.status !== 'demolished');
  return other ? { target_structure_id: other.id } : {};
}

export const MAP_W = 1000;
export const MAP_H = 700;
/** Zoom maximal : 1000 / 180 ≈ ×5,5. */
export const MIN_VIEW_W = 180;

/** Cadre visible, en unités du plan (la hauteur découle du format de l'écran). */
export interface View {
  x: number;
  y: number;
  w: number;
}

/** Hauteur du cadre pour un format d'affichage (hauteur / largeur en pixels). */
export const viewHeight = (v: View, aspect: number) => v.w * aspect;

/** Borne le cadre au plan : largeur entre MIN_VIEW_W et tout le plan, jamais hors des bords. */
export function clampView(v: View, aspect: number): View {
  const maxW = Math.min(MAP_W, MAP_H / aspect);
  const w = Math.max(MIN_VIEW_W, Math.min(maxW, v.w));
  const h = w * aspect;
  const x = Math.max(0, Math.min(MAP_W - w, v.x));
  const y = Math.max(0, Math.min(MAP_H - h, v.y));
  return { x, y, w };
}

/** Cadre le plus large possible, centré (vue d'ensemble). */
export function fitView(aspect: number): View {
  const w = Math.min(MAP_W, MAP_H / aspect);
  return clampView({ x: (MAP_W - w) / 2, y: (MAP_H - w * aspect) / 2, w }, aspect);
}

/** Zoom de facteur `factor` (> 1 : rapproche) autour du point (px, py) du plan. */
export function zoomAt(v: View, factor: number, px: number, py: number, aspect: number): View {
  const w = v.w / factor;
  const ratio = w / v.w;
  return clampView({ x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio, w }, aspect);
}

/** Cadre centré sur un point, à la largeur donnée. */
export function centerOn(px: number, py: number, w: number, aspect: number): View {
  return clampView({ x: px - w / 2, y: py - (w * aspect) / 2, w }, aspect);
}

export function centerOf(s: Pick<Structure, 'x' | 'y' | 'width' | 'height' | 'path_points'>): [number, number] {
  if (s.path_points && s.path_points.length > 0) {
    const mid = s.path_points[Math.floor(s.path_points.length / 2)]!;
    return [mid[0]!, mid[1]!];
  }
  return [s.x + s.width / 2, s.y + s.height / 2];
}

// ---------------------------------------------------------------------------
// Icônes, calques, groupes
// ---------------------------------------------------------------------------
export const KIND_ICON: Record<string, string> = {
  building: '🏠', church: '⛪', forge: '⚒️', school: '🏫', jail: '🗝️', gite: '🏡', water_source: '💧', pipe: '🚰',
  septic_tank: '🚽', power_line: '🗼', generator: '⚡', dam: '🌊', solar: '☀️', mining_farm: '💻', garden: '🥕',
  livestock_pen: '🐑', track: '🛤️', watchtower: '🔭', gate: '🚧', square: '🏛️', river: '🎣', forest: '🌲', lab: '🧪',
  border_post: '🛂',
};

export const KIND_LABEL: Record<string, string> = {
  building: 'Bâtisse habitable', church: 'Église', forge: 'Forge', school: 'École', jail: 'Cachot', gite: 'Gîte rural',
  water_source: 'Captage d\'eau', pipe: 'Conduite d\'eau', septic_tank: 'Fosse septique', power_line: 'Ligne électrique',
  generator: 'Groupe électrogène', dam: 'Micro-barrage', solar: 'Champ solaire', mining_farm: 'Ferme de minage',
  garden: 'Potager', livestock_pen: 'Enclos', track: 'Piste forestière', watchtower: 'Mirador', gate: 'Herse',
  square: 'Place du village', river: 'Rivière', forest: 'Forêt', lab: 'Laboratoire', border_post: 'Poste-frontière',
};

/** Icône d'un ouvrage : celle du nouveau bâtiment (V5.4) s'il en est un, sinon celle de son type. */
export function structureIcon(s: Pick<Structure, 'kind' | 'variant'>): string {
  return buildingTypeOf(s)?.icon ?? KIND_ICON[s.kind] ?? '📍';
}

export function structureLabel(s: Pick<Structure, 'kind' | 'variant'>): string {
  return buildingTypeOf(s)?.label ?? KIND_LABEL[s.kind] ?? s.kind;
}

/** Ouvrages représentés comme des tracés ou des surfaces (pas de pastille). */
export const LANDSCAPE_KINDS = ['forest', 'river', 'track', 'pipe', 'power_line'];

export type LayerId = 'all' | 'todo' | 'housing' | 'works' | 'energy' | 'water';

export const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'todo', label: '🎯 À faire' },
  { id: 'housing', label: '🏠 Logements' },
  { id: 'works', label: '🏗️ Chantiers' },
  { id: 'energy', label: '⚡ Énergie' },
  { id: 'water', label: '💧 Eau' },
];

const ENERGY_KINDS = ['generator', 'power_line', 'dam', 'solar', 'mining_farm'];
const WATER_KINDS = ['water_source', 'pipe', 'septic_tank', 'river', 'dam'];

/** Ouvrage qui demande une intervention (chantier, raccordement, fuite, dégât, priorité du moment). */
export function needsAttention(s: Structure, priorityIds: ReadonlySet<string>): boolean {
  return priorityIds.has(s.id) || s.status === 'awaiting_power' || s.status === 'in_progress' || s.status === 'damaged' || s.leak_alert || s.eco_veto_active;
}

export function inLayer(s: Structure, layer: LayerId, priorityIds: ReadonlySet<string>): boolean {
  switch (layer) {
    case 'all':
      return true;
    case 'todo':
      return needsAttention(s, priorityIds);
    case 'housing':
      return (s.kind === 'building' && !buildingTypeOf(s)) || s.kind === 'gite';
    case 'works':
      return ['ruin', 'cleared', 'in_progress', 'damaged', 'awaiting_power', 'planned'].includes(s.status) && !LANDSCAPE_KINDS.includes(s.kind);
    case 'energy':
      return ENERGY_KINDS.includes(s.kind) || s.status === 'awaiting_power' || s.is_power_connected;
    case 'water':
      return WATER_KINDS.includes(s.kind) || s.leak_alert;
  }
}

export interface StructureGroup {
  id: string;
  label: string;
  items: Structure[];
}

/** Groupes de la vue « Liste », du plus pressant au plus calme. */
export function groupStructures(structures: Structure[], priorityIds: ReadonlySet<string>): StructureGroup[] {
  const visible = structures.filter((s) => s.status !== 'demolished');
  const taken = new Set<string>();
  const pick = (id: string, label: string, test: (s: Structure) => boolean): StructureGroup => {
    const items = visible.filter((s) => !taken.has(s.id) && test(s)).sort((a, b) => b.progress_pct - a.progress_pct || a.name.localeCompare(b.name));
    for (const s of items) taken.add(s.id);
    return { id, label, items };
  };
  return [
    pick('attention', 'À traiter en priorité', (s) => priorityIds.has(s.id) || s.status === 'awaiting_power' || s.leak_alert || s.status === 'damaged'),
    pick('works', 'Chantiers en cours', (s) => s.status === 'in_progress' || s.status === 'cleared'),
    pick('ruins', 'Ruines à rénover', (s) => s.status === 'ruin'),
    pick('planned', 'Projets', (s) => s.status === 'planned'),
    pick('ok', 'En service', (s) => !LANDSCAPE_KINDS.includes(s.kind) || s.kind === 'pipe'),
    pick('landscape', 'Paysage & réseaux', () => true),
  ].filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------------------
// Prochaine étape d'un ouvrage
// ---------------------------------------------------------------------------
export interface NextStep {
  /** Ce qu'il faut faire, en clair. */
  text: string;
  /** Action du moteur correspondante (null : rien à faire, ou se joue ailleurs). */
  actionCode: string | null;
  who: string | null;
  mine: boolean;
}

type StepData = Pick<GameData, 'me' | 'players' | 'village'>;

const BUILDING_KINDS = ['building', 'gite', 'school', 'jail', 'lab', 'church', 'forge', 'border_post'];

/** Séances de rénovation restantes (12 points par séance × facilité du bâtiment, selon la productivité du village). */
export function sessionsLeft(s: Pick<Structure, 'progress_pct'>, productivityPct: number, ease = 1): number {
  const perSession = Math.max(1, Math.round((12 * ease * productivityPct) / 100));
  return Math.max(1, Math.ceil((100 - s.progress_pct) / perSession));
}

export function nextStepFor(s: Structure, data: StepData): NextStep {
  const v = data.village;
  const step = (text: string, code: string | null): NextStep => {
    if (!code) return { text, actionCode: null, who: null, mine: false };
    const def = getAction(code);
    if (!def || (def.minAct && v.act_number < def.minAct)) return { text, actionCode: null, who: null, mine: false };
    return { text, actionCode: code, ...actorsOf(code, data) };
  };
  const later = (act: number, what: string): NextStep => step(`${what} — possible à l'Acte ${act === 2 ? 'II' : 'III'} (autonomie ${act === 2 ? 35 : 85} %).`, null);

  if (s.eco_veto_active) return step('Veto écologique en cours : le chantier est suspendu tant qu\'Ely ne le lève pas.', 'lift_eco_veto');

  const type = buildingTypeOf(s);
  if (BUILDING_KINDS.includes(s.kind)) {
    if (s.status === 'awaiting_power') {
      return v.energy_tier >= 2
        ? step('Chantier terminé : il ne reste qu\'à la raccorder au courant (120 € de câbles) pour la livrer.', 'connect_power')
        : step('Chantier terminé, mais le hameau n\'a pas d\'électricité : installer d\'abord le groupe électrogène.', 'install_generator');
    }
    if (s.status === 'damaged') return step(`Endommagée (état ${s.condition_pct} %) : réparer (300 € de matériaux par séance) jusqu'à 60 % d'état.`, 'renovate_building');
    if (['ruin', 'cleared', 'in_progress', 'planned'].includes(s.status)) {
      const n = sessionsLeft(s, v.productivity_modifier_pct, type?.ease ?? 1);
      const start = s.status === 'ruin' ? 'Rénover (on peut d\'abord déblayer les gravats pour récupérer de la pierre)' : type && s.status === 'planned' ? 'Lancer le chantier' : 'Poursuivre le chantier';
      const power = type && needsPower(s) ? ' Il faudra ensuite le raccorder au courant.' : '';
      return step(`${start} : environ ${n} séance${n > 1 ? 's' : ''} de 300 €, 5 pierres et 5 bois chacune${s.plu_approved ? '' : ', avec l\'accord PLU de Tiphaine'}.${power}`, 'renovate_building');
    }
    if (s.kind === 'gite' && !v.gite_open) return step('Le gîte est prêt : l\'ouvrir rapporte 800 à 2 500 € par semaine.', 'open_gite');
    // Usure (V5.5) : entretien conseillé sous WEAR_WARN_AT
    if (s.status === 'operational' && s.condition_pct < C.WEAR_WARN_AT) {
      return step(`Usée (état ${s.condition_pct} %) : l'entretenir (${C.MAINTAIN_STONE} pierres et ${C.MAINTAIN_IRON} fer par séance) avant qu'elle ne s'abîme sous ${C.WEAR_DAMAGED_AT} %.`, 'maintain_building');
    }
    if (type) return step(`En service : ${type.effect}`, type.id === 'sawmill' ? 'cut_wood' : type.id === 'cheese_dairy' && v.livestock_count < 2 ? 'buy_livestock' : null);
    if (s.kind === 'church') return step('Messe du dimanche : moral du village +12 %.', 'sunday_mass');
    if (s.kind === 'forge') return step('Forger des outils : un par travailleur évite −35 % de rendement.', 'forge_tools');
    if (s.kind === 'lab') return step('Préparer remèdes et décoctions, ou faire avancer la R&D.', 'brew_remedies');
    if (s.kind === 'school') return step('Former les apprentis (enfants de 12 ans et plus).', 'train_apprentice');
    if (s.kind === 'jail') return step('Cachot prêt : isolement de 24 h sur décision du ministre de l\'Intérieur.', 'detain_cachot');
    if (s.kind === 'border_post') return step('Tenir le poste-frontière : contrôle des passeports.', 'border_control');
    const up = nextUpgrade(s);
    if (s.kind === 'building' && s.beds_capacity > 0 && up && s.condition_pct < C.UPGRADE_MIN_CONDITION) {
      return step(`Habitable : ${s.beds_capacity} lits. Pour passer au niveau ${up.level} (${upgradeGains(s).slice(0, 2).join(', ')}), l'entretenir d'abord jusqu'à ${C.UPGRADE_MIN_CONDITION} % d'état.`, 'maintain_building');
    }
    if (s.kind === 'building' && s.beds_capacity > 0 && up) {
      return step(`Habitable : ${s.beds_capacity} lits (niveau ${structureLevel(s)}). Niveau ${up.level} : ${upgradeGains(s).join(', ')} — ${up.price_eur} €, ${up.stone} pierres, ${up.iron} fer, ${up.wood} bois.`, 'upgrade_building');
    }
    return step(s.beds_capacity > 0 ? `Habitable : ${s.beds_capacity} lits.` : 'En service.', s.kind === 'building' ? 'improve_own_housing' : null);
  }

  switch (s.kind) {
    case 'generator':
      return s.status === 'operational' || v.energy_tier >= 2
        ? step('Le groupe tourne au gasoil : surveiller la réserve (Trésor → Réserves).', null)
        : step('Installer le groupe électrogène : 2 800 €, première source d\'électricité du hameau.', 'install_generator');
    case 'power_line':
      if (v.energy_tier >= 3) return step('Ligne en service : le hameau est sur le réseau.', null);
      if (v.energy_tier < 2) return step('Après le groupe électrogène : tirer la ligne aérienne (palier 3).', 'install_generator');
      return step(`Tirer la ligne aérienne : 1 500 € par séance (avancement ${s.progress_pct} %), bloqué si la pression administrative atteint 60 %.`, 'build_power_line');
    case 'solar':
      if (s.status === 'operational') return step('Champ solaire en service.', null);
      return v.act_number < 2 ? later(2, 'Champ solaire (palier 4)') : step(`Construire le champ solaire : 3 000 € par séance (avancement ${s.progress_pct} %).`, 'build_solar');
    case 'dam':
      if (s.status === 'operational') return step('Micro-barrage en service.', null);
      return v.act_number < 2 ? later(2, 'Micro-barrage (palier 4)') : step(`Construire le micro-barrage : 2 500 € par séance, après la cartographie des 30 ha (avancement ${s.progress_pct} %).`, 'build_dam');
    case 'mining_farm':
      if (s.status === 'operational') return step('Ferme de minage en service.', null);
      return v.act_number < 3 ? later(3, 'Ferme de minage') : step('Installer la ferme de minage : 4 000 €, surplus électrique requis.', 'connect_mining_farm');
    case 'livestock_pen':
      return s.status === 'operational'
        ? step('Enclos prêt : acheter des bêtes à la foire de Lleida (140 € par tête).', 'buy_livestock')
        : step(`Construire l'enclos : 350 € et 8 bois par séance (avancement ${s.progress_pct} %).`, 'build_livestock_pen');
    case 'watchtower':
    case 'gate':
      if (s.status === 'operational') return step('Ouvrage de défense en service : −3 d\'insécurité.', null);
      return v.act_number < 2 ? later(2, 'Mirador et herse') : step(`Poser l'ouvrage : 400 € et 6 bois par séance (avancement ${s.progress_pct} %).`, 'build_watchtower');
    case 'pipe':
      return s.leak_alert || v.water_network_condition_pct < 60
        ? step(`Réseau à ${Math.round(v.water_network_condition_pct)} %${s.leak_alert ? ' et fuite signalée' : ''} : inspecter et réparer.`, 'repair_pipes')
        : step(`Réseau en état (${Math.round(v.water_network_condition_pct)} %) : poser des canalisations ajoute 800 L par jour.`, 'lay_pipes');
    case 'water_source':
      return step('Analyser l\'eau : la traite et stoppe une épidémie en incubation.', 'analyze_water');
    case 'septic_tank':
      return step('Une fosse de plus accueille 6 habitants de plus (1 200 €).', 'build_septic');
    case 'garden':
      return step(`Potager de ${v.garden_area_m2} m² : l'entretenir donne une récolte immédiate, l'agrandir nourrit le village pour toujours.`, 'garden_tend');
    case 'track':
      return v.track_condition_pct < 60
        ? step(`Piste à ${Math.round(v.track_condition_pct)} % : l'empierrer (5 pierres) ; sous 40 %, les livraisons coûtent 40 % de plus.`, 'track_maintenance')
        : step(`Piste praticable (${Math.round(v.track_condition_pct)} %).`, null);
    case 'forest':
      return step('Surveiller les parcelles : détruit les cultures clandestines.', 'forest_patrol');
    case 'river':
      return step('Pêche & chasse : des rations selon la saison (débit réservé respecté).', 'fish_hunt');
    case 'square':
      return step('L\'Agora se tient ici le dimanche à 11 h : votes, Tribunal, Constitution.', null);
    default:
      return step('En service.', null);
  }
}
