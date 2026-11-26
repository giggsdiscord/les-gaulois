/**
 * Banque des propositions discrètes (Tentations & Dérives) [GDD §6.2, Précisions V4.5].
 *
 * - 15 thèmes (tournées, fêtes, contrebande, jeux d'argent, stupéfiants, évasions, romances,
 *   affaires de cœur, pots-de-vin, combines, idéologie, rivalités, ressources, notoriété, métier),
 *   chacun rattaché à l'une des trois catégories du moteur (festive, sentimental,
 *   ideological_financial — contrainte CHECK de la table temptations, inchangée).
 * - Tirage déterministe (Rng fourni) qui tient compte de l'historique du joueur : aucune situation
 *   déjà reçue parmi ses TEMPTATION_NO_REPEAT_WINDOW derniers dilemmes, thèmes de ses
 *   TEMPTATION_THEME_COOLDOWN derniers dilemmes évités, catégorie précédente moins probable.
 * - Le thème est choisi par la session (pickTemptationTheme) et transmis à l'IA comme au
 *   dictionnaire de secours : les deux varient de la même façon.
 * - Les effets restent modestes ; ils repassent de toute façon par boundTemptationEffects.
 *
 * Logique pure (aucun Deno / npm) : testée par Vitest (tests/functions/temptations.test.ts).
 */
import { constants, type Rng, type TemptationCategory, type TemptationEffects } from '../../engine/index.ts';
import type { PlayerBrief, RecentTemptation } from './prompt.ts';

// ---------------------------------------------------------------------------
// Thèmes
// ---------------------------------------------------------------------------
interface ThemeDef {
  /** Libellé français (prompt IA, documentation). */
  label: string;
  /** Pistes concrètes données à l'IA. */
  hint: string;
  /** Catégorie dominante du thème. */
  category: TemptationCategory;
  /** Poids de tirage (équilibre les trois catégories). */
  weight: number;
  /** Mots-clés (sans accents) pour reconnaître le thème d'un dilemme écrit par l'IA. */
  keys: readonly string[];
}

export const TEMPTATION_THEMES = {
  bar: {
    label: 'Tournées & comptoirs',
    hint: 'bar du col, vermut d\'après-messe, gourde d\'orujo, défi du porron, ratafia, nuit blanche à Sort',
    category: 'festive',
    weight: 1,
    keys: ['tournee', 'bar ', 'ratafia', 'vermut', 'orujo', 'porron', 'gin', 'biere', 'whisky', 'apero', 'cuite', 'comptoir'],
  },
  fiesta: {
    label: 'Fêtes de village & traditions',
    hint: 'Festa Major, calçotada, revetlla, matança del porc, correfoc, bal clandestin dans la grange',
    category: 'festive',
    weight: 1,
    keys: ['festa', 'fete', 'calcot', 'revetlla', 'matanca', 'correfoc', 'bal ', 'sardane', 'carnaval', 'banquet'],
  },
  smuggling: {
    label: 'Contrebande andorrane',
    hint: 'alcool, tabac, gasoil ou électronique détaxés du Pas de la Casa ou de Sant Julià de Lòria, coffre d\'un « cousin », Guardia Civil',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['andorr', 'pas de la casa', 'detax', 'contreband', 'douane', 'cartouche', 'cigarette', 'gasoil', 'sans facture'],
  },
  gambling: {
    label: 'Jeux d\'argent',
    hint: 'poker clandestin, paris sur les duels de Carlage, loterie de Noël, roulette en Andorre, tombola arrangée, jeton miracle',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['poker', 'pari', 'loterie', 'roulette', 'casino', 'tombola', 'mise ', 'jeton', 'crypto'],
  },
  substances: {
    label: 'Stupéfiants & distillation clandestine',
    hint: 'sachet au concert des BOR, plants cachés dans l\'Obaga, champignons hors du guide, comprimés pour le chantier, alambic',
    category: 'festive',
    weight: 1,
    keys: ['sachet', 'cannabis', 'champignon', 'comprime', 'pilule', 'drogue', 'alambic', 'joint', 'herbe'],
  },
  escape: {
    label: 'Évasions & paresse',
    hint: 'bains de Caldea, ski à Port Ainé, plage de Salou, rafting sur la Noguera, grasse matinée le jour de corvée',
    category: 'festive',
    weight: 1,
    keys: ['caldea', 'ski', 'plage', 'salou', 'couette', 'grasse matinee', 'rafting', 'spa', 'escapade', 'vacances'],
  },
  romance: {
    label: 'Romances & séductions',
    hint: 'garde forestière, gardien du refuge, vétérinaire, client du gîte, agent des Mossos trop assidu, rencontre au marché de la Seu',
    category: 'sentimental',
    weight: 2,
    keys: ['diner', 'rendez-vous', 'idylle', 'galant', 'chandelle', 'seduc', 'charme', 'flirt', 'refuge'],
  },
  heart: {
    label: 'Affaires de cœur & secrets',
    hint: 'retour d\'un ex, lettre anonyme, résident marié, mariage arrangé pour des papiers, complicité sur le chantier, poème au mirador',
    category: 'sentimental',
    weight: 2,
    keys: ['ex ', 'lettre', 'flamme', 'mariage', 'marie', 'poeme', 'complicite', 'coeur', 'jalous'],
  },
  bribe: {
    label: 'Pots-de-vin & passe-droits',
    hint: 'enveloppe d\'un entrepreneur de Lleida, secrétaire de l\'Ayuntamiento, agent rural, attestation PLU de complaisance, commission d\'un fournisseur',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['enveloppe', 'pot-de-vin', 'commission', 'complaisance', 'secretaire', 'agent rural', 'carnet', 'passe-droit', 'assurance'],
  },
  embezzlement: {
    label: 'Caisse, factures & combines',
    hint: 'facture gonflée, nuits du gîte en liquide, cuivre des vieilles lignes, subvention européenne fictive, caisse noire, heures gonflées',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['facture', 'caisse noire', 'detourn', 'liquide', 'subvention', 'registre', 'grand livre', 'heures', 'cuivre'],
  },
  ideology: {
    label: 'Idéologie & militantisme',
    hint: 'tracts collectivistes, comité des rations, banderole indépendantiste, émissaire libertarien, grève du zèle, collectif de Barcelone, sermon politique',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['tract', 'collectiv', 'syndic', 'militant', 'greve', 'independ', 'libertar', 'comite', 'egalit', 'sermon', 'propriete privee'],
  },
  rivalry: {
    label: 'Rivalités entre fondateurs',
    hint: 'grand livre de M. Lerme resté ouvert, rumeur avant l\'Agora, outil emprunté sans demander, photo compromettante, voix achetée, ordre du jour réécrit',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['rumeur', 'rival', 'photo', 'voix', 'ordre du jour', 'sabot', 'jaloux', 'compromet', 'masse'],
  },
  resources: {
    label: 'Ressources du village',
    hint: 'rations « en trop », eau détournée, bois de chauffage vendu au noir, électricité de la ferme de minage, tomates d\'Ely, groupe électrogène loué',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['ration', 'reserve', 'conduite', 'irrig', 'stere', 'bois de chauffage', 'compteur', 'groupe electrogene', 'cagette'],
  },
  fame: {
    label: 'Notoriété & médias',
    hint: 'reportage de TV3, influenceur andorran, tabloïd britannique, sponsor de boisson énergisante, défi en direct, documentaire « un peu scénarisé »',
    category: 'ideological_financial',
    weight: 0.5,
    keys: ['tv3', 'influenc', 'tabloid', 'journaliste', 'sponsor', 'reportage', 'documentaire', 'en direct', 'abonnes'],
  },
  calling: {
    label: 'Tentations du métier',
    hint: 'abus discret des prérogatives du personnage (voix prépondérante, kiné, plans, ferme de minage, forge, laboratoire, confessions)',
    category: 'ideological_financial',
    weight: 1,
    keys: ['voix preponderante', 'kine', 'minage', 'forge', 'laboratoire', 'confession', 'sacristie', 'plans'],
  },
} as const satisfies Record<string, ThemeDef>;

