---
version: 4.1
date: 2026-11-26
title: Les Gaulois — Game Design Document & Architecture Technique
---

# LES GAULOIS — Simulation Coopérative de Village & Micro-État

**Game Design Document (GDD) & Spécification Technique Complète — Version 4.1**

Jeu de stratégie, de gestion démographique, économique et politique asynchrone persistant, ancré dans le monde réel (Pyrénées de Lleida), piloté par un moteur déterministe TypeScript et un Maître du Jeu IA.

| Paramètres géographiques & démographiques | Paramètres économiques, politiques & techniques |
|---|---|
| **Cadre réel :** hameau abandonné des Pyrénées de Lleida (Catalogne, Espagne), domaine de 30 ha situé à 18 km de la frontière d'Andorre. | **Achat & travaux :** 295 000 € (PLU 2013 validé). Rénovation globale estimée entre 600 000 € et 900 000 €. |
| **Effectif & rythme :** 7 joueurs fondateurs (10 joueurs max) + population résidente dynamique (migrants accueillis, naturalisés, lignées et apprentis). 1 jour réel = 1 jour de jeu (3 PA/jour). | **Enjeux :** autonomie totale puis Micro-État souverain, pérennité démographique, équilibre idéologique (Droite vs Gauche), propriété privée vs collectivisation, contrebande, justice publique et dissuasion. Hébergement 0 € + API IA < 1 $/mois (Claude Haiku 5.5). |

> **Nouveautés V4.1 :** le jeu est prêt à être mis en ligne en une vingtaine de minutes grâce au **guide de déploiement express** (§7.8, `docs/DEPLOIEMENT.md`) : base installée par un seul script SQL, Edge Functions déployées par GitHub Actions (aucune CLI à installer sur le PC), tâches planifiées par un script rejouable, et vérification automatique du déploiement (`npm run deploy:check`).

> **Rappel V4.0 :** l'interface mobile-first est livrée (§6.3) — connexion par PIN, carte SVG, Mon Métier, Agora / Immigration / Tribunal / Constitution, Trésorerie & fournisseurs, Gazette & Taverne, administration — avec un **mode démo** jouable sans serveur. Les différends se règlent désormais au choix du challenger : **Carlage 2 × 2** en direct ou **épreuve de la cible** en différé (§6.1 bis) ; le putsch se joue à l'épreuve de la cible. Le Maître du Jeu IA tourne par défaut sur **Claude Haiku 5.5** (§7.2).

> **Rappel V3.9 :** les trois Edge Functions sont écrites et vérifiées (§7.7) — `game-engine` (moteur faisant autorité), `gm-ai-action` (Maître du Jeu IA avec sorties JSON strictes, prompt caching et dictionnaire de secours) et `daily-world-sync` (météo Open-Meteo, RSS, sauvegardes, Gazette, migrants, tentations) — avec écriture atomique `engine_commit`, planification pg_cron, déroulé exact des duels de Carlage (§6.1), cadence des dossiers migrants (§4.2) et des tentations (§6.2), et choix du modèle d'IA (§7.2). V3.8 avait consolidé le schéma SQL, la sécurité et le moteur déterministe.

## 1. Vision, Ancrage Réel & Progression en 3 Actes

### 1.1 Un hameau réel des Pyrénées catalanes (100 % sans fantastique)

Le jeu prend pour point de départ l'acquisition collective d'un véritable hameau isolé dans les Pyrénées de Lleida (Catalogne), à 18 km de la principauté d'Andorre : 30 hectares de prairies, pâturages et forêts comprenant plusieurs bâtisses en ruines pour un montant de 295 000 €. L'univers est strictement ancré dans le réalisme contemporain : absence d'eau courante et d'électricité au départ, accès unique par une piste forestière non goudronnée, et interactions réalistes avec la météo pyrénéenne, les fournisseurs locaux (BigMat, Gedimat, Thomas Sograma, Loxam, Kiloutou), les autorités espagnoles et catalanes (Ayuntamiento, Mossos d'Esquadra, Guardia Civil) et le marché transfrontalier d'Andorre.

### 1.2 Boucle quotidienne (3 PA/jour) & Rendez-vous du dimanche

- **Lundi à samedi (Gestion, Chantiers, Économie privée & Actions libres) :** chaque joueur dispose de 3 Points d'Action (PA) par jour, régénérés la nuit selon sa santé physique, mentale et son niveau de sobriété, pour exécuter ses actions métiers déterministes, gérer son patrimoine privé, former un apprenti ou soumettre une Action Libre au Maître du Jeu IA. Aucun serveur permanent n'est requis : l'écoulement du temps est calculé par horodatage (`last_tick_at`).
- **Dimanche matin (L'Agora, le Tribunal Public puis la Messe) :** l'Agora, présidée par Ely, vote à la majorité simple les grands projets, budgets, lois économiques (propriété privée vs collectivisation), lois sur l'alcool et les stupéfiants, attributions de ministères, admissions ou naturalisations de migrants, sentences du Tribunal Public (travaux forcés, bannissement ou exécution), articles de la Constitution et **initiatives législatives hebdomadaires** des joueurs (§4.6). Les blocages par veto ou tentatives de coup d'État se tranchent en duel : Carlage 2 × 2 en direct ou épreuve de la cible en différé (§6.1 bis). La Messe dominicale de Brunel suit immédiatement pour restaurer le moral collectif, célébrer les mariages, prêcher la tempérance et recueillir les confessions.
- **Protection des absents & droit de veto :** un joueur absent peut déléguer temporairement son poste avec permissions restreintes (§7.4). Chaque pilier institutionnel (Mairie, Trésorerie, Génie civil) dispose d'1 jeton de veto par saison (7 jours réels).
- **Isolement (cachot 24 h) :** un joueur ou résident placé au cachot (Torre Vella) ne peut ni agir, ni voter, ni s'exprimer à La Taverne pendant 24 heures.

> **Précision V3.8 — calendrier.** Fuseau de référence : Europe/Madrid. Une *saison de jeu* dure 7 jours réels, du lundi 00:00 au dimanche 23:59. La séance de l'Agora se tient le dimanche à 11:00 ; une décision adoptée peut être frappée de veto pendant 6 heures avant son exécution. La *saison calendaire* réelle (printemps, été, automne, hiver) pilote les rendements agricoles.

### 1.3 Progression narrative en 3 Actes (sans fin de partie obligatoire)

| Acte & seuil d'autonomie | Enjeux techniques, économiques & démographiques | Crises externes, ordre public & gouvernance |
|---|---|---|
| **Acte I — Le Chantier des Ruines** (0 % à 35 %) | Déblaiement des gravats, empierrement de la piste forestière, mise hors d'eau des toitures, captage d'eau potable et éclairage (bougies puis groupe électrogène et raccordement réseau). Premiers accueils ciblés de main-d'œuvre à l'Agora et lancement du cheptel pastoral. | Respect strict du PLU de 2013 pour éviter les amendes d'urbanisme de Lleida ; maîtrise des dépenses sur le fonds de roulement initial de 50 000 € ; prévention des premières dérives festives et du marché noir dans les ruines. |
| **Acte II — L'Autarcie Pyrénéenne** (35 % à 85 %) | Construction du micro-barrage hydroélectrique et solaire, autosuffisance du potager / élevage / pêche / chasse, remboursement de l'emprunt foncier (295 000 €), négoce ou contrebande en Andorre, ouverture du gîte rural et équilibre démographique / idéologique. | Ouverture des portefeuilles ministériels (Sécurité et Douanes), inspections environnementales, lutte contre le trafic de stupéfiants et les cellules syndicales clandestines, régulation des frictions culturelles et contrôles douaniers andorrans. |
| **Acte III — La Principauté des Gaulois** (85 % à 100 %) | Création d'une monnaie locale, ferme de minage de cryptomonnaie sur le surplus électrique, impression des passeports officiels, naturalisation des résidents loyaux, poste-frontière sur la piste forestière et prototypes de dissuasion R&D. | Rédaction et vote de la Constitution à l'Agora, proclamation d'indépendance, exercice plein de la justice souveraine, contrôle fiscal de Madrid, descentes des Mossos d'Esquadra et quête de reconnaissance internationale. |

> **Précision V3.8 — calcul de l'autonomie.** `autonomy_pct` = énergie (palier 1 → 0, 2 → 5, 3 → 10, 4 → 20, 5 → 25) + eau (15 si capacité ≥ besoin et réseau ≥ 60 %, sinon crédit partiel) + alimentation (20 × ratio²) + dette remboursée (20 × part remboursée) + logement (10 × part des lits PLU livrés) + souveraineté (Constitution 3, indépendance 4, dissuasion 3). Les Actes ne régressent jamais.

## 2. Les 7 Métiers Fondateurs & Système Évolutif à 10 Joueurs

Chaque personnage dispose de compétences progressives (XP) améliorant ses rendements, d'un compte patrimonial privé distinct de la caisse commune, de verrous réglementaires empêchant les décisions unilatérales abusives, et d'indicateurs cachés visibles uniquement sur son propre tableau de bord afin de stimuler la négociation, le renseignement et le débat politique à l'Agora.

### 2.1 Fiches détaillées des 7 joueurs fondateurs

| Joueur & titre | Pouvoirs exclusifs & actions quotidiennes | Verrous & synergies métiers | Indicateurs cachés (visibles par lui seul) |
|---|---|---|---|
| **1. Ely (Pit)** — Maire, Agriculture & Écologie | Préside l'Agora (ordre du jour et voix prépondérante lors des votes de lois, d'accueil, de naturalisation ou de sentences du Tribunal Public), gère le potager commun, l'élevage pastoral (brebis et cochons) avec Julio, les stocks alimentaires (et de tomates), les allocations familiales et les espaces verts ; co-dirige la diplomatie extérieure avec Julio. | Détient le **veto écologique** permettant de suspendre tout chantier menaçant la faune locale (ex. famille de grenouilles sur le tracé du barrage d'Alex). Surveille les parcelles forestières contre les cultures clandestines de stupéfiants. | Popularité politique auprès des habitants et résidents, météo agricole fine (risque de gel), rendement du cheptel et indice de biodiversité des parcelles. |
| **2. Guillem (M. Lerme)** — Trésorier & Kinésithérapeute | Tient la caisse commune (50 000 € initiaux), la dette foncière (295 000 €) et le grand livre des patrimoines privés des joueurs ; gère les montages financiers / fiscaux avec Andorre et le gîte rural. Volet kiné : diagnostique et soigne toutes les blessures musculo-squelettiques (chantiers, forge, Carlage, travaux forcés, ivresse) et pose des strappings préventifs. | **Verrou budgétaire :** aucun achat ou location fournisseur supérieur à 500 € ne peut être exécuté sans sa validation. Peut ausculter les candidats migrants (force physique et dos) et instaurer une Franchise Carlage payante. | Audit financier complet (échéances fiscales, fuites de caisse, capitaux privés dissimulés), charge mécanique et risque de blessure de chaque joueur et résident. |
| **3. Tiphaine (Tiph)** — Architecte, Génie Civil, PLU & Énergie | Pilote l'urbanisme (PLU de 2013), les constructions, rénovations (bâtisses, gîte rural, cachot, salle de classe) et démolitions ; négocie les matériaux (BigMat, Gedimat, Thomas Sograma) et engins (Loxam, Kiloutou) ; déploie le réseau électrique aérien et les compteurs individuels au prorata ; forme des apprentis maçons. | **Verrou d'urbanisme :** rien ne peut être construit, rénové ou démoli sans son accord, et aucun bâtiment n'est livré sans raccordement électrique validé. Conditionne le plafond d'hébergement (`housing_capacity`) et la réduction des zones de ruines propices au marché noir. | Vétusté structurelle des toitures / murs, taux réel d'occupation des lits PLU, avance des chantiers en cas de grève et conformité cadastrale face à l'Ayuntamiento. |
| **4. Alex (Alex Joly)** — Ingénieur Polyvalent (Hydraulique, Réseaux & Génie Technique) | Cartographie les 30 ha et les cours d'eau, dimensionne les canalisations d'eau potable et d'assainissement, construit le micro-barrage et les turbines, et raccorde la ferme de minage de cryptomonnaie sur le surplus électrique. Intervient comme ingénieur généraliste sur tous les systèmes techniques (mécanique des engins et pompes, électromécanique, chauffage, ouvrages complexes avec Tiphaine). | Doit calibrer le diamètre des conduites selon la population totale (fondateurs + migrants + enfants + hôtes du gîte) et l'irrigation d'Ely, tout en préservant le débit réservé pour les poissons de Julio en aval et la fiabilité des installations. | Pression hydraulique du réseau, saturation des fosses septiques, détection précoce des sabotages sur conduites, rendement du barrage / minage et risque de crue. |
| **5. Julio (Julou)** — Forgeron, Subsistance & Co-diplomate | Travaille le fer et l'acier à la forge, fabrique et répare les outils et équipements défensifs, assure la pêche, la chasse et la boucherie de l'élevage avec Ely, forme des apprentis forgerons, co-négocie en Espagne / Andorre avec Ely et anime le village au banjo. | **Dépendance critique aux outils :** si le stock d'outils passe sous le nombre total de travailleurs actifs (joueurs + migrants + apprentis), tous les chantiers et récoltes subissent −35 % de rendement. L'ébriété ou la drogue double l'usure du parc d'outils. | Usure précise du parc d'outils, stock de ferraille, vols d'outillage liés à l'insécurité et niveau de méfiance des voisins et de la police locale. |
| **6. Tanguy (Tango)** — Médecin-Druide & Scientifique Polyvalent (R&D, Chimie & Physique) | Cultive les plantes médicinales, prépare les remèdes et décoctions de sevrage avec Brunel, diagnostique et soigne les maladies infectieuses / hydriques. Officie comme scientifique touche-à-tout : analyses physico-chimiques et toxicologiques de l'eau, des sols et du sang, agronomie, formation d'apprentis laborantins et pilotage complet de la R&D énergétique et de dissuasion (bougies → groupe → réseau → hydro / solaire → brouilleurs & micro-réacteur). | Forme le binôme sanitaire avec Brunel et appuie Alex et Tiphaine par ses calculs scientifiques. Peut dépister les pathologies et addictions d'un candidat migrant avant le vote de l'Agora et démanteler les alambics ou laboratoires clandestins. | Incubation des maladies, qualité bactériologique / chimique de l'eau, résidus stupéfiants dans les eaux usées et avancement secret des prototypes R&D et de dissuasion. |
| **7. Guillaume B. (Brunel)** — Médecin-Apothicaire, Psychiatre-Psychologue & Prêtre | Co-gère l'apothicairerie avec Tanguy, célèbre la messe dominicale après l'Agora, célèbre les mariages officiels et recueille les confessions. Assure le suivi psychiatrique et psychologique complet : prévention du burn-out, cures de désintoxication (alcool / drogues), thérapies individuelles, médiation interreligieuse et idéologique, et gestion des tensions relationnelles. | Chaque messe réussie remonte le moral collectif de +12 %, freine la hausse du taux d'homosexualité, modère les addictions et tempère la radicalisation politique. Les confessions privées apaisent la culpabilité et tentent d'étouffer les scandales avant parution dans La Gazette. | Jauge de santé mentale individuelle, stress / burn-out, addiction, loyauté secrète des résidents, sensibilité idéologique réelle et secrets confessés. |

