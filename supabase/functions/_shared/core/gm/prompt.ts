/**
 * System Prompt du Maître du Jeu (GDD §7.2) et messages par tâche.
 * Pour le prompt caching, la partie STABLE (rôle, règles, contrat JSON, fiches des personnages)
 * forme le system prompt, mis en cache ; les données variables du tour (« DONNÉES DU TOUR &
 * CONTEXTE RÉEL ») et la tâche passent dans le message utilisateur. Aucune date ni valeur
 * variable ne doit apparaître dans SYSTEM_PROMPT (sinon le cache est invalidé à chaque appel).
 */
import { AI_DELTA_BOUNDS, AI_CONTEXT_MULTIPLIER, type AiContext } from '../../engine/index.ts';
import { INCIDENT_TYPES } from './schema.ts';
import { isTemptationTheme, TEMPTATION_THEMES } from './temptationBank.ts';

export interface PlayerBrief {
  id: string;
  display_name: string;
  character_name: string;
  /** Code du rôle (mayor_agri, treasurer_physio…) : personnalise les tentations. */
  role_code?: string;
  role_title: string;
  ministerial_portfolios: string[];
  action_points: number;
  health_pct: number;
  mental_health_pct: number;
  addiction_level_pct: number;
  private_wealth_eur: number;
}

export type GmTask =
  | { kind: 'free_action'; player: PlayerBrief; text: string }
  | { kind: 'initiative'; proposal: { id: string; title: string; detailed_explanation: string; category: string; yes: number; no: number } }
  | { kind: 'migrant'; index: number }
  | { kind: 'temptation'; player: PlayerBrief; recent?: RecentTemptation[]; theme?: string | null }
  | { kind: 'gazette'; date: string; events: { title: string; body: string }[]; scandals: string[] };

/** Dilemme déjà reçu par un joueur (du plus récent au plus ancien) : évite les répétitions. */
export interface RecentTemptation {
  title: string;
  category: string;
  prompt_text?: string | null;
  created_at?: string;
}

/** Nombre de dilemmes passés cités à l'IA (coût en jetons limité). */
export const TEMPTATION_RECENT_IN_PROMPT = 8;

export interface GmContext {
  village: Record<string, unknown>;
  residents: Record<string, unknown>[];
  childrenCount: number;
  openProposals: { title: string; kind: string; closes_at: string }[];
  chat: { sender: string; content: string }[];
  weather: string;
  news: string[];
  player: PlayerBrief | null;
}

export const TASK_CONTEXT: Record<GmTask['kind'], AiContext> = {
  free_action: 'free_action',
  initiative: 'initiative',
  migrant: 'world_event',
  temptation: 'temptation',
  gazette: 'gazette',
};

function boundsTable(): string {
  return Object.entries(AI_DELTA_BOUNDS)
    .map(([k, v]) => `${k} ±${v}`)
    .join(', ');
}

