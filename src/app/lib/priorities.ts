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
  dailyMission,
  missionDone,
  dailyFoodConsumption,
  dayKey,
  wornStructures,
  getAction,
  firstName,
  forestBan,
  heatingNeed,
  planResidentWork,
  pantryAmount,
  planSupplyNight,
  storageAmount,
  type VillageState,
  type ActionDef,
  type AutonomyBreakdown,
  type GameSnapshot,
} from '../engine.ts';
import { actGoalsView, goalForPriority, type ActGoalsView } from './actGoals.ts';
import { buildingsOverview } from './buildings.ts';
import { collectiveView } from './collective.ts';
import { electionView } from './election.ts';
import { MISSION_REWARD_TEXT } from './jobLevel.ts';
import { residentPersona, sulkingResidents } from './residentLife.ts';
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
  /** Objectif d'Acte restant que cette priorité fait avancer (V5.1). */
  goal?: string;
}

export interface PriorityPlan {
  act: number;
  autonomy: number;
  nextAct: { act: 2 | 3; at: number } | null;
  pillars: Pillar[];
  items: PriorityItem[];
  /** Liste à cocher de l'Acte en cours (V5.1). */
  goals: ActGoalsView;
}

/** Une priorité qui fait avancer un objectif d'Acte restant passe un peu devant. */
const GOAL_PRIORITY_BONUS = 6;

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

  // Usure des bâtisses (V5.5) : la plus abîmée sous le seuil conseillé
  const worn = wornStructures(data);
  if (worn.length > 0) {
    const st = worn[0]!;
    const critical = st.condition_pct < C.WEAR_DAMAGED_AT + 10;
    const def = P.action('maintain_building');
    P.add({
      key: `maintain:${st.id}`, emoji: '🧰', title: `Entretenir « ${st.name} »`, urgent: critical, score: critical ? 80 : 50,
      short: `État ${st.condition_pct} % : sous ${C.WEAR_DAMAGED_AT} %, elle est endommagée.`,
      why: `Les bâtisses s'usent chaque nuit (bien plus l'hiver et les nuits de gel). Sous ${C.WEAR_DAMAGED_AT} % d'état, une bâtisse est endommagée : ${st.beds_capacity > 0 ? `ses ${st.beds_capacity} lits` : 'son effet'} disparaissent jusqu'à une réparation coûteuse.${worn.length > 1 ? ` Aussi à entretenir : ${worn.slice(1).map((x) => `${x.name} (${x.condition_pct} %)`).join(', ')}.` : ''}`,
      actionCode: 'maintain_building', preset: { target_structure_id: st.id },
      steps: [
        `1 PA, ${C.MAINTAIN_STONE} pierres et ${C.MAINTAIN_IRON} fer : +${C.MAINTAIN_POINTS} % d'état (plus pour Tiphaine).`,
        ...(v.stone_stock < C.MAINTAIN_STONE || v.iron_stock < C.MAINTAIN_IRON ? [`Réserve : ${Math.floor(v.stone_stock)} pierres, ${Math.floor(v.iron_stock)} fer — déblayer une ruine (pierre) ou recycler la ferraille (fer).`] : []),
        `Un résident au poste « chantier » entretient aussi les bâtisses sous ${C.RESIDENT_MAINTAIN_BELOW} %.`,
        ...P.locks(def, 0, st),
      ],
      gain: 'Garde ses lits et son effet',
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
  // Travail des résidents (V4.9) : les bûcherons compensent le chauffage
  const work = planResidentWork(s, season, now).totals;
  const ban = forestBan(v);
  const burn = heat.wood - work.wood;
  if (heat.wood > 0 && burn > 0 && v.wood_stock < burn * 4) {
    const nights = Math.floor(v.wood_stock / burn);
    P.add({
      key: 'heating', short: nights < 2 ? 'Plus assez de bois pour chauffer cette nuit.' : `Bois de chauffage pour ${nights} nuits seulement.`, emoji: '🪵', title: 'Faire des réserves de bois', urgent: nights < 2, score: nights < 2 ? 91 : 72,
      why: `Il fait ${Math.round(heat.tempMin)} °C au petit matin : ${heat.buildings} ${heat.buildings > 1 ? 'bâtisses habitées brûlent' : 'bâtisse habitée brûle'} ${heat.wood} stères par nuit${work.wood > 0 ? ` (les bûcherons résidents en rapportent ${Math.round(work.wood * 10) / 10})` : ''}, et il en reste ${v.wood_stock}. Une nuit sans feu coûte ${C.HEATING_COLD_MORALE} % de moral et 1 point de santé à chaque fondateur.`,
      actionCode: ban ? 'buy_supplies' : 'cut_wood',
      preset: ban ? { catalog_item_id: 'kiloutou_tronconneuse' } : undefined,
      steps: [
        ban
          ? `${P.nameOf('mayor_agri')} a interdit les coupes jusqu'à lundi (« ${ban.reason} ») : il faut acheter du bois, ou lui demander de rouvrir la forêt.`
          : `Couper du bois : environ ${C.WOOD_CUT_BASE} stères par séance, gratuit — au-delà de ${C.WOOD_CUT_SUSTAINABLE} coupes par semaine, la forêt souffre.`,
        `Mettre un résident en forêt (Agora → Immigration) : environ ${C.RESIDENT_FOREST_WOOD} stères chaque nuit.`,
        'Ou louer une tronçonneuse chez Kiloutou (60 €, +10 bois).',
      ],
      gain: ban ? '+10 stères par location' : `+${C.WOOD_CUT_BASE} stères par séance`,
    });
  }
  // Mission du jour (V5.2) : l'action conseillée au joueur aujourd'hui, petite récompense si elle est faite
  const mission = dailyMission(s, data.me as unknown as GameSnapshot['players'][number], now);
  if (mission && !missionDone(v, data.me.id, now) && data.me.action_points >= mission.apCost) {
    P.add({
      key: `mission:${mission.code}`, emoji: '🎯', title: `Mission du jour : ${mission.label}`, urgent: false, score: 56,
      short: `Votre action conseillée aujourd'hui : ${MISSION_REWARD_TEXT}.`,
      why: `Chaque jour, votre métier vous conseille une action. Faite avant minuit, elle rapporte ${MISSION_REWARD_TEXT} ; l'expérience fait monter votre niveau de métier (niveau 2 à ${C.SKILL_LEVEL_XP[1]} XP : +${Math.round(C.SKILL_LEVEL_BONUS[1] * 100)} % de rendement dans votre métier).`,
      actionCode: mission.code,
      steps: [mission.description, ...(mission.apCost > 0 ? [`${mission.apCost} PA.`] : [])],
      gain: MISSION_REWARD_TEXT,
    });
    const item = P.items.find((x) => x.key === `mission:${mission.code}`);
    if (item) Object.assign(item, { who: 'vous', mine: true });
  }

  // Chantier collectif de la semaine (V5.0) : tant qu'il n'est pas fini, chaque PA compte
  const col = collectiveView(data, now);
  if (col.project && col.def && !col.done) {
    const late = col.daysBeforeSunday <= 1;
    P.add({
      key: 'collective', emoji: col.def.icon, title: `Chantier de la semaine : ${col.def.label}`, urgent: late && col.daysBeforeSunday === 1, score: late ? 70 : 58,
      short: `${col.project.points}/${col.project.goal} points — ${col.daysBeforeSunday === 0 ? 'à finir ce soir (sans bonus)' : col.daysBeforeSunday === 1 ? 'dernier jour pour le bonus' : `${col.daysBeforeSunday} jours pour le bonus`}.`,
      why: `Le projet commun de la semaine : ${col.def.summary} Fini avant dimanche, son effet est multiplié par ${String(C.COLLECTIVE_EARLY_FACTOR).replace('.', ',')} et le moral gagne ${C.COLLECTIVE_EARLY_MORALE} % ; inachevé lundi, le moral perd ${C.COLLECTIVE_FAIL_MORALE} %.`,
      actionCode: 'contribute_collective',
      steps: [
        `1 PA = 1 point, ${col.myPoints > 1 ? '2 pour vous (c\'est votre métier)' : `2 pour le métier du projet (${P.nameOf(col.def.pole)})`}. Il manque ${col.remaining} ${plural(col.remaining, 'point', 'points')}.`,
        'Tout le monde peut y participer, même aux travaux forcés.',
        'Votez aussi pour le chantier de la semaine prochaine (accueil ou Agora).',
      ],
      gain: col.def.summary,
    });
  }
  // Nouveaux bâtiments (V5.4) : rien en projet, une parcelle libre et de quoi payer un petit plan
  const builds = buildingsOverview(data, 'winter');
  if (builds.canPlan && builds.openProjects === 0 && v.treasury_eur >= 1500) {
    const cheap = C.BUILDING_TYPES.filter((b) => !builds.built.some((s) => s.variant === b.id)).sort((a, b) => a.price_eur - b.price_eur).slice(0, 3);
    P.add({
      key: 'build:plan', emoji: '🏗️', title: 'Bâtir sur une parcelle libre', urgent: false, score: 34,
      short: `${builds.freeParcels} ${plural(builds.freeParcels, 'parcelle libre', 'parcelles libres')} : four, serre, poulailler… nourrissent le hameau.`,
      why: 'Chaque nouveau bâtiment en service donne son effet toutes les nuits (rations, moral, santé, bois…). Le plan coûte 1 PA et son prix ; le chantier se fait ensuite par la rénovation.',
      actionCode: 'plan_building',
      steps: [
        `Les moins chers : ${cheap.map((b) => `${b.icon} ${b.label} (${b.price_eur} €)`).join(', ')}.`,
        'Touchez un « + » sur la carte pour voir ce que chaque parcelle peut accueillir (moulin et lavoir : bord de rivière).',
        'Ensuite : « Rénover / construire » (300 €, 5 pierres, 5 bois par séance, accord PLU de Tiphaine).',
      ],
      gain: 'Un effet permanent, chaque nuit.',
    });
  }
  // Élection vivante d'un portefeuille (V5.3) : voter, se présenter, défendre son programme
  const el = electionView(data, now);
  if (el.election) {
    const lastDay = el.lastDay;
    const mandate = `Mandat de ${C.ELECTION_MANDATE_WEEKS} semaines : le portefeuille débloque ses actions pour l'élu·e (seconde casquette).`;
    if (el.canVote && !el.myVote) {
      P.add({
        key: 'election:vote', emoji: '🗳️', title: `Voter : ${el.title}`, urgent: lastDay, score: lastDay ? 74 : 64,
        short: `${el.candidates.length} candidat(s), ${el.voters}/${el.electors} votant(s) — vote secret, 0 PA.`,
        why: `Le portefeuille « ${el.title} » est mis en jeu tant que sa place à temps plein est vacante. ${mandate}`,
        actionCode: null, route: { name: 'agora' },
        steps: ['Lisez les programmes (Agora) et le débat (Taverne → Hall de l\'Agora).', 'Touchez un candidat pour voter ; on ne vote pas pour soi, on peut changer d\'avis jusqu\'au soir.', `Participation d'au moins ${Math.round(C.ELECTION_TURNOUT_MIN * 100)} % : moral +${C.ELECTION_TURNOUT_MORALE} %.`],
        gain: `moral +${C.ELECTION_TURNOUT_MORALE} % si la participation est bonne`,
      });
    } else if (el.canStand) {
      P.add({
        key: 'election:stand', emoji: '🗳️', title: `Se présenter : ${el.title}`, urgent: lastDay && el.candidates.length === 0, score: el.candidates.length === 0 ? 54 : 44,
        short: el.candidates.length === 0 ? 'Aucun candidat pour l\'instant : sans candidat, le portefeuille reste vacant une semaine.' : `${el.candidates.length} candidat(s) déjà : ${el.status}`,
        why: `${mandate} L'élu·e gagne aussi ${C.ELECTION_WINNER_XP} XP.`,
        actionCode: null, route: { name: 'agora' },
        steps: [`Rédigez un programme (${C.ELECTION_PROGRAM_MIN} à ${C.ELECTION_TEXT_MAX} caractères) : 1 PA.`, 'Puis défendez-le au débat de la Taverne (1 PA par jour).'],
        gain: `le portefeuille pour ${C.ELECTION_MANDATE_WEEKS} semaines`,
      });
    }
    if (el.canSpeak) {
      P.add({
        key: 'election:speak', emoji: '🎙️', title: 'Défendre votre programme au débat', urgent: false, score: 50,
        short: 'Une intervention par jour à la Taverne : à égalité de voix, le plus présent au débat l\'emporte.',
        why: `Vous êtes candidat·e à « ${el.title} ». La première intervention du jour au hameau anime la place (moral +${C.ELECTION_SPEECH_MORALE} %).`,
        actionCode: null, route: { name: 'gazette', param: 'agora' },
        steps: [`${C.ELECTION_SPEECH_MIN} à ${C.ELECTION_TEXT_MAX} caractères, 1 PA.`],
        gain: 'départage les égalités',
      });
    }
  }
  if (work.unassigned > 0) {
    const n = work.unassigned;
    P.add({
      key: 'residents_idle', emoji: '🧑‍🌾', title: `Donner un poste à ${n} ${plural(n, 'résident', 'résidents')}`, urgent: false, score: 64,
      short: `${n} ${plural(n, 'résident mange', 'résidents mangent')} sans rien produire.`,
      why: `Chaque résident mange ${C.RATIONS_ADULT_DAY} ration par jour. Au potager, en forêt, au chantier, à la forge, au pâturage, sur le réseau d'eau ou sur la piste, il produit chaque nuit — bien plus au poste de sa spécialité.`,
      actionCode: null, route: { name: 'agora', param: 'immigration' },
      steps: [
        'Agora → Immigration → touchez un résident pour choisir son poste (gratuit, sans PA, tout le monde peut le faire).',
        'Poste conseillé : celui de sa spécialité (maçon → chantier, maraîcher → potager, berger → pâturage, soudeur → forge…).',
      ],
      gain: 'Rations, bois, chantiers ou outils chaque nuit',
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

  // Filières, péremption & stockage (V5.6)
  const supply = planSupplyNight(s, season);
  if (Object.keys(supply.spoiled).length > 0) {
    const lost = Object.entries(supply.spoiled).map(([k, n]) => `${C.STORAGE_LABEL[k as C.StorageKey].label.toLowerCase()} −${n}`).join(', ');
    P.add({
      key: 'spoil', emoji: '❄️', title: 'Arrêter le gâchis : une chambre froide', urgent: false, score: 44,
      short: 'La chaleur gâte rations, tomates et prunes chaque nuit.',
      why: `L'été (ou quand il fait plus de ${C.SPOIL_HOT_C} °C), les vivres frais se gâtent la nuit : ${lost} cette nuit. Une chambre froide en service arrête tout le gâchis. Fromage et ratafia, eux, se gardent.`,
      actionCode: 'plan_building', preset: { params: { variant: 'cold_room' } },
      steps: ['La chambre froide demande l’électricité.', 'En attendant : vendre les tomates, faire des conserves, distiller les prunes en ratafia.'],
      gain: 'Plus aucune perte de vivres',
    });
  }
  const full = (Object.keys(supply.caps) as C.StorageKey[]).filter((k) => storageAmount(v as VillageState, k) >= supply.caps[k] * 0.9);
  if (full.length > 0) {
    const k = full[0]!;
    const meta = C.STORAGE_LABEL[k];
    const sell = C.MARKET_ITEMS.find((m) => m.stock === k);
    P.add({
      key: `storage:${k}`, emoji: '🏚️', title: sell ? `Vendre du surplus : ${meta.label.toLowerCase()}` : 'Bâtir un hangar', urgent: false, score: 52,
      short: `${meta.label} presque plein : au-delà, le surplus se perd la nuit.`,
      why: `Chaque réserve a une capacité (${full.map((x) => `${C.STORAGE_LABEL[x].label.toLowerCase()} ${Math.floor(storageAmount(v as VillageState, x))} / ${supply.caps[x]}`).join(', ')}). Ce qui dépasse se perd chaque nuit. Un hangar relève toutes les capacités (×1,5, puis ×2 et ×2,5 avec ses niveaux).`,
      actionCode: sell ? 'market_sale' : 'plan_building', preset: sell ? { catalog_item_id: sell.id } : { params: { variant: 'shed' } },
      steps: [sell ? `Vendre au marché d'Organyà (+30 % le samedi).` : 'Hangar : 500 €, sur une parcelle libre.', 'Ou bâtir (ou améliorer) le hangar pour garder davantage.'],
      gain: sell ? 'Argent pour la caisse' : 'Plus de place pour tout',
    });
  }
  if (pantryAmount(v, 'plums_kg') >= C.RATAFIA_PLUMS_KG) {
    P.add({
      key: 'ratafia', emoji: '🍶', title: 'Distiller du ratafia', urgent: false, score: 40,
      short: `Des prunes mûres : ${C.RATAFIA_PLUMS_KG} kg font ${C.RATAFIA_BOTTLES} bouteilles de ratafia.`,
      why: `Le verger donne des prunes l'été et l'automne, mais elles se gâtent vite. En ratafia légal (${C.RATAFIA_COST_EUR} € d'eau-de-vie et de droits), elles se gardent et se vendent au marché.`,
      actionCode: 'make_ratafia',
      steps: [`1 PA, ${C.RATAFIA_PLUMS_KG} kg de prunes et ${C.RATAFIA_COST_EUR} € de la caisse.`, 'Ensuite : vendre les bouteilles au marché d’Organyà.'],
      gain: `${C.RATAFIA_BOTTLES} bouteilles à vendre`,
    });
  }
  if (pantryAmount(v, 'cheese_kg') >= 4) {
    P.add({
      key: 'cheese:sell', emoji: '🧀', title: `Vendre ${Math.floor(pantryAmount(v, 'cheese_kg'))} kg de fromage`, urgent: false, score: v.treasury_eur < 3000 ? 55 : 32,
      short: 'Du fromage en réserve : il se vend bien à Organyà.',
      why: 'Le fromage du hameau est le produit le mieux payé du marché d’Organyà, surtout le samedi.',
      actionCode: 'market_sale', preset: { catalog_item_id: 'cheese' },
      steps: ['1 PA par vente, par lots de 2 kg ; le marché sature au fil de la semaine.'],
      gain: 'Argent pour la caisse',
    });
  }

  // Résidents maussades (V5.7) : le rendement baisse, un encouragement par jour remonte l'humeur
  const sulky = sulkingResidents(data.migrants);
  if (sulky.length > 0) {
    const m = sulky[0]!;
    const p = residentPersona(m, data.migrants, now);
    P.add({
      key: `mood:${m.id}`, emoji: '😞', title: `Remonter le moral de ${firstName(m)}`, urgent: false, score: p.cheeredToday ? 20 : 45,
      short: `Humeur ${p.mood}/100 : son rendement baisse de ${Math.round((1 - C.MOOD_SULK_FACTOR) * 100)} %.`,
      why: `Sous ${C.MOOD_SULK_AT} d'humeur, un résident travaille moins bien${p.lastReason ? ` ; la nuit dernière, c'est surtout ${p.lastReason} qui a pesé` : ''}. Le travail, le repas, le feu et les amis font remonter l'humeur.${sulky.length > 1 ? ` Aussi maussades : ${sulky.slice(1).map(firstName).join(', ')}.` : ''}`,
      actionCode: 'cheer_resident', preset: { target_migrant_id: m.id },
      steps: [`${C.CHEER_AP} PA : +${C.CHEER_MOOD} d'humeur, une fois par jour et par résident.`, 'Un poste à sa spécialité, des rations et du bois l’hiver le gardent de bonne humeur.'],
      gain: `+${C.CHEER_MOOD} d'humeur`,
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

  // Objectifs d'Acte (V5.1) : une priorité qui coche une étape restante le dit et passe un peu devant
  const goals = actGoalsView(data);
  for (const item of P.items) {
    const g = goalForPriority(goals, item.key);
    if (!g) continue;
    item.goal = `${g.icon} ${g.label}`;
    item.score += GOAL_PRIORITY_BONUS;
    item.steps = [...item.steps, `Objectif de l'Acte : « ${g.label} » — récompense : ${g.reward}.`];
  }
  const items = P.items.sort((a, b) => b.score - a.score);
  const nextAct = act === 1 ? { act: 2 as const, at: C.ACT_THRESHOLDS.act2 } : act === 2 ? { act: 3 as const, at: C.ACT_THRESHOLDS.act3 } : null;
  return { act, autonomy: v.autonomy_pct, nextAct, pillars: pillarsOf(auto, data, foodPct), items, goals };
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