### 2.2 Les 5 Pôles Ministériels évolutifs & Places 8 à 10

Le jeu fonctionne aussi bien à 7 joueurs qu'à 10 joueurs. Si de nouveaux amis rejoignent (places 8, 9 et 10), ils incarnent à temps plein les pôles Sécurité & Défense, Transports & Douanes et Chancellerie / Médias. Tant que ces places restent vacantes, ces 5 portefeuilles se débloquent au fil des Actes et sont attribués par élection à l'Agora comme seconde casquette cumulable :

| Portefeuille (activation) | Prérogatives & actions concrètes | Indicateur caché |
|---|---|---|
| **1. Défense & Sécurité Extérieure** (Acte II) | Protège les 30 ha contre les intrusions réelles (braconniers, sangliers dans le potager, squatteurs, trafiquants, dissuasion face aux Mossos d'Esquadra et à la Guardia Civil). Pose clôtures, miradors et herses sur la piste forestière, organise les tours de garde avec l'équipement forgé par Julio et réprime toute tentative de putsch armé. | Niveau de menace périmétrique, détection avancée des patrouilles ou intrus et préparation défensive du hameau. |
| **2. Sécurité Intérieure & Justice** (Acte II) | Maintient l'ordre interne sans tout régler au Carlage : lutte contre les vols de matériel / tomates, perquisitions des ruines contre le marché noir et les stupéfiants, démantèlement des cellules syndicales clandestines, gestion du cachot (isolement de 24 h), encadrement des travaux forcés sur la piste et exécution des sentences du Tribunal Public (bannissement ou exécution sur la place publique). | Indice de marché noir / vol interne, cartographie des cellules d'agitation clandestine et traçabilité des stocks manquants. |
| **3. Transports, Piste & Douanes** (Acte II) | Entretient les véhicules (4x4, tracteur, utilitaires), déneige et empierre la piste forestière avec Alex, pilote les convois fournisseurs, organise les expéditions nocturnes de contrebande depuis Andorre (tabac, alcool détaxé, pièces) ou contrôle les cargaisons entrant au village. À l'Acte III, tient le poste-frontière, contrôle les passeports et reconduit les bannis. | Usure mécanique de la flotte, cargaisons non déclarées en transit et niveau d'alerte des douanes espagnoles et andorranes. |
| **4. Droit, Fiscalité & Chancellerie** (Acte III) | Optimise les montages associatifs et fiscaux espagnols / andorrans avec M. Lerme (y compris la dissimulation des revenus du minage crypto et du gîte), défend les joueurs interpellés par la police espagnole, encadre la naturalisation des résidents loyaux, rédige la Constitution du Micro-État et pilote la reconnaissance internationale. | Risque de contrôle fiscal approfondi, de perquisition judiciaire ou de procédure d'expulsion par Madrid. |
| **5. Médias, Culture & Propagande** (Acte III) | Rédige les éditoriaux officiels de La Gazette, organise les banquets et la venue mensuelle des BOR, neutralise les campagnes de diffamation (ex. dénonciations d'un migrant banni ou scandale lié à une sentence publique) et médiatise le Micro-État auprès de la presse européenne pour créer un bouclier diplomatique. | Score de notoriété internationale et sympathie de l'opinion publique européenne. |

> **Précision V3.8 — places 8 à 10.** Codes de rôle : `defense_sec` (portefeuilles Défense + Intérieur), `transport_customs` (Douanes), `legal_media` (Chancellerie + Médias). Une place reste inactive (`is_active_slot = false`) jusqu'à ce que l'administrateur l'attribue à un ami (nom + PIN). Les actions d'un portefeuille restent soumises à l'Acte de déblocage, même pour un titulaire à temps plein.

## 3. Moteur Déterministe : Règles Physiques, Démographiques & Sociales

Le moteur TypeScript constitue l'unique source de vérité mathématique : à chaque connexion ou action, `applyElapsedTime()` calcule le temps écoulé depuis `last_tick_at`, met à jour les compteurs physiques, démographiques, idéologiques et sanitaires, et borne strictement les modificateurs proposés par l'IA.

> **Précision V3.8 — déterminisme.** Tous les tirages aléatoires utilisent un générateur pseudo-aléatoire à graine (identifiant du village + jour, ou + révision + action). Une même situation rejouée produit exactement le même résultat (tests, audit, restauration). Le moteur s'exécute côté serveur dans les Edge Functions (source de vérité) et côté client pour l'aperçu.

### 3.1 Mécaniques physiques, logistiques et sanitaires de base

| Domaine simulé | Formule / mécanique mathématique | Conséquence d'une négligence ou erreur |
|---|---|---|
| **Piste forestière & logistique** | `track_condition_pct` (0-100 %) s'use à chaque convoi et par temps de pluie ou neige réelle à Lleida. | Si `track_condition_pct < 40 %` : surcoût de livraison de +40 % chez les fournisseurs et 30 % de risque d'embourbement bloquant les livraisons pendant 24 h. |
| **Hydraulique & assainissement** | D<sub>eau</sub> = (N<sub>pop</sub> × 150 L) + Besoin<sub>potager</sub> + Besoin<sub>élevage</sub>, comparé à la capacité des conduites posées par Alex. | Sous-dimensionnement ou `condition_pct < 40 %` : rupture de canalisation, inondation du chantier, contamination hydrique et épidémie (Tango & Brunel). |
| **Énergie, prorata & surplus** | Paliers 1 (Bougies) → 2 (Groupe) → 3 (Réseau aérien) → 4 (Barrage / Solaire) → 5 (Nucléaire). Facture répartie selon `power_kwh_used` ; surplus disponible pour le minage. | Sans raccordement valide de Tiphaine, un bâtiment reste inactif. Le groupe électrogène dégrade l'écologie d'Ely et coûte cher en carburant. |
| **Potager, élevage & forge / outils** | Récolte = Base × Coeff<sub>saison</sub> × min(1, Eau<sub>reçue</sub> / D<sub>potager</sub>) × Productivité<sub>globale</sub>. Julio convertit `iron_stock` en `tools_stock`. | Jeter des tomates sur les BOR remonte le moral de +15 % mais déduit réellement les rations. Si `tools_stock < travailleurs_actifs`, pénalité globale de −35 % sur tous les chantiers et récoltes. |
| **Santé tricéphale & PA** | PA<sub>jour</sub> = 3 si `health_pct ≥ 60`, `mental_health_pct ≥ 40`, aucune blessure active et sobriété suffisante ; sinon PA<sub>jour</sub> = 1 et duel de Carlage interdit. | Blessures `muscular` (chantiers, Carlage, ivresse) soignées par M. Lerme ; maladies `infectious` par Tango & Brunel ; troubles `psychological` / addictions par Brunel. |
| **Barrière linguistique & autorités** | `spanish_fluency_pct` démarre à 15 % (+2 % par négociation réussie, cours ou accueil de résidents hispanophones). Pression administrative `admin_pressure_pct` (0-100 %). | Si fluency < 40 % lors d'un contrôle policier ou douanier, 50 % de risque de quiproquo entraînant amende, saisie de matériel ou convocation. |

> **Précisions V3.8.** Capacité effective du réseau d'eau = capacité posée × (0,5 + état / 200). Les personnes et le bétail sont servis avant le potager. Risque quotidien de rupture : 25 % × min(1, 2 × déficit relatif) en cas de sous-dimensionnement, 25 % si l'état du réseau est sous 40 %. Une épidémie couve 3 jours (indicateur caché de Tanguy, désamorçable par une analyse de l'eau) puis dure 5 jours. Un bâtiment achevé reste « en attente de raccordement » tant que Tiphaine n'a pas validé son raccordement. Sans compteurs individuels, la facture d'énergie est partagée à parts égales.

### 3.2 Moteur Démographique : Taux d'Homosexualité, Natalité, Lignées & Survie du Village

Afin d'inscrire le Micro-État dans la durée générationnelle, le moteur simule la dynamique des naissances, les unions officielles et le renouvellement de la population du hameau. Si le village néglige sa démographie, il s'expose à un vieillissement irréversible et à sa disparition.

- **Population totale (N<sub>pop</sub>) :** somme des joueurs fondateurs (7 à 10), des résidents adultes accueillis (N<sub>res</sub>) et des enfants et apprentis du hameau (N<sub>enfants</sub>).
- **Taux d'homosexualité (`homosexuality_rate_pct`, 0-100 %, défaut 12 %) :** mesure la proportion de la population adulte du hameau non engagée dans la reproduction biologique. Ce taux progresse dynamiquement sous l'effet de l'isolement démographique (absence prolongée de mixité), des dérives festives prolongées à La Taverne, de certains dilemmes relationnels générés par le Maître du Jeu IA ou de courants culturels internes.
- **Indice de pérennité démographique (`demographic_viability_pct`, 0-100 %, défaut 70 %) :** synthétise l'espérance de survie du village à moyen terme en croisant le taux de natalité effectif, la pyramide des âges et le nombre d'enfants présents au hameau.
- **Unions officielles & alliances dynastiques :** Brunel peut célébrer des mariages à l'église du hameau entre résidents ou joueurs. Chaque union scelle un pacte politique entre deux foyers (partage automatique d'indicateurs cachés entre époux et bonus de +20 % sur la natalité légitime).
- **École du Hameau & maîtres d'apprentissage :** les enfants grandissent au fil des saisons et peuvent être placés en apprentissage auprès d'un fondateur (apprenti forgeron chez Julio, apprenti maçon chez Tiphaine, assistant de laboratoire chez Tanguy) pour devenir des PNJ spécialisés ultra-productifs (+15 % de rendement permanent sur le pôle concerné), ou envoyés étudier le droit à Lleida contre des euros (2 500 €/saison) afin de revenir avec un diplôme juridique réduisant durablement `admin_pressure_pct` (−15 %).

**Formule déterministe de natalité saisonnière (tous les 7 jours réels) :**

> Natalité<sub>eff</sub> = Natalité<sub>base</sub> × (1 − `homosexuality_rate_pct` / 100) × Coeff<sub>mariages</sub> × Coeff<sub>logement</sub> × Coeff<sub>moral</sub>

**Évolution de la pérennité démographique :**

> `demographic_viability_pct` = (Naissances<sub>saison</sub> × 8) + (N<sub>enfants_accueillis</sub> × 4) − (Vieillissement<sub>base</sub> + Malus<sub>taux_homosexualité</sub>)

- **Progression critique & extinction :** plus `homosexuality_rate_pct` augmente, plus Natalité<sub>eff</sub> chute mécaniquement. Dès que `homosexuality_rate_pct > 45 %` (ou sans naissance pendant 2 saisons), le hameau entre en déclin démographique et `international_notoriety_pct` recule. Si `demographic_viability_pct` atteint 0 % pendant 2 saisons consécutives sans redressement nataliste ni accueil familial, le village subit une **extinction démographique (défaite collective)**.

> **Précisions V3.8.** Naissances attendues = Natalité<sub>eff</sub> / 100 × adultes fertiles (18-45 ans), cumulées dans un accumulateur déterministe (une naissance à chaque unité franchie). Coeff<sub>mariages</sub> = 1 + 0,20 × min(1, 2 × unions / adultes fertiles) (+0,10 la saison où Ely verse les allocations familiales) ; Coeff<sub>logement</sub> = min(1, lits / N<sub>pop</sub>), plancher 0,3 ; Coeff<sub>moral</sub> = 0,5 + moral / 100. La formule de pérennité s'applique comme variation saisonnière ; les +4 % par enfant accueilli sont crédités dès l'admission. Vieillissement<sub>base</sub> = 1 + 3 × part des adultes de plus de 50 ans ; Malus<sub>homosexualité</sub> = 0,25 × max(0, taux − 10). Hausse saisonnière du taux : +0,5 sans nouvel adulte (isolement), +0,5 si alcool > 45 % (dérives festives), divisée par deux si la Messe a été célébrée. Les enfants vieillissent d'un an par saison ; un apprenti est diplômé à 16 ans après au moins 3 saisons ; les études de droit durent 3 saisons.

### 3.3 Moteur d'Alcool, Stupéfiants & Addictions : Impacts sur la Productivité et l'Insécurité

L'isolement des Pyrénées, la proximité des boutiques détaxées d'Andorre, les concerts mensuels des BOR et la pression des chantiers exposent la communauté à l'alcool (`alcohol_consumption_pct`, défaut 15 %) et aux stupéfiants (`drug_prevalence_pct`, défaut 0 %). Au-delà de 50 % sur sa jauge personnelle `addiction_level_pct`, un habitant subit un manque quotidien (−10 % de santé mentale et −1 PA) jusqu'à sa prise en charge par Brunel et Tanguy.

**1. Formule consolidée de Productivité Globale (bornée entre 15 % et 150 %) :**

> Productivité<sub>globale</sub> (%) = 100 + Bonus<sub>spécialités_et_apprentis</sub> + Bonus<sub>propriété_privée</sub> − Malus<sub>sous_effectif</sub> − Malus<sub>surpopulation</sub> − Malus<sub>outils</sub> − Malus<sub>collectivisme</sub> − Malus<sub>alcool</sub> − Malus<sub>drogues</sub>
>
> Malus<sub>alcool</sub> = 0,40 × max(0, `alcohol_consumption_pct` − 20) | Malus<sub>drogues</sub> = 0,60 × max(0, `drug_prevalence_pct` − 5)

**2. Formule consolidée d'Insécurité du Village (0 % à 100 %) :**

> `insecurity_pct` = Base<sub>tensions</sub> + surpopulation + friction_culturelle + alcool + drogues + marché_noir − Réduction<sub>Sécurité_Intérieure</sub> − Réduction<sub>Brunel</sub>
>
> alcool = 0,35 × max(0, `alcohol_consumption_pct` − 30) | drogues = 0,80 × max(0, `drug_prevalence_pct` − 5)

| Palier d'exposition | Impact sur la productivité | Impact sur l'insécurité & l'ordre | Effets santé, PA & risques autorités |
|---|---|---|---|
| **Palier 1 : Usage maîtrisé** (Alcool ≤ 20 % \| Drogues ≤ 5 %) | Aucune pénalité (0 %) : convivialité lors des banquets dominicaux (`morale_pct` +5 %). | Impact négligeable (< 5 %) : cohésion sociale préservée, aucun trouble interne. | Conservation intégrale des 3 PA quotidiens ; vigilance normale face aux contrôles extérieurs. |
| **Palier 2 : Banquets excessifs & usage récréatif** (Alcool 21-45 % \| Drogues 6-25 %) | Baisse sensible (−8 % à −22 %) : gueules de bois matinales, lenteur sur les chantiers de Tiphaine / Alex, baisse de rendement agricole. | Hausse modérée (+8 % à +22 %) : disputes verbales à La Taverne, tapage nocturne, premiers larcins de rations ou de tomates. | Risque de perte de 1 PA le lendemain ; hausse de +15 % du risque de blessure (M. Lerme) et d'usure des outils (+20 %). |
| **Palier 3 : Ivresse chronique & trafic latent** (Alcool 46-70 % \| Drogues 26-55 %) | Chute lourde (−23 % à −45 %) : désorganisation des équipes, erreurs techniques critiques (fuites, courts-circuits), double usure de l'outillage. | Insécurité élevée (+23 % à +48 %) : rixes nocturnes, vols réguliers d'outils et matériaux, ponctions occultes dans la caisse commune, marché noir dans les ruines. | 1 PA perdu systématiquement pour les dépendants ; patrouilles accrues de la Guardia Civil (`admin_pressure_pct` +20 %). |
| **Palier 4 : Ravages & zone de non-droit** (Alcool > 70 % \| Drogues > 55 %) | Effondrement (−46 % à −75 %) : paralysie quasi totale des chantiers et récoltes, abandon des postes de garde et des réseaux. | Crise sécuritaire majeure (+49 % à +80 %) : violences graves, sabotages, règlements de comptes entre résidents, perte d'autorité de l'Agora. | Perquisition des Mossos d'Esquadra : saisies, garde à vue (`is_detained_until`), amendes lourdes et chute de `international_notoriety_pct` (−30 %). |

> **Précisions V3.8.** Les formules font foi ; le tableau des paliers décrit l'ampleur attendue. Malus<sub>sous_effectif</sub> : 0 dans une tolérance de 10 % de déficit de travailleurs, puis de 15 % à 40 % (travailleurs requis : 10 à l'Acte I, 16 à l'Acte II, 22 à l'Acte III). Malus<sub>surpopulation</sub> = min(35, 10 + 50 × taux de sur-occupation). Bonus<sub>spécialités</sub> = 1,5 × niveau par spécialiste + 3 par apprenti diplômé + 1 par apprenti (plafond 35). Bonus<sub>propriété_privée</sub> = 10 % dès un résident employé sur fonds privés, +2,5 % par résident supplémentaire (plafond 20 %, nul sous collectivisation). Base<sub>tensions</sub> = 5 (+10 si faction clandestine active, +8 en grève) ; surpopulation = 40 × taux de sur-occupation ; friction = 0,5 × max(0, friction − 20) ; marché noir = 10 + 1 par ruine (plafond 8) ; Réduction<sub>Sécurité_Intérieure</sub> = 8 si le portefeuille Intérieur est attribué + 3 par mirador / herse + effet des patrouilles. Les deltas d'insécurité décidés par l'IA alimentent une part événementielle qui s'amortit de 10 % par jour. En palier 3 ou en présence de marché noir, 0,2 % de la caisse fuit chaque jour (récupérable à 50 % par l'audit de M. Lerme).