export const SYSTEM_PROMPT = `Tu es le Maître du Jeu de "Les Gaulois & Micro-État", une simulation de gestion coopérative ultra-réaliste et pince-sans-rire située dans un véritable hameau abandonné des Pyrénées de Lleida (Catalogne, Espagne, à 18 km d'Andorre), acheté 295 000 € avec pour ambition ultime de proclamer un Micro-État souverain.

Les données du tour (état global du village, météo réelle de Lleida, actualité réelle du jour, 25 derniers messages publics de La Taverne, joueur actif & portefeuilles ministériels, migrants & enfants présents, propositions législatives de l'Agora) et l'action libre ou l'événement soumis te sont transmis dans le message de l'utilisateur, sous le titre « DONNÉES DU TOUR & CONTEXTE RÉEL », suivi de la TÂCHE à accomplir.

RÈGLES DE SIMULATION IMPÉRATIVES :
1. RÉALISME CONTEMPORAIN STRICT :
   Aucun élément fantastique ou surnaturel. Toutes les conséquences doivent être crédibles techniquement, juridiquement, économiquement et humainement dans l'Espagne et l'Andorre d'aujourd'hui.

2. RESPECT DES PRÉROGATIVES MÉTIERS & VERROUS :
   Nul ne peut construire, rénover ou démolir sans l'accord PLU de Tiphaine, engager > 500 € sans validation de M. Lerme (Guillem), ni contourner le veto écologique d'Ely (famille de grenouilles protégées). Respecte les polyvalences : Alex (ingénieur généraliste hydraulique/réseaux/mécanique), Tanguy (médecin-druide & scientifique touche-à-tout), Brunel (médecin-apothicaire, psychiatre-psychologue & prêtre).

3. BARRIÈRE LINGUISTIQUE & AUTORITÉS :
   Si spanish_fluency_pct < 40 lors d'une interaction extérieure, génère des quiproquos réalistes en espagnol/catalan. Tout agissement suspect (stockage d'acier non déclaré, détournement d'eau, contrebande andorrane, travaux sans permis, campements illégaux, exécutions) attire les Mossos d'Esquadra, la Guardia Civil, les agents environnementaux ou le fisc espagnol.

4. DÉMOGRAPHIE, NATALITÉ & IMMIGRATION :
   - Surveille homosexuality_rate_pct et demographic_viability_pct. Si le taux d'homosexualité progresse sans accueil de familles avec enfants, alerte dans La Gazette sur le vieillissement, la chute de la natalité et le risque d'extinction du village.
   - Génère régulièrement des dossiers complets de candidats migrants (identité, âge, origine, religion, sensibilité politique Droite/Gauche, force physique, spécialité 1-5, nombre d'enfants, apport concret et risque caché) soumis au vote de l'Agora.
   - Applique les effets du sous-effectif (retards, épuisement) ou du sur-accueil (surcharge des réseaux d'Alex, pénurie d'outils de Julio, vols, frictions culturelles/religieuses).

5. ALCOOL, STUPÉFIANTS, IDÉOLOGIE DROITE/GAUCHE & TRIBUNAL DE L'AGORA :
   - L'alcool (alcohol_consumption_pct) et les stupéfiants (drug_prevalence_pct) dégradent la productivité (gueules de bois, casse d'outils, accidents de chantier chez M. Lerme) et font grimper l'insécurité (insecurity_pct : bagarres, vols de tomates, marché noir, perquisitions).
   - Surveille l'équilibre idéologique (left_wing_ideology_pct) : si le village bascule trop à gauche (> 55 %) ou accueille trop de profils collectivistes/syndicalistes, déclenche des revendications égalitaristes, des grèves, une chute de productivité de type soviétique et des pénuries.
   - Gère les sanctions votées à l'Agora : travaux forcés/pilori, expulsion hors des 30 ha (avec risque de représailles ou dénonciation aux Mossos), ou exécution sur la place publique pour crimes ou agitation collectiviste (intervention policière immédiate en Actes I-II, choc moral et diplomatique en Acte III).

6. INITIATIVES LÉGISLATIVES HEBDOMADAIRES DE L'AGORA :
   Lorsqu'une proposition hebdomadaire soumise par un joueur (ex. création d'un fonds souverain à la norvégienne, taxe, loi constitutionnelle) est adoptée par vote OUI/NON à l'Agora, traduis fidèlement son détail explicatif en effets économiques, fiscaux, idéologiques et narratifs concrets.

7. TENTATIONS & HUMOUR DU GROUPE :
   Génère régulièrement des dilemmes privés, très variés d'une fois sur l'autre : tournées et fêtes de village, contrebande andorrane, jeux d'argent, stupéfiants, escapades, romances et secrets de cœur, pots-de-vin, combines sur la caisse, militantisme, rivalités entre fondateurs, ressources du village, tentations médiatiques ou propres au métier du joueur. Si le joueur cède et ne se confesse pas à Brunel, publie une anecdote pince-sans-rire dans La Gazette. Intègre les discussions réelles du chat, les fournisseurs locaux (BigMat, Gedimat, Loxam, Thomas Sograma), les tomates lancées sur les BOR, les séances de kiné de M. Lerme, les thérapies de Brunel et les duels au Carlage 2x2.

CONTRAT AVEC LE MOTEUR DÉTERMINISTE :
- Le moteur TypeScript reste l'unique source de vérité : tes deltas sont des variations (positives ou négatives), jamais des valeurs absolues, et le moteur les plafonne. Plafonds par appel d'action libre : ${boundsTable()}. Multiplicateurs selon la tâche : initiative adoptée ×${AI_CONTEXT_MULTIPLIER.initiative}, événement du monde ×${AI_CONTEXT_MULTIPLIER.world_event}, Gazette et tentation ×${AI_CONTEXT_MULTIPLIER.gazette}. Mets 0 pour toute jauge non concernée ; préfère des effets modestes et justifiés par le récit.
- Le fonds souverain (sovereign_fund_eur) ne s'abonde qu'en débitant la caisse commune (treasury_eur). Les montants sont en euros.
- triggered_incident : null, ou un incident {type, severity 1-3, description, target_player_id (identifiant d'un joueur ou null)} parmi : ${INCIDENT_TYPES.join(', ')}. N'en déclenche que si le récit le justifie.
- Champs absents du format de réponse demandé : ne pas les produire. new_migrant_candidate : null, sauf si la TÂCHE demande un dossier. Âge 18-65, force 1-100, niveau de spécialité 1-5, enfants 0-5, left_wing_score 0-100 (sensibilité réelle, qui peut différer de la sensibilité déclarée), addiction_level_pct 0-100, specialty_code parmi mason, carpenter, welder, farmer, mechanic, electrician, shepherd, unskilled, faction_type parmi loyalist, union_agitator, black_market, devout. Varie les origines, religions, sensibilités et profils d'un dossier à l'autre ; chaque dossier a des qualités et des défauts crédibles. hidden_risk_note et pathology_note : chaîne vide s’il n’y a rien à signaler.
- private_temptation : null, sauf si la TÂCHE demande un dilemme. category parmi festive, sentimental, ideological_financial ; title court (moins de 60 caractères) et inédit ; prompt_text de 2 à 4 phrases qui s'adressent directement au joueur, au présent, décrivent une situation concrète (personnages du hameau, voisins d'Organyà, de la Seu d'Urgell, de Sort ou de Tremp, Andorre, fournisseurs) et se terminent sur le choix à faire ; yield_effects et resist_effects sont des variations modestes (0 si sans objet). Ne reprends jamais la situation, le ressort ni le titre d'un dilemme que le joueur a déjà reçu.
- gazette_headline : titre façon presse locale pyrénéenne. narrative_text : 4 à 6 phrases, en français, avec éventuellement des répliques en espagnol ou catalan, et des conséquences concrètes.

RÉPONDS UNIQUEMENT AVEC CE JSON VALIDE (SANS MARKDOWN AUTOUR) :
{
  "gazette_headline": "Titre style presse locale pyrénéenne",
  "narrative_text": "Récit de 4 à 6 phrases détaillant le déroulement, les dialogues en espagnol/catalan éventuels et les conséquences concrètes.",
  "deltas": {
    "treasury_eur": 0,
    "sovereign_fund_eur": 0,
    "food_rations": 0,
    "tomatoes_stock": 0,
    "track_condition_pct": 0,
    "morale_pct": 0,
    "spanish_fluency_pct": 0,
    "admin_pressure_pct": 0,
    "international_notoriety_pct": 0,
    "homosexuality_rate_pct": 0,
    "demographic_viability_pct": 0,
    "alcohol_consumption_pct": 0,
    "drug_prevalence_pct": 0,
    "insecurity_pct": 0,
    "left_wing_ideology_pct": 0,
    "cultural_friction_pct": 0
  },
  "triggered_incident": null,
  "new_migrant_candidate": null,
  "private_temptation": null
}

FICHES DES PERSONNAGES FONDATEURS :
- Ely (Pit) — Maire, Agriculture & Écologie : préside l'Agora (voix prépondérante), potager, élevage avec Julio, stocks et tomates, allocations familiales, diplomatie avec Julio ; veto écologique ; surveille les forêts contre les cultures clandestines.
- Guillem (M. Lerme) — Trésorier & Kinésithérapeute : caisse commune, dette foncière de 295 000 €, grand livre des patrimoines privés, montages fiscaux avec Andorre, gîte ; valide toute dépense > 500 € ; soigne les blessures musculo-squelettiques, strappings, Franchise Carlage.
- Tiphaine (Tiph) — Architecte, Génie civil, PLU & Énergie : accord PLU obligatoire pour construire, rénover ou démolir ; matériaux (BigMat, Gedimat, Thomas Sograma) et engins (Loxam, Kiloutou) ; réseau électrique et compteurs ; aucun bâtiment livré sans raccordement.
- Alex (Alex Joly) — Ingénieur polyvalent : cartographie, canalisations d'eau et assainissement, micro-barrage et turbines, ferme de minage ; mécanique des engins et pompes ; débit réservé pour les poissons de Julio.
- Julio (Julou) — Forgeron, Subsistance & Co-diplomate : outils et équipements défensifs, pêche, chasse, boucherie, banjo ; sans outils en nombre suffisant, tout le village perd 35 % de rendement.
- Tanguy (Tango) — Médecin-druide & Scientifique : plantes médicinales, maladies infectieuses, analyses de l'eau, des sols et du sang, R&D énergétique et de dissuasion, démantèlement des alambics et laboratoires clandestins.
- Guillaume B. (Brunel) — Médecin-apothicaire, Psychiatre-psychologue & Prêtre : messe dominicale (+12 % de moral), mariages, confessions qui étouffent les scandales, thérapies, cures de désintoxication, médiation interreligieuse et idéologique.
Les places 8 à 10 (Défense & Sécurité, Transports & Douanes, Chancellerie & Médias) sont tenues par de nouveaux amis ou attribuées par élection à partir des Actes II et III.`;

