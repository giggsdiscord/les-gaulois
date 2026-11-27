/**
 * Dictionnaire local de secours (fallback déterministe) du Maître du Jeu [GDD §7.2, §7.3].
 * Utilisé sans clé API, en cas d'erreur, de délai dépassé, de refus ou de réponse invalide.
 * Produit une réponse au même format JSON que l'IA (elle passe ensuite par le même bornage).
 * Tous les tirages sont déterministes (graine fournie par l'appelant).
 */
import { createRng, type Rng, type TemptationEffects } from '../../engine/index.ts';
import type { GmContext, GmTask } from './prompt.ts';
import { DELTA_KEYS, TEMPTATION_EFFECT_KEYS } from './schema.ts';
import {
  draftTemptationFromBank,
  isTemptationTheme,
  pickTemptationTheme,
  TEMPTATION_AMBIANCE,
  temptationConditions,
} from './temptationBank.ts';

type Deltas = Partial<Record<(typeof DELTA_KEYS)[number], number>>;

export interface RawGmResponse {
  gazette_headline: string;
  narrative_text: string;
  deltas: Record<string, number>;
  triggered_incident: { type: string; severity: number; description: string; target_player_id: string | null } | null;
  new_migrant_candidate: Record<string, unknown> | null;
  private_temptation: Record<string, unknown> | null;
}

function fullDeltas(d: Deltas): Record<string, number> {
  return Object.fromEntries(DELTA_KEYS.map((k) => [k, d[k] ?? 0]));
}

function empty(headline: string, narrative: string, deltas: Deltas = {}): RawGmResponse {
  return {
    gazette_headline: headline,
    narrative_text: narrative,
    deltas: fullDeltas(deltas),
    triggered_incident: null,
    new_migrant_candidate: null,
    private_temptation: null,
  };
}

export function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ---------------------------------------------------------------------------
// Actions libres : règles par mots-clés
// ---------------------------------------------------------------------------
interface KeywordRule {
  keys: string[];
  deltas: Deltas;
  headline: string;
  narrative: (who: string) => string;
}