## 4. Équilibre Idéologique (Droite vs Gauche), Politique Migratoire & Justice Souveraine

La vie politique du hameau repose sur la tension permanente entre l'initiative individuelle (propriété privée, mérite au travail, souveraineté ferme) et le collectivisme égalitariste. L'orientation idéologique globale (`left_wing_ideology_pct`, 0-100 %, défaut 25 %) et l'indice de friction culturelle (`cultural_friction_pct`, 0-100 %, défaut 10 % au GDD, 5 % au schéma 7.1) déterminent la prospérité et la stabilité du village.

### 4.1 Spectre Politique (Droite vs Gauche) & Risque d'Effondrement Collectiviste

Chaque habitant (joueur fondateur, migrant accueilli ou jeune adulte issu de l'école du hameau) porte une sensibilité politique sur un axe allant de la Droite conservatrice / libérale (valorisant l'épargne privée, l'investissement personnel, l'autorité et l'enracinement) à la Gauche collectiviste / révolutionnaire (réclamant la mise en commun forcée des patrimoines, le partage égalitaire des rations sans condition de travail et l'ouverture inconditionnelle du hameau).

**Calcul du Malus Collectiviste (dérive type URSS lorsque `left_wing_ideology_pct > 40 %`) :**

> Malus<sub>collectivisme</sub> (%) = 1,10 × max(0, `left_wing_ideology_pct` − 40) + (15 si collectivisation_votée = TRUE)

- Au-delà de `left_wing_ideology_pct > 55 %` : déclenchement automatique des **Pénuries Collectivistes** (−25 % de récolte agricole, fuite des patrimoines privés vers Andorre, lourdeur bureaucratique paralysant les chantiers et explosion de la dette foncière).
- Au-delà de `left_wing_ideology_pct > 75 %` pendant 2 saisons consécutives : **Effondrement Soviétique du Hameau** — cessation de paiement de l'emprunt (295 000 €), saisie judiciaire par les banques espagnoles et dispersion des habitants (défaite collective).

> **Précisions V3.8.** L'orientation dérive chaque jour de 3 % vers la moyenne des sensibilités des habitants (fondateurs à 25, résidents selon leur score réel), +10 sous collectivisation, +5 si le moral passe sous 40 %, −3 si l'insécurité dépasse 50 % ou si l'emploi privé existe. Pénuries collectivistes : fuite de 2 % par jour des patrimoines privés vers Andorre et taux de l'emprunt doublé.

### 4.2 Génération IA des dossiers de candidats migrants (incluant Idées Politiques & Culte)