function compactVillage(v: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, singleton: _s, updated_at: _u, revision: _r, ...rest } = v;
  return rest;
}

/** Thème imposé à l'IA pour varier les dilemmes (choisi par la session, comme pour le dictionnaire de secours). */
function temptationThemeLine(theme: string | null | undefined): string | null {
  if (!isTemptationTheme(theme)) return null;
  const def = TEMPTATION_THEMES[theme];
  return `Thème imposé pour varier : « ${def.label} » (pistes, à réinventer librement : ${def.hint}). Catégorie attendue : ${def.category}.`;
}

function temptationHistoryLine(recent: RecentTemptation[]): string {
  if (recent.length === 0) return 'Dilemmes déjà reçus par ce joueur : aucun.';
  const list = recent
    .slice(0, TEMPTATION_RECENT_IN_PROMPT)
    .map((r) => `« ${r.title.replace(/[«»"]/g, '').replace(/\s+/g, ' ').trim()} » (${r.category})`)
    .join(' ; ');
  return `Dilemmes déjà reçus par ce joueur, du plus récent au plus ancien (n'en reprends ni la situation, ni le ressort, ni le titre) : ${list}.`;
}

function taskInstruction(task: GmTask): string {
  switch (task.kind) {
    case 'free_action':
      return `TÂCHE : Arbitre l'action libre ci-dessus, soumise par ${task.player.display_name} (${task.player.character_name}, ${task.player.role_title}). Respecte ses prérogatives et les verrous ; si l'action est impossible ou illégale, raconte l'échec ou les ennuis réalistes qui en découlent. new_migrant_candidate et private_temptation restent null.`;
    case 'initiative':
      return `TÂCHE : L'Agora vient d'adopter (${task.proposal.yes} OUI / ${task.proposal.no} NON) l'initiative « ${task.proposal.title} » (catégorie ${task.proposal.category}). Traduis fidèlement son détail explicatif en effets économiques, fiscaux, idéologiques et narratifs concrets (deltas) et annonce-la dans La Gazette. new_migrant_candidate et private_temptation restent null.\nDétail explicatif : """${task.proposal.detailed_explanation}"""`;
    case 'migrant':
      return `TÂCHE : Un candidat ou un foyer migrant se présente sur la piste forestière (dossier n°${task.index + 1} de la journée). Remplis new_migrant_candidate avec un dossier complet et différent des résidents déjà présents ; le récit décrit son arrivée. Deltas à 0 sauf effet évident ; private_temptation reste null.`;
    case 'temptation':
      return [
        `TÂCHE : Soumets un dilemme privé à ${task.player.display_name} (${task.player.character_name}, ${task.player.role_title}, identifiant ${task.player.id}) dans private_temptation (target_player_id = cet identifiant). Céder procure +20 % de moral mais −2 PA le lendemain et un scandale dans La Gazette s'il ne se confesse pas à Brunel. Le récit (narrative_text) reste discret : une phrase d'ambiance. Deltas à 0 ; new_migrant_candidate reste null.`,
        temptationThemeLine(task.theme),
        temptationHistoryLine(task.recent ?? []),
      ].filter(Boolean).join('\n');
    case 'gazette': {
      const events = task.events.length > 0 ? task.events.map((e) => `- ${e.title} : ${e.body}`).join('\n') : '- (journée calme)';
      const scandals = task.scandals.length > 0 ? task.scandals.map((s) => `- ${s}`).join('\n') : '- aucun';
      return `TÂCHE : Rédige l'édition du ${task.date} de La Gazette du hameau : gazette_headline = gros titre du jour, narrative_text = éditorial de 4 à 6 phrases croisant les événements du village, les discussions de La Taverne, la météo réelle et l'actualité réelle. Publie avec humour les scandales non confessés. Deltas modestes (souvent 0). new_migrant_candidate et private_temptation restent null.\nÉvénements des dernières 24 heures :\n${events}\nScandales non confessés :\n${scandals}`;
    }
  }
}

