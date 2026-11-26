/**
 * « À faire en priorité » (V4.6) : ce qui fait avancer le hameau maintenant, et pourquoi.
 *
 * Lit l'état public (village, bâtisses, population) et le calcul d'autonomie du moteur
 * (6 piliers : énergie 25, eau 15, nourriture 20, dette 20, logement 10, souveraineté 10 ;
 * Acte II à 35 %, Acte III à 85 %) pour proposer l'étape suivante de chaque chantier :
 * ce qu'il faut faire, pourquoi, qui peut le faire, les verrous (PLU, budget) et ce que ça
 * rapporte. Les urgences (vivres, outils, caisse, réseau d'eau…) passent devant.
 * Pur (aucun DOM) : testé dans tests/app/priorities.test.ts.
 */
import {
  calendarSeasonOfKey,
  computeAutonomy,
  computeWaterBalance,
  constants as C,
  countPopulation,
  dailyFoodConsumption,
  dayKey,
  getAction,
  heatingNeed,
  type ActionDef,
  type AutonomyBreakdown,
  type GameSnapshot,
} from '../engine.ts';
import type { ActionInput, GameData, Structure } from '../api/types.ts';
import { eur } from './format.ts';
import { availableActions } from './game.ts';

export type PillarId = 'energy' | 'water' | 'food' | 'debt' | 'housing' | 'sovereignty';

export interface Pillar {
  id: PillarId;
  emoji: string;
  label: string;
  value: number;
  max: number;
  /** Comment gagner des points sur ce pilier, selon l'état actuel. */
  tip: string;
}

export interface PriorityItem {
  key: string;
  emoji: string;
  /** Ce qu'il faut faire. */
  title: string;
  /** Le pourquoi en une phrase (carte d'accueil). */
  short: string;
  /** Pourquoi c'est important maintenant (détail). */
  why: string;
  /** Verrous, coûts, prérequis et étapes suivantes. */
  steps: string[];
  /** Ce que ça rapporte (points d'autonomie, argent…). */
  gain: string | null;
  /** Action du moteur à lancer (null : se joue ailleurs, ex. à l'Agora). */
  actionCode: string | null;
  preset?: Partial<ActionInput>;
  /** Écran où agir quand ce n'est pas une action du Métier. */
  route?: { name: string; param?: string };
  /** Qui peut le faire (prénoms). */
  who: string;
  /** Le joueur courant peut le faire lui-même. */
  mine: boolean;
  urgent: boolean;
  score: number;
}

export interface PriorityPlan {
  act: number;
  autonomy: number;
  nextAct: { act: 2 | 3; at: number } | null;
  pillars: Pillar[];
  items: PriorityItem[];
}

export type PriorityData = Pick<GameData, 'me' | 'village' | 'players' | 'migrants' | 'children' | 'structures' | 'constitution'>;

/** Adapte l'état public au format du moteur (les champs cachés ne servent pas au calcul d'autonomie). */
function snapshotOf(data: PriorityData): GameSnapshot {
  return {
    village: data.village,
    players: data.players,
    migrants: data.migrants,
    children: data.children,
    structures: data.structures,
    unions: [],
    approvals: [],
    temptations: [],
    constitution: data.constitution,
  } as unknown as GameSnapshot;
}

const PORTFOLIO_HOLDER: Record<string, string> = {
  defense: 'le ministre de la Défense',
  interior: 'le ministre de l\'Intérieur',
  customs: 'le ministre des Transports & Douanes',
  chancery: 'le Chancelier',
  media: 'le ministre des Médias',
};