const FREE_ACTION_RULES: KeywordRule[] = [
  {
    keys: ['contreband', 'andorre', 'detaxe', 'frontiere'],
    deltas: { treasury_eur: 300, admin_pressure_pct: 4 },
    headline: 'Allers-retours suspects vers Andorre',
    narrative: (w) => `${w} revient du Pas de la Casa avec un coffre étrangement lourd. La caisse respire un peu mieux. À la sortie de la Seu d'Urgell, un agent de la Guardia Civil a pris le temps de noter la plaque. « Bon dia », a-t-il dit, sans sourire.`,
  },
  {
    keys: ['vol', 'derob', 'detourn', 'pique', 'chaparde'],
    deltas: { treasury_eur: -200, insecurity_pct: 3, morale_pct: -2 },
    headline: 'Des euros s\'évaporent au hameau',
    narrative: (w) => `Une somme disparaît de la boîte à biscuits qui sert de coffre. ${w} jure n'y être pour rien. M. Lerme recompte trois fois, puis une quatrième par principe. L'ambiance se tend à La Taverne.`,
  },
  {
    keys: ['negoci', 'marchand', 'tarif', 'remise', 'fournisseur', 'bigmat', 'gedimat', 'loxam', 'kiloutou', 'sograma'],
    deltas: { treasury_eur: 150, spanish_fluency_pct: 1 },
    headline: 'Âpres négociations au comptoir',
    narrative: (w) => `${w} passe la matinée au comptoir du fournisseur. À force de « ¿y si lo pagamos en efectivo? », une remise finit par tomber. Le vendeur promet de ne plus jamais ouvrir le samedi.`,
  },
  {
    keys: ['fete', 'apero', 'biere', 'vin', 'tournee', 'soiree', 'banquet', 'ratafia'],
    deltas: { morale_pct: 4, alcohol_consumption_pct: 2 },
    headline: 'Soirée animée sur la Plaça del Poble',
    narrative: (w) => `${w} sort les bouteilles et le banjo de Julio suit. La soirée se termine tard, le ratafia aussi. Le moral remonte ; le réveil, lui, sera plus discutable.`,
  },
  {
    keys: ['repar', 'bricol', 'entret', 'nettoy', 'deblai', 'chantier', 'piste'],
    deltas: { track_condition_pct: 2, morale_pct: 1 },
    headline: 'Coup de main bénévole sur la piste',
    narrative: (w) => `${w} rebouche deux nids-de-poule et dégage une souche qui menaçait les suspensions. Personne ne l'a demandé, tout le monde en profite.`,
  },
  {
    keys: ['tomate', 'potager', 'jardin', 'legume', 'semis'],
    deltas: { food_rations: 5, tomatoes_stock: 5 },
    headline: 'Main verte au potager d\'Ely',
    narrative: (w) => `${w} désherbe, arrose et tuteure. Ely inspecte, hoche la tête et ne dit rien, ce qui chez elle vaut une médaille. Quelques rations de plus finiront dans la réserve.`,
  },
  {
    keys: ['chasse', 'peche', 'sanglier', 'truite', 'champignon', 'cepe'],
    deltas: { food_rations: 8 },
    headline: 'Retour de cueillette',
    narrative: (w) => `${w} revient de la forêt de l'Obaga, les bottes trempées et le panier plein. Les agents environnementaux n'ont rien vu. Cette fois.`,
  },
  {
    keys: ['police', 'mossos', 'guardia', 'mairie', 'ayuntamiento', 'administration', 'permis'],
    deltas: { admin_pressure_pct: -2, spanish_fluency_pct: 1 },
    headline: 'Visite de courtoisie à l\'Ayuntamiento',
    narrative: (w) => `${w} apporte des tomates au secrétaire de mairie. Le dossier n'avance pas, mais il sent meilleur. On promet de « mirar-ho ».`,
  },
  {
    keys: ['espagnol', 'catalan', 'cours', 'apprend', 'langue'],
    deltas: { spanish_fluency_pct: 2 },
    headline: 'Progrès linguistiques',
    narrative: (w) => `${w} enchaîne les conjugaisons avec la boulangère d'Organyà. Le subjonctif résiste encore, mais les commandes de pain sont désormais exactes.`,
  },
  {
    keys: ['priere', 'messe', 'medit', 'confess', 'eglise'],
    deltas: { morale_pct: 2 },
    headline: 'Recueillement à Sant Climent',
    narrative: (w) => `${w} passe un moment dans l'église de Sant Climent. Brunel fait semblant de ne pas remarquer, ce qui est une forme de pastorale.`,
  },
  {
    keys: ['bebe', 'enfant', 'famille', 'mariage', 'seduc', 'amour', 'rendez-vous'],
    deltas: { morale_pct: 3, demographic_viability_pct: 1 },
    headline: 'Rumeurs sentimentales au lavoir',
    narrative: (w) => `On aurait vu ${w} rentrer tard, de bonne humeur. Les spéculations vont bon train à La Taverne ; l'indice de pérennité démographique, lui, se prend à rêver.`,
  },
  {
    keys: ['greve', 'syndic', 'collectiv', 'revolution', 'tract'],
    deltas: { left_wing_ideology_pct: 2, morale_pct: -1 },
    headline: 'Agitation militante dans les ruines',
    narrative: (w) => `${w} distribue des tracts dactylographiés dans la Borda Alta. Le vocabulaire est ambitieux, l'orthographe aussi. Certains résidents les lisent avec intérêt.`,
  },
  {
    keys: ['journal', 'presse', 'video', 'reseaux', 'instagram', 'tiktok', 'photo'],
    deltas: { international_notoriety_pct: 2 },
    headline: 'Le hameau fait parler de lui',
    narrative: (w) => `${w} publie une vidéo du lever de soleil sur les ruines. Trois médias locaux la reprennent, un influenceur andorran la commente. La notoriété monte, les demandes d'autographes non.`,
  },
];

function freeActionFallback(task: Extract<GmTask, { kind: 'free_action' }>, rng: Rng): RawGmResponse {
  const text = normalizeText(task.text);
  const rule = FREE_ACTION_RULES.find((r) => r.keys.some((k) => text.includes(k)));
  const who = task.player.display_name;
  if (rule) return empty(rule.headline, rule.narrative(who), rule.deltas);
  const variants = [
    `Le Maître du Jeu, parti cueillir des cèpes, note l'initiative de ${who} d'un hochement de tête. Rien ne bouge vraiment, mais l'intention est saluée à La Taverne.`,
    `${who} s'affaire toute la journée. Le résultat est difficile à mesurer, ce qui, au hameau, est déjà une tradition.`,
    `Initiative de ${who} : les voisins observent, perplexes. On en reparlera dimanche à l'Agora.`,
  ];
  return empty('Initiative individuelle', rng.pick(variants), { morale_pct: 1 });
}

