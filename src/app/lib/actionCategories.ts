/**
 * Menu des actions par type (V4.4) : chaque action métier appartient à une catégorie affichée en
 * tuile dans l'écran Métier. Pur (aucun DOM) ; tests/app/actionHints.test.ts vérifie que toute
 * action du moteur (hors Action libre) est classée — une nouvelle action doit être ajoutée ici.
 */
import type { ActionDef } from '../engine.ts';

export interface ActionCategory {
  id: string;
  emoji: string;
  label: string;
  codes: readonly string[];
}

export const ACTION_CATEGORIES: readonly ActionCategory[] = [
  {
    id: 'vivres',
    emoji: '🌾',
    label: 'Vivres & élevage',
    codes: ['garden_tend', 'expand_garden', 'build_livestock_pen', 'buy_livestock', 'livestock_care', 'butcher_livestock', 'fish_hunt', 'repel_boars', 'make_preserves', 'make_cheese', 'make_ratafia'],
  },
  {
    id: 'chantiers',
    emoji: '🏗️',
    label: 'Chantiers & bâti',
    codes: ['plan_building', 'renovate_building', 'maintain_building', 'upgrade_building', 'improve_own_housing', 'clear_rubble', 'demolish_building', 'build_septic', 'track_maintenance', 'contribute_collective', 'vote_collective_project', 'cut_wood', 'forest_ban', 'lift_forest_ban', 'plu_inspection', 'eco_veto', 'lift_eco_veto'],
  },
  {
    id: 'reseaux',
    emoji: '⚡',
    label: 'Eau & énergie',
    codes: ['survey_land', 'lay_pipes', 'repair_pipes', 'build_dam', 'connect_power', 'install_generator', 'build_power_line', 'install_meters', 'build_solar', 'connect_mining_farm', 'rd_progress', 'build_microreactor'],
  },
  {
    id: 'atelier',
    emoji: '🔨',
    label: 'Forge & entretien',
    codes: ['forge_tools', 'recycle_scrap', 'forge_defense', 'repair_machinery', 'vehicle_maintenance'],
  },
  {
    id: 'sante',
    emoji: '🩺',
    label: 'Soins & santé',
    codes: ['rest', 'treat_muscular', 'preventive_strapping', 'treat_infectious', 'brew_remedies', 'analyze_water', 'withdrawal_cure', 'therapy'],
  },
  {
    id: 'argent',
    emoji: '💰',
    label: 'Argent & commerce',
    codes: ['private_work', 'market_sale', 'buy_supplies', 'hire_resident', 'fire_resident', 'financial_audit', 'pay_land_debt', 'transfer_sovereign_fund', 'set_carlage_fee', 'open_gite', 'close_gite', 'family_allowance', 'andorra_fiscal_scheme', 'smuggling_run'],
  },
  {
    id: 'village',
    emoji: '🎻',
    label: 'Vie du village',
    codes: ['spanish_lesson', 'banjo_evening', 'throw_tomatoes', 'sunday_mass', 'celebrate_marriage', 'hear_confession', 'mediation', 'train_apprentice', 'organize_banquet', 'bor_concert', 'run_for_office', 'campaign_speech', 'vote_election'],
  },
  {
    id: 'diplomatie',
    emoji: '🤝',
    label: 'Diplomatie & image',
    codes: ['diplomacy_ayuntamiento', 'negotiate_spain_andorra', 'international_recognition', 'editorial', 'counter_defamation'],
  },
  {
    id: 'ordre',
    emoji: '🛡️',
    label: 'Ordre & sécurité',
    codes: ['forest_patrol', 'guard_rounds', 'build_watchtower', 'ruin_search', 'dismantle_lab', 'dismantle_cell', 'detain_cachot', 'inspect_cargo', 'border_control', 'legal_defense'],
  },
  {
    id: 'candidats',
    emoji: '🧳',
    label: 'Résidents & candidats',
    codes: ['assign_work_post', 'cheer_resident', 'screen_migrant_physical', 'screen_migrant_medical', 'screen_migrant_psych'],
  },
];

export const FREE_ACTION_CODE = 'free_ai_action';

export function categoryOf(code: string): ActionCategory | undefined {
  return ACTION_CATEGORIES.find((c) => c.codes.includes(code));
}

export interface CategoryGroup {
  category: ActionCategory;
  actions: ActionDef[];
  /** Actions propres au métier ou aux portefeuilles du titulaire (pas « pour tous »). */
  ownCount: number;
}

/**
 * Regroupe les actions disponibles par catégorie, catégories vides retirées. Les catégories où le
 * titulaire a le plus d'actions de son métier passent en tête (ordre fixe à égalité).
 */
export function groupByCategory(actions: readonly ActionDef[]): CategoryGroup[] {
  const groups = ACTION_CATEGORIES.map((category) => {
    const list = category.codes.map((code) => actions.find((a) => a.code === code)).filter((a): a is ActionDef => a !== undefined);
    return { category, actions: list, ownCount: list.filter((a) => !a.anyone).length };
  }).filter((g) => g.actions.length > 0);
  const order = new Map(ACTION_CATEGORIES.map((c, i) => [c.id, i]));
  return groups.sort((a, b) => b.ownCount - a.ownCount || order.get(a.category.id)! - order.get(b.category.id)!);
}