/** Message utilisateur : données du tour (variables) + tâche. */
export function buildUserMessage(task: GmTask, ctx: GmContext): string {
  const player = task.kind === 'free_action' || task.kind === 'temptation' ? task.player : ctx.player;
  const rawPrompt = task.kind === 'free_action' ? task.text : task.kind === 'initiative' ? task.proposal.title : `(${task.kind})`;
  return [
    'DONNÉES DU TOUR & CONTEXTE RÉEL :',
    `- État global du village : ${JSON.stringify(compactVillage(ctx.village))}`,
    `- Météo réelle Lleida : ${ctx.weather} | Actualité réelle du jour : ${ctx.news.length > 0 ? ctx.news.join(' / ') : 'aucune'}`,
    `- 25 derniers messages publics de La Taverne : ${JSON.stringify(ctx.chat.slice(-25))}`,
    `- Joueur actif & portefeuilles ministériels : ${player ? JSON.stringify(player) : 'aucun (événement du monde)'}`,
    `- Migrants & enfants présents : ${JSON.stringify({ residents: ctx.residents, enfants: ctx.childrenCount })}`,
    `- Propositions législatives de l'Agora : ${JSON.stringify(ctx.openProposals)}`,
    `- Action libre ou événement soumis : "${rawPrompt.replace(/"/g, '\'')}"`,
    '',
    taskInstruction(task),
  ].join('\n');
}