// ---------------------------------------------------------------------------
// Initiatives adoptées à l'Agora : effets cumulés des règles reconnues (3 max)
// ---------------------------------------------------------------------------
interface InitiativeRule {
  keys: string[];
  deltas: (treasury: number) => Deltas;
  label: string;
}

const INITIATIVE_RULES: InitiativeRule[] = [
  { keys: ['fonds souverain', 'norveg', 'epargne', 'fonds'], deltas: (t) => ({ sovereign_fund_eur: Math.min(5000, Math.round(Math.max(0, t) * 0.1)), morale_pct: 2 }), label: 'un premier versement au fonds souverain' },
  { keys: ['taxe', 'impot', 'redevance', 'cotisation', 'contribution'], deltas: () => ({ treasury_eur: 1500, morale_pct: -3 }), label: 'une nouvelle contribution des habitants' },
  { keys: ['ecole', 'education', 'formation', 'apprenti', 'enfant'], deltas: () => ({ treasury_eur: -1000, demographic_viability_pct: 2, morale_pct: 2 }), label: 'un effort pour l\'école du hameau' },
  { keys: ['securite', 'police', 'garde', 'milice', 'surveillance'], deltas: () => ({ treasury_eur: -800, insecurity_pct: -6 }), label: 'un renforcement de la sécurité' },
  { keys: ['fete', 'festival', 'concert', 'banquet', 'bor'], deltas: () => ({ treasury_eur: -500, morale_pct: 6, alcohol_consumption_pct: 3 }), label: 'des festivités' },
  { keys: ['immigration', 'accueil', 'refugie', 'integration'], deltas: () => ({ cultural_friction_pct: -2, demographic_viability_pct: 2, left_wing_ideology_pct: 1 }), label: 'une politique d\'accueil' },
  { keys: ['quota', 'fermeture', 'restriction', 'selection'], deltas: () => ({ cultural_friction_pct: -3, left_wing_ideology_pct: -2, international_notoriety_pct: -1 }), label: 'une politique migratoire restrictive' },
  { keys: ['route', 'piste', 'chemin', 'empierr'], deltas: () => ({ treasury_eur: -1200, track_condition_pct: 8 }), label: 'des travaux sur la piste' },
  { keys: ['ecolog', 'foret', 'grenouille', 'nature', 'biodiversite'], deltas: () => ({ morale_pct: 2, international_notoriety_pct: 1 }), label: 'une mesure écologique' },
  { keys: ['alcool', 'sobriete', 'prohibition', 'drogue'], deltas: () => ({ alcohol_consumption_pct: -4, drug_prevalence_pct: -2, morale_pct: -2 }), label: 'une campagne de sobriété' },
  { keys: ['monnaie', 'crypto', 'banque', 'credit'], deltas: () => ({ treasury_eur: 500, admin_pressure_pct: 3 }), label: 'une innovation financière' },
  { keys: ['constitution', 'independance', 'souverainete', 'passeport'], deltas: () => ({ international_notoriety_pct: 3, admin_pressure_pct: 4 }), label: 'un pas vers la souveraineté' },
  { keys: ['propriete privee', 'prive', 'merite', 'entreprise'], deltas: () => ({ left_wing_ideology_pct: -2, morale_pct: 1 }), label: 'un encouragement à l\'initiative privée' },
  { keys: ['partage', 'egalit', 'commun', 'solidarit'], deltas: () => ({ left_wing_ideology_pct: 2, morale_pct: 1 }), label: 'une mesure de partage' },
];

const CATEGORY_DEFAULTS: Record<string, Deltas> = {
  economy: { treasury_eur: 300 },
  justice: { insecurity_pct: -3 },
  immigration: { demographic_viability_pct: 1 },
  infrastructure: { track_condition_pct: 3 },
  constitution: { international_notoriety_pct: 2 },
  society: { morale_pct: 2 },
  energy: { treasury_eur: -300, morale_pct: 1 },
  security: { insecurity_pct: -3 },
};