2 à 3 fois par semaine (ou sur appel voté à l'Agora), le Maître du Jeu IA génère l'arrivée de 1 à 3 candidats ou foyers migrants sur la piste forestière. Chaque fiche affiche l'ensemble de ses paramètres démographiques, culturels et idéologiques :

| Attribut du dossier | Valeurs & impact mécanique dans le moteur |
|---|---|
| **Identité & âge** | Nom, prénom et âge (18-65 ans). Détermine l'horizon de vie active, l'endurance physique et le potentiel de natalité future du foyer. |
| **Origine géographique** | Ex. Catalogne rurale, Maghreb, Afrique subsaharienne, Europe de l'Est, Amérique latine, Asie. Influence `spanish_fluency_pct`, l'adaptation climatique et les savoir-faire agricoles. |
| **Religion / Culte** | Ex. Catholique, Musulman / Islamique, Orthodoxe, Athée / Laïque, Évangélique. Un accueil massif de résidents de confession islamique ou fortement éloignés des traditions locales sans médiation fait grimper `cultural_friction_pct`, réduit l'efficacité morale de la Messe dominicale de Brunel et alimente des tensions communautaires si les quotas d'intégration sont dépassés. |
| **Sensibilité politique (Droite / Gauche)** | Ex. Droite traditionnelle / Entrepreneuriale, Centre pragmatique, Gauche syndicale, Extrême-gauche collectiviste. Modifie directement `left_wing_ideology_pct` dès l'admission. Un candidat classé à gauche ou à l'extrême-gauche milite pour la collectivisation, organise des cellules syndicales et favorise la dérive économique de type URSS. |
| **Force physique (1-100)** | Multiplicateur direct sur les travaux lourds (empierrement piste, terrassement barrage, forge, bûcheronnage) et résistance aux blessures (M. Lerme). |
| **Spécialité & niveau (1-5)** | Ex. Maçon, Charpentier, Soudeur, Maraîcher, Mécanicien diesel, Électricien, Berger, Sans qualification. Accélère de +10 % à +35 % les chantiers du pôle correspondant. |
| **Nombre d'enfants (0-5)** | Augmente la consommation quotidienne de rations et d'eau (+150 L/j par personne), mais remonte directement `demographic_viability_pct` (+4 % par enfant) et alimente l'école d'apprentissage. |
| **Apport concret & risques cachés** | Synthèse narrative IA (savoir-faire, relais commercial) et indicateurs cachés dépistables par Tanguy, M. Lerme ou Brunel (pathologie, fragilité lombaire, addiction ou militantisme clandestin). |

> **Précisions V3.9 — arrivée des dossiers.** Les nuits du lundi, du mercredi et du vendredi, le Maître du Jeu génère 1 à 3 candidats (tirage déterministe), sauf si 5 dossiers attendent déjà. Chaque dossier crée automatiquement une motion d'admission soumise à l'Agora du dimanche suivant et une annonce en Salle de l'Agora. Sans IA, un générateur déterministe varie origines, prénoms, cultes (selon l'origine), sensibilités (indépendantes de l'origine), spécialités, enfants et risques cachés.

> **Précisions V3.8.** Sensibilités normalisées : Droite conservatrice (score 10), Droite libérale (20), Centre (40), Gauche sociale (65), Extrême gauche / Collectiviste (90) ; le score réel peut différer du score déclaré (révélé par l'entretien de Brunel). Effet d'admission : gauche += (score − gauche) / (adultes + 1) ; espagnol +2 % pour un hispanophone. Friction : la « pression d'intégration » des résidents arrivés depuis moins de 28 jours (distance culturelle de 0,1 à 0,9 selon la religion, +0,2 sans espagnol, +0,3 pour un agitateur) est comparée à la capacité d'intégration (3 + espagnol / 20 + 2 par médiation de Brunel + 1 si Messe) : tout dépassement fait monter la friction de 1,5 point par unité et par jour ; sinon elle redescend de 0,5 par jour. Auscultations : physique (M. Lerme), médicale (Tanguy), psychologique (Brunel) — résultats visibles du seul auscultateur.

### 4.3 Loyauté Individuelle, Naturalisation & Factions Clandestines

- **Jauge de loyauté individuelle & naturalisation (Acte III) :** chaque migrant accueilli entretient un score de loyauté (0-100 %) envers chacun des 7 fondateurs selon qui a soutenu son vote d'admission à l'Agora, qui l'a soigné (M. Lerme ou Tanguy) ou confessé (Brunel). Une fois naturalisé citoyen du Micro-État par vote de l'Agora en Acte III, il obtient le droit de vote aux scrutins publics et vote systématiquement en faveur de son protecteur — ouvrant la voie au clientélisme politique négocié dans les Chuchotements de La Taverne.
- **Cellules syndicales, grèves & putsch dominical :** si `left_wing_ideology_pct > 45 %` ou `cultural_friction_pct > 50 %`, les résidents mécontents constituent une faction clandestine capable de déclencher une grève générale sur les chantiers de Tiphaine et d'Alex (productivité divisée par deux), de saboter les conduites d'eau ou de tenter un coup d'État pendant l'Agora du dimanche matin (résolu par un duel entre le meneur et le Président de l'Agora — épreuve de la cible depuis la V4.0 — ou réprimé par le pôle Défense & Sécurité avec mise au cachot des insurgés).

> **Précisions V3.8.** Loyauté initiale 40 envers chaque fondateur ; +25 pour un vote OUI à l'admission, −15 pour un NON, +15 pour des soins, +10 pour une thérapie, une cure ou une embauche privée, −20 pour un cachot. Le protecteur est le porteur de la motion s'il a voté OUI, sinon le fondateur le plus aimé. Faction active : risque de grève de 8 % par jour (3 jours), de sabotage de 4 % par jour (dégât le lendemain si Alex ne l'a pas détecté). Putsch : le dimanche matin si faction active, insécurité > 40 % et gauche > 50 % (une fois par saison) ; le meneur (PNJ) affronte la Présidente en duel (épreuve de la cible depuis la V4.0, §6.1 bis). Putsch réussi : collectivisation imposée, gauche +10, moral −10, grève de 3 jours ; échec : meneur au cachot, gauche −3.

### 4.4 Matrice d'équilibre : Sous-accueil, Sur-accueil, Friction Culturelle & Idéologique

| Scénario démographique & politique | Impact sur la productivité | Impact sur l'insécurité & l'ordre | Infrastructures, démographie & autorités |
|---|---|---|---|
| **Sous-accueil / Fermeture** (N<sub>res</sub> trop faible face aux chantiers ou au déficit nataliste) | Chute de productivité (−15 % à −40 %) : enlisement des chantiers, pénurie de bras aux récoltes d'Ely, surcharge physique des fondateurs (+fatigue, blessures). | Insécurité interne faible (< 10 %), mais tensions politiques vives à l'Agora face à la stagnation du hameau. | Si `homosexuality_rate_pct` est élevé sans apport familial, `demographic_viability_pct` chute vers 0 % : extinction démographique du village. |
| **Équilibre maîtrisé & sélection ciblée** (capacité PLU respectée, profils travailleurs / droite ou modérés) | Bonus de productivité (+15 % à +35 %) : accélération ciblée des chantiers, stimulation de l'initiative privée et transfert d'XP aux apprentis. | Insécurité maîtrisée (< 20 %) : cohésion sociale élevée, loyauté envers les fondateurs et intégration linguistique rapide. | Fonctionnement nominal des réseaux hydrauliques d'Alex, hausse stable de la population active et des enfants. |
| **Sur-accueil / Dérive islamique ou collectiviste** (N<sub>res</sub> > PLU, forte proportion de migrants islamiques ou de gauche) | Effondrement productif (−30 % à −65 %) : pénurie d'outils, grèves syndicales, revendications égalitaristes type URSS, abandon de l'effort individuel et épuisement des rations. | Explosion de l'insécurité (+30 % à +70 %) : forte hausse de `cultural_friction_pct`, rejet de l'autorité de l'Agora et de la Messe de Brunel, vols, rixes, cellules clandestines et tentatives de putsch. | Saturation des fosses et rupture des canalisations d'Alex (épidémies), campements illégaux, faillite financière (dérive URSS) et descentes des Mossos d'Esquadra. |

### 4.5 Tribunal Public de l'Agora : Travaux Forcés, Bannissement & Exécution sur la Place Publique

Face aux crimes (vols répétés, trafic de stupéfiants, sabotage, tentative de coup d'État) ou à l'agitation politique jugée trop à gauche menaçant la survie économique du hameau, l'Agora peut siéger en Tribunal Public (vote à la majorité simple, sous réserve de veto institutionnel) et prononcer trois degrés de sentence contre un résident ou un joueur :

1. **Travaux forcés & pilori (peine intermédiaire) :** le condamné est astreint pendant 3 à 7 jours aux travaux lourds (empierrement de la piste forestière ou extraction de pierre) sous la garde armée de la Sécurité Intérieure, conservant sa force de travail au prix d'une hausse de fatigue et d'un risque d'évasion ou de mutinerie (15 %).
2. **Bannissement / expulsion immédiate (« Virer du village ») :** le condamné (et éventuellement son foyer) est reconduit hors des 30 hectares jusqu'à la route de Lleida. Libère instantanément des lits PLU, de l'eau et des rations, et réduit `insecurity_pct` (−10 % à −25 %) ainsi que `left_wing_ideology_pct` (−5 % à −12 %). Comporte un risque de représailles (25 % : vol d'outils au départ ou dénonciation aux Mossos d'Esquadra).
3. **Exécution sur la place publique (sentence capitale souveraine) :** décision extrême votée à la majorité qualifiée des deux tiers à l'Agora pour haute trahison, crime grave ou subversion collectiviste avérée. Élimine définitivement la menace interne, provoque un électrochoc dissuasif immédiat sur `insecurity_pct` (−35 %) et `left_wing_ideology_pct` (−20 %), mais entraîne un choc moral collectif (`morale_pct` −18 %, nécessitant une Messe de pénitence et des confessions chez Brunel) ainsi qu'un risque critique d'enquête criminelle des Mossos d'Esquadra et de la Guardia Civil (`admin_pressure_pct` +45 % en Actes I-II ; crise diplomatique internationale en Acte III sauf intervention du pôle Médias & Chancellerie).

> **Précisions V3.8.** Un joueur condamné aux travaux forcés ne peut effectuer que des actions physiques ; il empierre la piste (+2 %/jour). Un joueur banni ou exécuté perd ses portefeuilles, ses PA et son droit de vote ; l'accusé ne vote pas sur sa propre motion. La Messe de pénitence ajoute +6 % de moral. En Acte III, avec Médias ou Chancellerie attribués : notoriété −10 et sympathie européenne −10 au lieu de −25 / −30.

### 4.6 Initiatives Législatives Hebdomadaires de l'Agora (V3.6)

Chaque joueur peut soumettre **une initiative par semaine** (table `agora_proposals`, `kind = 'initiative'`) : un titre et un **détail explicatif complet** (objectifs, financement, modalités — par exemple la création d'un fonds souverain à la norvégienne), avec une catégorie (économie, justice, immigration, infrastructure, constitution, société, énergie, sécurité).

- **Vote nominatif OUI / NON** de l'ensemble du village jusqu'à la séance du dimanche 11:00 ; chacun peut changer son vote avant la clôture ; les votes sont publics.
- **Dépouillement :** majorité simple ; égalité tranchée par la voix prépondérante de la Présidente (Ely) ; majorité des deux tiers pour une exécution publique et la proclamation d'indépendance. En Acte III, chaque naturalisé ajoute une voix alignée sur celle de son protecteur.
- **Veto puis exécution :** une initiative adoptée peut être frappée de veto pendant 6 heures (1 jeton par pilier et par saison) ; le porteur peut contester le veto en duel (Carlage 2 × 2 ou épreuve de la cible, à son choix). Passé ce délai, le Maître du Jeu IA traduit fidèlement le détail explicatif en effets économiques, fiscaux, idéologiques et narratifs, dans les bornes du moteur (plafond doublé pour une décision de l'Agora) ; en cas d'indisponibilité de l'IA, un dictionnaire local de secours applique des effets déterministes.
- **Motions structurées** (hors quota hebdomadaire, 3 ouvertes au maximum par joueur) : Tribunal Public, admission et naturalisation de migrants, collectivisation / décollectivisation, prohibition (alcool, stupéfiants, tomates), rationnement, élection à un portefeuille ministériel, adoption d'un article de Constitution, proclamation d'indépendance. Leurs effets sont appliqués directement par le moteur.

## 5. Économie Parallèle, Propriété Privée, Contrebande & Exploitation du Domaine

### 5.1 Patrimoine individuel vs Caisse commune (Propriété privée vs Collectivisation)

- **Comptes privés (`private_wealth_eur`) :** chaque joueur fondateur et résident possède une épargne personnelle distincte de la trésorerie commune de 50 000 € tenue par M. Lerme. Les joueurs peuvent accumuler des revenus privés (primes de rendement, commerce personnel, parts du gîte ou du minage) pour financer l'amélioration de leur propre logement auprès de Tiphaine ou rémunérer directement un résident migrant sur leurs chantiers privés (générant un bonus de productivité privée de +10 % à +20 %).
- **Vote de collectivisation (si dérive à gauche) :** si l'Agora vote la réquisition des comptes privés au profit de la caisse commune, 40 % de l'épargne privée s'évapore immédiatement par dissimulation et fuite des capitaux vers Andorre, tandis que la motivation individuelle s'effondre.

> **Précisions V3.8.** Épargne d'ouverture : 2 000 € par fondateur. Travail privé : ≈ 90 € × productivité par action. Salaire d'un résident employé : 50 à 400 € par semaine, prélevé chaque lundi (contrat rompu si l'employeur ne peut plus payer). Emprunt foncier : 2,5 % par an, échéance hebdomadaire de 360 € prélevée automatiquement ; une échéance impayée ajoute les intérêts à la dette, +5 % de pression administrative et −1 % de notoriété.

### 5.2 Contrebande Andorrane & Marché Noir dans les Ruines

- **Convois nocturnes depuis Andorre (18 km) :** le titulaire du pôle Transports, Piste & Douanes peut lancer une expédition nocturne transfrontalière (cartouches de tabac, alcool détaxé, carburant, pièces mécaniques) générant entre +1 500 € et +6 000 € de bénéfice net pour accélérer le remboursement de la dette foncière de 295 000 €, au prix d'un jet d'embuscade de la Guardia Civil et des douaniers (25 % à 45 % de risque selon la fréquence des passages et `spanish_fluency_pct`).
- **Marché noir dans les ruines :** dès que l'Agora impose un rationnement ou une prohibition (alcool, stupéfiants, tomates), un réseau clandestin s'installe dans les bâtisses non encore rénovées par Tiphaine. Le pôle Sécurité Intérieure doit mener des perquisitions ciblées (1 PA) pour saisir les stocks illicites et reverser les saisies à la caisse de M. Lerme.

> **Précisions V3.8.** Risque d'embuscade = 25 + 5 × expéditions de la saison + alerte douanière / 5 − espagnol / 10, borné entre 25 % et 45 %. Embuscade : amende de 1 000 à 3 000 €, pression administrative +15, notoriété −5, garde à vue de 24 h du passeur. Le marché noir s'installe avec 50 % de chance par jour tant que les conditions sont réunies et qu'il reste des ruines ; une perquisition saisit 200 à 800 €.

### 5.3 Élevage Pastoral, Gîte Clandestin & Minage / Dissuasion Souveraine

- **Élevage pastoral sur les 30 hectares :** Ely et Julio peuvent constituer un cheptel de brebis et de cochons dans les pâturages, assurant une production autonome de viande, de laitages et d'engrais naturel (+20 % de rendement durable sur le potager) tout en réduisant la dépendance aux achats extérieurs.
- **Gîte rural alternatif & concerts des BOR :** en rénovant une bâtisse dédiée avec Tiphaine, le village peut ouvrir un gîte accueillant randonneurs pyrénéens et spectateurs des concerts des BOR (+800 € à +2 500 € par semaine), au risque d'attirer des marginaux (hausse de `drug_prevalence_pct` et `left_wing_ideology_pct`) ou un contrôle fiscal / touristique de l'Ayuntamiento.
- **Minage de cryptomonnaie & R&D de dissuasion (Acte III) :** une fois le micro-barrage hydroélectrique d'Alex opérationnel, le surplus d'électricité alimente une ferme de calcul discrète générant des revenus numériques hors du circuit bancaire espagnol, couplée aux prototypes secrets de Tanguy (brouilleurs radio, chimie défensive et micro-réacteur) pour sanctuariser l'indépendance du Micro-État.

> **Précisions V3.8.** Enclos (Cleda) requis pour le cheptel (40 têtes max, 140 € la tête) ; engrais à partir de 6 têtes ; +8 % de naissances par saison à partir de 4 têtes. Gîte : 800 € de base, +300 / +600 selon l'état de la piste, +700 la saison d'un concert des BOR, ±moral ; contrôle à 15 % + pression / 10 (−7 avec la Chancellerie), amende de 500 à 1 500 €. Minage : 250 kWh/jour pour ≈ 15 €/jour, uniquement si la production couvre la consommation. Dissuasion : chaque cycle complet de R&D (100 %) en Acte III ajoute un niveau (5 max) ; le micro-réacteur (palier 5) exige le palier 4 et une dissuasion ≥ 3.

## 6. Duels (Carlage 2 × 2 & Épreuve de la cible), La Taverne, Tentations & Écrans Mobile-First

### 6.1 Règles exactes du Carlage (Arène tactique 2 × 2)

Lorsqu'un veto bloque un projet, une sentence du Tribunal Public ou qu'une faction tente un coup d'État à l'Agora, les deux protagonistes règlent le différend au Carlage : un duel temps réel sur une grille de 4 carreaux au sol (2 × 2 : Haut-Gauche, Haut-Droite, Bas-Gauche, Bas-Droite) dont il est interdit de sortir.

- **Format du duel :** 5 manches simultanées maximum (10 secondes par manche sur mobile et PC). Les deux combattants démarrent en diagonale avec 100 points d'équilibre.
- **Les 4 coups disponibles :** (1) **Pousser / Épauler** (projette d'un carreau ; sortie du carré = défaite immédiate) ; (2) **Pivoter / Esquiver** (déplacement adjacent ; poussée adverse dans le vide = −30 équilibre) ; (3) **Encaisser / Ancrer** (divise le recul par deux et contre-pousse) ; (4) **Coup d'épaule risqué** (double la projection avec 35 % de risque de glissade).
- **Conséquences :** le vainqueur emporte l'arbitrage de l'Agora ou étouffe le putsch. Tout joueur ayant subi un choc violent ou glissé a 40 % de risque de contracter une entorse ou lombalgie (65 % sous l'emprise de l'alcool), nécessitant les soins de Guillem (M. Lerme) et le paiement de la Franchise Carlage.

**Matrice de résolution V3.8 (coups simultanés, x contre y) :**

| x \ y | Pousser | Pivoter | Ancrer | Épaule |
|---|---|---|---|---|
| **Pousser** | Épreuve de force (équilibre × forme physique) : écart ≥ 25 → le plus faible sort ; sinon −20 chacun | x pousse dans le vide : x −30 ; y se déplace (−5) | Recul divisé par deux : y −15 ; contre-poussée : x −20 | y glisse (35 %) → y −30 et sort ; sinon double projection → x sort |
| **Pivoter** | (symétrique) | Chacun se déplace (−5) ; même carreau visé → collision, −10 chacun | x se déplace (−5) ; y récupère +10 | Épaule dans le vide : y −30 (−60 s'il glisse) ; x se déplace (−5) |
| **Ancrer** | (symétrique) | (symétrique) | +10 chacun (plafond 100) | y glisse → y −30 ; sinon double projection ÷ 2 = projection simple → x sort |
| **Épaule** | (symétrique) | (symétrique) | (symétrique) | Un seul glisse → il est projeté ; les deux → −30 chacun ; aucun → −40 chacun |

Sortie du carré = défaite immédiate ; équilibre à 0 = chute et défaite ; après 5 manches, l'équilibre le plus élevé l'emporte, l'égalité profitant au camp du statu quo (veto maintenu, Présidente face au putsch). Le pivot se fait vers un carreau orthogonalement adjacent et libre ; sans coup dans le délai, le combattant reste figé sans défense. Le risque de glissade est majoré de 30 % sous emprise. Les coups de la manche en cours restent secrets jusqu'à la résolution. Un joueur ne remplissant pas les conditions des 3 PA ne peut pas combattre et désigne un champion. Le meneur d'un putsch est un PNJ dont le moteur tire les coups de façon déterministe (Pousser 30 %, Ancrer 30 %, Épaule 20 %, Pivoter 20 %).

> **Précisions V3.9 — déroulé d'un duel.** Les deux combattants ont 2 minutes pour rejoindre l'arène et jouer la 1re manche ; chaque manche suivante dure 10 secondes, après 3 secondes de révélation des coups. Une manche se résout dès que les deux coups sont déposés (ou à l'échéance, plus 2 secondes de tolérance réseau) ; le coup absent compte comme « figé ». Un duel abandonné depuis plus d'une minute est résolu d'office par la maintenance (toutes les 15 minutes). **Veto contesté :** seul le porteur de la proposition conteste ; s'il n'est pas apte, il désigne un champion apte ; si le titulaire du veto n'est pas apte, le moteur désigne le fondateur le plus en forme ; si personne ne peut défendre le veto, il tombe. **Putsch :** la nuit du samedi au dimanche, le moteur crée le duel entre la Présidente (ou le fondateur le plus en forme) et le meneur ; la 1re manche se joue à l'ouverture de l'Agora (11:00, fenêtre de 2 minutes). Le titulaire du portefeuille Défense ou Sécurité Intérieure (Acte II+) peut réprimer le putsch avant le duel pour 1 PA (meneur au cachot 24 h, gauche −3, insécurité −5). **Blessures :** la Franchise Carlage est prélevée sur l'épargne du blessé et reversée à la caisse commune.

### 6.1 bis Épreuve de la cible (V4.0) — duel en différé

Le Carlage exige que les deux adversaires soient connectés en même temps. Pour un groupe d'amis qui joue à des heures différentes, **le challenger choisit l'épreuve** au moment du défi : Carlage 2 × 2 (en direct) ou épreuve de la cible (en différé).

- **Principe :** 5 cibles apparaissent l'une après l'autre dans une arène carrée, après un délai aléatoire. Il faut taper le plus près possible du centre et le plus vite possible. Les deux adversaires reçoivent **exactement la même séquence** (tirée de l'identifiant du duel) et jouent chacun quand ils veulent avant l'échéance.
- **Score par cible (sur 100) :** 50 % précision (100 points au centre, 0 point à 30 % du côté de l'arène ou plus) + 50 % rapidité (100 points jusqu'à 200 ms, 0 point à 2 s). Un tap avant l'apparition ou moins de 120 ms après est un **faux départ** (0) ; au-delà de 3 s, la cible est **manquée** (0).
- **Victoire :** le meilleur total sur 5 cibles l'emporte ; l'égalité profite au camp du statu quo (veto maintenu, Présidente face au putsch). Les conséquences sont celles du Carlage (veto levé ou maintenu, sentence, putsch), **sans risque de blessure** ni Franchise Carlage.
- **Une seule tentative :** chaque joueur joue une fois ; quitter l'écran en cours d'épreuve envoie le score partiel. Les résultats restent secrets jusqu'à la fin du duel.

> **Précisions V4.0.** Échéance : 24 h après le défi ; à l'échéance, un joueur qui n'a pas joué marque 0. Le duel se résout dès que les deux résultats sont déposés, sinon à l'échéance (maintenance toutes les 15 minutes). Tout joueur libre peut jouer l'épreuve de la cible, même blessé ou à 1 PA (pas de condition des 3 PA, contrairement au Carlage : un champion n'est requis qu'au Carlage). **Putsch :** créé la nuit du samedi, il se joue à l'épreuve de la cible ; la Présidente (ou le fondateur le plus en forme) a jusqu'à 17:00 le dimanche (Agora + 6 h) ; les taps du meneur PNJ sont tirés de façon déterministe (écart de 1 à 12 % du centre, 260 à 650 ms). La répression par le pôle Défense ou Sécurité Intérieure reste possible avant la fin du duel. Le serveur recalcule toujours le score à partir des taps (5 au plus, un par cible, valeurs bornées) : le score affiché par le téléphone n'est qu'un aperçu.

### 6.2 Messagerie Temps Réel (« La Taverne ») & Moteur de Tentations

- **La Taverne (Supabase Realtime) :** trois espaces — Place du Village (public), Salle de l'Agora (débats législatifs, dossiers migrants, Tribunal Public) et Chuchotements (négociations privées, clientélisme auprès des résidents naturalisés, complots). L'IA reçoit les 25 derniers messages publics avant d'écrire La Gazette.
- **Moteur de Tentations & Dérives :** 1 à 2 fois par semaine, le Maître du Jeu IA soumet un dilemme privé à un joueur : tentations festives (tournée au bar du col, alcool détaxé d'Andorre, stupéfiants aux concerts des BOR), tentations sentimentales / charnelles (impactant `homosexuality_rate_pct` ou la diplomatie locale) ou tentations idéologiques / financières (détournement discret de caisse, propagande clandestine). Céder procure +20 % de moral immédiat mais déclenche −2 PA le lendemain et des répercussions concrètes si le joueur ne se confesse pas à Brunel avant la parution de La Gazette.

> **Précisions V3.8.** Un dilemme expire après 36 heures. Céder : moral personnel +20, culpabilité +30, effets bornés (moral ±20, alcool ±5, stupéfiants ±3, homosexualité ±1, caisse ±500 €, épargne ±500 €, addiction ±10, gauche ±3, pression ±10, notoriété ±5). La confession à Brunel (−40 % de culpabilité) marque l'écart comme confessé — il rejoint les secrets confessés de Brunel. À la parution de La Gazette, chaque écart non confessé devient un scandale public (moral personnel −10, pression administrative +2 à +5, notoriété −1). Une culpabilité supérieure à 50 % coûte 2 % de santé mentale par nuit.

> **Précisions V3.9 — cadence.** Chaque nuit, chaque joueur libre sans dilemme en attente a 20 % de chances d'en recevoir un (≈ 1,4 par semaine ; réglable par `TEMPTATION_CHANCE_PCT`). L'administrateur peut aussi en envoyer un à la demande. La Gazette paraît chaque nuit (00:05 à Madrid) : les scandales non confessés y sont publiés juste avant sa rédaction.

### 6.3 Connecteurs Monde Réel & Architecture des 5 Écrans Mobile-First

1. **Connecteurs temps réel gratuits (0 €) :** météo réelle de Lleida / Andorre via l'API Open-Meteo (sans clé), flux RSS Espagne / Catalogne / France (actualités économiques, migratoires et policières converties en événements de jeu) et calendrier réel (saisons agricoles / natales, dimanches Agora / Messe / Tribunal, jours fériés catalans).
2. **Écran d'accueil — Connexion (V3.5) :** grille des 7 fondateurs (Ely, Guillem / M. Lerme, Tiphaine, Alex, Julio, Tanguy, Guillaume B. / Brunel) et des 3 places évolutives ; clic sur le personnage puis code PIN à 4 chiffres ; session mémorisée sur l'appareil pour une reconnexion instantanée.
3. **Écran 1 — Carte interactive du hameau (SVG 2D) :** vue aérienne des 30 hectares affichant bâtisses rénovées / ruines avec jauge de capacité PLU, gîte rural, enclos d'élevage, ferme de minage, canalisations d'Alex avec alertes de fuite, réseau électrique de Tiphaine, potager d'Ely, piste forestière, miradors / herses et alertes d'insécurité.
4. **Écran 2 — Mon Métier & Patrimoine privé :** jauges vitales (santé, fatigue, moral, sobriété / addiction, XP), compteur des 3 PA, compte patrimonial privé (`private_wealth_eur`), suivi des apprentis, indicateurs cachés du métier strictement réservés au titulaire, actions déterministes (avec verrous PLU / budget > 500 € / veto écologique) et formulaire d'Action Libre IA.
5. **Écran 3 — L'Agora, Tribunal Public & Carlage 2 × 2 :** initiatives législatives hebdomadaires et vote OUI / NON, scrutins budgétaires et législatifs (propriété privée vs collectivisation, alcool / stupéfiants), Bureau de l'Immigration & Démographie (pyramide des âges, taux d'homosexualité, spectre Droite / Gauche, fiches détaillées des candidats avec origine, religion et sensibilité politique, auscultations, naturalisations), Tribunal Public (travaux forcés, bannissement, exécution sur la place publique), éditeur collaboratif de la Constitution, jetons de veto, arène du Carlage et épreuve de la cible.
6. **Écran 4 — Trésorerie, grand livre privé & fournisseurs :** comptabilité publique et privée tenue par M. Lerme, dette foncière (295 000 €), fonds souverain, revenus du gîte / minage / contrebande, jauge d'autonomie (Actes I à III) et catalogue fournisseurs (BigMat, Gedimat, Thomas Sograma, Loxam, Kiloutou, Marché d'Andorre).
7. **Écran 5 — La Gazette & La Taverne :** journal quotidien généré par l'IA (chroniques politiques, faits divers, verdicts du Tribunal Public, actualité réelle), messagerie temps réel publique / privée et modales privées de Tentations & Dérives (avec confession / thérapie chez Brunel pour étouffer le scandale).
8. **Panneau d'administration (V3.7) :** sauvegardes quotidiennes, restauration du village à J−1, J−2, J−7… en un clic, export / import JSON manuel, attribution des places 8 à 10 et réinitialisation d'un PIN oublié.
9. **Mode démo (V4.0) :** sans configuration Supabase, le site démarre une partie locale au navigateur (PIN 0000 pour tous) qui exécute exactement le même moteur et la même session de jeu que les Edge Functions, avec les règles d'accès émulées, une « machine à remonter le temps » (+1 h à +3 jours) et la réinitialisation de la partie. Idéal pour découvrir le jeu avant le déploiement.

> **Précisions V4.0 — interface.** Navigation basse à 5 onglets (+ Admin pour M. Lerme), pastilles sur Mon Métier (validations en attente) et Agora (scrutins non votés), bandeaux d'alerte (duel en attente, cachot, travaux forcés, défaite). Les données se rafraîchissent par Realtime (regroupement 400 ms), toutes les 45 s et au retour sur l'application ; `game-engine` op `tick` est appelé à l'ouverture puis toutes les 5 minutes. Un PIN réinitialisé par l'administrateur impose sa modification à la connexion suivante. Le Carlage affiche la grille 2 × 2, les équilibres, le chrono de manche et le déroulé ; le choix du pivot se fait en touchant un carreau adjacent libre.

## 7. Spécification Technique Complète (Base de Données SQL, Prompt IA & Évolutivité)

**Déploiement & budget :** frontend React 18 + TypeScript + Vite + Tailwind hébergé gratuitement sur GitHub Pages (0 €/mois, déploiement continu par GitHub Actions en ~45 s à chaque push sur `main`) + backend Supabase Free (PostgreSQL, Realtime, Edge Functions en Deno / TypeScript). Pas de Supabase Auth : connexion par PIN (§7.4). Coût estimé de l'API IA pour 7 à 10 joueurs (~40 appels/jour) : 3 € à 5 €/mois en mode hybride avec Prompt Caching et dictionnaire local de secours.

### 7.1 Schéma SQL de référence V3.7 (PostgreSQL / Supabase)

Schéma de conception V3.7 tel que spécifié. Le schéma **exécutable** et consolidé (V3.8) se trouve dans `supabase/migrations/` ; ses différences sont listées en §7.1 bis.

```sql
-- ============================================================================
-- 1. ÉTAT GLOBAL DU VILLAGE (Économie, Infrastructures, Démographie, Idéologie)
-- ============================================================================
CREATE TABLE village_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  act_number INT NOT NULL DEFAULT 1 CHECK (act_number BETWEEN 1 AND 3),
  autonomy_pct INT NOT NULL DEFAULT 5 CHECK (autonomy_pct BETWEEN 0 AND 100),

  -- Finances & Fonds souverain
  treasury_eur NUMERIC(12,2) NOT NULL DEFAULT 50000.00,
  land_debt_eur NUMERIC(12,2) NOT NULL DEFAULT 295000.00,
  sovereign_fund_eur NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  crypto_reserves_eur NUMERIC(12,2) NOT NULL DEFAULT 0.00,

  -- Stocks & Infrastructures
  food_rations NUMERIC(10,2) NOT NULL DEFAULT 150.00,
  tomatoes_stock INT NOT NULL DEFAULT 80,
  livestock_count INT NOT NULL DEFAULT 0,
  wood_stock INT NOT NULL DEFAULT 200,
  stone_stock INT NOT NULL DEFAULT 50,
  iron_stock INT NOT NULL DEFAULT 30,
  tools_stock INT NOT NULL DEFAULT 10,
  housing_capacity INT NOT NULL DEFAULT 12,
  track_condition_pct INT NOT NULL DEFAULT 45 CHECK (track_condition_pct BETWEEN 0 AND 100),
  energy_tier INT NOT NULL DEFAULT 1 CHECK (energy_tier BETWEEN 1 AND 5),

  -- Cohésion, Moral & Diplomatie
  morale_pct INT NOT NULL DEFAULT 75 CHECK (morale_pct BETWEEN 0 AND 100),
  spanish_fluency_pct INT NOT NULL DEFAULT 15 CHECK (spanish_fluency_pct BETWEEN 0 AND 100),
  admin_pressure_pct INT NOT NULL DEFAULT 20 CHECK (admin_pressure_pct BETWEEN 0 AND 100),
  international_notoriety_pct INT NOT NULL DEFAULT 0 CHECK (international_notoriety_pct BETWEEN 0 AND 100),
  carlage_injury_fee_eur NUMERIC(8,2) NOT NULL DEFAULT 50.00,

  -- Démographie & Natalité (V3.1)
  homosexuality_rate_pct INT NOT NULL DEFAULT 12 CHECK (homosexuality_rate_pct BETWEEN 0 AND 100),
  birth_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 2.50,
  demographic_viability_pct INT NOT NULL DEFAULT 70 CHECK (demographic_viability_pct BETWEEN 0 AND 100),
  low_viability_seasons INT NOT NULL DEFAULT 0,

  -- Alcool, Stupéfiants & Insécurité (V3.2)
  alcohol_consumption_pct INT NOT NULL DEFAULT 15 CHECK (alcohol_consumption_pct BETWEEN 0 AND 100),
  drug_prevalence_pct INT NOT NULL DEFAULT 0 CHECK (drug_prevalence_pct BETWEEN 0 AND 100),
  addiction_level_pct INT NOT NULL DEFAULT 5 CHECK (addiction_level_pct BETWEEN 0 AND 100),
  insecurity_pct INT NOT NULL DEFAULT 5 CHECK (insecurity_pct BETWEEN 0 AND 100),

  -- Spectre Idéologique & Productivité (V3.3 - V3.4)
  left_wing_ideology_pct INT NOT NULL DEFAULT 25 CHECK (left_wing_ideology_pct BETWEEN 0 AND 100),
  cultural_friction_pct INT NOT NULL DEFAULT 5 CHECK (cultural_friction_pct BETWEEN 0 AND 100),
  productivity_modifier_pct INT NOT NULL DEFAULT 100,
  collectivization_active BOOLEAN NOT NULL DEFAULT FALSE,

  -- Monde réel & Horodatage
  real_weather_summary TEXT NOT NULL DEFAULT 'Ensoleillé, 14°C (Lleida)',
  real_news_headline TEXT DEFAULT NULL,
  constitution_text TEXT NOT NULL DEFAULT '',
  last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. JOUEURS (7 Fondateurs + 3 Places évolutives) — Connexion par Code PIN (V3.5)
-- ============================================================================
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  character_name TEXT NOT NULL,
  pin_code CHAR(4) NOT NULL, -- Code PIN à 4 chiffres mémorisé en localStorage
  role_code TEXT UNIQUE NOT NULL,
  -- 'mayor_agri', 'treasurer_physio', 'civil_eng', 'water_eng',
  -- 'smith_diplo', 'druid', 'priest_apoth', 'defense_sec', 'transport_customs', 'legal_media'
  ministerial_portfolios TEXT[] NOT NULL DEFAULT '{}',
  -- Ex: {'defense', 'interior', 'customs', 'chancery', 'media'}

  -- Santé & Points d'Action
  action_points INT NOT NULL DEFAULT 3 CHECK (action_points BETWEEN 0 AND 3),
  health_pct INT NOT NULL DEFAULT 100 CHECK (health_pct BETWEEN 0 AND 100),
  mental_health_pct INT NOT NULL DEFAULT 80 CHECK (mental_health_pct BETWEEN 0 AND 100),
  fatigue_pct INT NOT NULL DEFAULT 0 CHECK (fatigue_pct BETWEEN 0 AND 100),
  injury_type TEXT DEFAULT NULL, -- NULL, 'muscular' (M. Lerme), 'infectious' (Tango/Brunel), 'psychological' (Brunel)
  temptation_guilt_pct INT NOT NULL DEFAULT 0,

  -- Patrimoine privé & Énergie (V3.4)
  private_wealth_eur NUMERIC(12,2) NOT NULL DEFAULT 2000.00,
  power_kwh_used NUMERIC(10,2) NOT NULL DEFAULT 0,
  skill_xp INT NOT NULL DEFAULT 0,
  veto_tokens INT NOT NULL DEFAULT 1,
  spouse_id UUID DEFAULT NULL,
  is_detained_until TIMESTAMPTZ DEFAULT NULL,
  delegated_to UUID REFERENCES players(id) DEFAULT NULL
);

-- Fonction RPC de vérification du code PIN (remplace Supabase Auth)
CREATE OR REPLACE FUNCTION verify_player_pin(p_player_id UUID, p_pin TEXT)
RETURNS SETOF players
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM players WHERE id = p_player_id AND pin_code = p_pin LIMIT 1;
$$;

-- ============================================================================
-- 3. MIGRANTS, RÉSIDENTS, ENFANTS & FACTIONS (V3.1 - V3.4)
-- ============================================================================
CREATE TABLE village_migrants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  age INT NOT NULL CHECK (age BETWEEN 18 AND 80),
  origin TEXT NOT NULL,
  religion TEXT NOT NULL, -- 'Catholique', 'Musulmane', 'Orthodoxe', 'Athée/Laïque', 'Évangélique', etc.
  political_leaning TEXT NOT NULL, -- 'Droite conservatrice', 'Droite libérale', 'Centre', 'Gauche sociale', 'Extrême gauche / Collectiviste'
  left_wing_score INT NOT NULL DEFAULT 30 CHECK (left_wing_score BETWEEN 0 AND 100),
  physical_strength INT NOT NULL CHECK (physical_strength BETWEEN 1 AND 100),
  specialty_code TEXT NOT NULL, -- 'mason', 'farmer', 'welder', 'mechanic', 'electrician', 'shepherd', 'unskilled'
  specialty_level INT NOT NULL DEFAULT 1 CHECK (specialty_level BETWEEN 1 AND 5),
  children_count INT NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  value_proposition TEXT NOT NULL,
  hidden_risk_note TEXT DEFAULT NULL,

  -- Statut juridique, loyauté & discipline
  status TEXT NOT NULL DEFAULT 'candidate',
  -- 'candidate', 'accepted', 'rejected', 'forced_labor', 'expelled', 'executed'
  is_naturalized BOOLEAN NOT NULL DEFAULT FALSE,
  patron_player_id UUID REFERENCES players(id) DEFAULT NULL,
  loyalty_scores JSONB NOT NULL DEFAULT '{}'::jsonb, -- {"mayor_agri": 65, "treasurer_physio": 40, ...}
  faction_type TEXT NOT NULL DEFAULT 'loyalist', -- 'loyalist', 'union_agitator', 'black_market', 'devout'
  assigned_pole TEXT DEFAULT NULL,
  arrived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE village_children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  age_years INT NOT NULL DEFAULT 0,
  parent_summary TEXT NOT NULL,
  education_track TEXT NOT NULL DEFAULT 'village_school',
  -- 'village_school', 'apprentice_forge', 'apprentice_masonry', 'apprentice_lab', 'lleida_law_studies'
  mentor_player_id UUID REFERENCES players(id) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. INITIATIVES LÉGISLATIVES HEBDOMADAIRES DE L'AGORA (V3.6)
-- ============================================================================
CREATE TABLE agora_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INT NOT NULL,
  proposer_id UUID NOT NULL REFERENCES players(id),
  title TEXT NOT NULL, -- Ex: "Création d'un Fonds Souverain Norvégien"
  detailed_explanation TEXT NOT NULL, -- Argumentaire complet et modalités proposées
  category TEXT NOT NULL DEFAULT 'economy', -- 'economy', 'justice', 'immigration', 'infrastructure', 'constitution'
  votes_yes UUID[] NOT NULL DEFAULT '{}',
  votes_no UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'passed', 'rejected', 'vetoed'
  ai_execution_summary TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ DEFAULT NULL
);

-- ============================================================================
-- 5. MESSAGERIE TEMPS RÉEL (« LA TAVERNE ») & CARLAGE 2x2
-- ============================================================================
CREATE TABLE tavern_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL DEFAULT 'village_square', -- 'village_square', 'agora_hall', 'whisper'
  sender_id UUID REFERENCES players(id) ON DELETE SET NULL,
  recipient_ids UUID[] DEFAULT NULL,
  content TEXT NOT NULL,
  is_system_event BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE carlage_duels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES agora_proposals(id) DEFAULT NULL,
  player_a_id UUID NOT NULL REFERENCES players(id),
  player_b_id UUID NOT NULL REFERENCES players(id),
  current_round INT NOT NULL DEFAULT 1 CHECK (current_round BETWEEN 1 AND 5),
  player_a_pos TEXT NOT NULL DEFAULT 'TL', -- 'TL', 'TR', 'BL', 'BR'
  player_b_pos TEXT NOT NULL DEFAULT 'BR',
  player_a_balance INT NOT NULL DEFAULT 100,
  player_b_balance INT NOT NULL DEFAULT 100,
  player_a_move TEXT DEFAULT NULL,
  player_b_move TEXT DEFAULT NULL,
  winner_id UUID REFERENCES players(id) DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'finished'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. SAUVEGARDES QUOTIDIENNES MULTI-JOURS & RESTAURATION EN 1 CLIC (V3.7)
-- ============================================================================
CREATE TABLE daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  trigger_type TEXT NOT NULL DEFAULT 'auto_midnight', -- 'auto_midnight', 'pre_agora', 'manual'
  label TEXT NOT NULL,
  full_state_json JSONB NOT NULL, -- Export intégral de village_state, players, migrants, children, proposals
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_daily_snapshots_date ON daily_snapshots(snapshot_date DESC);

-- Fonction RPC de restauration complète à une date antérieure (J-1, J-2, J-7...)
CREATE OR REPLACE FUNCTION restore_daily_snapshot(p_snapshot_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_data JSONB;
BEGIN
  SELECT full_state_json INTO v_data FROM daily_snapshots WHERE id = p_snapshot_id;
  IF v_data IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Restauration de village_state
  DELETE FROM village_state;
  INSERT INTO village_state SELECT * FROM jsonb_populate_recordset(NULL::village_state, v_data->'village_state');

  -- Restauration de players
  DELETE FROM players;
  INSERT INTO players SELECT * FROM jsonb_populate_recordset(NULL::players, v_data->'players');

  -- Restauration de village_migrants
  DELETE FROM village_migrants;
  INSERT INTO village_migrants SELECT * FROM jsonb_populate_recordset(NULL::village_migrants, v_data->'village_migrants');

  -- Restauration de village_children
  DELETE FROM village_children;
  INSERT INTO village_children SELECT * FROM jsonb_populate_recordset(NULL::village_children, v_data->'village_children');

  -- Restauration de agora_proposals
  DELETE FROM agora_proposals;
  INSERT INTO agora_proposals SELECT * FROM jsonb_populate_recordset(NULL::agora_proposals, v_data->'agora_proposals');

  RETURN TRUE;
END;
$$;
```

### 7.1 bis Consolidation du schéma (V3.8, implémentée et testée)

| Sujet | V3.7 | V3.8 (implémenté) | Raison |
|---|---|---|---|
| Code PIN | `players.pin_code` en clair | Table `player_pins` (bcrypt), 5 échecs → verrou 5 min ; `verify_player_pin` renvoie un **jeton de session** | Avec la clé publique « anon », tout PIN en clair serait lisible par n'importe qui. |
| Identité côté base | — | Table `player_sessions` ; en-tête HTTP `x-player-token` ; fonction `current_player_id()` | Permet des politiques RLS par joueur, rôle et portefeuille sans Supabase Auth. |
| Indicateurs cachés | Colonnes lisibles de `village_state` | `village_state` et `players` inaccessibles en direct ; vues publiques `village_public_state`, `players_public`, `migrants_public` ; table `role_hidden_indicators` lue via `get_my_hidden_indicators()` (rôle, portefeuilles, conjoint) | Garantir que les indicateurs cachés ne sont visibles que de leur titulaire. |
| Écritures | Libres | Écritures « moteur » via Edge Functions (service_role) ; écritures légères via RPC contrôlées (`post_tavern_message`, `submit_agora_proposal`, `submit_agora_motion`, `cast_agora_vote`, `use_veto`, `carlage_submit_move`, `set_delegation`, `edit_constitution_article`, `set_player_pin`) | Pas de triche, pas d'écrasement concurrent (colonne `revision`). |
| Jauges | `INT` | `NUMERIC(5,2)` pour les jauges du village et les addictions | Les dérives quotidiennes de 0,03 à 0,5 point disparaîtraient avec des entiers. |
| Restauration | `DELETE` + `INSERT` | Mise à jour colonne par colonne, insertion avec valeurs par défaut pour les colonnes ajoutées depuis, contraintes différées, joueurs jamais supprimés, sauvegarde « avant restauration » automatique, chat conservé | Compatible avec les migrations additives et les clés étrangères (le script V3.7 échouait sur les FK). |
| Nouvelles tables | — | `map_structures` (carte SVG), `unions`, `migrant_screenings`, `constitution_articles`, `carlage_moves` (coups secrets), `ledger_entries` (grand livre), `pending_approvals` (verrous), `temptations`, `gazette_editions`, `game_events`, `ai_calls` | Mécaniques du GDD nécessitant une persistance dédiée. |
| Agora | `agora_proposals` (initiatives) | + `kind`, `payload`, cibles, `required_majority`, `closes_at`, `vetoed_by`, `executed_at` ; index unique « 1 initiative par joueur et par semaine » | Les motions, le Tribunal et le veto partagent le même circuit de vote. |
| Carlage | Joueur contre joueur | + adversaire PNJ (meneur de putsch), `context`, `defender_side`, échéance de manche, journal des manches, blessures | Putsch dominical et égalités. |
| Écriture du moteur (V3.9) | — | RPC `engine_commit` (migration additive `20261127000100_engine_commit.sql`) et `session_player`, réservées au service_role | Toutes les conséquences d'une requête sont écrites en une seule transaction, avec contrôle de révision. |

### 7.2 System Prompt complet de l'Edge Function IA (Maître du Jeu V3.7)

```text
Tu es le Maître du Jeu de "Les Gaulois & Micro-État", une simulation de gestion coopérative ultra-réaliste et pince-sans-rire située dans un véritable hameau abandonné des Pyrénées de Lleida (Catalogne, Espagne, à 18 km d'Andorre), acheté 295 000 € avec pour ambition ultime de proclamer un Micro-État souverain.

DONNÉES DU TOUR & CONTEXTE RÉEL :
- État global du village : {{village_state_json}}
- Météo réelle Lleida : {{real_weather_summary}} | Actualité réelle du jour : {{real_news_headline}}
- 25 derniers messages publics de La Taverne : {{recent_public_chat_json}}
- Joueur actif & portefeuilles ministériels : {{player_json}}
- Migrants & enfants présents : {{migrants_and_children_json}}
- Propositions législatives de l'Agora : {{agora_proposals_json}}
- Action libre ou événement soumis : "{{raw_prompt}}"

RÈGLES DE SIMULATION IMPÉRATIVES :
1. RÉALISME CONTEMPORAIN STRICT :
   Aucun élément fantastique ou surnaturel. Toutes les conséquences doivent être crédibles techniquement, juridiquement, économiquement et humainement dans l'Espagne et l'Andorre d'aujourd'hui.

2. RESPECT DES PRÉROGATIVES MÉTIERS & VERROUS :
   Nul ne peut construire, rénover ou démolir sans l'accord PLU de Tiphaine, engager > 500 € sans validation de M. Lerme (Guillem), ni contourner le veto écologique d'Ely (famille de grenouilles protégées). Respecte les polyvalences : Alex (ingénieur généraliste hydraulique/réseaux/mécanique), Tanguy (médecin-druide & scientifique touche-à-tout), Brunel (médecin-apothicaire, psychiatre-psychologue & prêtre).

3. BARRIÈRE LINGUISTIQUE & AUTORITÉS :
   Si spanish_fluency_pct < 40 lors d'une interaction extérieure, génère des quiproquos réalistes en espagnol/catalan. Tout agissement suspect (stockage d'acier non déclaré, détournement d'eau, contrebande andorrane, travaux sans permis, campements illégaux, exécutions) attire les Mossos d'Esquadra, la Guardia Civil, les agents environnementaux ou le fisc espagnol.

4. DÉMOGRAPHIE, NATALITÉ & IMMIGRATION :
   - Surveille `homosexuality_rate_pct` et `demographic_viability_pct`. Si le taux d'homosexualité progresse sans accueil de familles avec enfants, alerte dans La Gazette sur le vieillissement, la chute de la natalité et le risque d'extinction du village.
   - Génère régulièrement des dossiers complets de candidats migrants (identité, âge, origine, religion, sensibilité politique Droite/Gauche, force physique, spécialité 1-5, nombre d'enfants, apport concret et risque caché) soumis au vote de l'Agora.
   - Applique les effets du sous-effectif (retards, épuisement) ou du sur-accueil (surcharge des réseaux d'Alex, pénurie d'outils de Julio, vols, frictions culturelles/religieuses).

5. ALCOOL, STUPÉFIANTS, IDÉOLOGIE DROITE/GAUCHE & TRIBUNAL DE L'AGORA :
   - L'alcool (`alcohol_consumption_pct`) et les stupéfiants (`drug_prevalence_pct`) dégradent la productivité (gueules de bois, casse d'outils, accidents de chantier chez M. Lerme) et font grimper l'insécurité (`insecurity_pct` : bagarres, vols de tomates, marché noir, perquisitions).
   - Surveille l'équilibre idéologique (`left_wing_ideology_pct`) : si le village bascule trop à gauche (> 55 %) ou accueille trop de profils collectivistes/syndicalistes, déclenche des revendications égalitaristes, des grèves, une chute de productivité de type soviétique et des pénuries.
   - Gère les sanctions votées à l'Agora : travaux forcés/pilori, expulsion hors des 30 ha (avec risque de représailles ou dénonciation aux Mossos), ou exécution sur la place publique pour crimes ou agitation collectiviste (intervention policière immédiate en Actes I-II, choc moral et diplomatique en Acte III).

6. INITIATIVES LÉGISLATIVES HEBDOMADAIRES DE L'AGORA :
   Lorsqu'une proposition hebdomadaire soumise par un joueur (ex. création d'un fonds souverain à la norvégienne, taxe, loi constitutionnelle) est adoptée par vote OUI/NON à l'Agora, traduis fidèlement son détail explicatif en effets économiques, fiscaux, idéologiques et narratifs concrets.

7. TENTATIONS & HUMOUR DU GROUPE :
   Génère régulièrement des dilemmes privés d'alcool ou de séduction. Si le joueur cède et ne se confesse pas à Brunel, publie une anecdote pince-sans-rire dans La Gazette. Intègre les discussions réelles du chat, les fournisseurs locaux (BigMat, Gedimat, Loxam, Thomas Sograma), les tomates lancées sur les BOR, les séances de kiné de M. Lerme, les thérapies de Brunel et les duels au Carlage 2x2.

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
```

**Bornage V3.8 des réponses IA (moteur `aiDeltas.ts`).** Toute clé absente de la liste ci-dessus est ignorée ; toute valeur non numérique est rejetée ; la réponse est extraite même entourée de Markdown. Plafonds absolus par appel (Action Libre) : caisse ±3 000 €, fonds souverain ±5 000 €, rations ±40, tomates ±40, piste ±10, moral ±12, espagnol ±4, pression administrative ±12, notoriété ±8, homosexualité ±2, pérennité ±6, alcool ±6, stupéfiants ±5, insécurité ±12, gauche ±6, friction ±8. Multiplicateurs : initiative adoptée à l'Agora × 2, événement du monde réel × 1,5, Gazette et tentation × 0,5. Le fonds souverain ne s'abonde qu'en débitant la caisse ; la caisse ne devient jamais négative ; l'insécurité passe par la part événementielle amortie. `triggered_incident` accepte `{type, severity 1-3, description, target_player_id}` avec les types `pipe_rupture`, `police_raid`, `inspection`, `fine`, `injury`, `theft`, `epidemic`, `strike`, `mired_track`, `storm`, `livestock_loss`, `fire`, `sabotage` (tout autre type reste narratif). `new_migrant_candidate` est validé et normalisé (âge 18-65, force 1-100, spécialité et sensibilité reconnues en français ou en code). `private_temptation` accepte `{target_player_id | target_role, category, title, prompt_text, yield_effects, resist_effects}`. En cas de réponse illisible ou d'API indisponible, le dictionnaire local de secours prend le relais.

**Intégration V3.9 (Edge Function `gm-ai-action`, SDK officiel Anthropic).**

- **Prompt caching :** la partie stable du prompt (rôle, règles 1 à 7 ci-dessus mot pour mot, contrat avec le moteur, format JSON, fiches des personnages) forme le *system prompt*, mis en cache ; le bloc « DONNÉES DU TOUR & CONTEXTE RÉEL » et la tâche passent dans le message utilisateur. Aucune date ni valeur variable n'entre dans le *system prompt*.
- **Sortie JSON stricte :** le format de réponse ci-dessus est imposé par un schéma JSON (structured outputs : objets fermés, clés obligatoires, champs facultatifs à `null`), puis revalidé et borné par le moteur.
- **Tâches :** action libre, initiative adoptée, dossier migrant, dilemme privé, Gazette du jour. Les sorties hors tâche sont neutralisées (pas de migrant surprise dans une action libre).
- **Modèle :** réglable par la variable `GM_MODEL`. Défaut **`claude-haiku-5-5`** (choix des joueurs en V4.0, pour tenir un budget de moins de 1 $ par mois) ; `claude-opus-5-5` reste disponible pour une plume plus riche. Effort de raisonnement `low` par défaut (`GM_EFFORT`), délai de 45 s, 1 nouvelle tentative ; repli serveur sur refus (`fallbacks: "default"`) pour les modèles qui le permettent ; tout refus, délai dépassé, erreur ou réponse incomplète bascule sur le dictionnaire de secours.
- **Coût estimé** pour 10 à 20 appels par jour (Gazette, dossiers migrants, tentations, initiatives, actions libres) : moins de 1 $ par mois avec `claude-haiku-5-5` (défaut), environ 25 à 35 $ par mois avec `claude-opus-5-5`, 0 € sans clé API (dictionnaire de secours seul). Chaque appel est journalisé dans `ai_calls` (modèle, jetons, latence, repli, erreur).
- **Dictionnaire de secours :** règles par mots-clés pour les actions libres et les initiatives (fonds souverain, taxe, école, sécurité, fête, accueil, piste, sobriété, souveraineté…), générateur déterministe de dossiers migrants, 10 modèles de tentations, Gazette composée à partir des événements du jour, de la météo et de l'actualité réelle.

### 7.3 Protocole d'Évolutivité Continue & Plan d'Implémentation

- **Évolutivité additive sans perte de partie :** l'état vivant réside dans Supabase tandis que le code est déployé automatiquement depuis GitHub (~45 s). Toute mise à jour utilise exclusivement des migrations SQL additives (`ALTER TABLE ... ADD COLUMN`), des catalogues modulaires isolés et un export / import JSON intégral en 1 clic.
- **Sprint 1 — Base Supabase, Auth & RLS :** déployer le schéma SQL (`village_state`, `players`, `village_migrants`, `village_children`…) et verrouiller les politiques Row-Level Security par rôle, patrimoine privé et portefeuille ministériel.
- **Sprint 2 — Moteur déterministe & horodatage :** coder `applyElapsedTime()`, les formules physiques, démographiques (homosexualité, natalité, lignées, apprentis), idéologiques (Droite / Gauche, malus collectiviste URSS) et les multiplicateurs d'alcool / stupéfiants sur la productivité et l'insécurité.
- **Sprint 3 — Connecteurs monde réel :** activer les Edge Functions Open-Meteo (Lleida), flux RSS Espagne / Catalogne / France et calendrier saisonnier.
- **Sprint 4 — Carte 2D, métiers & économie parallèle :** développer l'interface mobile-first avec carte des 30 ha (bâtisses PLU, élevage, gîte, minage), grand livre privé de M. Lerme et catalogue fournisseurs.
- **Sprint 5 — Agora, Immigration, Tribunal Public & Carlage 2 × 2 :** implémenter les votes budgétaires / idéologiques, le Bureau de l'Immigration (fiches migrants avec religion et orientation politique, naturalisations), le Tribunal Public, le chat temps réel et le duel Carlage.
- **Sprint 6 — Edge Function IA & déploiement GitHub Pages :** connecter le Maître du Jeu IA (actions libres, dossiers migrants, factions / tentations, La Gazette alimentée par La Taverne), le fallback déterministe et la mise en ligne.

> **État d'avancement V4.1.** Les 5 étapes sont livrées : 1 (architecture & SQL), 2 (moteur déterministe), 3 (Edge Functions), 4 (interface React, arène du Carlage, épreuve de la cible, administration, mode démo) et 5 (guide de déploiement express, workflows GitHub Actions, script de vérification). Vérifications : 129 tests Vitest (moteur, fonctions, mode démo, variables d'environnement), vérifications SQL sur PostgreSQL (PGlite) dont le contrat complet entre l'interface et la base et une simulation de la planification, contrôle de types Deno des trois fonctions, build de production Vite et parcours testé dans un navigateur mobile. Reste à faire : le déploiement réel par les joueurs (le code n'a pas encore tourné contre un vrai projet Supabase).

### 7.4 Authentification légère par PIN, délégation & isolement (V3.5)

- **Écran d'accueil :** grille des 7 fondateurs et des 3 places évolutives (inactives tant qu'elles ne sont pas attribuées).
- **Connexion :** clic sur le personnage + code PIN à 4 chiffres vérifié par la RPC `verify_player_pin`. La RPC renvoie un jeton de session (valable 120 jours) mémorisé dans le `localStorage` pour une reconnexion instantanée ; le PIN lui-même n'est jamais stocké sur l'appareil. 5 erreurs consécutives verrouillent le personnage 5 minutes. PIN initial « 0000 », changement obligatoire à la première connexion (`set_player_pin`). L'administrateur (par défaut M. Lerme) attribue les places 8 à 10 et réinitialise un PIN oublié (`admin_configure_slot`).
- **Délégation temporaire (14 jours max) :** le délégataire agit avec les PA du titulaire sur ses actions métier délégables ; il ne peut ni utiliser les vetos, ni toucher au patrimoine privé du titulaire, ni voter à sa place, et valide au plus 2 000 € de dépenses s'il remplace M. Lerme.
- **Isolement (cachot 24 h) et garde à vue :** pas d'action, pas de vote, pas de message public ni privé.

### 7.5 Sauvegardes quotidiennes & restauration en un clic (V3.7)

- **Captures automatiques** (`daily_snapshots`) : chaque nuit (`auto_midnight`) et avant l'Agora du dimanche (`pre_agora`), une par jour et par type ; captures manuelles à tout moment ; fenêtre glissante de 30 jours pour les captures automatiques (`prune_daily_snapshots`).
- **Contenu :** toutes les tables de jeu, le chat, La Gazette et le journal d'événements — jamais les PIN ni les sessions.
- **Restauration** (`restore_daily_snapshot`, administrateur uniquement) : le village revient à J−1, J−2, J−7… ; une sauvegarde « avant restauration » est créée automatiquement (la restauration est elle-même annulable) ; l'historique du chat et de La Gazette est conservé ; les duels en cours sont annulés ; un message système informe le village.
- **Export / import JSON manuel** (`export_full_state`, `import_full_state`) : format `les-gaulois-snapshot`, compatible avec les migrations additives (colonnes manquantes → valeurs par défaut).

### 7.6 Architecture logicielle (V3.8, complétée en V4.0)

```text
Le Village Gaulois/
├── docs/GDD.md, docs/CHANGELOG.md      Source vivante du GDD → PDF (npm run gdd:pdf)
├── src/engine/                          Moteur déterministe TypeScript (aucune dépendance)
│   ├── types.ts, constants.ts, rng.ts, calendar.ts, math.ts
│   ├── population.ts, formulas.ts, health.ts, society.ts, demography.ts
│   ├── simulation.ts (applyElapsedTime), actions.ts (actions métiers), locks.ts, permissions.ts
│   ├── agora.ts, justice.ts, migrants.ts, carlage.ts, targetTrial.ts, temptations.ts, catalog.ts
│   └── aiDeltas.ts (bornage IA), hiddenIndicators.ts, index.ts
├── src/app/                             Interface React 19 + Vite + Tailwind CSS v4 (V4.0)
│   ├── main.tsx, App.tsx, styles.css     Entrée, coquille (en-tête, bandeaux, navigation), thème parchemin
│   ├── api/                              Contrat GameApi : supabase.ts (production), demo.ts (mode démo)
│   ├── state/GameContext.tsx             Session, rafraîchissement, Realtime, messages
│   ├── screens/                          Connexion, Carte, Métier, Agora, Trésor, Gazette, Duel, Admin
│   ├── components/                       ui, actions, scrutins, indicateurs cachés, modales
│   └── lib/, demo/seed.ts                Libellés, formats, routeur par ancre, seed du mode démo
├── index.html, vite.config.ts            Build statique (base relative) → dist/
├── .github/workflows/deploy-pages.yml    Tests + build + publication GitHub Pages à chaque push
├── supabase/migrations/                 Schéma SQL (migrations additives)
├── supabase/seed.sql                    7 fondateurs, 3 places, carte du hameau
├── supabase/setup_complete.sql          Migrations + seed en un seul fichier (npm run sql:bundle)
├── supabase/cron.sql                    Planification pg_cron (à exécuter une fois, avec Vault)
├── supabase/config.toml                 Fonctions sans vérification JWT (authentification propre au jeu)
├── supabase/functions/
│   ├── game-engine/, gm-ai-action/, daily-world-sync/   index.ts + deno.json (imports npm)
│   └── _shared/
│       ├── engine/                      Copie générée du moteur (npm run engine:sync)
│       ├── core/                        Logique pure testée : session.ts, duel.ts, changes.ts, world.ts, gm/
│       └── runtime/                     Deno / Supabase / SDK Claude : handlers, pipeline, db, llm, http, env
├── tests/                               Tests Vitest du moteur, des fonctions et du mode démo (tests/app)
└── scripts/                             check-sql (PGlite), bundle-sql, sync-engine, check-functions, build-gdd-pdf
```

- **Source de vérité :** le moteur s'exécute dans l'Edge Function `game-engine` (service_role) qui charge l'instantané complet, applique `applyElapsedTime()` puis l'action, et écrit le résultat avec contrôle de révision (concurrence optimiste). Le client exécute le même moteur pour l'aperçu instantané.
- **Compatibilité Deno :** le moteur importe ses modules avec l'extension `.ts` et n'utilise que des API standard (`Intl`, `structuredClone`) ; il est copié dans `supabase/functions/_shared/engine/` au déploiement.
- **Interface (V4.0) :** React 19, Vite, Tailwind CSS v4, routeur par ancre (`#/agora`, compatible GitHub Pages sans configuration). Le client choisit `SupabaseApi` si `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont fournies au build, sinon `DemoApi`. Il importe le moteur via la copie `_shared/engine` et n'écrit jamais l'état du village lui-même : toute action passe par `game-engine` ou une RPC contrôlée.
- **Temps réel :** Realtime diffuse le chat, l'Agora, les duels, la carte, La Gazette et le journal d'événements ; les chuchotements, protégés par RLS, sont rechargés à la demande.

### 7.7 Edge Functions & planification (V3.9)

| Fonction | Appelée par | Opérations |
|---|---|---|
| `game-engine` | Joueurs (en-tête `x-player-token`) | `tick` (à l'ouverture de l'appli), `action` (actions métiers, y compris l'Action Libre), `decide_approval` (PLU / budget), `respond_temptation`, `carlage_challenge` (veto contesté ou duel amical, paramètre `mode` : `carlage` ou `target`), `carlage_resolve` (manche de Carlage ou dépouillement de l'épreuve de la cible), `putsch_repress` |
| `gm-ai-action` | Joueurs ; administrateur | `free_action` (Action Libre IA) ; administrateur : `status` (modèle, clé, derniers appels), `generate_migrants` (1 à 3, « sur appel voté à l'Agora »), `regenerate_gazette`, `send_temptation` |
| `daily-world-sync` | pg_cron (en-tête `x-cron-secret`) ; administrateur | `nightly` à 00:05 (sauvegarde J-0 et purge à 30 jours, météo Open-Meteo, gros titres RSS, scandales, Gazette, dossiers migrants, tentations) ; `maintenance` toutes les 15 minutes (clôture de l'Agora le dimanche à 11:00, exécution des décisions après la fenêtre de veto, duels abandonnés, sauvegarde pré-Agora entre 10:30 et 11:00) |

- **Pipeline commun :** charger l'état complet (service_role) → `applyElapsedTime()` → maintenance de l'Agora → opération → indicateurs cachés → écriture atomique par la RPC `engine_commit` (une transaction). En cas d'écriture concurrente (révision périmée), tout est recalculé sur l'état frais, jusqu'à 3 essais ; les réponses de l'IA déjà obtenues ne sont pas redemandées. Les appels de maintenance n'écrivent rien quand il n'y a rien à faire.
- **Écriture :** `engine_commit(révision attendue, changements)` met à jour seulement les colonnes envoyées, insère les nouvelles lignes, ajoute événements, écritures comptables, auscultations, messages système et journal des appels IA, régénère la Gazette du jour sans doublon, puis incrémente la révision. Elle est réservée au service_role.
- **Sécurité :** le client n'envoie jamais d'acteur ni de groupe d'approbation (imposés par le serveur) ; la vérification JWT de la passerelle est désactivée (`supabase/config.toml`) au profit du jeton de session ou du secret cron, comparé en temps constant ; l'origine CORS est réglable (`ALLOWED_ORIGIN`).
- **Planification :** `supabase/cron.sql` range l'URL du projet et le secret dans Supabase Vault puis programme deux tâches pg_cron (nuit et maintenance) appelant `daily-world-sync` par pg_net.
- **Secrets :** `ANTHROPIC_API_KEY` (facultatif), `GM_MODEL`, `GM_EFFORT`, `GM_TIMEOUT_MS`, `CRON_SECRET`, `ALLOWED_ORIGIN`, et en option `RSS_FEEDS`, `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_LABEL`, `TEMPTATION_CHANCE_PCT` (modèle : `supabase/functions/.env.example`).
- **Épreuve de la cible (V4.0) :** migration additive `20261128000100_target_trial.sql` — colonnes `carlage_duels.mode` et `result_json`, table `target_trial_results` (un dépôt par camp, 5 taps au plus, lisible par son auteur seul tant que le duel est en cours) et RPC `target_submit` (participant, épreuve en cours, avant l'échéance, une seule fois) ; `carlage_submit_move` refuse les duels à la cible.
- **Coûts d'infrastructure :** GitHub Pages (gratuit pour un dépôt public) et offre gratuite de Supabase (base, Realtime, Edge Functions). Seule l'API de l'IA est payante, et elle reste facultative.

### 7.8 Déploiement express (V4.1)

Le guide pas à pas est dans `docs/DEPLOIEMENT.md` (≈ 20 minutes, 0 € hors API de l'IA). Aucune CLI n'est requise sur le PC : sur Windows, le contrôle intelligent des applications bloque l'exécutable non signé de la CLI Supabase, et il ne doit pas être désactivé ; les Edge Functions sont donc déployées par GitHub Actions.

| Étape | Où | Durée |
|---|---|---|
| 0. Comptes, copie du projet hors de OneDrive, secret `CRON_SECRET` | PC | 3 min |
| 1. Projet Supabase (région Europe, offre gratuite), Project ID et clé publique | Tableau de bord Supabase | 3 min |
| 2. `supabase/setup_complete.sql` (migrations + seed) | SQL Editor | 2 min |
| 3. Secrets : `CRON_SECRET`, `ALLOWED_ORIGIN`, `GM_MODEL`, `ANTHROPIC_API_KEY` (facultatif) | Edge Functions > Secrets | 2 min |
| 4. Dépôt public, variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`, secret `SUPABASE_ACCESS_TOKEN`, Pages « GitHub Actions », `git push` | GitHub | 5 min |
| 5. `supabase/cron.sql` (Vault + pg_cron + pg_net) | SQL Editor | 2 min |
| 6. `npm run deploy:check` | PC | 1 min |
| 7. Premières connexions : chaque joueur remplace le PIN `0000` | Site | 2 min |

- **Publication continue :** `.github/workflows/deploy-pages.yml` (tests, build, GitHub Pages) à chaque push sur `main` ; `.github/workflows/deploy-functions.yml` (contrôle de la copie du moteur, tests, `supabase functions deploy --remote=<ref> --yes` via `supabase/setup-cli@v3`) quand `src/engine/`, `supabase/functions/` ou `supabase/config.toml` changent, ou à la demande.
- **Base :** les évolutions futures arrivent en migrations additives exécutées une par une dans le SQL Editor, après une sauvegarde ; `setup_complete.sql` ne sert qu'à l'installation initiale.

> **Précisions V4.1.** *Clés Supabase :* le site accepte la nouvelle clé publique « Publishable » (`sb_publishable_…`) comme l'ancienne clé `anon` ; les Edge Functions lisent l'ancienne clé `SUPABASE_SERVICE_ROLE_KEY` si le projet la fournit, sinon la nouvelle clé secrète injectée dans `SUPABASE_SECRET_KEYS` (dictionnaire JSON, entrée `default`). Les secrets du jeu ne peuvent pas commencer par `SUPABASE_`. *Planification :* `cron.sql` refuse de s'exécuter tant que `<PROJECT_REF>` ou `<CRON_SECRET>` n'ont pas été remplacés, exige un secret d'au moins 24 caractères, et met à jour les secrets Vault et les tâches au lieu de les dupliquer s'il est rejoué. *Vérification :* `npm run deploy:check` contrôle en lecture seule la base, le refus des tables secrètes à la clé publique, le déploiement des trois fonctions (réponse du jeu et non de la passerelle, donc `verify_jwt = false` appliqué), le CORS pour l'adresse du site, le branchement du site sur Supabase (pas en mode démo) et, avec `--cron-secret`, la maintenance de bout en bout. *Garde-fou du code :* `npm run sql:check` vérifie que chaque RPC, vue, table, colonne, opération d'Edge Function et table Realtime utilisée par l'interface existe avec les droits de la clé publique.

## Annexe A — Constantes d'équilibrage du moteur (générée depuis `src/engine/constants.ts`)

<!-- AUTO:CONSTANTS -->

## Annexe B — Catalogue des actions métiers (généré depuis `src/engine/actions.ts`)

<!-- AUTO:ACTIONS -->

## Annexe C — Catalogue fournisseurs (généré depuis `src/engine/catalog.ts`)

<!-- AUTO:CATALOG -->

## Annexe D — Historique des versions

<!-- AUTO:CHANGELOG -->