function joinOr(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'personne pour l\'instant';
  return `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export type ActorData = Pick<GameData, 'me' | 'players' | 'village'>;

/** Qui peut faire une action (prénoms, « vous » pour le joueur courant) et si le joueur le peut. */
export function actorsOf(code: string, data: ActorData): { who: string; mine: boolean } {
  const def = getAction(code);
  if (!def) return { who: '—', mine: false };
  const mine = availableActions(data.me, data.village.act_number).some((a) => a.code === code);
  if (def.anyone) return { who: 'Tout le monde', mine };
  const names = data.players
    .filter((p) => p.is_active_slot && p.status !== 'banished' && p.status !== 'executed' && (def.roles as readonly string[] | undefined)?.includes(p.role_code))
    .map((p) => (p.id === data.me.id ? 'vous' : p.display_name));
  if (def.portfolio) names.push(data.me.ministerial_portfolios.includes(def.portfolio) ? 'vous' : PORTFOLIO_HOLDER[def.portfolio] ?? def.portfolio);
  return { who: joinOr([...new Set(names)]), mine };
}

/** Planificateur : construit les recommandations à partir de l'état. */
class Planner {
  readonly items: PriorityItem[] = [];
  readonly s: GameSnapshot;
  readonly v: PriorityData['village'];

  constructor(readonly data: PriorityData) {
    this.s = snapshotOf(data);
    this.v = data.village;
  }

  /** Prénom du titulaire d'un rôle (ex. « Guillem » pour le trésorier). */
  nameOf(role: string): string {
    const p = this.data.players.find((x) => x.role_code === role && x.is_active_slot);
    return p ? (p.id === this.data.me.id ? 'vous' : p.display_name) : role;
  }

  structure(code: string): Structure | undefined {
    return this.data.structures.find((st) => st.code === code);
  }

  /** Verrous et coûts d'une action, expliqués. */
  locks(def: ActionDef, cost: number, structure?: Structure): string[] {
    const steps: string[] = [];
    const treasurer = this.nameOf('treasurer_physio');
    const architect = this.nameOf('civil_eng');
    if (cost > C.BUDGET_LOCK_THRESHOLD_EUR) {
      steps.push(
        treasurer === 'vous'
          ? `Dépense de ${eur(cost)} prise dans la caisse : au-delà de ${eur(C.BUDGET_LOCK_THRESHOLD_EUR)}, c'est vous (trésorier) qui validez — la demande vous arrivera automatiquement.`
          : `Dépense de ${eur(cost)} prise dans la caisse : au-delà de ${eur(C.BUDGET_LOCK_THRESHOLD_EUR)}, ${treasurer} (trésorier) doit valider — la demande lui part automatiquement.`,
      );
    } else if (cost > 0) {
      steps.push(`Coût : ${eur(cost)} pris dans la caisse commune.`);
    }
    if (def.requiresPlu && structure && !structure.plu_approved) {
      steps.push(`Accord PLU de ${architect === 'vous' ? 'vous-même (architecte)' : `${architect} (architecte)`} : demandé automatiquement, inutile si ${architect === 'vous' ? 'vous lancez' : 'elle lance'} le chantier.`);
    }
    if (cost > 0 && cost > this.v.treasury_eur) {
      steps.push(`La caisse n'a que ${eur(this.v.treasury_eur)} : il manque ${eur(cost - this.v.treasury_eur)} (voir « Renflouer la caisse »).`);
    }
    if (def.ecoSensitive && structure?.eco_veto_active) {
      const mayor = this.nameOf('mayor_agri');
      steps.push(mayor === 'vous' ? 'Votre veto écologique bloque ce chantier : levez-le d\'abord.' : `Veto écologique de ${mayor} en cours sur ce chantier : il faut qu'elle le lève d'abord.`);
    }
    if (def.apCost > 0) steps.push(`${def.apCost} PA par séance.`);
    return steps;
  }

  add(item: Omit<PriorityItem, 'who' | 'mine' | 'steps'> & { steps?: string[] }): void {
    const def = item.actionCode ? getAction(item.actionCode) : undefined;
    if (item.actionCode && !def) return;
    if (def?.minAct && this.v.act_number < def.minAct) return;
    if (this.items.some((x) => x.key === item.key)) return;
    const actors = def ? actorsOf(def.code, this.data) : { who: 'Tout le monde, à l\'Agora', mine: true };
    this.items.push({ ...item, steps: item.steps ?? [], ...actors });
  }

  action(code: string): ActionDef {
    const def = getAction(code);
    if (!def) throw new Error(`Action inconnue : ${code}`);
    return def;
  }
}

function pillarsOf(a: AutonomyBreakdown, data: PriorityData, foodPct: number): Pillar[] {
  const v = data.village;
  const beds = data.structures.filter((st) => st.kind === 'building');
  const okBeds = beds.filter((st) => st.status === 'operational').reduce((n, st) => n + st.beds_capacity, 0);
  const allBeds = beds.reduce((n, st) => n + st.beds_capacity, 0);
  const energyTip: Record<number, string> = {
    1: 'Bougies : installer le groupe électrogène (+5), puis la ligne aérienne (+5).',
    2: 'Groupe électrogène : tirer la ligne aérienne (+5), puis barrage ou solaire à l\'Acte II (+10).',
    3: 'Réseau aérien : barrage ou champ solaire à l\'Acte II (+10).',
    4: 'Barrage & solaire : micro-réacteur à l\'Acte III (+5).',
    5: 'Palier maximal atteint.',
  };
  return [
    { id: 'energy', emoji: '⚡', label: 'Énergie', value: a.energy, max: 25, tip: energyTip[v.energy_tier] ?? '' },
    { id: 'water', emoji: '💧', label: 'Eau', value: a.water, max: 15, tip: 'Plein quand le réseau couvre toute la demande (habitants, bétail, potager) et reste en bon état (≥ 60 %).' },
    { id: 'food', emoji: '🌾', label: 'Nourriture', value: a.food, max: 20, tip: `Potager et cheptel couvrent ${foodPct} % des besoins de l'année : agrandir le potager, élever des bêtes.` },
    { id: 'debt', emoji: '💶', label: 'Dette', value: a.debt, max: 20, tip: `Reste ${eur(v.land_debt_eur)} d'emprunt foncier : chaque échéance payée et chaque remboursement anticipé font monter ce pilier.` },
    { id: 'housing', emoji: '🏠', label: 'Logement', value: a.housing, max: 10, tip: `${okBeds} lits livrés sur ${allBeds} possibles : rénover les ruines habitables.` },
    { id: 'sovereignty', emoji: '🏳️', label: 'Souveraineté', value: a.sovereignty, max: 10, tip: 'Acte III : Constitution adoptée (+3), indépendance proclamée (+4), dissuasion (+3).' },
  ];
}