function initiativeFallback(task: Extract<GmTask, { kind: 'initiative' }>, ctx: GmContext): RawGmResponse {
  const text = normalizeText(`${task.proposal.title} ${task.proposal.detailed_explanation}`);
  const treasury = Number(ctx.village.treasury_eur ?? 0);
  const matched = INITIATIVE_RULES.filter((r) => r.keys.some((k) => text.includes(k))).slice(0, 3);
  const total: Deltas = {};
  const add = (d: Deltas) => {
    for (const [k, v] of Object.entries(d) as [keyof Deltas, number][]) total[k] = (total[k] ?? 0) + v;
  };
  if (matched.length === 0) add(CATEGORY_DEFAULTS[task.proposal.category] ?? { morale_pct: 1 });
  for (const r of matched) add(r.deltas(treasury));
  const what = matched.length > 0 ? matched.map((r) => r.label).join(', ') : 'une mesure dont chacun interprète la portée à sa façon';
  return empty(
    `L'Agora adopte « ${task.proposal.title} »`,
    `Par ${task.proposal.yes} voix contre ${task.proposal.no}, l'Agora entérine l'initiative. Concrètement : ${what}. M. Lerme ouvre une nouvelle ligne au grand livre, Ely la signe d'un geste présidentiel. Les sceptiques promettent d'en reparler dimanche prochain.`,
    total,
  );
}

// ---------------------------------------------------------------------------
// Dossiers de candidats migrants (générateur déterministe)
// ---------------------------------------------------------------------------
interface OriginProfile {
  origin: string;
  names: string[];
  religions: [string, number][];
  spanish: number; // probabilité (%) d'être hispanophone
}

const ORIGINS: OriginProfile[] = [
  { origin: 'Catalogne rurale (Pallars)', names: ['Jordi Puig', 'Montse Vilaró', 'Pere Casals', 'Núria Soler', 'Ramon Bosch'], religions: [['Catholique', 55], ['Athée/Laïque', 45]], spanish: 100 },
  { origin: 'Andalousie (Jaén)', names: ['Antonio Ruiz', 'Carmen Moreno', 'Manuel Ortega', 'Rocío Castillo'], religions: [['Catholique', 65], ['Athée/Laïque', 35]], spanish: 100 },
  { origin: 'Maghreb (Maroc)', names: ['Youssef El Amrani', 'Fatima Zahra Benali', 'Karim Haddad', 'Salma Ouazzani'], religions: [['Musulmane', 70], ['Athée/Laïque', 30]], spanish: 45 },
  { origin: 'Afrique subsaharienne (Sénégal)', names: ['Moussa Diop', 'Aminata Ndiaye', 'Ibrahima Fall', 'Awa Sarr'], religions: [['Musulmane', 60], ['Catholique', 30], ['Évangélique', 10]], spanish: 25 },
  { origin: 'Europe de l\'Est (Roumanie)', names: ['Andrei Popescu', 'Ioana Marin', 'Florin Dumitru', 'Elena Stan'], religions: [['Orthodoxe', 75], ['Athée/Laïque', 25]], spanish: 50 },
  { origin: 'Europe de l\'Est (Ukraine)', names: ['Oleksandr Kovalenko', 'Olena Shevchenko', 'Dmytro Bondarenko', 'Iryna Melnyk'], religions: [['Orthodoxe', 65], ['Athée/Laïque', 35]], spanish: 15 },
  { origin: 'Amérique latine (Colombie)', names: ['Sergio Martínez', 'Luisa Fernanda Gómez', 'Andrés Rojas', 'Paola Vargas'], religions: [['Catholique', 60], ['Évangélique', 30], ['Athée/Laïque', 10]], spanish: 100 },
  { origin: 'Amérique latine (Argentine)', names: ['Martín Fernández', 'Sofía Romero', 'Lucas Giménez', 'Valentina Acosta'], religions: [['Catholique', 50], ['Athée/Laïque', 50]], spanish: 100 },
  { origin: 'Asie (Philippines)', names: ['José Reyes', 'Maria Santos', 'Ramon Dela Cruz', 'Liza Bautista'], religions: [['Catholique', 80], ['Évangélique', 20]], spanish: 20 },
  { origin: 'France (Occitanie)', names: ['Bastien Mercier', 'Chloé Fabre', 'Thibault Roques', 'Léa Bousquet'], religions: [['Athée/Laïque', 70], ['Catholique', 30]], spanish: 35 },
  { origin: 'Pays-Bas (Utrecht)', names: ['Jeroen de Vries', 'Sanne Bakker', 'Pieter Visser', 'Anouk Smit'], religions: [['Athée/Laïque', 80], ['Protestante', 20]], spanish: 30 },
];

