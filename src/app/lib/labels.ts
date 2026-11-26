/** Libellés français de l'interface. */

export const ROLE_SHORT: Record<string, string> = {
  mayor_agri: 'Mairie & Agriculture',
  treasurer_physio: 'Trésorerie & Kiné',
  civil_eng: 'Génie civil & PLU',
  water_eng: 'Hydraulique & Réseaux',
  smith_diplo: 'Forge & Diplomatie',
  druid: 'Médecine & Sciences',
  priest_apoth: 'Apothicairerie & Culte',
  defense_sec: 'Sécurité & Défense',
  transport_customs: 'Transports & Douanes',
  legal_media: 'Chancellerie & Médias',
};

export const HIDDEN_TITLE: Record<string, string> = {
  mayor_agri: 'Mairie, agriculture & biodiversité',
  treasurer_physio: 'Audit financier & risques de blessure',
  civil_eng: 'Bâti, PLU & chantiers',
  water_eng: 'Réseaux, eau & énergie',
  smith_diplo: 'Outillage & méfiance locale',
  druid: 'Santé publique & R&D secrète',
  priest_apoth: 'Âmes, addictions & secrets confessés',
  'portfolio:defense': 'Portefeuille Défense',
  'portfolio:interior': 'Portefeuille Sécurité Intérieure',
  'portfolio:customs': 'Portefeuille Transports & Douanes',
  'portfolio:chancery': 'Portefeuille Chancellerie',
  'portfolio:media': 'Portefeuille Médias',
};

export const PORTFOLIO_LABEL: Record<string, string> = {
  defense: 'Défense',
  interior: 'Sécurité Intérieure',
  customs: 'Transports & Douanes',
  chancery: 'Chancellerie',
  media: 'Médias',
};

export const STRUCTURE_STATUS: Record<string, string> = {
  ruin: 'En ruine',
  cleared: 'Déblayée',
  in_progress: 'Chantier en cours',
  awaiting_power: 'Attend le raccordement',
  operational: 'Opérationnelle',
  damaged: 'Endommagée',
  demolished: 'Démolie',
  planned: 'Projet',
};

export const PROPOSAL_KIND: Record<string, string> = {
  initiative: 'Initiative',
  migrant_admission: 'Admission',
  naturalization: 'Naturalisation',
  tribunal: 'Tribunal Public',
  collectivization: 'Collectivisation',
  decollectivization: 'Propriété privée',
  prohibition: 'Prohibition',
  rationing: 'Rationnement',
  ministry_election: 'Élection ministérielle',
  constitution_article: 'Constitution',
  independence: 'Indépendance',
};

export const PROPOSAL_STATUS: Record<string, string> = {
  open: 'Vote en cours',
  passed: 'Adoptée',
  rejected: 'Rejetée',
  vetoed: 'Veto',
  cancelled: 'Annulée',
};

export const CATEGORY_LABEL: Record<string, string> = {
  economy: 'Économie',
  justice: 'Justice',
  immigration: 'Immigration',
  infrastructure: 'Infrastructures',
  constitution: 'Constitution',
  society: 'Société',
  energy: 'Énergie',
  security: 'Sécurité',
};

export const SENTENCE_LABEL: Record<string, string> = {
  forced_labor: 'Travaux forcés & pilori',
  expulsion: 'Bannissement',
  execution: 'Exécution sur la place publique',
};

export const SPECIALTY_LABEL: Record<string, string> = {
  mason: 'Maçon',
  carpenter: 'Charpentier',
  welder: 'Soudeur',
  farmer: 'Maraîcher',
  mechanic: 'Mécanicien diesel',
  electrician: 'Électricien',
  shepherd: 'Berger',
  unskilled: 'Sans qualification',
};

export const MIGRANT_STATUS: Record<string, string> = {
  candidate: 'Candidat',
  accepted: 'Résident',
  forced_labor: 'Travaux forcés',
  rejected: 'Refusé',
  expelled: 'Banni',
  executed: 'Exécuté',
  departed: 'Parti',
};

export const INJURY_LABEL: Record<string, string> = {
  muscular: 'Blessure musculaire (M. Lerme)',
  infectious: 'Infection (Tango & Brunel)',
  psychological: 'Trouble psychologique (Brunel)',
};

export const CHANNEL_LABEL: Record<string, string> = {
  village_square: 'Place du Village',
  agora_hall: "Salle de l'Agora",
  whisper: 'Chuchotements',
};

export const DUEL_CONTEXT: Record<string, string> = {
  veto: 'Veto contesté',
  tribunal: 'Sentence contestée',
  putsch: 'Tentative de putsch',
  friendly: 'Duel amical',
};

export const DUEL_MODE: Record<string, string> = {
  carlage: 'Carlage 2×2 (en direct)',
  target: 'Épreuve de la cible (en différé)',
};

export const CARLAGE_MOVE: Record<string, string> = {
  push: 'Pousser',
  pivot: 'Pivoter',
  anchor: 'Ancrer',
  shoulder: 'Épaule',
  none: 'Figé',
};

export const TEMPTATION_CATEGORY: Record<string, string> = {
  festive: 'Tentation festive',
  sentimental: 'Tentation sentimentale',
  ideological_financial: 'Tentation idéologique ou financière',
};

export const ACCOUNT_LABEL: Record<string, string> = {
  treasury: 'Caisse commune',
  sovereign_fund: 'Fonds souverain',
  crypto: 'Réserves crypto',
  land_debt: 'Dette foncière',
  private: 'Compte privé',
};

export const SNAPSHOT_TRIGGER: Record<string, string> = {
  auto_midnight: 'Nuit',
  pre_agora: 'Avant Agora',
  manual: 'Manuelle',
  pre_restore: 'Avant restauration',
  import: 'Import',
};

export const ENERGY_LABEL: Record<number, string> = {
  1: 'Bougies',
  2: 'Groupe électrogène',
  3: 'Réseau aérien',
  4: 'Barrage & Solaire',
  5: 'Micro-réacteur',
};

export const ACT_LABEL: Record<number, string> = {
  1: 'Acte I — Le Chantier des Ruines',
  2: "Acte II — L'Autarcie Pyrénéenne",
  3: 'Acte III — La Principauté des Gaulois',
};

export const APPROVAL_KIND: Record<string, string> = {
  plu: 'Accord PLU',
  budget: 'Validation budgétaire',
  eco_veto: 'Veto écologique',
};

export const APPROVAL_STATUS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Accordée',
  rejected: 'Refusée',
  expired: 'Expirée',
  executed: 'Exécutée',
};

export const PLAYER_STATUS: Record<string, string> = {
  active: 'Actif',
  forced_labor: 'Travaux forcés',
  banished: 'Banni',
  executed: 'Exécuté',
};