export type TemptationTheme = keyof typeof TEMPTATION_THEMES;
export const TEMPTATION_THEME_CODES = Object.keys(TEMPTATION_THEMES) as TemptationTheme[];

export function isTemptationTheme(value: unknown): value is TemptationTheme {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(TEMPTATION_THEMES, value);
}

// ---------------------------------------------------------------------------
// Conditions du moment (réalisme : pas de ski en août)
// ---------------------------------------------------------------------------
export interface TemptationConditions {
  temp_c: number | null;
  snow_cm: number | null;
}

export function temptationConditions(village: { real_temp_c?: unknown; real_snow_cm?: unknown }): TemptationConditions {
  const n = (x: unknown) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  return { temp_c: n(village.real_temp_c), snow_cm: n(village.real_snow_cm) };
}

const cold = (c: TemptationConditions) => (c.snow_cm !== null && c.snow_cm > 0) || (c.temp_c !== null && c.temp_c <= 6);
const hot = (c: TemptationConditions) => c.temp_c !== null && c.temp_c >= 22;
const mild = (c: TemptationConditions) => c.temp_c !== null && c.temp_c >= 15;

// ---------------------------------------------------------------------------
// Situations
// ---------------------------------------------------------------------------
export interface TemptationTemplate {
  key: string;
  theme: TemptationTheme;
  category: TemptationCategory;
  title: string;
  prompt: (p: PlayerBrief, r: Rng) => string;
  yield_effects: TemptationEffects;
  resist_effects: TemptationEffects;
  /** Rôles pour lesquels la situation colle particulièrement (poids ×3). */
  roles?: string[];
  /** Réservée à ces rôles. */
  only?: string[];
  /** Exclue pour ces rôles (le texte les cite à la troisième personne). */
  notFor?: string[];
  /** Condition météo réelle. */
  when?: (c: TemptationConditions) => boolean;
}

const FOUNDERS: [string, string][] = [
  ['mayor_agri', 'Ely'],
  ['treasurer_physio', 'M. Lerme'],
  ['civil_eng', 'Tiphaine'],
  ['water_eng', 'Alex'],
  ['smith_diplo', 'Julio'],
  ['druid', 'Tanguy'],
  ['priest_apoth', 'Brunel'],
];

/** Un autre fondateur que le joueur (pour les rivalités). */
function otherFounder(p: PlayerBrief, r: Rng): string {
  return r.pick(FOUNDERS.filter(([role, name]) => role !== p.role_code && name !== p.display_name).map(([, name]) => name));
}

const is = (p: PlayerBrief, role: string) => p.role_code === role;