const LEANING_WEIGHTS: [string, number][] = [
  ['Droite conservatrice', 20],
  ['Droite libérale', 20],
  ['Centre', 25],
  ['Gauche sociale', 22],
  ['Extrême gauche / Collectiviste', 13],
];
const LEFT_BASE: Record<string, number> = {
  'Droite conservatrice': 10,
  'Droite libérale': 20,
  Centre: 40,
  'Gauche sociale': 65,
  'Extrême gauche / Collectiviste': 90,
};
const SPECIALTY_WEIGHTS: [string, number][] = [
  ['mason', 16], ['carpenter', 12], ['welder', 10], ['farmer', 16], ['mechanic', 12], ['electrician', 10], ['shepherd', 9], ['unskilled', 15],
];
const SPECIALTY_PITCH: Record<string, string> = {
  mason: 'Maçon : remonte un mur en pierre sèche sans plan, et sans permis s\'il le faut.',
  carpenter: 'Charpentier : remet une toiture hors d\'eau en une semaine avec du bois de récupération.',
  welder: 'Soudeur : répare herses, remorques et portails ; sait parler aux postes à souder capricieux.',
  farmer: 'Maraîcher : double le rendement d\'un potager en terrasses, connaît les sols calcaires.',
  mechanic: 'Mécanicien diesel : ressuscite tracteurs, groupes électrogènes et pompes immergées.',
  electrician: 'Électricien : tire une ligne, câble un tableau et lit un schéma unifilaire en catalan.',
  shepherd: 'Berger : mène un troupeau en estive et soigne les brebis sans vétérinaire.',
  unskilled: 'Sans qualification, mais endurant et volontaire : prêt à porter des pierres toute la journée.',
};
const PATHOLOGIES = ['Hernie discale ancienne', 'Asthme d\'effort', 'Diabète de type 2 traité', 'Tendinite chronique à l\'épaule'];

function weighted<T>(rng: Rng, items: [T, number][]): T {
  return rng.weighted(items as readonly (readonly [T, number])[]);
}

export function generateMigrantDraft(rng: Rng): Record<string, unknown> {
  const profile = rng.pick(ORIGINS);
  const fullName = rng.pick(profile.names);
  const religion = weighted(rng, profile.religions);
  const leaning = weighted(rng, LEANING_WEIGHTS);
  const left = Math.max(0, Math.min(100, (LEFT_BASE[leaning] ?? 40) + rng.int(-8, 8)));
  const specialty = weighted(rng, SPECIALTY_WEIGHTS);
  const level = specialty === 'unskilled' ? 1 : rng.int(1, 5);
  const children = weighted(rng, [[0, 40], [1, 25], [2, 20], [3, 12], [4, 3]]);
  const backFragility = rng.chance(15);
  const pathology = rng.chance(10) ? rng.pick(PATHOLOGIES) : null;
  const addiction = rng.chance(10) ? rng.int(30, 60) : rng.int(0, 15);
  const faction = left > 70 && rng.chance(40) ? 'union_agitator' : rng.chance(5) ? 'black_market' : religion !== 'Athée/Laïque' && rng.chance(10) ? 'devout' : 'loyalist';
  const risks = [
    backFragility ? 'fragilité lombaire' : null,
    pathology ? pathology.toLowerCase() : null,
    addiction >= 30 ? 'consommation d\'alcool préoccupante' : null,
    faction === 'union_agitator' ? 'passé de militant syndical très actif' : null,
    faction === 'black_market' ? 'connaissances douteuses à Andorre' : null,
  ].filter(Boolean);
  return {
    full_name: fullName,
    age: rng.int(19, 58),
    origin: profile.origin,
    religion,
    political_leaning: leaning,
    left_wing_score: left,
    physical_strength: rng.int(30, 95),
    specialty_code: specialty,
    specialty_level: level,
    children_count: children,
    spanish_speaker: rng.chance(profile.spanish),
    value_proposition: `${SPECIALTY_PITCH[specialty]}${children > 0 ? ` Arrive avec ${children} enfant(s).` : ''}`,
    hidden_risk_note: risks.length > 0 ? `À surveiller : ${risks.join(', ')}.` : null,
    pathology_note: pathology,
    back_fragility: backFragility,
    addiction_level_pct: addiction,
    faction_type: faction,
  };
}

function migrantFallback(rng: Rng): RawGmResponse {
  const draft = generateMigrantDraft(rng);
  const response = empty(
    'Un nouveau visage sur la piste forestière',
    `${String(draft.full_name)} (${String(draft.age)} ans, ${String(draft.origin)}) remonte la piste à pied, sac au dos. Le dossier est déposé au Bureau de l'Immigration ; l'Agora se prononcera dimanche.`,
  );
  response.new_migrant_candidate = draft;
  return response;
}