/** Recommandations classées, de la plus urgente à la moins pressante. */
export function priorityPlan(data: PriorityData, now: Date): PriorityPlan {
  const P = new Planner(data);
  const v = data.village;
  const s = P.s;
  const season = calendarSeasonOfKey(dayKey(now));
  const auto = computeAutonomy(s, season);
  const pop = countPopulation(s);
  const water = computeWaterBalance(s, season);
  const foodDay = dailyFoodConsumption(s);
  const act = v.act_number;
  const tier = v.energy_tier;
  const treasurer = P.nameOf('treasurer_physio');

  // ------------------------------------------------------------------ Urgences
  if (foodDay > 0 && v.food_rations < foodDay * 3) {
    const days = Math.floor(v.food_rations / foodDay);
    P.add({
      key: 'food_stock', short: 'Moins de 3 jours de vivres : la famine guette.', emoji: '🍞', title: 'Remplir la réserve de vivres', urgent: true, score: 100,
      why: `Il reste ${v.food_rations} rations, soit ${days <= 0 ? 'moins d\'un jour' : `environ ${days} ${plural(days, 'jour', 'jours')}`} pour ${pop.total} habitants. À zéro, la faim fait chuter santé et moral de tout le village.`,
      actionCode: 'fish_hunt',
      steps: [
        `Pêche & chasse (${P.nameOf('smith_diplo')}), potager (${P.nameOf('mayor_agri')}) ou boucherie du cheptel.`,
        'Tout le monde peut aussi commander 30 rations de conserves au marché d\'Andorre (160 €).',
      ],
      gain: 'Évite la famine',
    });
    P.add({
      key: 'food_buy', short: '30 rations livrées tout de suite (160 €).', emoji: '🥫', title: 'Commander des conserves', urgent: true, score: 99,
      why: 'Le plus rapide pour regarnir la réserve : 30 rations livrées par la piste.',
      actionCode: 'buy_supplies', preset: { catalog_item_id: 'andorre_conserves' },
      steps: P.locks(P.action('buy_supplies'), 160),
      gain: '+30 rations',
    });
  }

  if (v.tools_stock < pop.workers) {
    const def = P.action('forge_tools');
    P.add({
      key: 'tools', short: 'Il manque des outils : −35 % de rendement pour tous.', emoji: '🔨', title: 'Forger des outils', urgent: true, score: 95,
      why: `${v.tools_stock} ${plural(v.tools_stock, 'outil', 'outils')} pour ${pop.workers} travailleurs : tant qu'il en manque, tout le village perd 35 % de rendement (chantiers, potager, réseaux).`,
      actionCode: 'forge_tools',
      steps: [
        `3 fers par fournée (stock : ${v.iron_stock}).`,
        ...(v.iron_stock < 3 ? ['Pas assez de fer : recycler la ferraille, ou commander « Quincaillerie & fers à béton » chez Gedimat (210 €, +10 fers).'] : []),
        'Dépannage immédiat : « Outillage de chantier » chez BigMat (260 €, +2 outils).',
        ...P.locks(def, 0),
      ],
      gain: 'Supprime le malus de −35 %',
    });
  }

  if (pop.total > v.housing_capacity) {
    const target = nextBuilding(data.structures);
    P.add({
      key: 'overcrowding', short: 'Plus d\'habitants que de lits livrés.', emoji: '🛏️', title: target ? `Loger tout le monde : rénover « ${target.name} »` : 'Loger tout le monde', urgent: true, score: 88,
      why: `${pop.total} habitants pour ${v.housing_capacity} lits livrés : la surpopulation fait baisser le rendement et la natalité.`,
      actionCode: target ? 'renovate_building' : null, preset: target ? { target_structure_id: target.id } : undefined,
      steps: target ? [...P.locks(P.action('renovate_building'), 300, target), ...stockSteps(v)] : [],
      gain: target ? `+${target.beds_capacity} lits` : null,
    });
  }

  if (v.missed_loan_payments > 0 || v.treasury_eur < C.LOAN_WEEKLY_INSTALLMENT_EUR * 2) {
    const missed = v.missed_loan_payments > 0;
    P.add({
      key: 'treasury', short: missed ? 'Des échéances de l\'emprunt sont impayées.' : 'La caisse couvre à peine deux échéances.', emoji: '💰', title: 'Renflouer la caisse commune', urgent: missed, score: missed ? 92 : 70,
      why: missed
        ? `${v.missed_loan_payments} ${plural(v.missed_loan_payments, 'échéance', 'échéances')} de l'emprunt foncier (${eur(C.LOAN_WEEKLY_INSTALLMENT_EUR)} par semaine) n'${plural(v.missed_loan_payments, 'a', 'ont')} pas pu être ${plural(v.missed_loan_payments, 'payée', 'payées')} : les intérêts s'ajoutent à la dette et la pression administrative monte de 5 % à chaque fois.`
        : `La caisse (${eur(v.treasury_eur)}) couvre à peine deux échéances de l'emprunt (${eur(C.LOAN_WEEKLY_INSTALLMENT_EUR)} par semaine) et chaque chantier coûte de l'argent.`,
      actionCode: 'negotiate_spain_andorra',
      steps: [
        `Négocier en Espagne / Andorre (${P.nameOf('smith_diplo')}, ${P.nameOf('mayor_agri')}) : +300 € si l'affaire se conclut.`,
        'Tout le monde peut vendre tomates, bois ou conserves au marché d\'Organyà (Argent & commerce), +30 % le samedi.',
        'Proposer à l\'Agora une contribution des habitants (initiative « taxe ») : environ +1 500 €.',
        'À moyen terme : rénover et ouvrir le gîte (800 à 2 500 € par semaine).',
      ],
      gain: '+300 € par négociation réussie',
    });
  }

  // Bois de chauffage (V4.8) : une nuit froide sans bois coûte moral et santé
  const heat = heatingNeed(s);
  if (heat.wood > 0 && v.wood_stock < heat.wood * 4) {
    const nights = Math.floor(v.wood_stock / heat.wood);
    P.add({
      key: 'heating', short: nights < 2 ? 'Plus assez de bois pour chauffer cette nuit.' : `Bois de chauffage pour ${nights} nuits seulement.`, emoji: '🪵', title: 'Faire des réserves de bois', urgent: nights < 2, score: nights < 2 ? 91 : 72,
      why: `Il fait ${Math.round(heat.tempMin)} °C au petit matin : ${heat.buildings} ${heat.buildings > 1 ? 'bâtisses habitées brûlent' : 'bâtisse habitée brûle'} ${heat.wood} stères par nuit, et il en reste ${v.wood_stock}. Une nuit sans feu coûte ${C.HEATING_COLD_MORALE} % de moral et 1 point de santé à chaque fondateur.`,
      actionCode: 'cut_wood',
      steps: [`Couper du bois : environ ${C.WOOD_CUT_BASE} stères par séance, gratuit — au-delà de ${C.WOOD_CUT_SUSTAINABLE} coupes par semaine, la forêt souffre.`, 'Ou louer une tronçonneuse chez Kiloutou (60 €, +10 bois).'],
      gain: `+${C.WOOD_CUT_BASE} stères par séance`,
    });
  }
  if (v.tomatoes_stock >= 60) {
    P.add({
      key: 'tomatoes', short: 'Des tomates qui dorment : vendez-les ou mettez-les en bocaux.', emoji: '🍅', title: `Écouler ${Math.floor(v.tomatoes_stock)} kg de tomates`, urgent: false, score: v.treasury_eur < 3000 ? 58 : 30,
      why: 'Les tomates ne se mangent pas toutes seules : au marché d\'Organyà elles rapportent de l\'argent à la caisse (surtout le samedi), en conserve elles deviennent des rations pour l\'hiver.',
      actionCode: 'market_sale', preset: { catalog_item_id: 'tomatoes' },
      steps: [`Faire des conserves : ${C.PRESERVES_TOMATOES_KG} kg → ${C.PRESERVES_RATIONS} rations (${C.PRESERVES_JARS_EUR} € de bocaux).`, 'Garder 20 kg pour le lancer sur les BOR (moral +15 %).'],
      gain: 'Argent pour la caisse ou rations',
    });
  }

  const awaiting = data.structures.filter((st) => st.status === 'awaiting_power');
  if (awaiting.length > 0 && tier >= 2) {
    const st = awaiting.find((x) => x.code === 'mas_era') ?? awaiting[0]!;
    P.add({
      key: `connect:${st.id}`, short: 'Chantier fini, mais pas livré sans courant.', emoji: '🔌', title: `Raccorder « ${st.name} » au courant`, urgent: true, score: 86,
      why: `Le chantier est fini, mais la bâtisse n'est livrée qu'une fois raccordée${st.beds_capacity > 0 ? ` : en attendant, ses ${st.beds_capacity} lits ne comptent ni pour le logement ni pour l'autonomie` : ''}${st.code === 'mas_era' ? ' et le gîte ne peut pas ouvrir' : ''}.`,
      actionCode: 'connect_power', preset: { target_structure_id: st.id },
      steps: [...P.locks(P.action('connect_power'), 120, st), ...(awaiting.length > 1 ? [`Aussi en attente : ${awaiting.filter((x) => x.id !== st.id).map((x) => x.name).join(', ')}.`] : [])],
      gain: st.beds_capacity > 0 ? `+${st.beds_capacity} lits livrés` : 'Bâtisse livrée',
    });
  }

  if (v.water_network_condition_pct < 60 || data.structures.some((st) => st.leak_alert)) {
    const bad = v.water_network_condition_pct < 40 || data.structures.some((st) => st.leak_alert);
    P.add({
      key: 'water_repair', short: 'Les fuites mangent la capacité d\'eau.', emoji: '🔧', title: 'Réparer le réseau d\'eau', urgent: bad, score: bad ? 84 : 58,
      why: `Le réseau est à ${Math.round(v.water_network_condition_pct)} %${data.structures.some((st) => st.leak_alert) ? ' et une fuite est signalée' : ''} : les fuites mangent la capacité, et sous 60 % le pilier eau ne peut pas être plein.`,
      actionCode: 'repair_pipes',
      steps: P.locks(P.action('repair_pipes'), 120),
      gain: '+25 % d\'état du réseau',
    });
  }

  if (v.admin_pressure_pct >= 45) {
    const blocking = v.admin_pressure_pct >= 60;
    P.add({
      key: 'admin', short: blocking ? 'Au-delà de 60 %, l\'électricité est bloquée.' : 'Bientôt 60 % : l\'électricité serait bloquée.', emoji: '🏛️', title: 'Calmer l\'administration espagnole', urgent: blocking && tier === 2, score: blocking ? 78 : 40,
      why: `Pression administrative à ${Math.round(v.admin_pressure_pct)} %${blocking ? ' : au-delà de 60 %, le raccordement au réseau électrique est bloqué et les inspections se multiplient.' : ' : à 60 %, le raccordement au réseau électrique sera bloqué.'}`,
      actionCode: 'diplomacy_ayuntamiento',
      steps: [
        `Négocier à l'Ayuntamiento (${P.nameOf('mayor_agri')}, ${P.nameOf('smith_diplo')}) : −8 % si succès.`,
        `Contrôle de conformité cadastrale (${P.nameOf('civil_eng')}) : −4 %.`,
        'Éviter contrebande et chantiers sans permis pendant ce temps.',
      ],
      gain: 'Jusqu\'à −8 % de pression',
    });
  }

  if (v.track_condition_pct < C.TRACK_SURCHARGE_THRESHOLD) {
    P.add({
      key: 'track', short: 'Piste abîmée : livraisons 40 % plus chères.', emoji: '🛤️', title: 'Empierrer la piste forestière', urgent: false, score: 52,
      why: `Piste à ${Math.round(v.track_condition_pct)} % : sous ${C.TRACK_SURCHARGE_THRESHOLD} %, chaque commande coûte ${C.TRACK_SURCHARGE_PCT} % de plus et la piste peut s'embourber (24 h sans livraison).`,
      actionCode: 'track_maintenance',
      steps: [`5 pierres par séance (stock : ${v.stone_stock}).`, ...P.locks(P.action('track_maintenance'), 0)],
      gain: '+6 % d\'état de piste',
    });
  }

  if (v.morale_pct < 35) {
    P.add({
      key: 'morale', short: 'Moral bas : la natalité s\'effondre.', emoji: '🎻', title: 'Remonter le moral du village', urgent: false, score: 60,
      why: `Moral à ${Math.round(v.morale_pct)} % : un moral bas freine la natalité (la pérennité du village) et échauffe les esprits à l'Agora.`,
      actionCode: 'banjo_evening',
      steps: [`Messe dominicale de ${P.nameOf('priest_apoth')} (+12 %, le dimanche), soirée banjo de ${P.nameOf('smith_diplo')} (+4 %), lancer de tomates sur les BOR (+15 %, une fois par saison).`],
      gain: 'Jusqu\'à +12 % de moral',
    });
  }

  if (v.insecurity_pct >= 40) {
    P.add({
      key: 'insecurity', short: 'Vols, et risque de putsch le dimanche.', emoji: '🚨', title: 'Faire baisser l\'insécurité', urgent: v.left_wing_ideology_pct > 50, score: 62,
      why: `Insécurité à ${Math.round(v.insecurity_pct)} % : vols de rations et de tomates, et au-delà de 40 % un putsch devient possible le dimanche si une faction s'organise.`,
      actionCode: 'dismantle_lab',
      steps: [`Démanteler alambics & labos (${P.nameOf('druid')}), médiation de ${P.nameOf('priest_apoth')}, tours de garde à l'Acte II.`],
      gain: '−3 d\'insécurité par démantèlement',
    });
  }

  // ------------------------------------------------------------------ Énergie
  if (tier === 1) {
    const gen = P.structure('grup_electrogen');
    P.add({
      key: 'generator', short: 'Sans courant, aucune bâtisse rénovée n\'est livrée.', emoji: '⚡', title: 'Installer le groupe électrogène', urgent: awaiting.length > 0, score: awaiting.length > 0 ? 90 : 80,
      why: `Le hameau vit encore à la bougie. Sans électricité, aucune bâtisse rénovée ne peut être livrée (elle reste « en attente de courant »)${awaiting.length > 0 ? ` — c'est déjà le cas de ${awaiting.map((x) => `« ${x.name} »`).join(', ')}` : ''}, le gîte ne peut pas ouvrir, et la ligne aérienne, les compteurs ou le barrage restent hors de portée. C'est la première marche de l'énergie, qui vaut 25 points d'autonomie.`,
      actionCode: 'install_generator', preset: gen ? { target_structure_id: gen.id } : undefined,
      steps: [...P.locks(P.action('install_generator'), 2800, gen), 'Ensuite : raccorder chaque bâtisse terminée (120 € de câbles chacune).'],
      gain: '+5 points d\'autonomie',
    });
  } else if (tier === 2) {
    const line = P.structure('linia_aeria');
    P.add({
      key: 'power_line', short: 'Moins cher que le gasoil, +5 points d\'autonomie.', emoji: '🗼', title: 'Tirer la ligne électrique aérienne', urgent: false, score: 50,
      why: `Le groupe électrogène tourne au gasoil (${Math.round(v.fuel_stock_l)} L en stock) et abîme l'écologie. Le réseau aérien coûte moins cher au kilowattheure et rapporte 5 points d'autonomie de plus.`,
      actionCode: 'build_power_line', preset: line ? { target_structure_id: line.id } : undefined,
      steps: [
        ...P.locks(P.action('build_power_line'), 1500, line),
        `Environ 5 séances${line && line.progress_pct > 0 ? ` (avancement : ${line.progress_pct} %)` : ''}.`,
        `Bloqué si la pression administrative atteint 60 % (actuellement ${Math.round(v.admin_pressure_pct)} %).`,
      ],
      gain: '+5 points d\'autonomie',
    });
    if (v.fuel_stock_l < 40) {
      P.add({
        key: 'fuel', short: 'Bientôt à sec : retour aux bougies.', emoji: '⛽', title: 'Racheter du gasoil pour le groupe', urgent: true, score: 83,
        why: `Plus que ${Math.round(v.fuel_stock_l)} L de gasoil : à sec, le groupe s'arrête et le hameau repasse à la bougie.`,
        actionCode: 'buy_supplies', preset: { catalog_item_id: 'andorre_gasoil' },
        steps: [...P.locks(P.action('buy_supplies'), 230), 'Gasoil détaxé d\'Andorre : attention à la douane.'],
        gain: '+200 L',
      });
    }
  } else if (tier === 3 && act >= 2) {
    const solar = P.structure('camp_solar');
    P.add({
      key: 'tier4', short: 'Le plus gros gain d\'autonomie restant (+10).', emoji: '☀️', title: 'Produire sa propre électricité (champ solaire ou barrage)', urgent: false, score: 45,
      why: 'Le palier 4 rend le hameau autonome en énergie, fait chuter le prix du kilowattheure et ouvre la ferme de minage à l\'Acte III : c\'est le plus gros gain d\'autonomie restant (+10 points).',
      actionCode: 'build_solar', preset: solar ? { target_structure_id: solar.id } : undefined,
      steps: [
        ...P.locks(P.action('build_solar'), 3000, solar),
        `Ou le micro-barrage d'${P.nameOf('water_eng')} (2 500 € par séance), après la cartographie des 30 ha ; un veto écologique est possible (grenouilles).`,
      ],
      gain: '+10 points d\'autonomie',
    });
  }
  if (tier >= 2 && !v.power_meters_installed) {
    P.add({
      key: 'meters', short: 'Chacun paie sa propre électricité.', emoji: '📟', title: 'Poser les compteurs individuels', urgent: false, score: 22,
      why: 'Sans compteurs, la caisse commune paie toute l\'électricité ; avec, chacun paie sa propre consommation.',
      actionCode: 'install_meters', steps: P.locks(P.action('install_meters'), 450), gain: 'Énergie facturée au réel',
    });
  }

  // ------------------------------------------------------------------ Logement & gîte
  const gite = P.structure('mas_era');
  if (gite && gite.status === 'operational' && !v.gite_open) {
    P.add({
      key: 'open_gite', short: '800 à 2 500 € par semaine pour la caisse.', emoji: '🏡', title: 'Ouvrir le gîte rural', urgent: false, score: 76,
      why: 'Le Mas de l\'Era est rénové et raccordé : ouvert, il rapporte 800 à 2 500 € par semaine à la caisse.',
      actionCode: 'open_gite', steps: P.locks(P.action('open_gite'), 0), gain: '+800 à 2 500 € par semaine',
    });
  } else if (gite && !['operational', 'awaiting_power', 'demolished'].includes(gite.status)) {
    P.add({
      key: 'gite', short: 'Le gîte financera tous les autres chantiers.', emoji: '🏡', title: 'Rénover le Mas de l\'Era (futur gîte)', urgent: false, score: v.treasury_eur < 3000 ? 66 : 56,
      why: `Une fois rénové et raccordé, le gîte rapporte 800 à 2 500 € par semaine à la caisse : de quoi financer l'électricité, l'eau et les autres chantiers. Avancement : ${gite.progress_pct} %.`,
      actionCode: 'renovate_building', preset: { target_structure_id: gite.id },
      steps: [...P.locks(P.action('renovate_building'), 300, gite), ...stockSteps(v), ...(tier === 1 ? ['Il faudra aussi l\'électricité pour le livrer (groupe électrogène).'] : [])],
      gain: 'Revenus réguliers pour la caisse',
    });
  }
  if (pop.total <= v.housing_capacity) {
    const target = nextBuilding(data.structures);
    if (target && auto.housing < 10) {
      P.add({
        key: `renovate:${target.id}`, short: 'Plus de lits, plus d\'autonomie.', emoji: '🧱', title: `Rénover « ${target.name} »`, urgent: false, score: 40,
        why: `Le logement vaut 10 points d'autonomie (lits livrés / lits possibles) et chaque lit permet d'accueillir un nouvel habitant. Avancement : ${target.progress_pct} %.`,
        actionCode: 'renovate_building', preset: { target_structure_id: target.id },
        steps: [...P.locks(P.action('renovate_building'), 300, target), ...stockSteps(v)],
        gain: `+${target.beds_capacity} lits`,
      });
    }
  }

  // ------------------------------------------------------------------ Eau
  if (water.ratio < 1) {
    const pipe = P.structure('conduite_principale');
    P.add({
      key: 'water_capacity', short: 'Pas assez d\'eau pour tout le monde et le potager.', emoji: '💧', title: 'Augmenter la capacité d\'eau', urgent: water.ratio < 0.6, score: water.ratio < 0.6 ? 80 : 54,
      why: `Le réseau fournit ${Math.round(water.capacity)} L par jour pour un besoin de ${Math.round(water.demandTotal)} L (habitants, bétail, potager) : le potager est arrosé en dernier et le pilier eau (15 points) reste incomplet.`,
      actionCode: 'lay_pipes', preset: pipe ? { target_structure_id: pipe.id } : undefined,
      steps: P.locks(P.action('lay_pipes'), 800, pipe),
      gain: `+800 L par jour, jusqu'à +${Math.max(0, Math.round(15 - auto.water))} points`,
    });
  }

  // ------------------------------------------------------------------ Nourriture
  const foodPct = Math.round(Math.sqrt(Math.max(0, auto.food) / 20) * 100);
  if (auto.food < 14) {
    P.add({
      key: 'garden', short: 'La nourriture vaut 20 points d\'autonomie.', emoji: '🥕', title: 'Agrandir le potager', urgent: false, score: 44 + Math.round((14 - auto.food) / 2),
      why: `Potager (${v.garden_area_m2} m²) et cheptel (${v.livestock_count} ${plural(v.livestock_count, 'bête', 'bêtes')}) couvrent environ ${foodPct} % des besoins de l'année : la nourriture vaut 20 points d'autonomie et protège des pénuries.`,
      actionCode: 'expand_garden',
      steps: [...P.locks(P.action('expand_garden'), 150), ...(water.gardenSupplyRatio < 0.8 ? ['Attention : le potager manque déjà d\'eau — augmenter d\'abord la capacité du réseau.'] : [])],
      gain: '+100 m² de potager',
    });
    const pen = P.structure('cleda');
    if (pen && pen.status !== 'operational') {
      P.add({
        key: 'pen', short: 'Pas d\'enclos, pas de bétail.', emoji: '🐑', title: 'Construire l\'enclos (Cleda)', urgent: false, score: 36,
        why: 'Sans enclos, pas de bétail : brebis et cochons donnent laitages, œufs et viande toute l\'année, même l\'hiver quand le potager ne produit presque rien.',
        actionCode: 'build_livestock_pen', preset: { target_structure_id: pen.id },
        steps: P.locks(P.action('build_livestock_pen'), 350, pen), gain: 'Ouvre l\'élevage',
      });
    } else if (pen && v.livestock_count < 6) {
      P.add({
        key: 'livestock', short: 'Chaque bête nourrit le village toute l\'année.', emoji: '🐖', title: 'Acheter du bétail à la foire de Lleida', urgent: false, score: 36,
        why: 'L\'enclos est prêt : chaque bête nourrit le village toute l\'année et fait monter le pilier nourriture.',
        actionCode: 'buy_livestock', steps: P.locks(P.action('buy_livestock'), 140), gain: 'Rations toute l\'année',
      });
    }
  }

  // ------------------------------------------------------------------ Dette & souveraineté
  if (v.land_debt_eur > 0 && v.treasury_eur > 6000 && v.missed_loan_payments === 0) {
    P.add({
      key: 'debt', short: 'Caisse confortable : rembourser fait monter l\'autonomie.', emoji: '🏦', title: 'Rembourser une partie de la dette', urgent: false, score: 24,
      why: `La caisse est confortable (${eur(v.treasury_eur)}) : chaque euro remboursé fait monter le pilier dette (20 points) et réduit les intérêts.`,
      actionCode: 'pay_land_debt', steps: [`Seul ${treasurer === 'vous' ? 'vous pouvez le faire' : `${treasurer} (trésorier) peut le faire`}.`], gain: 'Pilier dette',
    });
  }
  if (act >= 3 && !data.constitution.some((a) => a.status === 'adopted')) {
    P.add({
      key: 'constitution', short: '+3 points de souveraineté à l\'Acte III.', emoji: '📜', title: 'Rédiger et adopter la Constitution', urgent: false, score: 34,
      why: 'À l\'Acte III, une Constitution adoptée rapporte 3 points de souveraineté et prépare l\'indépendance.',
      actionCode: null, route: { name: 'agora', param: 'constitution' }, gain: '+3 points d\'autonomie',
    });
  }

  const items = P.items.sort((a, b) => b.score - a.score);
  const nextAct = act === 1 ? { act: 2 as const, at: C.ACT_THRESHOLDS.act2 } : act === 2 ? { act: 3 as const, at: C.ACT_THRESHOLDS.act3 } : null;
  return { act, autonomy: v.autonomy_pct, nextAct, pillars: pillarsOf(auto, data, foodPct), items };
}

/** Prochaine bâtisse habitable à rénover : chantier entamé d'abord, puis la plus grande. */
function nextBuilding(structures: Structure[]): Structure | undefined {
  return structures
    .filter((st) => st.kind === 'building' && ['ruin', 'cleared', 'in_progress', 'planned', 'damaged'].includes(st.status))
    .sort((a, b) => b.progress_pct - a.progress_pct || b.beds_capacity - a.beds_capacity)[0];
}

/** Matériaux d'une séance de chantier (5 pierres + 5 bois). */
function stockSteps(v: PriorityData['village']): string[] {
  const out: string[] = [];
  if (v.stone_stock < 5) out.push(`Pierre : ${v.stone_stock} (il en faut 5 par séance) — déblayer des gravats ou commander chez BigMat.`);
  if (v.wood_stock < 5) out.push(`Bois : ${v.wood_stock} (il en faut 5 par séance) — commander chez Gedimat ou louer une tronçonneuse chez Kiloutou (60 €, +10 bois).`);
  return out;
}