const TEMPLATES: TemptationTemplate[] = [
  // --- Tournées & comptoirs -------------------------------------------------
  {
    key: 'bar_col', theme: 'bar', category: 'festive', title: 'Tournée générale au bar du col',
    prompt: (p) => `${p.character_name}, le patron du bar du col vous reconnaît : « La primera ronda la paga la casa ! » Il est 23 h et le chantier reprend à 7 h. Vous restez ?`,
    yield_effects: { morale_pct: 10, alcohol_consumption_pct: 2, addiction_level_pct: 6 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'bar_ratafia', theme: 'bar', category: 'festive', title: 'Concours de ratafia',
    prompt: () => 'Le village voisin organise un concours de ratafia maison et vous êtes désigné juré. Le règlement impose de goûter les quatorze bouteilles, « per respecte ». Vous acceptez la charge ?',
    yield_effects: { alcohol_consumption_pct: 2, addiction_level_pct: 4, morale_pct: 6 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'bar_vermut', theme: 'bar', category: 'festive', title: 'Vermut d\'après-messe à Organyà',
    prompt: () => 'À la sortie de la messe, les anciens d\'Organyà vous font signe : « Un vermut, només un. » Il en vient toujours un deuxième avec les olives, puis un troisième « per la cama coixa ». L\'Agora ouvre à 11 h.',
    yield_effects: { alcohol_consumption_pct: 2, addiction_level_pct: 4, morale_pct: 8 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'bar_orujo', theme: 'bar', category: 'festive', title: 'La gourde du berger', notFor: ['druid'],
    prompt: () => 'Un berger qui redescend d\'estive vous tend sa gourde d\'orujo : « Fait par mon beau-frère, 60 degrés, c\'est de la médecine. » Tanguy a une opinion très arrêtée sur la médecine à 60 degrés. Vous trinquez ?',
    yield_effects: { alcohol_consumption_pct: 2, addiction_level_pct: 5, morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'bar_porron', theme: 'bar', category: 'festive', title: 'Défi du porron à Coll de Nargó',
    prompt: () => 'Au bar de Coll de Nargó, des chasseurs vous défient au porron : boire au jet sans tacher sa chemise, le perdant paie la tournée. Vous avez déjà perdu deux fois, mais vous sentez que la troisième sera la bonne.',
    yield_effects: { alcohol_consumption_pct: 3, addiction_level_pct: 5, morale_pct: 8, private_wealth_eur: -40 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'bar_rafteurs', theme: 'bar', category: 'festive', title: 'Fin de saison des rafteurs à Sort',
    prompt: () => 'Les moniteurs de rafting de la Noguera Pallaresa fêtent la fin de saison à Sort et vous invitent. Programme annoncé : gin-tonic, karaoké, puis « ja veurem ». Le chantier, lui, reprend à 7 h.',
    yield_effects: { alcohol_consumption_pct: 3, addiction_level_pct: 5, morale_pct: 10 }, resist_effects: { morale_pct: -2 },
  },

  // --- Fêtes de village -----------------------------------------------------
  {
    key: 'fiesta_major', theme: 'fiesta', category: 'festive', title: 'Bracelet VIP pour la Festa Major',
    prompt: (_p, r) => `La Festa Major de ${r.pick(['Organyà', 'Coll de Nargó', 'Oliana', 'Tremp'])} bat son plein : orquestra jusqu'à 4 h, barraque à cocktails, et le comité des fêtes vous a gardé un bracelet VIP. Demain, c'est vous qui êtes de corvée d'eau.`,
    yield_effects: { morale_pct: 12, alcohol_consumption_pct: 3, addiction_level_pct: 4 }, resist_effects: { morale_pct: -3 },
  },
  {
    key: 'fiesta_calcotada', theme: 'fiesta', category: 'festive', title: 'Calçotada qui déborde',
    prompt: () => 'Un voisin organise une calçotada : calçots grillés, romesco, saucisses à la braise et porron qui tourne. On vous attend « pour une heure ou deux », ce qui, ici, veut dire jusqu\'à la nuit.',
    yield_effects: { morale_pct: 10, alcohol_consumption_pct: 2 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'fiesta_revetlla', theme: 'fiesta', category: 'festive', title: 'Revetlla improvisée dans l\'Obaga',
    prompt: () => 'Des jeunes d\'Oliana veulent faire une revetlla dans la clairière de l\'Obaga : grand feu, coca, cava et pétards achetés en Andorre. Il leur manque votre terrain, votre bois et votre bénédiction. Les agents rurals, eux, ne sont pas invités.',
    yield_effects: { morale_pct: 10, alcohol_consumption_pct: 2, admin_pressure_pct: 3 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'fiesta_matanca', theme: 'fiesta', category: 'festive', title: 'Invitation à la matança',
    prompt: () => 'Une famille de Cabó vous invite à la matança del porc : deux jours de botifarres, de vin et de chansons. En échange, on attend de vous un coup de main… et un silence prudent sur l\'abattage fait hors abattoir.',
    yield_effects: { morale_pct: 8, alcohol_consumption_pct: 2, admin_pressure_pct: 2 }, resist_effects: {},
  },
  {
    key: 'fiesta_correfoc', theme: 'fiesta', category: 'festive', title: 'Fourche de diable au correfoc',
    prompt: () => 'La colla de diables de la Seu d\'Urgell vous prête une fourche à feux d\'artifice pour le correfoc de samedi. Ni formation, ni assurance, beaucoup d\'étincelles. « Tranquil, home, és tradició ! »',
    yield_effects: { morale_pct: 10, international_notoriety_pct: 1, admin_pressure_pct: 1 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'fiesta_bal', theme: 'fiesta', category: 'festive', title: 'Bal clandestin dans la grange',
    prompt: () => 'La grange est balayée, le banjo accordé, les guirlandes pendues : il ne manque que l\'électricité, qu\'on vous propose d\'« emprunter » au compteur du chantier pour la nuit. Personne ne relève les compteurs le dimanche.',
    yield_effects: { morale_pct: 10, alcohol_consumption_pct: 2, treasury_eur: -40 }, resist_effects: { morale_pct: -2 },
  },

  // --- Contrebande andorrane ------------------------------------------------
  {
    key: 'smug_bouteilles', theme: 'smuggling', category: 'festive', title: 'Jerricans détaxés d\'Andorre',
    prompt: () => 'Un cousin d\'un ami propose de rapporter « quelques » bouteilles détaxées du Pas de la Casa dans votre coffre. Personne ne contrôle jamais le mardi, paraît-il.',
    yield_effects: { alcohol_consumption_pct: 3, admin_pressure_pct: 2, morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'smug_tabac', theme: 'smuggling', category: 'ideological_financial', title: 'Cartouches en transit',
    prompt: () => 'Un chauffeur de Sant Julià de Lòria cherche un « garage tranquille » pour entreposer quarante cartouches de cigarettes pendant une semaine. 150 € pour vous, et il jure que la Guardia Civil a d\'autres chats à fouetter.',
    yield_effects: { private_wealth_eur: 150, admin_pressure_pct: 4 }, resist_effects: {},
  },
  {
    key: 'smug_gasoil', theme: 'smuggling', category: 'ideological_financial', title: 'Gasoil andorran livré de nuit',
    prompt: () => 'Un contact propose de remplir la cuve du groupe électrogène avec du gasoil andorran, 40 % moins cher, livré de nuit par la piste forestière. Pas de facture, donc pas de problème… en théorie.',
    yield_effects: { treasury_eur: 200, admin_pressure_pct: 5 }, resist_effects: {},
  },
  {
    key: 'smug_coffre', theme: 'smuggling', category: 'ideological_financial', title: 'Le coffre du « cousin »',
    prompt: () => 'On vous demande de passer la douane avec le coffre d\'un « cousin » : deux caisses de whisky, un carton de parfums et un colis dont personne ne connaît le contenu. 100 € et une bouteille pour la peine.',
    yield_effects: { private_wealth_eur: 100, alcohol_consumption_pct: 1, drug_prevalence_pct: 1, admin_pressure_pct: 4 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'smug_telephones', theme: 'smuggling', category: 'ideological_financial', title: 'Téléphones sans facture',
    prompt: () => 'À Andorra la Vella, un vendeur vous cède six téléphones « sans facture » à revendre aux résidents. Bénéfice garanti ; garantie, non.',
    yield_effects: { private_wealth_eur: 180, admin_pressure_pct: 3 }, resist_effects: {},
  },

  // --- Jeux d'argent --------------------------------------------------------
  {
    key: 'gamb_poker', theme: 'gambling', category: 'ideological_financial', title: 'Poker clandestin à la Borda Alta',
    prompt: () => 'Une partie de poker s\'organise ce soir dans la Borda Alta avec deux routiers et un ancien croupier. Mise d\'entrée : 100 €. On murmure que les cartes ne sont pas toutes d\'origine.',
    yield_effects: { private_wealth_eur: -120, addiction_level_pct: 4, morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'gamb_carlage', theme: 'gambling', category: 'ideological_financial', title: 'Parier contre soi-même au Carlage',
    prompt: () => 'Un résident tient un carnet de paris sur les duels de Carlage et vous propose de miser… sur votre propre défaite, à 4 contre 1. Il suffirait d\'un mauvais tir au bon moment.',
    yield_effects: { private_wealth_eur: 200, morale_pct: 4, admin_pressure_pct: 1 }, resist_effects: { morale_pct: 1 },
  },
  {
    key: 'gamb_loterie', theme: 'gambling', category: 'ideological_financial', title: 'Dixièmes de la loterie de Noël',
    prompt: () => 'Le bar d\'Organyà vend des dixièmes de la loterie de Noël et vous propose d\'en acheter dix « pour tout le hameau », avec l\'argent de la caisse commune. S\'il tombe, c\'est l\'indépendance ; sinon, il faudra l\'expliquer au grand livre.',
    yield_effects: { treasury_eur: -200, morale_pct: 8 }, resist_effects: {},
  },
  {
    key: 'gamb_roulette', theme: 'gambling', category: 'festive', title: 'Une théorie sur le rouge',
    prompt: () => 'Des amis de passage vous emmènent tenter votre chance à la roulette en Andorre. Vous avez 200 € en poche et une théorie infaillible sur le rouge.',
    yield_effects: { private_wealth_eur: -150, addiction_level_pct: 5, morale_pct: 8 }, resist_effects: {},
  },
  {
    key: 'gamb_tombola', theme: 'gambling', category: 'ideological_financial', title: 'Tombola arrangée',
    prompt: () => 'Le comité des fêtes vous confie la tombola de la Festa Major. Le gros lot, un jambon de Teruel, doit « naturellement » revenir au neveu du président. 50 € pour votre discrétion.',
    yield_effects: { private_wealth_eur: 50, morale_pct: 4, admin_pressure_pct: 1 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'gamb_jeton', theme: 'gambling', category: 'ideological_financial', title: 'Le jeton qui rapporte 30 % par mois',
    prompt: () => 'Un inconnu sur Telegram vous propose de placer une partie de la caisse dans un jeton « adossé à l\'économie andorrane », garanti à 30 % par mois. Il a un avatar de lion et beaucoup d\'émojis.',
    yield_effects: { treasury_eur: -300, morale_pct: 6 }, resist_effects: {},
  },

  // --- Stupéfiants & distillation -------------------------------------------
  {
    key: 'subst_bor', theme: 'substances', category: 'festive', title: 'After des BOR',
    prompt: () => 'Après le concert, un roadie des BOR vous tend un petit sachet : « Pour tenir jusqu\'à l\'aube. » Les autres sont déjà partis danser dans la grange.',
    yield_effects: { drug_prevalence_pct: 2, addiction_level_pct: 8, morale_pct: 8 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'subst_plants', theme: 'substances', category: 'festive', title: 'Douze plants dans l\'Obaga', notFor: ['mayor_agri'],
    prompt: () => 'Un résident vous montre douze plants de cannabis cachés dans un recoin de l\'Obaga, loin des rondes d\'Ely. Il vous offre la moitié de la récolte contre votre silence et un arrosoir.',
    yield_effects: { drug_prevalence_pct: 2, addiction_level_pct: 5, morale_pct: 6, admin_pressure_pct: 2 }, resist_effects: { drug_prevalence_pct: -1 },
  },
  {
    key: 'subst_champis', theme: 'substances', category: 'festive', title: 'Champignons hors du guide', notFor: ['druid'],
    prompt: () => 'En cueillant des cèpes, un randonneur néerlandais vous fait goûter des champignons qui ne figurent dans aucun guide de Tanguy. « Very natural », insiste-t-il, les pupilles très dilatées.',
    yield_effects: { drug_prevalence_pct: 2, addiction_level_pct: 4, morale_pct: 8 }, resist_effects: {},
  },
  {
    key: 'subst_pilules', theme: 'substances', category: 'festive', title: 'Comprimés pour tenir le chantier',
    prompt: (_p, r) => `Sur le parking de ${r.pick(['BigMat', 'Gedimat'])}, un ouvrier vous propose des comprimés « pour enchaîner trois jours de chantier sans dormir ». Il en prend lui-même et il a l'air en pleine forme. Trop, peut-être.`,
    yield_effects: { drug_prevalence_pct: 2, addiction_level_pct: 8, morale_pct: 6 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'subst_alambic', theme: 'substances', category: 'festive', title: 'Alambic dans la cave', notFor: ['druid'],
    prompt: () => 'Un ancien du coin propose d\'installer son alambic dans votre cave pour distiller de l\'eau-de-vie de prunes. Tanguy démantèle ce genre d\'installation ; raison de plus, dit-il, pour ne rien lui dire.',
    yield_effects: { alcohol_consumption_pct: 3, addiction_level_pct: 4, morale_pct: 6, admin_pressure_pct: 2 }, resist_effects: {},
  },

  // --- Évasions & paresse ---------------------------------------------------
  {
    key: 'esc_caldea', theme: 'escape', category: 'festive', title: 'Après-midi à Caldea',
    prompt: () => 'Des amis vous offrent une entrée aux bains de Caldea, en Andorre : jacuzzis, saunas, cocktails au bord de l\'eau. C\'est cet après-midi, précisément quand vous aviez promis un coup de main sur la piste.',
    yield_effects: { morale_pct: 10, private_wealth_eur: -40 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'esc_ski', theme: 'escape', category: 'festive', title: 'Neige fraîche à Port Ainé', when: cold,
    prompt: () => 'Il est tombé de la neige fraîche à Port Ainé et un ami a deux forfaits pour demain. La piste forestière, elle, attend toujours d\'être déneigée à la pelle.',
    yield_effects: { morale_pct: 10, private_wealth_eur: -50 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'esc_salou', theme: 'escape', category: 'festive', title: 'Deux jours à la plage de Salou', when: hot,
    prompt: () => 'Trois heures de route et c\'est la mer : un ami part à Salou demain à l\'aube et il lui reste une place. Le hameau survivra bien deux jours sans vous. Probablement.',
    yield_effects: { morale_pct: 12, private_wealth_eur: -80 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'esc_couette', theme: 'escape', category: 'festive', title: 'Grasse matinée stratégique',
    prompt: () => 'Votre réveil sonne à 6 h 30 pour la corvée commune. Il fait nuit noire, la couette est chaude et personne ne passera vérifier avant midi.',
    yield_effects: { morale_pct: 6 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'esc_rafting', theme: 'escape', category: 'festive', title: 'Descente de la Noguera en rafting', when: mild,
    prompt: () => 'Une agence de rafting de Sort vous offre une place pour « tester le parcours » : trois heures de rapides, puis paella et sangria au bord de l\'eau. La réunion de chantier est à 15 h.',
    yield_effects: { morale_pct: 10, alcohol_consumption_pct: 1 }, resist_effects: { morale_pct: -1 },
  },

  // --- Romances & séductions ------------------------------------------------
  {
    key: 'rom_garde', theme: 'romance', category: 'sentimental', title: 'Idylle avec une garde forestière',
    prompt: () => 'La garde forestière qui contrôle les coupes de bois prolonge chaque inspection d\'un café. Elle vous propose un dîner à Sort, « sans parler de permis ».',
    yield_effects: { morale_pct: 8, admin_pressure_pct: -2 }, resist_effects: { admin_pressure_pct: 1 },
  },
  {
    key: 'rom_seu', theme: 'romance', category: 'sentimental', title: 'Rendez-vous galant à la Seu d\'Urgell',
    prompt: () => 'Une rencontre au marché de la Seu d\'Urgell vous invite au restaurant samedi. C\'est le jour de la corvée de bois.',
    yield_effects: { morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'rom_refuge', theme: 'romance', category: 'sentimental', title: 'Une nuit au refuge',
    prompt: (_p, r) => `${r.pick(['La gardienne', 'Le gardien'])} du refuge d'en haut vous invite à passer la nuit « pour voir les étoiles depuis le col ». Il ne reste qu'une couverture de libre, a-t-on précisé.`,
    yield_effects: { morale_pct: 8 }, resist_effects: {},
  },
  {
    key: 'rom_veterinaire', theme: 'romance', category: 'sentimental', title: 'Visite vétérinaire prolongée',
    prompt: (p, r) => `${r.pick(['La vétérinaire venue', 'Le vétérinaire venu'])} soigner ${is(p, 'smith_diplo') ? 'vos brebis' : 'les brebis de Julio'} s'attarde au hameau et propose de revenir « en dehors des heures de visite ». Les brebis vont très bien ; ce n'est visiblement pas la question.`,
    yield_effects: { morale_pct: 8 }, resist_effects: {},
  },
  {
    key: 'rom_gite', theme: 'romance', category: 'sentimental', title: 'Client du gîte sous le charme',
    prompt: (_p, r) => `${r.pick(['Une cliente', 'Un client'])} du gîte prolonge son séjour d'une semaine et vous laisse entendre que ce n'est pas pour la vue. Dîner aux chandelles proposé ce soir, chambre 2 — la seule dont le radiateur fonctionne.`,
    yield_effects: { morale_pct: 8, treasury_eur: 80 }, resist_effects: {},
  },
  {
    key: 'rom_mossos', theme: 'romance', category: 'sentimental', title: 'Une patrouille trop assidue',
    prompt: (_p, r) => `${r.pick(['Une agente', 'Un agent'])} des Mossos d'Esquadra passe « vérifier les permis » pour la troisième fois cette semaine, sans carnet. Un dîner à Organyà adoucirait sans doute ses prochains rapports.`,
    yield_effects: { morale_pct: 8, admin_pressure_pct: -3 }, resist_effects: { admin_pressure_pct: 1 },
  },
  {
    key: 'rom_sardane', theme: 'romance', category: 'sentimental', title: 'Cours de sardane particulier',
    prompt: (_p, r) => r.pick([
      'Une danseuse de la colla sardanista de la Seu propose de vous apprendre la sardane en cours particulier, chez elle, « là où le parquet est meilleur ». Le cours commence à 22 h.',
      'Un danseur de la colla sardanista de la Seu propose de vous apprendre la sardane en cours particulier, chez lui, « là où le parquet est meilleur ». Le cours commence à 22 h.',
    ]),
    yield_effects: { morale_pct: 8 }, resist_effects: {},
  },

  // --- Affaires de cœur & secrets -------------------------------------------
  {
    key: 'heart_rivalite', theme: 'heart', category: 'sentimental', title: 'Le même regard au marché',
    prompt: (p, r) => `${otherFounder(p, r)} et vous avez remarqué la même personne au marché d'Organyà. Un mot perfide glissé au bon moment, et le terrain serait libre — l'amitié, un peu moins.`,
    yield_effects: { morale_pct: 6 }, resist_effects: { morale_pct: 1 },
  },
  {
    key: 'heart_chantier', theme: 'heart', category: 'sentimental', title: 'Complicité troublante sur le chantier',
    prompt: () => 'Une complicité de plus en plus troublante s\'installe avec un compagnon de chantier. Ce soir, il vous propose de monter voir les étoiles au mirador.',
    yield_effects: { morale_pct: 8, homosexuality_rate_pct: 0.5 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'heart_ex', theme: 'heart', category: 'sentimental', title: 'Le retour de l\'ex',
    prompt: () => 'Votre ex vous écrit : de passage en Andorre ce week-end, « juste un café, en souvenir ». Le message se termine par trois points de suspension et un cœur.',
    yield_effects: { morale_pct: 8 }, resist_effects: { morale_pct: -2 },
  },
  {
    key: 'heart_lettre', theme: 'heart', category: 'sentimental', title: 'Lettre anonyme sous la porte',
    prompt: (p) => `Une lettre anonyme glissée sous votre porte déclare une flamme « brûlante comme ${is(p, 'smith_diplo') ? 'votre forge' : 'la forge de Julio'} » et donne rendez-vous au lavoir à minuit. L'écriture ressemble étrangement à celle d'un autre habitant du hameau.`,
    yield_effects: { morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'heart_marie', theme: 'heart', category: 'sentimental', title: 'Avances d\'une personne mariée',
    prompt: (_p, r) => `${r.pick(['Une résidente mariée', 'Un résident marié'])} vous fait des avances de plus en plus appuyées. Son conjoint commence à poser des questions à La Taverne ; un rendez-vous discret au vieux moulin, dit-on, « clarifierait les choses ».`,
    yield_effects: { morale_pct: 6 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'heart_mariage', theme: 'heart', category: 'sentimental', title: 'Mariage arrangé pour des papiers', notFor: ['priest_apoth'],
    prompt: (_p, r) => `Un résident vous demande d'épouser ${r.pick(['sa cousine, arrivée', 'son cousin, arrivé'])} sans papiers, pour lui obtenir un titre de séjour. Brunel célébrerait sans poser de questions ; la famille offre 300 € de « cadeau de mariage ».`,
    yield_effects: { private_wealth_eur: 300, admin_pressure_pct: 4, morale_pct: 4 }, resist_effects: {},
  },
  {
    key: 'heart_poeme', theme: 'heart', category: 'sentimental', title: 'Poème au mirador',
    prompt: (_p, r) => r.pick([
      'Une nouvelle résidente vous a écrit un poème en catalan approximatif, où « cor » rime avec « tractor ». Elle vous attend ce soir au mirador avec une bouteille et une couverture.',
      'Un nouveau résident vous a écrit un poème en catalan approximatif, où « cor » rime avec « tractor ». Il vous attend ce soir au mirador avec une bouteille et une couverture.',
    ]),
    yield_effects: { morale_pct: 8, alcohol_consumption_pct: 1 }, resist_effects: { morale_pct: -1 },
  },

  // --- Pots-de-vin & passe-droits -------------------------------------------
  {
    key: 'bribe_enveloppe', theme: 'bribe', category: 'ideological_financial', title: 'Enveloppe discrète',
    prompt: () => 'Un entrepreneur de Lleida vous glisse une enveloppe : « Pour faciliter le dossier de la grange. » Personne n\'en saura rien. En théorie.',
    yield_effects: { treasury_eur: -300, private_wealth_eur: 300, admin_pressure_pct: 3 }, resist_effects: { morale_pct: 1 },
  },
  {
    key: 'bribe_secretaire', theme: 'bribe', category: 'ideological_financial', title: 'Le secrétaire de mairie a soif',
    prompt: () => 'Le secrétaire de l\'Ayuntamiento laisse entendre qu\'un dossier « avance plus vite » avec une caisse de vin du Costers del Segre. Un jambon, ajoute-t-il, accélérerait même la signature.',
    yield_effects: { treasury_eur: -120, admin_pressure_pct: -4 }, resist_effects: { admin_pressure_pct: 2 },
  },
  {
    key: 'bribe_agent_rural', theme: 'bribe', category: 'ideological_financial', title: 'L\'agent rural compréhensif',
    prompt: () => 'Un agent rural constate que le dépôt de gravats derrière la grange n\'a « rien de réglementaire ». Il propose d\'oublier son carnet contre 200 € en liquide, tout de suite.',
    yield_effects: { treasury_eur: -200, admin_pressure_pct: -5 }, resist_effects: { admin_pressure_pct: 4 },
  },
  {
    key: 'bribe_plu', theme: 'bribe', category: 'ideological_financial', title: 'Attestation PLU de complaisance', roles: ['civil_eng'],
    prompt: (p) => is(p, 'civil_eng')
      ? 'Un voisin veut agrandir sa borda en limite du hameau, sans permis. Il vous propose 400 € pour une attestation PLU de complaisance, signée de votre main et antidatée si possible.'
      : 'Un voisin veut agrandir sa borda en limite du hameau, sans permis. Il vous propose 400 € si vous obtenez de Tiphaine une attestation PLU de complaisance — ou si vous imitez sa signature.',
    yield_effects: { private_wealth_eur: 400, admin_pressure_pct: 4 }, resist_effects: {},
  },
  {
    key: 'bribe_commission', theme: 'bribe', category: 'ideological_financial', title: 'Commission du commercial',
    prompt: (_p, r) => `Le commercial de ${r.pick(['BigMat', 'Gedimat', 'Thomas Sograma'])} propose une « commission » de 5 % sur toutes les commandes du hameau si elles passent par lui. Ses prix ont curieusement grimpé de 5 % ce matin.`,
    yield_effects: { private_wealth_eur: 250, treasury_eur: -250 }, resist_effects: {},
  },
  {
    key: 'bribe_pelle', theme: 'bribe', category: 'ideological_financial', title: 'Mini-pelle et fausse panne',
    prompt: (_p, r) => `L'agence ${r.pick(['Loxam', 'Kiloutou'])} de Lleida vous prête une mini-pelle gratuitement ce week-end… à condition de déclarer à l'assurance une panne qui n'a jamais eu lieu.`,
    yield_effects: { treasury_eur: 150, admin_pressure_pct: 3 }, resist_effects: {},
  },

  // --- Caisse, factures & combines ------------------------------------------
  {
    key: 'emb_facture', theme: 'embezzlement', category: 'ideological_financial', title: 'Facture gonflée', notFor: ['treasurer_physio'],
    prompt: () => 'Le fournisseur propose de majorer la facture de 200 € « pour votre peine ». M. Lerme ne vérifie que les totaux, non ?',
    yield_effects: { treasury_eur: -200, private_wealth_eur: 200 }, resist_effects: {},
  },
  {
    key: 'emb_gite', theme: 'embezzlement', category: 'ideological_financial', title: 'Nuits du gîte payées en liquide',
    prompt: () => 'Des randonneurs du GR veulent dormir au gîte et payer en liquide, sans passer par le registre. 180 € qui pourraient très bien ne jamais croiser le grand livre — ou y entrer, si vous les déclarez.',
    yield_effects: { private_wealth_eur: 180, admin_pressure_pct: 2 }, resist_effects: { treasury_eur: 180 },
  },
  {
    key: 'emb_cuivre', theme: 'embezzlement', category: 'ideological_financial', title: 'Le cuivre des vieilles lignes', notFor: ['civil_eng'],
    prompt: () => 'Les anciens câbles électriques des ruines contiennent du cuivre. Un ferrailleur de Ponts en offre 300 € comptant, pour vous seul, à condition qu\'ils disparaissent avant l\'inventaire de Tiphaine.',
    yield_effects: { private_wealth_eur: 300, admin_pressure_pct: 1 }, resist_effects: {},
  },
  {
    key: 'emb_subvention', theme: 'embezzlement', category: 'ideological_financial', title: 'Subvention européenne imaginative',
    prompt: () => 'Un consultant de Lleida propose de monter un dossier de subvention agricole européenne pour trente hectares de cultures qui n\'existent pas encore. Il prend 20 % ; vous n\'avez qu\'à signer.',
    yield_effects: { treasury_eur: 400, admin_pressure_pct: 6 }, resist_effects: {},
  },
  {
    key: 'emb_caisse_noire', theme: 'embezzlement', category: 'ideological_financial', title: 'Petite caisse noire', notFor: ['treasurer_physio'],
    prompt: () => 'Vous avez, pour la journée, les clés de la boîte à biscuits qui sert de coffre. Une petite caisse noire « pour les urgences » ne ferait de mal à personne, et M. Lerme compte surtout les gros billets.',
    yield_effects: { treasury_eur: -150, private_wealth_eur: 150 }, resist_effects: {},
  },
  {
    key: 'emb_heures', theme: 'embezzlement', category: 'ideological_financial', title: 'Heures de chantier gonflées',
    prompt: () => 'Le chantier de la grange est payé à l\'heure par la caisse commune. Un résident propose de déclarer dix heures de plus chacun et de partager. « Personne ne compte vraiment », assure-t-il.',
    yield_effects: { treasury_eur: -160, private_wealth_eur: 80 }, resist_effects: {},
  },

  // --- Idéologie & militantisme ---------------------------------------------
  {
    key: 'ideo_tracts', theme: 'ideology', category: 'ideological_financial', title: 'Tracts collectivistes',
    prompt: () => 'Un résident militant vous demande de distribuer ses tracts « pour l\'égalité des rations ». Ça ne coûte rien, dit-il.',
    yield_effects: { left_wing_ideology_pct: 2, morale_pct: 4 }, resist_effects: { left_wing_ideology_pct: -1 },
  },
  {
    key: 'ideo_comite', theme: 'ideology', category: 'ideological_financial', title: 'Comité secret des rations',
    prompt: () => 'Des résidents montent un « comité des rations » pour exiger un partage strictement égal des tomates et des heures de travail. Ils veulent votre nom en tête de la pétition, en gros.',
    yield_effects: { left_wing_ideology_pct: 3, morale_pct: 4 }, resist_effects: { left_wing_ideology_pct: -1 },
  },
  {
    key: 'ideo_banderole', theme: 'ideology', category: 'ideological_financial', title: 'Banderole géante sur les ruines',
    prompt: () => 'Des militants de la Seu d\'Urgell veulent tendre une immense banderole indépendantiste sur les ruines, « par solidarité entre petites nations ». Les photos feraient le tour des réseaux ; les Mossos aussi.',
    yield_effects: { international_notoriety_pct: 3, admin_pressure_pct: 4, morale_pct: 4 }, resist_effects: { admin_pressure_pct: -1 },
  },
  {
    key: 'ideo_libertarien', theme: 'ideology', category: 'ideological_financial', title: 'L\'émissaire libertarien',
    prompt: () => 'L\'émissaire d\'un micro-État libertarien autoproclamé propose une alliance : passeports croisés, zéro impôt, et 300 € pour votre « fonds de campagne » personnel. Il demande juste que vous défendiez la suppression de la caisse commune à l\'Agora.',
    yield_effects: { private_wealth_eur: 300, left_wing_ideology_pct: -3, international_notoriety_pct: 2 }, resist_effects: {},
  },
  {
    key: 'ideo_greve', theme: 'ideology', category: 'ideological_financial', title: 'Grève du zèle sur le chantier',
    prompt: () => 'Un résident syndicaliste prépare une grève du zèle « pour le repos dominical sur les 30 hectares ». Il lui faut un fondateur pour la lancer, et il a pensé très fort à vous.',
    yield_effects: { left_wing_ideology_pct: 2, morale_pct: 6, treasury_eur: -100 }, resist_effects: { left_wing_ideology_pct: -1 },
  },
  {
    key: 'ideo_collectif', theme: 'ideology', category: 'ideological_financial', title: 'Le collectif de Barcelone',
    prompt: () => 'Un collectif de Barcelone veut s\'installer gratuitement dans une borda en ruine : potager partagé, assemblée permanente, toilettes sèches. Il ne demande que votre parrainage, sans en parler à l\'Agora.',
    yield_effects: { left_wing_ideology_pct: 3, morale_pct: 4, admin_pressure_pct: 2 }, resist_effects: {},
  },
  {
    key: 'ideo_sermon', theme: 'ideology', category: 'ideological_financial', title: 'Sermon sur commande', roles: ['priest_apoth'],
    prompt: (p) => is(p, 'priest_apoth')
      ? 'Un groupe de résidents vous demande de glisser, dans le sermon de dimanche, un passage sur « la propriété privée, péché originel du hameau ». Ils promettent de remplir les bancs.'
      : 'Un groupe de résidents vous demande de convaincre Brunel de glisser, dans le sermon de dimanche, un passage sur « la propriété privée, péché originel du hameau ». Ils comptent sur votre influence.',
    yield_effects: { left_wing_ideology_pct: 2, morale_pct: 4 }, resist_effects: {},
  },

  // --- Rivalités entre fondateurs -------------------------------------------
  {
    key: 'riv_grand_livre', theme: 'rivalry', category: 'ideological_financial', title: 'Le grand livre resté ouvert', notFor: ['treasurer_physio'],
    prompt: () => 'Le grand livre de M. Lerme est resté ouvert sur une table de La Taverne. Une page au moins vous intéresse : celle des patrimoines privés des autres fondateurs.',
    yield_effects: { morale_pct: 6 }, resist_effects: { morale_pct: 1 },
  },
  {
    key: 'riv_rumeur', theme: 'rivalry', category: 'ideological_financial', title: 'Une rumeur bien placée',
    prompt: (p, r) => `Avant le vote de dimanche, un résident vous propose de lancer une rumeur sur ${otherFounder(p, r)} — rien de faux, juste « présenté avec soin ». Votre proposition passerait alors toute seule.`,
    yield_effects: { morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'riv_masse', theme: 'rivalry', category: 'ideological_financial', title: 'La masse de Julio', notFor: ['smith_diplo'],
    prompt: () => 'Julio refuse de vous prêter sa meilleure masse depuis « l\'incident du mois dernier ». Elle est là, dans la forge ouverte, et il est parti pêcher jusqu\'au soir.',
    yield_effects: { morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'riv_photo', theme: 'rivalry', category: 'ideological_financial', title: 'Photo compromettante',
    prompt: (p, r) => `Un résident possède une photo de ${otherFounder(p, r)}, un soir de fête, dans une posture très peu présidentielle. Il vous la cède pour 50 € : de quoi gagner n'importe quel débat à l'Agora.`,
    yield_effects: { private_wealth_eur: -50, morale_pct: 6 }, resist_effects: {},
  },
  {
    key: 'riv_voix', theme: 'rivalry', category: 'ideological_financial', title: 'Une voix à vendre',
    prompt: () => 'Un résident naturalisé vous propose sa voix à l\'Agora pour tout le mois, contre 100 € et la promesse d\'une chambre avec fenêtre.',
    yield_effects: { private_wealth_eur: -100, morale_pct: 4, admin_pressure_pct: 1 }, resist_effects: {},
  },
  {
    key: 'riv_tomates', theme: 'rivalry', category: 'ideological_financial', title: 'Les tomates de concours d\'Ely', notFor: ['mayor_agri'],
    prompt: () => 'Ely prépare ses tomates pour le concours de la foire de Lleida. Un maraîcher jaloux d\'Oliana vous offre 80 € pour « oublier » d\'arroser pendant qu\'elle est à Sort.',
    yield_effects: { private_wealth_eur: 80, morale_pct: 4 }, resist_effects: {},
  },
  {
    key: 'riv_ordre_du_jour', theme: 'rivalry', category: 'ideological_financial', title: 'L\'ordre du jour réécrit',
    prompt: (p, r) => `${otherFounder(p, r)} vous a coupé la parole trois fois à la dernière Agora. Vous pourriez, l'air de rien, reléguer sa proposition en toute fin d'ordre du jour, à l'heure où tout le monde pense au déjeuner.`,
    yield_effects: { morale_pct: 6 }, resist_effects: {},
  },

  // --- Ressources du village ------------------------------------------------
  {
    key: 'res_rations', theme: 'resources', category: 'ideological_financial', title: 'Cartons de rations « en trop »',
    prompt: () => 'Vous êtes seul à la réserve et deux cartons de rations de secours semblent « en trop ». Personne ne refait l\'inventaire avant dimanche, et votre garde-manger personnel est bien vide.',
    yield_effects: { morale_pct: 6, private_wealth_eur: 40 }, resist_effects: {},
  },
  {
    key: 'res_eau', theme: 'resources', category: 'ideological_financial', title: 'Dérivation discrète', roles: ['water_eng'],
    prompt: (p) => `Un voisin agriculteur demande s'il peut se brancher, de nuit, sur ${is(p, 'water_eng') ? 'votre conduite' : 'la conduite d\'Alex'} pour irriguer son maïs. Il paie 200 € par mois, en liquide, à vous seul.`,
    yield_effects: { private_wealth_eur: 200, admin_pressure_pct: 3 }, resist_effects: {},
  },
  {
    key: 'res_bois', theme: 'resources', category: 'ideological_financial', title: 'Bois de chauffage vendu au noir',
    prompt: () => 'La réserve de bois commune est bien garnie. Un client de Tremp vous achète trois stères au noir, 150 €, enlevés ce soir par la piste.',
    yield_effects: { private_wealth_eur: 150, admin_pressure_pct: 1 }, resist_effects: {},
  },
  {
    key: 'res_courant', theme: 'resources', category: 'ideological_financial', title: 'Surplus de la ferme de minage', notFor: ['civil_eng'],
    prompt: () => 'La ferme de minage consomme moins que prévu cette semaine. Un voisin propose de racheter le surplus par un câble tiré jusqu\'à sa borda : 120 € pour vous. Personne ne lit les compteurs de Tiphaine le dimanche.',
    yield_effects: { private_wealth_eur: 120, admin_pressure_pct: 2 }, resist_effects: {},
  },
  {
    key: 'res_tomates', theme: 'resources', category: 'ideological_financial', title: 'Cagettes pour un restaurant de Sort', roles: ['mayor_agri'],
    prompt: (p) => `Un restaurateur de Sort veut les plus belles tomates ${is(p, 'mayor_agri') ? 'de votre potager' : 'du potager d\'Ely'} pour sa carte « kilomètre zéro ». 100 € en liquide, pour vous, s'il en a trois cagettes demain matin.`,
    yield_effects: { private_wealth_eur: 100 }, resist_effects: {},
  },
  {
    key: 'res_groupe', theme: 'resources', category: 'ideological_financial', title: 'Groupe électrogène à louer',
    prompt: () => 'Un chantier voisin cherche un groupe électrogène pour le week-end. Celui du hameau ne servira pas avant lundi : 120 € de location, rien sur le registre.',
    yield_effects: { private_wealth_eur: 120, admin_pressure_pct: 1 }, resist_effects: {},
  },

  // --- Notoriété & médias ---------------------------------------------------
  {
    key: 'fame_tv3', theme: 'fame', category: 'ideological_financial', title: 'Reportage de TV3',
    prompt: () => 'Une équipe de TV3 tourne un reportage sur « les Français qui veulent fonder un pays ». Le réalisateur vous suggère d\'en rajouter un peu : un faux poste-frontière, un faux hymne, une vraie dispute.',
    yield_effects: { international_notoriety_pct: 4, admin_pressure_pct: 3, morale_pct: 6 }, resist_effects: { international_notoriety_pct: 1 },
  },
  {
    key: 'fame_influenceur', theme: 'fame', category: 'ideological_financial', title: 'Influenceur en quête de buzz',
    prompt: () => 'Un influenceur andorran (1,2 million d\'abonnés) veut filmer « une nuit dans le micro-État le plus fou d\'Europe » et vous offre 200 € pour jouer le dictateur bienveillant.',
    yield_effects: { private_wealth_eur: 200, international_notoriety_pct: 4, admin_pressure_pct: 2 }, resist_effects: {},
  },
  {
    key: 'fame_tabloid', theme: 'fame', category: 'ideological_financial', title: 'Confidences à un tabloïd',
    prompt: () => 'Un journaliste d\'un tabloïd britannique vous offre 300 € pour « l\'histoire vraie » du hameau, scandales compris. Surtout les scandales.',
    yield_effects: { private_wealth_eur: 300, international_notoriety_pct: 3, morale_pct: -4 }, resist_effects: {},
  },
  {
    key: 'fame_sponsor', theme: 'fame', category: 'ideological_financial', title: 'Sponsor de boisson énergisante',
    prompt: () => 'Une marque de boisson énergisante offre 400 € à la caisse pour peindre son logo sur la façade de la Borda Alta et rebaptiser le Carlage « Carlage Extreme ». Il faudrait signer avant l\'Agora.',
    yield_effects: { treasury_eur: 400, international_notoriety_pct: 2, morale_pct: -3 }, resist_effects: {},
  },
  {
    key: 'fame_pont', theme: 'fame', category: 'festive', title: 'Défi en direct depuis le pont',
    prompt: () => 'Des ados de la Seu vous défient de sauter dans le Segre depuis le vieux pont, en direct. Le lien a déjà 3 000 vues alors que vous n\'avez pas encore dit oui.',
    yield_effects: { international_notoriety_pct: 2, morale_pct: 8 }, resist_effects: { morale_pct: -1 },
  },
  {
    key: 'fame_documentaire', theme: 'fame', category: 'ideological_financial', title: 'Un documentaire « un peu scénarisé »',
    prompt: () => 'Une société de production veut tourner un documentaire sur le hameau, à condition de « scénariser un peu » : un faux putsch, une fausse romance, et une vraie exclusivité de trois ans sur vos images.',
    yield_effects: { international_notoriety_pct: 5, treasury_eur: 300, admin_pressure_pct: 2 }, resist_effects: {},
  },

  // --- Tentations du métier (réservées à un fondateur) ----------------------
  {
    key: 'call_voix', theme: 'calling', category: 'ideological_financial', title: 'Voix prépondérante à vendre', only: ['mayor_agri'],
    prompt: () => 'Un groupe de résidents vous propose 300 € pour faire jouer votre voix prépondérante dimanche en faveur de leur proposition. « C\'est un don au potager », précisent-ils.',
    yield_effects: { private_wealth_eur: 300, admin_pressure_pct: 2 }, resist_effects: { morale_pct: 1 },
  },
  {
    key: 'call_seance', theme: 'calling', category: 'sentimental', title: 'Une séance qui s\'éternise', only: ['treasurer_physio'],
    prompt: (_p, r) => `${r.pick(['Une patiente', 'Un patient'])} réserve désormais trois séances de kiné par semaine pour une douleur qui semble surtout se manifester quand vous êtes là. Ce soir, on vous propose un verre « pour parler de la posture ».`,
    yield_effects: { morale_pct: 8 }, resist_effects: {},
  },
  {
    key: 'call_kine', theme: 'calling', category: 'ideological_financial', title: 'Séances de kiné fantômes', only: ['treasurer_physio'],
    prompt: () => 'Une mutuelle andorrane rembourse sans trop regarder. Un résident vous propose de déclarer dix séances que vous ne lui avez jamais données et de partager le remboursement.',
    yield_effects: { private_wealth_eur: 200, admin_pressure_pct: 2 }, resist_effects: {},
  },
  {
    key: 'call_plans', theme: 'calling', category: 'ideological_financial', title: 'Plans signés les yeux fermés', only: ['civil_eng'],
    prompt: () => 'Un ancien camarade d\'école, architecte à Andorra la Vella, vous demande de signer des plans que vous n\'avez pas vérifiés « pour tenir les délais ». 400 € de « frais d\'étude ».',
    yield_effects: { private_wealth_eur: 400, admin_pressure_pct: 3 }, resist_effects: {},
  },
  {
    key: 'call_minage', theme: 'calling', category: 'ideological_financial', title: 'Un portefeuille de plus', only: ['water_eng'],
    prompt: () => 'La ferme de minage tourne la nuit, sans témoin. Personne ne remarquerait qu\'une petite part des gains file vers un portefeuille numérique — le vôtre.',
    yield_effects: { treasury_eur: -150, private_wealth_eur: 150 }, resist_effects: {},
  },
  {
    key: 'call_forge', theme: 'calling', category: 'ideological_financial', title: 'Commande spéciale à la forge', only: ['smith_diplo'],
    prompt: () => 'Un chasseur de Tremp vous commande des pièces de forge « pour un fusil un peu personnel ». 300 € pour un après-midi à l\'enclume, sans questions et sans facture.',
    yield_effects: { private_wealth_eur: 300, admin_pressure_pct: 5 }, resist_effects: {},
  },
  {
    key: 'call_labo', theme: 'calling', category: 'ideological_financial', title: 'Une formule à tester', only: ['druid'],
    prompt: () => 'Un étudiant en chimie de Lleida propose de « tester une formule » dans votre laboratoire ce week-end. Les ingrédients ressemblent beaucoup à ce que vous démantelez d\'habitude. Il paie 250 € et insiste pour que vous goûtiez le résultat.',
    yield_effects: { drug_prevalence_pct: 3, private_wealth_eur: 250, addiction_level_pct: 4, admin_pressure_pct: 3 }, resist_effects: { drug_prevalence_pct: -1 },
  },
  {
    key: 'call_confession', theme: 'calling', category: 'ideological_financial', title: 'Un nom contre une enveloppe', only: ['priest_apoth'],
    prompt: () => 'Un journaliste vous offre 400 € pour un seul nom tiré des confessions de la semaine. « Juste un nom, mon père, pas les détails. »',
    yield_effects: { private_wealth_eur: 400, admin_pressure_pct: 2 }, resist_effects: { morale_pct: 1 },
  },
  {
    key: 'call_sacristie', theme: 'calling', category: 'festive', title: 'Le vin de messe', only: ['priest_apoth'],
    prompt: () => 'La sacristie vient de recevoir trois caisses de vin de messe, un excellent Montsant. Personne d\'autre que vous ne tient l\'inventaire de la sacristie.',
    yield_effects: { alcohol_consumption_pct: 2, addiction_level_pct: 5, morale_pct: 8 }, resist_effects: {},
  },
];

/** Vue en lecture seule de la banque (tests, documentation). */
export const TEMPTATION_TEMPLATES: readonly TemptationTemplate[] = TEMPLATES;

// ---------------------------------------------------------------------------
// Historique et tirage
// ---------------------------------------------------------------------------
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’`]/g, '\'').replace(/\s+/g, ' ').trim();
}

const BY_TITLE = new Map(TEMPLATES.map((t) => [fold(t.title), t]));

/** Thème d'un dilemme passé : par son titre (banque), sinon par mots-clés (dilemme écrit par l'IA). */
export function themeOfTemptation(entry: { title: string; prompt_text?: string | null }): TemptationTheme | null {
  const known = BY_TITLE.get(fold(entry.title));
  if (known) return known.theme;
  const text = ` ${fold(`${entry.title} ${entry.prompt_text ?? ''}`)} `;
  let best: TemptationTheme | null = null;
  let bestScore = 0;
  for (const code of TEMPTATION_THEME_CODES) {
    const score = TEMPTATION_THEMES[code].keys.filter((k) => text.includes(k)).length;
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

function eligible(t: TemptationTemplate, p: PlayerBrief, c: TemptationConditions): boolean {
  const role = p.role_code ?? '';
  if (t.only && !t.only.includes(role)) return false;
  if (t.notFor && t.notFor.includes(role)) return false;
  if (t.when && !t.when(c)) return false;
  return true;
}

function usedTitles(recent: readonly RecentTemptation[], window: number): Set<string> {
  return new Set(recent.slice(0, window).map((r) => fold(r.title)));
}

/** Situations encore inédites pour ce joueur (repli : tout sauf les 5 dernières, puis tout). */
function freshPool(p: PlayerBrief, recent: readonly RecentTemptation[], c: TemptationConditions): TemptationTemplate[] {
  const all = TEMPLATES.filter((t) => eligible(t, p, c));
  for (const window of [constants.TEMPTATION_NO_REPEAT_WINDOW, 5]) {
    const used = usedTitles(recent, window);
    const pool = all.filter((t) => !used.has(fold(t.title)));
    if (pool.length > 0) return pool;
  }
  return all;
}

/**
 * Thème du prochain dilemme d'un joueur (déterministe) : parmi les thèmes qui ont encore une
 * situation inédite, sans ceux des derniers dilemmes, en défavorisant la catégorie précédente.
 * `recent` est trié du plus récent au plus ancien.
 */
export function pickTemptationTheme(rng: Rng, player: PlayerBrief, recent: readonly RecentTemptation[], c: TemptationConditions): TemptationTheme {
  const pool = freshPool(player, recent, c);
  const available = TEMPTATION_THEME_CODES.filter((code) => pool.some((t) => t.theme === code));
  const cooling = new Set(recent.slice(0, constants.TEMPTATION_THEME_COOLDOWN).map((r) => themeOfTemptation(r)));
  const rested = available.filter((code) => !cooling.has(code));
  const candidates = rested.length > 0 ? rested : available.length > 0 ? available : TEMPTATION_THEME_CODES;
  const lastCategory = recent[0]?.category;
  const role = player.role_code ?? '';
  return rng.weighted(
    candidates.map((code) => {
      const def = TEMPTATION_THEMES[code];
      const personal = pool.some((t) => t.theme === code && (t.roles?.includes(role) || t.only?.includes(role)));
      return [code, def.weight * (def.category === lastCategory ? 0.5 : 1) * (personal ? 1.5 : 1)] as const;
    }),
  );
}

export interface TemptationPick {
  key: string;
  theme: TemptationTheme;
  category: TemptationCategory;
  title: string;
  prompt_text: string;
  yield_effects: TemptationEffects;
  resist_effects: TemptationEffects;
}

/** Choisit et rédige une situation inédite pour le joueur, dans le thème demandé si possible. */
export function draftTemptationFromBank(
  rng: Rng,
  player: PlayerBrief,
  recent: readonly RecentTemptation[],
  theme: TemptationTheme | null,
  c: TemptationConditions,
): TemptationPick {
  let pool = freshPool(player, recent, c);
  const themed = theme ? pool.filter((t) => t.theme === theme) : [];
  if (themed.length > 0) pool = themed;
  const lastCategory = recent[0]?.category;
  const role = player.role_code ?? '';
  const t = rng.weighted(pool.map((x) => [x, (x.roles?.includes(role) ? 3 : 1) * (themed.length === 0 && x.category === lastCategory ? 0.5 : 1)] as const));
  return {
    key: t.key,
    theme: t.theme,
    category: t.category,
    title: t.title,
    prompt_text: t.prompt(player, rng),
    yield_effects: { ...t.yield_effects },
    resist_effects: { ...t.resist_effects },
  };
}

/** Phrase d'ambiance (narrative_text) d'un dilemme du dictionnaire de secours. */
export const TEMPTATION_AMBIANCE = [
  'Une rumeur circule à La Taverne, sans que personne ne sache d\'où elle vient.',
  'Quelqu\'un a glissé un mot sous une porte. La Taverne fait semblant de ne rien savoir.',
  'Le vent du col apporte des propositions qu\'on ne fait pas en public.',
  'Brunel range son confessionnal ; il pressent du travail pour dimanche.',
  'À la nuit tombée, les téléphones vibrent plus que d\'habitude au hameau.',
  'La Plaça del Poble est calme. Trop calme.',
];