// ---------------------------------------------------------------------------
// Tentations & Dérives : banque de situations (temptationBank.ts, V4.5)
// ---------------------------------------------------------------------------
function effectsObject(e: TemptationEffects): Record<string, number> {
  return Object.fromEntries(TEMPTATION_EFFECT_KEYS.map((k) => [k, e[k] ?? 0]));
}

function temptationFallback(task: Extract<GmTask, { kind: 'temptation' }>, ctx: GmContext, rng: Rng): RawGmResponse {
  const recent = task.recent ?? [];
  const conditions = temptationConditions(ctx.village);
  const theme = isTemptationTheme(task.theme) ? task.theme : pickTemptationTheme(rng, task.player, recent, conditions);
  const t = draftTemptationFromBank(rng, task.player, recent, theme, conditions);
  const response = empty(t.title, rng.pick(TEMPTATION_AMBIANCE));
  response.private_temptation = {
    target_player_id: task.player.id,
    category: t.category,
    title: t.title,
    prompt_text: t.prompt_text,
    yield_effects: effectsObject(t.yield_effects),
    resist_effects: effectsObject(t.resist_effects),
  };
  return response;
}

// ---------------------------------------------------------------------------
// La Gazette
// ---------------------------------------------------------------------------
const EVENT_PRIORITY = ['defeat', 'independence', 'act_changed', 'putsch', 'sentence', 'epidemic', 'birth', 'scandal', 'migrant_admitted', 'strike', 'sabotage', 'pipe_rupture', 'proposal_passed', 'marriage'];

function gazetteFallback(task: Extract<GmTask, { kind: 'gazette' }>, ctx: GmContext): RawGmResponse {
  const ranked = [...task.events].sort((a, b) => {
    const rank = (t: string) => {
      const i = EVENT_PRIORITY.findIndex((p) => normalizeText(t).includes(p.replace('_', ' ')) || t.includes(p));
      return i < 0 ? 99 : i;
    };
    return rank(a.title) - rank(b.title);
  });
  const story = task.events.filter((e) => e.title.startsWith('Petite histoire : ')).at(-1);
  const neighbor = task.events.filter((e) => e.title.startsWith('Voisins : ')).at(-1);
  const visitor = task.events.filter((e) => e.title.startsWith('Visiteur : ')).at(-1);
  const week = task.events.filter((e) => e.title.startsWith('Bilan de la semaine : ')).at(-1);
  const main = ranked.find((e) => e !== story) ?? story;
  const headline = main ? main.title : `Journée calme au hameau : ${ctx.weather.split(',')[0] ?? 'météo de saison'}`;
  const lines = [
    main ? `${main.title}. ${main.body}` : 'Rien de notable au hameau, ce qui, de l\'avis général, est déjà une performance.',
    task.events.length > 1 ? `Autres nouvelles : ${task.events.slice(1, 4).map((e) => e.title.charAt(0).toLowerCase() + e.title.slice(1)).join(', ')}.` : null,
    story && story !== main ? `Au coin du feu : ${story.body}` : null,
    neighbor && neighbor !== main ? `Chez les voisins : ${neighbor.body}` : null,
    visitor && visitor !== main ? `De passage : ${visitor.body}` : null,
    week && week !== main ? `Bilan de la semaine : ${week.body}` : null,
    task.scandals.length > 0 ? `Côté confessionnal, Brunel n'a manifestement pas eu de visite : ${task.scandals.join(' ; ')}.` : null,
    `Météo : ${ctx.weather}.`,
    ctx.news[0] ? `Pendant ce temps, dans le monde réel : ${ctx.news[0]}.` : null,
  ].filter(Boolean);
  return empty(headline, lines.join(' '));
}

/** Réponse de secours au format JSON du Maître du Jeu. */
export function fallbackResponse(task: GmTask, ctx: GmContext, seed: string): RawGmResponse {
  const rng = createRng(`fallback:${seed}`);
  switch (task.kind) {
    case 'free_action':
      return freeActionFallback(task, rng);
    case 'initiative':
      return initiativeFallback(task, ctx);
    case 'migrant':
      return migrantFallback(rng);
    case 'temptation':
      return temptationFallback(task, ctx, rng);
    case 'gazette':
      return gazetteFallback(task, ctx);
  }
}
