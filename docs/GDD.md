---
version: 6.0
date: 2026-11-27
title: Les Gaulois — Game Design Document & Architecture Technique
---

# LES GAULOIS — Simulation Coopérative de Village & Micro-État

**Game Design Document (GDD) & Spécification Technique Complète — Version 6.0**

Jeu de stratégie, de gestion démographique, économique et politique asynchrone persistant, ancré dans le monde réel (Pyrénées de Lleida), piloté par un moteur déterministe TypeScript et un Maître du Jeu IA.

| Paramètres géographiques & démographiques | Paramètres économiques, politiques & techniques |
|---|---|
| **Cadre réel :** hameau abandonné des Pyrénées de Lleida (Catalogne, Espagne), domaine de 30 ha situé à 18 km de la frontière d'Andorre. | **Achat & travaux :** 295 000 € (PLU 2013 validé). Rénovation globale estimée entre 600 000 € et 900 000 €. |
| **Effectif & rythme :** 7 joueurs fondateurs (10 joueurs max) + population résidente dynamique (migrants accueillis, naturalisés, lignées et apprentis). 1 jour réel = 1 jour de jeu (3 PA/jour). | **Enjeux :** autonomie totale puis Micro-État souverain, pérennité démographique, équilibre idéologique (Droite vs Gauche), propriété privée vs collectivisation, contrebande, justice publique et dissuasion. Hébergement 0 € + API IA < 1 $/mois (Claude Haiku 5.5). |

> **Nouveautés V6.0 :** **le bilan de la semaine et la frise du hameau** (§5.11) : chaque action réussie compte dans un **score de la semaine** (PA dépensés, actions, missions du jour, coups de main au chantier, aux voisins, aux visiteurs et aux résidents, binômes). Lundi à minuit, la Gazette publie le **bilan de la semaine** : classement, **habitant de la semaine** (+30 XP, moral +1 %) et **records** battus. Une **frise datée** retient les grandes étapes du hameau (« groupe électrogène livré le… », objectifs d’Acte, élections, chantiers collectifs, naissances…), affichée dans l’onglet Gazette.

> **Rappel V5.9 :** **des visiteurs imprévus** (§5.10) : certaines nuits, quelqu’un se présente au hameau — un **randonneur perdu**, une **journaliste**, un **inspecteur de la mairie** ou un **vendeur ambulant**. Il attend une réponse **le jour même avant 21 h** : le premier joueur qui répond choisit entre deux gestes (1 PA, parfois des rations, des tomates ou de l’argent). Le choix fait bouger la caisse, le moral, la notoriété, la pression administrative ou les relations avec les voisins ; **sans réponse**, la nuit tranche, souvent mal (Mossos fâchés, article méfiant, rapport salé…).




> **Rappel V5.0 :** **un chantier collectif chaque semaine** (§5.5) : un projet commun (bois, piste, canaux, potager, chantier, fête) choisi par vote, auquel chacun met ses PA ; barre de progression commune, effet ×1,5 et moral en plus s'il est achevé avant dimanche.

> **Rappel V4.8 :** **les réserves prennent vie** (§5.4) : vente des tomates, du bois et des conserves au **marché d'Organyà** (prix plus hauts le samedi, marché qui sature dans la semaine), **coupe de bois** dans la forêt communale, **chauffage** des bâtisses habitées chaque nuit froide selon la température réelle (sans bois, moral et santé baissent), **conserves** de tomates pour l'hiver.

> **Rappel V4.7 :** **carte du hameau illustrée et pratique** (§6.3) : plan dessiné (prés, forêts, rivière qui coule, piste, réseaux, bâtisses avec toits, ruines, échafaudages), pastilles lisibles sur téléphone (icône, état, ⚡ 🐸 💧, avancement, priorité du moment qui pulse), calques (À faire, Logements, Chantiers, Énergie, Eau), mode **Explorer** plein écran (glisser, pincer, double-toucher, + / −, boussole, échelle, vue Liste) et fiche d'ouvrage avec la **prochaine étape** et le bouton pour agir.

> **Rappel V4.6 :** **le jeu s'explique** (§6.3) : à l'accueil, la carte **« À faire en priorité »** donne les prochaines étapes qui font avancer le hameau selon son avancement (d'abord le groupe électrogène, puis raccorder les bâtisses, la ligne aérienne, l'eau, le potager, le gîte…), avec le pourquoi, qui peut le faire, les verrous (PLU, budget) et ce que ça rapporte ; une fenêtre « Comprendre la progression » détaille les Actes et les six piliers d'autonomie. Dans l'onglet Trésor, les **Réserves du hameau** montrent le rythme de chaque stock (rations par jour, gasoil, usure des outils…), le nombre de jours restants, à quoi il sert et comment s'en procurer.

> **Rappel V4.5 :** **propositions discrètes bien plus variées** (§6.2) : 94 situations réparties en 15 thèmes (tournées, fêtes de village, contrebande andorrane, jeux d'argent, stupéfiants, escapades, romances, affaires de cœur, pots-de-vin, combines, militantisme, rivalités entre fondateurs, ressources du village, médias, tentations du métier), personnalisées selon le fondateur et la météo réelle ; un joueur ne reçoit jamais deux fois la même situation à moins de 24 dilemmes d'écart, change de thème à chaque fois, et le Maître du Jeu IA reçoit le thème imposé et la liste de ce que le joueur a déjà reçu.

> **Rappel V4.4 :** **ergonomie téléphone** (§6.3) : menu d'actions classées par type dans le Métier (tuiles, recherche, actions récentes, raison quand une action n'est pas jouable, résultat affiché dans la fenêtre), carte « Aujourd'hui » à l'accueil, menu du compte sous l'avatar, bouton retour du téléphone qui ferme les fenêtres, administration en quatre sous-onglets, et duels rangés à part dans le fil des événements de la Gazette.

> **Rappel V4.3 :** **pastilles rouges et notifications sur le téléphone** (§7.6) : les onglets signalent les messages non lus de la Taverne, les chuchotements, la Gazette du jour, les votes, validations et duels en attente (total reporté sur l'icône de l'appli installée) ; chaque joueur peut recevoir une notification, même appli fermée, pour la Taverne, un chuchotement, un duel, l'Agora, une validation, la Gazette ou une proposition discrète, et choisir ses catégories (menu du compte → Notifications).

> **Rappel V4.1 :** le jeu est prêt à être mis en ligne en une vingtaine de minutes grâce au **guide de déploiement express** (§7.8, `docs/DEPLOIEMENT.md`) : base installée par un seul script SQL, Edge Functions déployées par GitHub Actions (aucune CLI à installer sur le PC), tâches planifiées par un script rejouable, et vérification automatique du déploiement (`npm run deploy:check`).

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

> **Précisions V5.1 — objectifs d'Acte en liste à cocher (demandé par les joueurs : plus parlant qu'un pourcentage d'autonomie).** *Données :* `village_state.life.act_goals` (identifiant → date où l'étape a été cochée) et `life.act_goals_complete` (Actes dont la prime de fin de liste est versée) — **aucune nouvelle migration**. *Listes* (`ACT_GOALS`, `constants.ts`) : **Acte I** électricité au hameau (palier d'énergie 2 : emprunt −5 000 €, moral +3 %), 20 lits livrés (−5 000 €, +20 pierres), 500 m² de potager (−3 000 €, +20 stères de bois ; le potager compte déjà 300 m² au départ), piste empierrée à 70 % (−3 000 €, +10 fer), gîte ouvert (−6 000 €, moral +4 %) ; **Acte II** barrage ou champ solaire (palier 4 : −12 000 €, moral +4 %), 30 lits livrés (−10 000 €, +30 pierres), troupeau de 10 bêtes (−8 000 €, moral +3 %), 5 résidents au travail (poste attribué, hors emploi privé : −8 000 €, +30 stères), un quart de l'emprunt remboursé (caisse +3 000 €, moral +4 %) ; **Acte III** Constitution adoptée (−15 000 €, moral +4 %), dissuasion niveau 3 (−15 000 €, +20 fer), la moitié de l'emprunt remboursée (caisse +5 000 €, moral +4 %), indépendance proclamée (−20 000 €, moral +6 %). *Prime de fin de liste :* Acte I emprunt −10 000 € et moral +5 % ; Acte II −20 000 € et +5 % ; Acte III −30 000 € et +8 % (au total 170 000 € d'emprunt effacés sur les trois Actes). *Règles (`src/engine/goals.ts`, `checkActGoals`) :* vérifiées à chaque recalcul des grandeurs dérivées (après chaque action, chaque nuit et chaque passage de maintenance), pour l'Acte en cours et les précédents seulement (une étape d'un Acte futur attend que l'Acte soit atteint, puis se coche aussitôt) ; une étape cochée le reste même si la condition retombe, et sa récompense n'est versée qu'une fois ; la remise d'emprunt (le prêteur, rassuré par les progrès, efface une part de l'emprunt) est plafonnée à la dette restante, le surplus va dans la caisse ; l'autonomie est recalculée aussitôt (pilier dette). Événements publics « Objectif d'Acte coché » et « Liste de l'Acte terminée ». *Interface :* carte « À faire en priorité » de l'accueil, sous la barre d'Acte — une pastille par étape (✅ quand elle est atteinte), le compte « 2 / 5 » et la prochaine étape (la plus avancée) avec sa récompense ; un appui ouvre « Objectifs de l'Acte » (progression chiffrée, comment l'atteindre, récompense, prime de fin de liste). Les priorités qui font avancer une étape restante portent le badge « 🎯 Objectif d'Acte », passent un peu devant (+6) et rappellent la récompense dans leur détail.

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

> **Précisions V5.3 — élections vivantes.**
> - **Quand :** chaque nuit, si aucune élection n'est en cours, le moteur met en jeu le premier portefeuille (ordre Défense, Intérieur, Douanes, Chancellerie, Médias) qui est **débloqué** par l'Acte, **pas tenu à temps plein** (place 8, 9 ou 10 occupée) et **sans mandat en cours** (mandat expiré, titulaire banni ou exécuté). Une seule élection à la fois ; annonce dans le fil des événements.
> - **Calendrier :** 3 jours de **candidatures** (le jour d'ouverture compris), puis 2 jours de **vote** ; dépouillement la nuit qui suit le dernier jour de vote, et l'élection suivante s'ouvre aussitôt s'il reste un portefeuille à pourvoir.
> - **Candidature** (`run_for_office`, 1 PA, tout joueur actif sauf le titulaire actuel) : programme de 20 à 280 caractères, visible par tous. **Débat** (`campaign_speech`, 1 PA, candidats seulement, une intervention par jour, 10 à 280 caractères) : affiché dans la Taverne, salle de l'Agora ; la première intervention du jour au hameau donne moral +1 %. **Vote** (`vote_election`, 0 PA, pendant le vote) : un bulletin par joueur, jamais pour soi, modifiable jusqu'au soir ; secret jusqu'au dépouillement (seul le nombre de votants s'affiche).
> - **Dépouillement :** le plus de voix l'emporte ; à égalité, le candidat le plus présent au débat, puis la candidature la plus ancienne. Un seul candidat est élu sans opposition. L'élu·e reçoit le portefeuille (retiré aux autres cumulards) pour un **mandat de 4 semaines**, +10 XP ; participation ≥ 50 % : moral du village +2 %. **Sans candidat**, le portefeuille reste vacant et revient en jeu 7 jours plus tard.
> - La **motion « Élection à un portefeuille »** de l'Agora reste possible : adoptée, elle vaut mandat de 4 semaines et annule l'élection vivante du même portefeuille.
> - Interface : carte « Élection » sur l'accueil (candidats, candidature, vote), en tête d'Agora → Initiatives (programmes, débat, mandats en cours, dernier résultat) et dans la Taverne (salle de l'Agora : prise de parole et débat) ; lignes « Voter », « Se présenter » et « Défendre votre programme » dans « À faire en priorité ».
> - État dans `village_state.life` (`election`, `election_last`, `mandates`) : **aucune migration**, aucune nouvelle opération d'API.

### 2.3 Niveaux de métier, mission du jour & binômes (V5.2)

Chaque fondateur progresse dans son métier : chaque action rapporte de l'expérience, et le niveau atteint (1 à 4) se voit en tête du menu « Agir » de l'écran Métier, avec la barre vers le niveau suivant. Chaque jour, le métier conseille aussi **une mission** — une action précise — qui rapporte un petit bonus si elle est faite avant minuit. Enfin, deux joueurs qui travaillent **ensemble le même jour** (Tanguy et Brunel sur une cure, Ely et Julio en négociation, deux bâtisseurs sur les chantiers…) forment un **binôme** et font mieux à deux.

> **Précisions V5.2.**
> - **Niveaux** : calculés depuis l'expérience `players.skill_xp` (une action à 1 PA = 10 XP, 5 XP pour une action gratuite). Niveau 2 à 150 XP, niveau 3 à 400 XP, niveau 4 à 800 XP. Bonus de rendement **dans son propre métier** (quand le pôle de l'action est celui du joueur) : +10 %, +20 % (ex. chantiers de Tiphaine), +30 %. Niveau 4 de Julio : **fournée double** à la forge. Un passage de niveau est annoncé dans le fil des événements.
> - **Mission du jour** : tirée chaque jour (graine joueur + jour local) parmi les actions conseillées du métier (`MISSION_POOLS`), en écartant celles qu'il ne peut pas faire ce jour-là (Acte, messe hors dimanche) ou qui seraient refusées faute de moyens (cheptel vide, fer, ferraille, pierre, tomates, caisse, forêt interdite, pas de chantier de la semaine) ; repli : couper du bois, chantier de la semaine, cours d'espagnol. Faite : **+20 XP et moral du village +1 %**, une fois par jour. Elle apparaît dans « À faire en priorité » (« Mission du jour : … ») et sur la carte du Métier, où un appui ouvre l'action.
> - **Binômes** : six groupes d'actions (négociation, soins, chantier, terre & forêt, réseaux, forge). Quand un joueur fait une action d'un groupe où un autre joueur a déjà agi le même jour : **rendement +25 %** (négociation : +15 points de chance ; cure de sevrage −25 au lieu de −20 ; thérapie +25 au lieu de +20) et **+10 XP** ; la première fois du jour, le partenaire reçoit aussi +10 XP et le binôme est annoncé à tous. La carte du Métier signale « Ely a agi aujourd'hui (négociation) : faites … pour former un binôme ».
> - État dans `village_state.life` (`missions_done`, `duo_day`) : **aucune migration**, aucune nouvelle action ni opération d'API.

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

### 4.7 Travail des résidents : un poste pour chacun (V4.9)

Les résidents ne sont plus seulement des bouches à nourrir : ce sont des bras à organiser.

- **Un poste par résident :** tout habitant peut affecter un résident (admis ou aux travaux forcés) à l'un des sept postes — **potager, forêt, chantier, forge, pâturage, réseau d'eau, piste** —, gratuitement et sans PA. Le résident y travaille **chaque nuit**. Au poste de sa spécialité (maraîcher au potager, berger au pâturage, maçon au chantier, soudeur à la forge…), il rend bien plus, d'autant plus que son niveau est élevé.
- **Ce que rapporte chaque poste :** des rations et des tomates au potager (selon la saison et l'arrosage), du bois de chauffage en forêt, l'avancement du chantier de bâtisse en cours (ou la réparation d'une bâtisse abîmée), l'entretien des outils puis le recyclage de la ferraille à la forge, du lait au pâturage, l'état du réseau d'eau et celui de la piste.
- **Les places sont comptées :** un jardinier par 100 m² de potager, un berger pour 10 bêtes, une pierre par nuit et par maçon ; les bûcherons comptent dans les coupes de la semaine et Ely peut fermer la forêt (§5.4).
- **Qui ne travaille pas :** le résident sans poste, celui qu'un fondateur emploie sur son chantier privé, le détenu, le blessé ou le trop faible ; pendant une grève, tous travaillent à moitié.
- **À l'écran :** Agora → Immigration liste les résidents, leur poste et ce qu'ils produiront cette nuit ; un appui ouvre le choix du poste (★ = sa spécialité). Les Réserves du hameau comptent leur production, et « À faire en priorité » signale les résidents sans poste.

> **Précisions V4.9 — travail des résidents & droit de regard d'Ely (demandé par les joueurs : faire des migrants une vraie main-d'œuvre).** *Données :* colonne `village_migrants.work_post` (préparée par la migration V4.8, codes de `WORK_POSTS` : `garden`, `forest`, `construction`, `forge`, `pasture`, `water`, `track`) ; bilan de la nuit passée dans `village_state.life.work_last`, interdiction des coupes dans `life.forest_ban` (`by`, `reason`, `since`) — **aucune nouvelle migration**. *Action* « Affecter un résident à un poste » (`assign_work_post`, tout le monde, 0 PA, non délégable, catégorie Résidents & candidats ; `params.post` = code du poste ou `none`) : refusée pour un candidat et pour un résident employé sur un chantier privé ; l'embauche privée (`hire_resident`) lui fait quitter son poste. *Rendement* = (1 + 0,25 × niveau au poste de sa spécialité, sinon 1) × productivité du village × 0,5 pendant une grève ; ne travaille pas : sans poste, chantier privé, au cachot, blessé, santé < 30 %. Les meilleurs rendements passent en premier quand les places sont comptées. *Production d'une nuit* (`processResidentWork`, dans la clôture du jour après l'énergie, avant les récoltes et le chauffage) : **potager** 1,5 ration × coefficient de saison (0,15 l'hiver à 1 l'été) × arrosage × rendement, dont la part de tomates de la saison (×10 kg par ration) ; un jardinier par 100 m², rien si le potager est à sec ; **forêt** 2 stères × rendement, chaque bûcheron compte pour 0,25 coupe de la semaine ; au-delà de 10 coupes, écologie −0,5 par bûcheron et par nuit ; **chantier** 1 pierre par nuit, 2 % × rendement (arrondi, au moins 1) sur la bâtisse en cours la plus avancée (hors veto écologique), sinon 3 % d'état sur la bâtisse abîmée la plus proche d'être réparée (opérationnelle à 60 %) ; **forge** (Cal Ferrer en service) usure des outils −10 % × rendement, puis, outils neufs, 2 ferrailles → 1 fer ; **pâturage** 0,08 ration par bête × rendement, 10 bêtes par berger ; **réseau d'eau** +2 % × rendement ; **piste** +1 % × rendement (rien sous veto écologique). *Droit de regard d'Ely* (§5.4) : « Interdire les coupes de bois » (`forest_ban`, Ely seule, 0 PA, non délégable, motif de 10 caractères au moins, événement public « Forêt fermée aux coupes ») bloque « Couper du bois » jusqu'au lundi suivant (remise à zéro avec la saison) ; les bûcherons résidents entretiennent alors la forêt (écologie +0,2 par nuit) ; « Rouvrir la forêt aux coupes » (`lift_forest_ban`) la lève avant. *Interface :* Agora → Immigration, carte « Résidents au travail » (au travail / à l'arrêt / sans poste, production prévue cette nuit et nuit dernière, bandeau d'interdiction) et fenêtre de poste (postes de sa spécialité d'abord avec leur multiplicateur, retrait du poste, naturalisation à l'Acte III) ; Réserves du hameau : rations, tomates, bois, pierre, fer et outils intègrent la production des résidents et proposent « Mettre un résident au potager / en forêt / à la forge » ; « À faire en priorité » : résidents sans poste (vers Agora → Immigration) et besoin de bois calculé bûcherons déduits (achat de bois proposé quand la forêt est fermée) ; menu Métier : coupe et nouvelle interdiction grisées pendant l'interdiction, levée grisée quand la forêt est ouverte.


### 4.8 Résidents avec une personnalité (V5.7)

Les résidents ne sont plus des fiches anonymes : ce sont des voisins, avec leurs manies.

- **Un caractère pour chacun :** bosseur, boute-en-train, ronchon, frileux, gourmand, solitaire ou bavard — tiré une fois pour toutes, il colore son humeur, ses relations et ses histoires.
- **Une humeur qui bouge chaque nuit :** elle monte quand il travaille (surtout à sa spécialité), mange à sa faim et retrouve son ami ; elle baisse quand il reste sans rien faire, quand les rations manquent, quand le bois manque par grand froid, quand il est blessé ou qu'il travaille au même poste que son rival. Elle revient doucement vers 60.
- **Effet sur le travail :** au-dessus de 75, il est **joyeux** (rendement +10 %) ; sous 30, il est **maussade** (−15 %) ; un bosseur rend toujours 10 % de plus.
- **Amis et rivaux :** chacun (sauf le solitaire) se fait un ami ; un ronchon se trouve un rival dès qu'il y a trois résidents.
- **Encourager un résident :** un mot gentil, un verre partagé (1 PA, une fois par jour et par résident) : +15 d'humeur.
- **Petites histoires :** une nuit sur deux environ (plus souvent avec un bavard, toujours quand une amitié naît), une courte anecdote paraît dans la Gazette (« Au coin du feu »), écrite par le moteur : elle ne dépend pas de l'IA.
- **À l'écran :** Agora → Immigration montre l'humeur et le caractère de chacun et la dernière petite histoire ; la fiche d'un résident détaille caractère, humeur, effet sur le rendement, ami, rival et le bouton « Encourager » ; « À faire en priorité » signale le résident le plus maussade.

> **Précisions V5.7 — résidents avec une personnalité (feuille de route « vie du village », demandée par l'utilisateur).** *Données :* colonne JSONB `village_migrants.traits` (préparée par la migration V4.8 ; type `ResidentTraits` : `temper`, `mood` 0–100, `friend_id`, `rival_id`, `cheered_day`, `mood_delta`, `mood_reason`) et `village_state.life.story_last` (`day`, `migrant_id`, `other_id`, `title`, `text`) — **aucune nouvelle migration**. *Caractère* (`TEMPERS`) : mémorisé, sinon tiré de l'identifiant du résident (`createRng('temper:<id>')`), donc stable. *Humeur de la nuit* (`planMoods`, appliquée par `processResidentLife` dans la clôture du jour après les filières) : au travail +2 (+1 à sa spécialité, +1 solitaire) ; sans rien à faire ou sans poste −3 (−5 bosseur) ; blessé −3 au lieu du travail ; faim (rations à 0 après le repas) −6 (×2 gourmand), sinon +1 ; gourmand +2 s'il y a du fromage ; froid (nuit sans bois, `life.cold_streak` > 0) −5 (×2 frileux) ; ami résident +1 (+1 bavard, +2 si l'ami est boute-en-train) ; rival au même poste −2 ; ronchon −1 ; boute-en-train : baisse divisée par deux ; puis retour de 10 % de l'écart vers 60 ; bornée 0–100. *Rendement* : `residentFactor` = spécialité × humeur (≥ 75 : ×1,1 ; < 30 : ×0,85) × bosseur (×1,1) × productivité × grève. *Relations* (`assignRelations`, chaque nuit) : les liens vers un résident parti sont oubliés ; les résidents sans ami (hors solitaires) sont appariés deux à deux de façon déterministe ; avec au moins 3 résidents, un ronchon reçoit un rival (ni son ami, ni un solitaire). *Petites histoires* (`pickStory`, dictionnaire du moteur, graine `<village>:residents:<jour>`) : 50 % de chances par nuit (75 % avec un bavard), 100 % si une amitié vient de naître (alors c'est elle) ; tirage pondéré parmi les situations (bonne humeur, mauvaise passe, amis, querelle de rivaux, nuit glaciale d'un frileux, fromage ou faim d'un gourmand, bosseur, solitaire, bavard, boute-en-train) ; événement public `resident_story` « Petite histoire : … ». *Gazette :* section « Petite histoire du hameau » toujours remplie depuis l'événement ; l'édition de secours ajoute « Au coin du feu : … » ; la consigne de l'IA demande de la reprendre en une phrase. *Action* « Encourager un résident » (`cheer_resident`, tout le monde, 1 PA, non délégable, cible un résident admis ou aux travaux forcés, catégorie Résidents & candidats) : +15 d'humeur, une fois par jour et par résident (`precheck` : résident introuvable ou humeur déjà à 100). *Interface :* `lib/residentLife.ts` (pur : `residentPersona`, `sulkingResidents`, `lastStory`) ; carte « Résidents au travail » (ligne humeur + caractère, dernière histoire) et fiche du résident (caractère, jauge d'humeur, effet sur le rendement, variation de la nuit et sa raison, ami / rival, bouton « Encourager ») ; priorité `mood:<id>` (résident le plus maussade, score 45, 20 s'il a déjà été encouragé).

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

### 5.4 Vie du village : marché d'Organyà, bois de chauffage & conserves

- **Marché d'Organyà :** tout habitant peut descendre vendre les produits du hameau — tomates, bois, conserves et légumes — au profit de la caisse commune. Le samedi, jour de marché, les prix montent ; au fil de la semaine, le marché sature et les prix baissent, jusqu'au plafond hebdomadaire. Parler espagnol (ou catalan) fait de meilleures affaires.
- **Bois de chauffage :** la forêt communale fournit du bois gratuitement (« Couper du bois »), à condition de ne pas la saccager ; chaque nuit froide, les bâtisses habitées en brûlent selon la température réelle de Lleida. Sans bois, on grelotte : le moral et la santé s'en ressentent.
- **Conserves :** les tomates, jusqu'ici réservées au lancer sur les BOR, se mettent en bocaux et deviennent des rations pour l'hiver.
- **Droit de regard d'Ely sur la forêt (V4.9) :** comme son veto écologique sur les chantiers, Ely peut interdire toute coupe de bois jusqu'au lundi, motif à l'appui, quand la forêt est trop sollicitée ; les bûcherons résidents l'entretiennent en attendant. Elle peut rouvrir la forêt plus tôt — au village de la convaincre quand le froid arrive.

> **Précisions V4.8 — marché, bois & chauffage (demandé par les joueurs : donner un sens aux réserves).** *Nouvelle colonne* `village_state.life` (JSONB, migration additive `20261201000100_vie_du_village.sql`, qui prépare aussi les versions suivantes : postes des résidents, traits, ambitions secrètes, variantes et niveaux de bâtiments) : compteurs de la semaine (`market_sold`, `wood_cuts`), série de nuits froides (`cold_streak`), bois brûlé la nuit dernière (`heating_last`) ; remis à zéro chaque lundi avec la saison. *Marché* (« Vendre au marché d'Organyà », tout le monde, 1 PA, catégorie Argent & commerce) : produits `MARKET_ITEMS` — tomates 3 €/kg par lots de 10 kg (150 kg par semaine au plus), bois 7 €/stère par lots de 5 (60 par semaine), rations 4 € par lots de 5 (60 par semaine) ; prix = base × 1,3 le samedi × (1 − 0,5 × saturation moyenne de la vente) × (0,85 à 1,15 selon la maîtrise de l'espagnol) ; recette versée à la caisse (grand livre, catégorie `market`), espagnol +0,5 %, piste −1 % ; refus si la piste est bloquée, si la réserve manque ou si le marché ne prend plus ce produit cette semaine. *Couper du bois* (tout le monde, 1 PA, effort physique, catégorie Chantiers & bâti) : 8 stères × productivité (pôle forge-subsistance) ; au-delà de 10 coupes dans la semaine, écologie −2 et 35 % de risque de passage des agents rurals (pression administrative +3). *Chauffage* (chaque nuit, avant l'usure des outils) : bâtisses habitées = bâtisses opérationnelles avec des lits + le gîte s'il est ouvert ; minimale réelle < 10 °C → 1 stère par bâtisse, < 5 °C → 2, < 0 °C → 3 ; moitié moins (arrondi au-dessus) à partir du palier 4 ; sans assez de bois : réserve vidée, moral du village −2 %, santé −1 par fondateur, événement « Nuit glaciale sans feu » (1re nuit puis toutes les 3 nuits). *Conserves* (« Faire des conserves », tout le monde, 1 PA, catégorie Vivres & élevage) : 10 kg de tomates + 12 € de bocaux → 8 rations × productivité (pôle agriculture, 1,5 au plus). *Interface :* fenêtre de vente avec produit, nombre de lots, prix du jour, plafond restant et alertes ; Réserves du hameau (Trésor) : le bois affiche sa consommation de chauffage par nuit et sa durée, les coupes de la semaine, la vente et la coupe comme sources ; les tomates et les rations indiquent leur prix du jour au marché et les conserves ; « À faire en priorité » signale le bois qui manque pour l'hiver (moins de 4 nuits ; urgent sous 2) et les tomates à écouler (60 kg et plus), et cite le marché parmi les moyens de renflouer la caisse.

### 5.5 Chantier collectif de la semaine

Chaque semaine, le hameau se donne un projet commun : grande corvée de bois, journée de la piste, curage des canaux, agrandissement du potager, coup de main au chantier le plus avancé ou préparation de la fête du hameau. Tout le monde peut y mettre ses PA, une barre de progression commune montre où l'on en est, et le projet rapporte davantage s'il est achevé avant dimanche. Le projet de la semaine suivante est choisi par un vote ouvert à tous (accueil ou Agora) parmi trois propositions ; sans vote, le hameau retient le projet le plus utile du moment.

> **Précisions V5.0 — chantier collectif de la semaine (demandé par les joueurs : donner un objectif commun au quotidien).** *Données :* `village_state.life.collective` (`id`, `started_at`, `goal`, `points`, `contributions` par joueur, `completed_at`, `early`), `life.collective_candidates` (3 projets soumis au vote, le premier = proposition du hameau), `life.collective_votes` (joueur → projet), `life.collective_last` (bilan de la semaine passée) — **aucune nouvelle migration**. *Projets* (`COLLECTIVE_PROJECTS`) : corvée de bois +40 stères (métier : forge & diplomatie) ; journée de la piste, piste +15 % (transport & douanes) ; curage des canaux, réseau d'eau +15 % et qualité +5 % (ingénierie de l'eau) ; agrandir le potager +40 m² (mairie & agriculture) ; coup de main au chantier, +20 % sur la bâtisse en cours la plus avancée hors veto (génie civil) ; fête du hameau, moral +6 % (druide). *Objectif* : 2 points par fondateur actif (6 au moins ; 14 à sept). *Action* « Travailler au chantier de la semaine » (`contribute_collective`, tout le monde, 1 PA, physique — permise aux travaux forcés —, non délégable, catégorie Chantiers & bâti) : 1 point, 2 pour le métier du projet, plafonné à l'objectif ; refusée sans chantier ou une fois achevé. *Achèvement* : effet immédiat ; achevé du lundi au samedi, effet ×1,5 (arrondi) et moral +3 % ; le dimanche, effet simple. *Vote* « Voter pour le chantier de la semaine prochaine » (`vote_collective_project`, tout le monde, 0 PA, `params.project` parmi les candidats ; une voix par joueur, modifiable). *Cycle* (`closeCollectiveWeek`, à la clôture de la saison le lundi 00:00) : chantier inachevé → moral −2 % et événement public ; ouverture du projet le plus voté (à égalité ou sans vote : ordre des candidats, dont le premier est le plus utile selon les réserves — bois, état de la piste et du réseau, moral, chantier ouvert) ; tirage déterministe de trois nouveaux candidats, sans le projet en cours ; projet sans objet (piste ou réseau à 100 %, aucun chantier ouvert) écarté. Le tout premier chantier s'ouvre à la première nuit écoulée (sauf lundi, géré par la clôture de saison). *Interface :* carte « Chantier de la semaine » sur l'accueil (barre de progression, participants, temps restant avant le bonus, bouton « Y mettre 1 PA » ; vote affiché tant qu'aucun chantier n'est ouvert ou une fois achevé) et en tête d'Agora → Initiatives (vote toujours affiché, bilan de la semaine passée) ; « À faire en priorité » rappelle le chantier inachevé (plus haut les deux derniers jours) ; menu Métier : contribution grisée sans chantier ou une fois achevé.

### 5.6 Nouveaux bâtiments & parcelles libres

Le hameau ne se limite plus à ses ruines : sur la carte, onze **parcelles libres** (marquées d'un « + ») attendent un **nouveau bâtiment**. Tout habitant peut en poser le plan : on touche la parcelle, on choisit parmi douze bâtiments — **four à pain, fromagerie, chambre froide, scierie, moulin sur la rivière, lavoir, infirmerie, poulailler, ruches, serre, bar du hameau, hangar** — et la caisse commune paie le plan. Le chantier avance ensuite comme une rénovation (accord PLU de Tiphaine, matériaux), plus vite pour les petits bâtiments (ruches, poulailler) que pour les gros (moulin). Le moulin et le lavoir ne se bâtissent qu'en bord de rivière ; la chambre froide et la scierie demandent l'électricité. Une fois en service, chaque bâtiment donne son effet **chaque nuit** : des rations (four, moulin, fromagerie, chambre froide, poulailler, ruches, serre — surtout l'hiver), de la santé (infirmerie), du moral et un peu d'argent (bar, au prix d'un peu d'alcool), des outils mieux gardés (hangar), du bois en plus à chaque coupe (scierie) et deux fois moins d'épidémies (lavoir).

> **Précisions V5.4 — nouveaux bâtiments & parcelles libres (demandé par les joueurs : choisir où et quoi bâtir).** *Données :* un nouveau bâtiment est une ligne de `map_structures` avec `kind = 'building'` (la contrainte CHECK sur `kind` ne s'élargit pas), `variant` = son type et les coordonnées de la parcelle (`x`, `y`, `width`, `height`) ; il est créé **par le moteur** (code `nb_<type>`, insertion par `engine_commit`), statut « planned », 0 lit. L'occupation des parcelles vit dans `village_state.life.parcels` (parcelle → ouvrage) ; une démolition libère la parcelle, et le même type peut renaître ailleurs (la ligne démolie est réutilisée). Bilan de la nuit dans `life.buildings_last`. **Aucune migration.** *Action* « Bâtir sur une parcelle libre » (`plan_building`, 1 PA, tout le monde, `params.variant` + `params.parcel`) : prix du plan payé par la caisse (validation de M. Lerme au-delà de 500 €) ; accord PLU d'office si c'est Tiphaine, sinon demandé au premier coup de pioche. Règles vérifiées **avant** les verrous (aucune attente pour rien) : parcelle libre, un seul bâtiment de chaque type, moulin et lavoir en bord de rivière, **2 nouveaux bâtiments au plus en projet ou en chantier** en même temps. *Chantier :* chaque séance de « Rénover / construire » donne 12 points × facilité du bâtiment (ruches 3, poulailler 2,5, four / lavoir / serre / hangar 1,5, fromagerie / chambre froide / bar 1,2, scierie / infirmerie 1, moulin 0,8). *Prix et effets nocturnes* (une fois « Opérationnel ») : four à pain 600 € (+5 rations, +3 avec le moulin, 1 stère brûlé ; sans bois, pas de fournée) ; fromagerie 900 € (+3 rations avec au moins 2 bêtes) ; chambre froide 1 200 €, électricité (+2 rations, moins de gâchis) ; scierie 1 000 €, électricité (+3 stères à chaque coupe) ; moulin 1 100 €, rivière (+3 rations) ; lavoir 400 €, rivière (départ d'épidémie et contagion ×0,5) ; infirmerie 1 300 € (+3 santé par nuit à chaque joueur blessé ou malade) ; poulailler 250 € (+3 rations) ; ruches 200 € (+1 ration, écologie +0,2) ; serre 700 € (+4 rations en automne et en hiver, +1 sinon) ; bar 800 € (moral +1 jusqu'à 85 %, +12 € de recettes, alcool +0,3 %) ; hangar 500 € (usure des outils −1). *Préparé pour la suite :* niveaux et usure des bâtiments (V5.5, colonne `upgrade_level` déjà en place), fromage vendu au marché, péremption sans chambre froide et limites de stockage relevées par le hangar (V5.6). *Interface :* parcelles libres en pointillés « + » sur la carte (accueil et Explorer, calques Tout et Chantiers), fenêtre de la parcelle avec les douze choix (effet, prix, conditions, raison d'un refus), icône, toit et libellé propres à chaque bâtiment, prochaine étape dans la fiche ; rations et bois des bâtiments dans les Réserves du Trésor ; « À faire en priorité » propose de bâtir quand rien n'est en projet.

### 5.7 Niveaux & usure des bâtisses

Les bâtisses ne restent plus neuves pour toujours : **chaque nuit, une bâtisse en service perd un peu d'état**, davantage en hiver et les nuits de gel. Quand son état tombe sous 30 %, elle devient **endommagée** : ses lits ne comptent plus et un nouveau bâtiment ne donne plus son effet, jusqu'à une réparation (rénovation payante, ou résidents du chantier). L'**entretien** devient donc une petite tâche régulière, qui redonne enfin un usage à la **pierre et au fer**. En contrepartie, un hameau qui prospère peut **améliorer ses bâtisses** : la Casa Gran au niveau 2 gagne deux lits et une meilleure isolation, donc brûle moins de bois l'hiver ; un four ou un poulailler au niveau supérieur produit davantage.

> **Précisions V5.5 — niveaux & usure des bâtisses (demandé par les joueurs : entretien régulier, améliorations par niveaux).** *Usure :* chaque nuit (`processWear`, après les nouveaux bâtiments), toute bâtisse en service (logements, gîte, école, cachot, laboratoire, église, forge, poste-frontière, nouveaux bâtiments) perd 0,3 point d'état au printemps, 0,25 l'été, 0,4 l'automne et 0,7 l'hiver, +0,2 par nuit de gel (minimale réelle < 0 °C), −20 % par niveau au-delà du premier. `condition_pct` étant entier, la part fractionnaire attend dans `village_state.life.wear_acc`. **Sous 30 %, la bâtisse est « endommagée »** (événement public) : lits retirés de la capacité, effet du bâtiment coupé ; elle redevient opérationnelle à 60 % (rénovation à 300 € par séance, ou résident au chantier). *Entretien* (`maintain_building`, 1 PA, tout le monde, physique, sans accord PLU ni dépense) : +20 points d'état × rendement du métier (plus pour Tiphaine) contre **2 pierres et 1 fer** ; refusé avant de payer les PA si la bâtisse est parfaite, endommagée ou si la pierre / le fer manquent. Les **résidents du poste « chantier »** entretiennent aussi, après les chantiers et les réparations, les bâtisses sous 70 % (2 pierres par nuit). *Amélioration* (`upgrade_building`, 1 PA, physique, accord PLU, veto écologique possible ; colonne `upgrade_level`, niveaux 1 à 3) : logements, gîte et nouveaux bâtiments en service à 60 % d'état au moins ; **niveau 2 : 800 €, 10 pierres, 3 fer, 5 bois ; niveau 3 : 1 500 €, 15 pierres, 5 fer, 8 bois** (validation de M. Lerme au-delà de 500 €). Effets par niveau : **+2 lits** (logements et gîte), **isolation** (bois de chauffage ×0,75 au niveau 2, ×0,5 au niveau 3), **+50 % de production** pour un nouveau bâtiment (rations, recettes du bar, soins de l'infirmerie), usure −20 %. **Aucune migration** (colonnes `upgrade_level` et `condition_pct` déjà en place). *Interface :* carte « Entretien & niveau » dans la fiche d'une bâtisse (étoiles, usure par nuit, nuits avant d'être endommagée, gains et coût du niveau suivant, raison d'un refus), prochaine étape « Entretenir » ou « Améliorer » ; « À faire en priorité » propose d'entretenir la bâtisse la plus usée (sous 50 %, urgent sous 40 %) ; Réserves du Trésor : bâtisses à entretenir et nouveaux usages de la pierre, du fer et du bois. *Préparé pour la suite (V5.6) :* filières, péremption et limites de stockage.

### 5.8 Filières, péremption & stockage

Les réserves ne sont plus de simples compteurs : **on transforme** ce que le hameau produit pour mieux le garder et mieux le vendre, **les vivres frais se gâtent** quand il fait chaud, et **la place est comptée**.

> **Précisions V5.6 — filières, péremption & stockage (feuille de route « vie du village »).** *Filières :* **fromage** — la fromagerie en service affine **2 kg par nuit** s'il y a au moins 2 bêtes (+50 % par niveau, V5.5) ; l'action « Faire du fromage » (`make_cheese`, 1 PA, tout le monde, pôle d'Ely) transforme **4 rations de lait en 3 kg** (× rendement du métier, plafonné à ×1,5 ; +3 kg avec la fromagerie), au moins 2 bêtes. **Prunes** — le verger du hameau en donne **5 kg par nuit l'été et 2 kg l'automne**. **Ratafia légal** — « Distiller du ratafia » (`make_ratafia`, 1 PA) : **10 kg de prunes + 15 €** (eau-de-vie, sucre, droits d'accise déclarés) → **6 bouteilles** (× métier, plafonné à ×1,5). Ces produits vivent dans `village_state.life.pantry` (aucune colonne nouvelle). **Marché d'Organyà** : fromage 14 €/kg par lots de 2 kg (30 kg par semaine), ratafia 11 € la bouteille par lots de 2 (24 par semaine), avec les règles du §5.4 (samedi +30 %, saturation, espagnol). *Péremption :* chaque nuit d'été — ou dès que la température réelle atteint 28 °C — **sans chambre froide en service**, se gâtent 3 % des rations, 8 % des tomates et 10 % des prunes (rien sous 20 unités) ; fromage, ratafia, bois, pierre et fer se gardent. *Stockage :* capacités de base — rations 300, tomates 200 kg, bois 300 stères, pierre 200, fer 120, fromage 40 kg, ratafia 40 bouteilles, prunes 60 kg ; **le hangar en service les multiplie par 1,5 (niveau 1), 2 (niveau 2) et 2,5 (niveau 3)**. Chaque nuit (`processSupply`, après l'usure), après le verger, la fromagerie et la péremption, **le surplus au-delà de la capacité est perdu** (événement « Réserves pleines »). Les achats et les actions ne sont pas bloqués : seul le surplus de la nuit disparaît. *Interface :* Réserves du Trésor avec trois nouvelles tuiles (fromage, prunes, ratafia), la capacité de chaque réserve (tuile signalée à 90 %) et les pertes de la nuit ; « À faire en priorité » : bâtir une chambre froide quand les vivres se gâtent, vendre le surplus (ou bâtir un hangar) quand une réserve est presque pleine, distiller les prunes, vendre le fromage ; actions grisées sans troupeau, sans lait ou sans prunes. **Aucune migration.**

### 5.9 Relations avec les voisins

Le hameau n’est pas seul dans la vallée : **Organyà**, le bourg du marché, la **mairie (Ayuntamiento)** dont dépendent permis et dossiers, et les **Mossos d’Esquadra**, la police catalane, ont chacun leur avis sur les Gaulois. Rendre service fait monter cet avis ; ignorer une demande le fait baisser.

> **Précisions V5.8 — relations avec les voisins (feuille de route « vie du village »).** *Jauges :* trois relations de 0 à 100 (50 au départ), stockées dans `village_state.life.neighbors` ; chaque nuit (`processNeighbors`, après le moral et la diplomatie), elles reviennent de **0,5 point vers 50**, et perdent 0,5 point de plus si la pression administrative dépasse 60 % (mairie), si l’alerte des douanes dépasse 50 % (Mossos) ou si l’insécurité dépasse 50 % (Organyà). Au quotidien : **chaque vente au marché** rapproche Organyà (+0,5) ; une **négociation réussie à l’Ayuntamiento** donne +5 à la mairie (quiproquo : −3). *Effets :* bonne relation (≥ 70) / mauvaise (≤ 30) — **Organyà** : prix du marché ×1,1 / ×0,9 ; **mairie** : pression administrative −0,3 / +0,3 par nuit, et **sous 20 plus aucun permis pour un nouveau bâtiment** ; **Mossos** : alerte des douanes −1 / +1 par nuit, et risque de contrôle hebdomadaire du gîte +5 points quand la relation est mauvaise. *Demandes :* une seule à la fois, tirée de façon déterministe chaque nuit parmi dix demandes de saison (froid : déneiger la route du col, du bois pour les anciens, le chasse-neige communal ; beau temps : les foins, les tomates de la fête, débroussailler le chemin ; toute l’année : registre des habitants, signaler les passages suspects, dégager la piste, café avec la patrouille), sans répéter la précédente ; une fois sur deux, le voisin le plus fâché passe en premier. Chaque demande a **1 à 3 coups de main** (action « Rendre service aux voisins », `help_neighbors`, 1 PA, tout le monde, parfois 10 stères de bois, 10 kg de tomates, 5 rations ou 60 € par coup de main) et **2 ou 3 jours** pour répondre. Remplie : relation **+8 à +12** et un bonus (piste +3 à +5 %, moral +3 %, 15 rations, pression administrative −3 à −5 %, alerte des douanes −5 %, sécurité +3 %). Manquée à minuit du dernier jour : relation **−4 à −8**. Une nuit de pause suit chaque demande close. *Gazette :* les demandes ouvertes, remplies ou manquées paraissent dans la section « Chez les voisins » (et dans l’édition de secours, sans IA). *Interface :* carte « Les voisins » sur l’accueil et en complet à l’Agora (jauges colorées, effet du moment, demande, barre des coups de main, volontaires, bouton « Donner un coup de main ») ; priorité « Voisins : … » (urgente le dernier jour) ; action grisée sans demande ou sans la ressource demandée. **Aucune migration.**

### 5.10 Visiteurs imprévus

Un hameau perché attire du monde inattendu : un randonneur égaré, une journaliste curieuse, un inspecteur de l’Ayuntamiento, un vendeur ambulant. Il faut **répondre vite** : le visiteur n’attend que jusqu’au soir, et le silence a des conséquences.

> **Précisions V5.9 — visiteurs imprévus (feuille de route « vie du village »).** *Arrivée :* chaque nuit (`processVisitors`, après les voisins, graine `<village>:visitors:<jour>`), s’il n’y a pas de visiteur et après **une nuit de pause** depuis le dernier, un visiteur arrive avec **35 %** de chances, tiré parmi quatre sans répéter le dernier. État dans `village_state.life.visitor` (`day`, `due_at` = **21 h locales** du jour d’arrivée), `visitor_last`, `visitor_next_day` ; aucune migration. *Réponse :* action « Répondre au visiteur » (`answer_visitor`, `params.choice`, **1 PA**, tout joueur, non délégable) ; le premier qui répond tranche, refus après 21 h. *Choix (coût → effets) :* **randonneur** — le raccompagner au col (→ Mossos +6, moral +2 %) ou l’héberger (4 rations → 20 € en caisse, moral +3 %, Mossos +3) ; ignoré : Mossos −6. **Journaliste** — interview (→ notoriété +4 %, pression administrative +2 %, Organyà +3) ou visite discrète (3 rations → notoriété +2 %, moral +2 %) ; ignorée : pression +4 %, Organyà −3. **Inspecteur** — visite en règle (→ pression −5 %, mairie +8) ou casse-croûte (5 rations → pression −2 %, mairie +4) ; ignoré : pression +5 %, mairie −8. **Vendeur ambulant** — acheter (40 € → 2 outils, 5 fer) ou lui vendre (10 kg de tomates → 35 €, Organyà +1) ; ignoré : rien. *Conséquence par défaut :* appliquée la nuit suivante si personne n’a répondu. *Gazette :* événements titrés « Visiteur : … » → section « Visiteurs de passage » et, sans IA, « De passage : ». *Interface :* carte du visiteur sur l’accueil (seulement quand quelqu’un attend) et à l’Agora → Initiatives (dernière visite), un bouton par réponse, temps restant ; priorité « Visiteur » (urgente à moins de 3 h). Constantes `VISITORS`, `VISITOR_CHANCE_PCT`, `VISITOR_DUE_HOUR`, `VISITOR_GAP`.

### 5.11 Bilan de la semaine & frise du hameau

Le dimanche soir, le hameau fait ses comptes : qui a mis la main à la pâte, qui a battu un record, qui mérite le titre d’**habitant de la semaine**. Et pour ne pas oublier d’où l’on vient, une **frise** garde la date de chaque grande étape.

> **Précisions V6.0 — bilan de la semaine & frise (feuille de route « vie du village »).** *Compteurs :* chaque action **réussie** ajoute à son auteur (l’acteur, même en délégation) dans `village_state.life.week_stats` : 1 action, les PA dépensés, la mission du jour si elle vient d’être accomplie, un **coup de main** pour `contribute_collective`, `help_neighbors`, `answer_visitor` et `cheer_resident`, un binôme s’il y a des partenaires. *Score :* **2 points par PA, 1 par action, 3 par mission du jour, 2 par coup de main, 1 par binôme** (`WEEK_SCORE`). *Bilan :* à la clôture de la semaine (lundi minuit, `closeWeekReview` au début de `closeSeason`), classement par score, puis PA, puis missions, puis ordre des places ; le premier est **habitant de la semaine** : **+30 XP de métier** et **moral +1 %** (`WEEK_HERO_XP`, `WEEK_HERO_MORALE`). Événement public « Bilan de la semaine : … » (podium de 3, totaux, records), repris par la Gazette (section « Bilan de la semaine », ligne « Bilan de la semaine : » de l’édition de secours) ; bilan gardé dans `life.week_last`, compteurs remis à zéro. *Records* (`life.records`) : PA d’un joueur en une semaine, coups de main d’un joueur, actions du hameau ; un record battu est annoncé (le premier n’est que posé). *Frise :* les événements publics `structure_completed`, `building_upgraded`, `gite_opened`, `energy_tier`, `act_changed`, `act_goal_done`, `act_goals_complete`, `collective_completed`, `election_result`, `neighbor_mission_done`, `migrant_admitted`, `naturalization`, `birth`, `marriage`, `independence`, `putsch_success` (`TIMELINE_EVENTS`, une icône chacun) entrent dans `life.timeline` avec la date du jour local (jour écoulé pour la nuit) ; **60 étapes au plus** (`TIMELINE_MAX`), les plus anciennes s’effacent. *Interface :* onglet Gazette, cartes « Bilan de la semaine » (classement en cours, dernier bilan, aide du score et records) et « Frise du hameau » (6 dernières étapes, frise complète en fenêtre). Aucune migration, aucune nouvelle action.

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
- **Moteur de Tentations & Dérives :** 1 à 2 fois par semaine, le Maître du Jeu IA soumet un dilemme privé (une « proposition discrète ») à un joueur : tentations festives (tournée au bar du col, Festa Major, alcool détaxé d'Andorre, stupéfiants aux concerts des BOR, escapade à Caldea), tentations sentimentales / charnelles (impactant `homosexuality_rate_pct` ou la diplomatie locale : garde forestière, agent des Mossos, retour d'un ex, mariage arrangé) ou tentations idéologiques / financières (détournement discret de caisse, pots-de-vin, jeux d'argent, propagande clandestine, rivalités entre fondateurs, ressources du village vendues au noir, coups médiatiques). Céder procure +20 % de moral immédiat mais déclenche −2 PA le lendemain et des répercussions concrètes si le joueur ne se confesse pas à Brunel avant la parution de La Gazette.

> **Précisions V3.8.** Un dilemme expire après 36 heures. Céder : moral personnel +20, culpabilité +30, effets bornés (moral ±20, alcool ±5, stupéfiants ±3, homosexualité ±1, caisse ±500 €, épargne ±500 €, addiction ±10, gauche ±3, pression ±10, notoriété ±5). La confession à Brunel (−40 % de culpabilité) marque l'écart comme confessé — il rejoint les secrets confessés de Brunel. À la parution de La Gazette, chaque écart non confessé devient un scandale public (moral personnel −10, pression administrative +2 à +5, notoriété −1). Une culpabilité supérieure à 50 % coûte 2 % de santé mentale par nuit.

> **Précisions V3.9 — cadence.** Chaque nuit, chaque joueur libre sans dilemme en attente a 20 % de chances d'en recevoir un (≈ 1,4 par semaine ; réglable par `TEMPTATION_CHANCE_PCT`). L'administrateur peut aussi en envoyer un à la demande. La Gazette paraît chaque nuit (00:05 à Madrid) : les scandales non confessés y sont publiés juste avant sa rédaction.

> **Précisions V4.5 — variété des propositions discrètes.**
> - **Banque de secours** (`supabase/functions/_shared/core/gm/temptationBank.ts`, utilisée sans clé API, en cas d'erreur de l'IA et en mode démo) : 94 situations en 15 thèmes — tournées & comptoirs, fêtes de village & traditions, contrebande andorrane, jeux d'argent, stupéfiants & distillation, évasions & paresse (festifs) ; romances & séductions, affaires de cœur & secrets (sentimentaux) ; pots-de-vin & passe-droits, caisse & combines, idéologie & militantisme, rivalités entre fondateurs, ressources du village, notoriété & médias, tentations du métier (idéologiques / financiers, quelques exceptions festives ou sentimentales). Les textes varient encore par tirage (village de la Festa Major, fournisseur, genre de l'interlocuteur, fondateur visé par une rivalité).
> - **Personnalisation :** chaque fondateur a des tentations propres à son métier (voix prépondérante d'Ely, séances de kiné de M. Lerme, plans de Tiphaine, ferme de minage d'Alex, forge de Julio, laboratoire de Tanguy, confessions et sacristie de Brunel) ; une situation qui cite un fondateur à la troisième personne n'est jamais proposée à ce fondateur, ou s'adresse à lui directement. La météo réelle compte : ski à Port Ainé seulement par neige ou ≤ 6 °C, plage de Salou à partir de 22 °C, rafting à partir de 15 °C.
> - **Pas de répétition rapprochée :** une situation déjà reçue par le joueur parmi ses `TEMPTATION_NO_REPEAT_WINDOW` = 24 derniers dilemmes n'est pas reproposée (si tout a servi : on évite au moins les 5 derniers) ; les thèmes de ses `TEMPTATION_THEME_COOLDOWN` = 3 derniers dilemmes sont écartés ; la catégorie du précédent voit son poids divisé par deux. Poids des thèmes : 2 pour les deux thèmes sentimentaux, 1 pour les thèmes festifs et le métier (×1,5 si une situation vise son rôle), 0,5 pour les autres thèmes idéologiques / financiers — environ un tiers de chaque catégorie. Tirages déterministes (graine de la session et du joueur).
> - **Historique :** la nuit et lors d'un envoi par l'administrateur, les Edge Functions relisent les dilemmes des `TEMPTATION_HISTORY_DAYS` = 120 derniers jours, tous statuts (titre, catégorie, texte) ; en mode démo, l'historique complet est dans l'instantané. Le thème d'un dilemme écrit par l'IA est reconnu par mots-clés.
> - **Maître du Jeu IA :** la session choisit le thème (même règle) et l'impose dans la tâche, avec ses pistes et la catégorie attendue ; elle cite les 8 derniers titres reçus par le joueur en demandant de n'en reprendre ni la situation, ni le ressort, ni le titre. Le system prompt (mis en cache) demande des dilemmes variés, un titre court et inédit et 2 à 4 phrases concrètes ancrées dans le hameau et ses voisins. Les effets restent bornés par le moteur (Précisions V3.8).
> - **Catégories inchangées :** la table `temptations` garde sa contrainte `CHECK` à trois catégories (l'élargir exigerait un `DROP CONSTRAINT`) ; les thèmes ne sont pas stockés et aucune migration SQL n'est nécessaire.

### 6.3 Connecteurs Monde Réel & Architecture des 5 Écrans Mobile-First

1. **Connecteurs temps réel gratuits (0 €) :** météo réelle de Lleida / Andorre via l'API Open-Meteo (sans clé), flux RSS Espagne / Catalogne / France (actualités économiques, migratoires et policières converties en événements de jeu) et calendrier réel (saisons agricoles / natales, dimanches Agora / Messe / Tribunal, jours fériés catalans).
2. **Écran d'accueil — Connexion (V3.5) :** grille des 7 fondateurs (Ely, Guillem / M. Lerme, Tiphaine, Alex, Julio, Tanguy, Guillaume B. / Brunel) et des 3 places évolutives ; clic sur le personnage puis code PIN à 4 chiffres ; session mémorisée sur l'appareil pour une reconnexion instantanée.
3. **Écran 1 — Carte interactive du hameau (SVG 2D) :** vue aérienne des 30 hectares affichant bâtisses rénovées / ruines avec jauge de capacité PLU, gîte rural, enclos d'élevage, ferme de minage, canalisations d'Alex avec alertes de fuite, réseau électrique de Tiphaine, potager d'Ely, piste forestière, miradors / herses et alertes d'insécurité. *(V4.7)* Plan illustré, calques, mode Explorer plein écran et fiche d'ouvrage avec la prochaine étape (Précisions V4.7 ci-dessous).
4. **Écran 2 — Mon Métier & Patrimoine privé :** jauges vitales (santé, fatigue, moral, sobriété / addiction, XP), compteur des 3 PA, compte patrimonial privé (`private_wealth_eur`), suivi des apprentis, indicateurs cachés du métier strictement réservés au titulaire, actions déterministes (avec verrous PLU / budget > 500 € / veto écologique) et formulaire d'Action Libre IA.
5. **Écran 3 — L'Agora, Tribunal Public & Carlage 2 × 2 :** initiatives législatives hebdomadaires et vote OUI / NON, scrutins budgétaires et législatifs (propriété privée vs collectivisation, alcool / stupéfiants), Bureau de l'Immigration & Démographie (pyramide des âges, taux d'homosexualité, spectre Droite / Gauche, fiches détaillées des candidats avec origine, religion et sensibilité politique, auscultations, naturalisations), Tribunal Public (travaux forcés, bannissement, exécution sur la place publique), éditeur collaboratif de la Constitution, jetons de veto, arène du Carlage et épreuve de la cible.
6. **Écran 4 — Trésorerie, grand livre privé & fournisseurs :** comptabilité publique et privée tenue par M. Lerme, dette foncière (295 000 €), fonds souverain, revenus du gîte / minage / contrebande, jauge d'autonomie (Actes I à III) et catalogue fournisseurs (BigMat, Gedimat, Thomas Sograma, Loxam, Kiloutou, Marché d'Andorre).
7. **Écran 5 — La Gazette & La Taverne :** journal quotidien généré par l'IA (chroniques politiques, faits divers, verdicts du Tribunal Public, actualité réelle), messagerie temps réel publique / privée et modales privées de Tentations & Dérives (avec confession / thérapie chez Brunel pour étouffer le scandale).
8. **Panneau d'administration (V3.7) :** sauvegardes quotidiennes, restauration du village à J−1, J−2, J−7… en un clic, export / import JSON manuel, attribution des places 8 à 10 et réinitialisation d'un PIN oublié.
9. **Mode démo (V4.0) :** sans configuration Supabase, le site démarre une partie locale au navigateur (PIN 0000 pour tous) qui exécute exactement le même moteur et la même session de jeu que les Edge Functions, avec les règles d'accès émulées, une « machine à remonter le temps » (+1 h à +3 jours) et la réinitialisation de la partie. Idéal pour découvrir le jeu avant le déploiement.

> **Précisions V4.0 — interface.** Navigation basse à 5 onglets (+ Admin pour M. Lerme), pastilles sur Mon Métier (validations en attente) et Agora (scrutins non votés), bandeaux d'alerte (duel en attente, cachot, travaux forcés, défaite). Les données se rafraîchissent par Realtime (regroupement 400 ms), toutes les 45 s et au retour sur l'application ; `game-engine` op `tick` est appelé à l'ouverture puis toutes les 5 minutes. Un PIN réinitialisé par l'administrateur impose sa modification à la connexion suivante. Le Carlage affiche la grille 2 × 2, les équilibres, le chrono de manche et le déroulé ; le choix du pivot se fait en touchant un carreau adjacent libre.

> **Précisions V4.7 — carte du hameau.** Demandée par les joueurs : plus jolie et plus pratique sur téléphone (l'ancienne carte, réduite à la largeur de l'écran, avait des noms d'environ 4 pixels et des bâtisses difficiles à toucher). *Dessin :* prés en dégradé avec herbes et courbes de niveau, parcelles, forêts plantées d'arbres, rivière bordée avec un courant animé (arrêté si le téléphone demande moins d'animations), piste bordée dont le tireté prend la couleur de son état (≥ 60 % brun, 40-59 % ocre, < 40 % rouge), conduite d'eau pointillée (rouge en cas de fuite), ligne électrique avec ses poteaux (tiretée tant qu'elle n'est pas en service). Bâtisses vues du ciel avec ombre et toit à deux pans (tuiles, ardoise de l'église et son clocher, forge et sa cheminée, pierre du cachot, laboratoire) ; **ruine** = murs gris en pointillés et gravats ; **chantier** = échafaudage et toit posé à hauteur de l'avancement ; **endommagée** = tuiles manquantes et fissure ; **attend le courant** = contour ambre tireté ; **projet** = emprise fantôme. Potager en rangs, enclos à clôture, place pavée, captage, panneaux solaires. Neige ou pluie réelles en surimpression. *Pastilles :* chaque ouvrage a une pastille de taille fixe à l'écran (icône du type, anneau couleur de l'état, badges ⚡ attend le courant, 🐸 veto, 💧 fuite, avancement en %), et les ouvrages visés par les 5 premières priorités (§6.3, V4.6) **pulsent**. *Calques :* Tout, 🎯 À faire (priorités, chantiers en cours, raccordements, dégâts, fuites, vetos), 🏠 Logements, 🏗️ Chantiers, ⚡ Énergie, 💧 Eau, avec leur nombre ; les ouvrages hors calque s'estompent. *Accueil :* carte « Le hameau » en vue d'ensemble (météo réelle, insécurité) ; toucher une pastille ouvre la fiche, toucher ailleurs ou « ⛶ Explorer » ouvre le **mode Explorer** plein écran : glisser pour se déplacer, pincer ou double-toucher pour zoomer (jusqu'à ×5,5), molette sur ordinateur, boutons + / − / vue d'ensemble, boussole, échelle en mètres (1 unité du plan ≈ 0,65 m), noms affichés dès que le zoom les rend lisibles, vue **☰ Liste** (À traiter en priorité, Chantiers en cours, Ruines à rénover, Projets, En service, Paysage & réseaux ; 📍 recentre la carte sur l'ouvrage) ; le bouton retour du téléphone ferme l'Explorer. *Fiche d'ouvrage :* type et état, encadré **Prochaine étape** (`nextStepFor` : rénover avec le nombre de séances restant selon la productivité, raccorder — ou d'abord installer le groupe électrogène —, ouvrir le gîte, poser la ligne, réparer le réseau, empierrer la piste, acheter du bétail, etc. ; ce qui dépend d'un Acte suivant est annoncé) avec qui peut le faire et un bouton pour agir (l'action vise le bon ouvrage : depuis une bâtisse sans courant, le groupe électrogène), chiffres clés (lits, courant, PLU, gîte), jauges d'état et d'avancement, puis les actions du joueur sur cet ouvrage. Logique pure dans `src/app/lib/mapView.ts` (testée), dessin dans `src/app/components/VillageMap.tsx`, fiche dans `StructureSheet.tsx`.

> **Précisions V4.6 — « À faire en priorité » & réserves expliquées.** Demandé par les joueurs, qui comprenaient mal la progression. *Carte « À faire en priorité » (accueil, sous « Aujourd'hui ») :* barre d'autonomie jusqu'au prochain Acte (35 % puis 85 %) et les 3 priorités du moment, chacune avec une phrase courte, la mention « Urgent », et « Vous pouvez le faire » ou les prénoms de qui peut le faire ; un appui ouvre le détail — **pourquoi maintenant**, ce que ça rapporte, qui peut le faire, **à savoir** (dépense et validation du trésorier au-delà de 500 €, accord PLU de l'architecte, caisse insuffisante, veto écologique, PA, matériaux manquants, étape suivante) — et le bouton **« Faire maintenant »** (fenêtre d'action pré-remplie : bâtisse ou article du catalogue) si c'est dans le métier du joueur, sinon « En parler à la Taverne » ou « Y aller » (Agora). La fenêtre **« Comprendre la progression »** rappelle le but et les deux verrous, montre l'Acte et les **six piliers** de l'autonomie calculés par le moteur (énergie 25 points : palier 1 = 0, 2 = 5, 3 = 10, 4 = 20, 5 = 25 ; eau 15 : réseau couvrant toute la demande et en état ≥ 60 % ; nourriture 20 : production annuelle du potager et du cheptel face aux besoins ; dette 20 : part remboursée ; logement 10 : lits livrés / lits possibles ; souveraineté 10 : Constitution 3, indépendance 4, dissuasion 3), chacun avec la façon de le faire monter, puis toutes les priorités. *Règles (`src/app/lib/priorities.ts`, classées par urgence) :* urgences d'abord — vivres pour moins de 3 jours (pêche, potager, boucherie, conserves d'Andorre), outils en nombre inférieur aux travailleurs (−35 % de rendement), surpopulation, échéances de l'emprunt impayées ou caisse sous deux échéances, bâtisse terminée « en attente de courant » (raccorder), réseau d'eau sous 40 % ou fuite, pression administrative ≥ 60 % (bloque la ligne aérienne), gasoil pour moins de 40 L au palier 2 ; puis la progression — **énergie** (palier 1 : groupe électrogène, première marche car sans courant aucune bâtisse n'est livrée ; palier 2 : ligne aérienne, compteurs ; palier 3 à l'Acte II : champ solaire ou micro-barrage), gîte (rénover le Mas de l'Era, puis l'ouvrir : 800 à 2 500 € par semaine), eau (capacité inférieure à la demande), nourriture (potager, enclos, bétail), logement (bâtisse entamée ou la plus grande), remboursement anticipé quand la caisse dépasse 6 000 €, Constitution à l'Acte III ; et les signaux d'ambiance (moral < 35 %, insécurité ≥ 40 %, piste < 40 %). *Réserves du hameau (onglet Trésor, `src/app/lib/reserves.ts`) :* chaque tuile affiche la quantité, le rythme et, s'il baisse tout seul, la durée restante ; un appui ouvre **Chaque jour** (mêmes formules que le moteur : rations = adultes × 1 + enfants × 0,6 par jour, face au potager selon la saison et l'arrosage et au cheptel à 0,25 ration par bête ; tomates produites par le potager du printemps à l'automne, jamais mangées au quotidien ; bétail +8 % par saison à partir de 4 bêtes dans un enclos achevé, fumier +20 % au potager dès 6 bêtes ; gasoil = 0,35 L par kWh au palier 2 ; outils usés de 0,4 % par travailleur et par jour, un outil par travailleur exigé ; bois, pierre, fer et remèdes ne partent que dans les chantiers et les soins), **À quoi ça sert** et **Comment s'en procurer** (actions des métiers avec qui peut les faire, articles du catalogue au prix du jour, surcoût de piste compris), avec « Faire » ou « Commander » quand le joueur le peut. L'autonomie affichée reste celle du moteur, recalculée à chaque action et chaque nuit.

> **Précisions V4.4 — ergonomie téléphone.** L'application n'est utilisée que sur téléphone : tout est pensé pour le pouce. *Navigation :* 5 onglets en bas pour tous (Hameau, Métier, Agora, Trésor, Gazette) ; toucher l'onglet affiché remonte en haut. L'en-tête montre l'Acte, la caisse, la température et les PA (toucher les PA ouvre le Métier) ; l'avatar ouvre le **menu du compte** (Ma fiche, Notifications, Installer l'appli, Changer mon code PIN, Administration pour M. Lerme, Se déconnecter par double appui). Les fenêtres s'ouvrent depuis le bas et se ferment par la croix, en touchant le fond, en glissant la poignée vers le bas ou avec le **bouton retour du téléphone** (on ne quitte plus l'écran par erreur) ; leur bouton principal reste collé en bas. Les sous-onglets figurent dans l'adresse (`#/metier/fiche`, `#/agora/duels`, `#/admin/sauvegardes`…) sans encombrer l'historique. *Accueil (onglet Hameau) :* carte « Aujourd'hui » au-dessus de la carte du hameau : Acte, autonomie, compte à rebours de l'Agora et liste de ce qui attend le joueur, du plus urgent au simple rappel — proposition discrète en suspens (rouvre la fenêtre laissée sur « Décider plus tard »), validations à trancher, scrutins non votés (ouvre le bon sous-onglet de l'Agora), PA restants, chuchotements, Gazette et messages non lus, candidats à la porte. *Métier :* fiche compacte (PA, patrimoine, pastilles de santé, alertes) puis trois sous-onglets — **Agir**, **Ma fiche** (jauges, indicateurs cachés, apprentis, délégation, PIN) et **Journal** (derniers résultats, demandes de validation et leur état). « Agir » est un **menu d'actions classées par type** : tuiles Vivres & élevage, Chantiers & bâti, Eau & énergie, Forge & entretien, Soins & santé, Argent & commerce, Vie du village, Diplomatie & image, Ordre & sécurité, Candidats — seulement les catégories où le titulaire a des actions, celles de son métier ou de ses portefeuilles en tête et encadrées, avec le nombre d'actions et d'actions jouables. Toucher une tuile ouvre la liste de la catégorie (`#/metier/<type>` ; retour = menu). Au-dessus : recherche (sans accents ni majuscules), Action libre et actions récentes (4 dernières, par joueur, mémorisées sur le téléphone). Chaque action affiche son coût en PA et, si elle n'est pas jouable maintenant, la raison (partie terminée, cachot, non délégable, dimanche seulement, PA insuffisants, travaux forcés) dans l'ordre de contrôle du moteur, qui reste seul juge. *Fenêtre d'action :* verrous expliqués en clair (« Bon à savoir » : accord PLU, validation budgétaire, veto écologique, effort physique, gratuité), joueurs ciblés en boutons avec avatar, quantités au bouton − / +, mouvement du fonds souverain dans les deux sens (caisse → fonds, fonds → caisse), compteur de caractères de l'Action libre ; après l'action, le récit s'affiche dans la fenêtre (✅ réussie ou ⏳ en attente de validation) avec les PA restants et « Refaire ». *Administration (menu du compte) :* quatre sous-onglets — **Partie** (Acte, caisse, autonomie, habitants ; points à surveiller ; activité des joueurs : dernière connexion, PA, cachot, blessure, délégation, en rouge au-delà de 48 h d'absence ; machine à remonter le temps en démo), **Joueurs** (les 10 places → fiche : prénom, personnage, nouveau PIN, ouverture ou libération des places 8 à 10 confirmée), **Sauvegardes** (sauvegarde immédiate, les 8 plus récentes puis les plus anciennes sur demande, restauration expliquée et confirmée par double appui, export / import JSON), **MJ (IA)** (modèle, clé API, appels, secours et jetons récents ; commandes expliquées, « Lancer la nuit » et « Régénérer la Gazette » confirmées par double appui ; tentation envoyée à un joueur choisi ; derniers appels). *Gazette :* le **fil des événements** sépare les **faits de jeu** (affichés d'abord) des **duels** (défis lancés, vainqueurs), chacun limité aux 30 plus récents ; les conséquences d'un duel (veto maintenu ou renversé, putsch) restent des faits de jeu ; les faits majeurs (défaite, changement d'Acte, putsch, sentences, épidémie, famine, scandale, chantier achevé…) sont mis en relief.

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
- **Sortie JSON stricte :** le format de réponse ci-dessus est imposé par un schéma JSON (structured outputs : objets fermés, clés obligatoires, champs facultatifs à `null`), puis revalidé et borné par le moteur. *(V4.3)* Un schéma **par tâche** (`GM_SCHEMAS`) : action libre, initiative et Gazette demandent titre, récit, deltas et incident éventuel ; un dossier migrant ou une tentation ne demande que son propre objet (notes du migrant en chaîne vide plutôt que `null`). Le schéma unique d'origine, avec trois gros objets facultatifs, dépassait la taille de grammaire acceptée par l'API (« compiled grammar is too large ») et faisait tomber chaque appel sur le dictionnaire de secours ; au plus deux unions par schéma désormais (test).
- **Tâches :** action libre, initiative adoptée, dossier migrant, dilemme privé, Gazette du jour. Les sorties hors tâche sont neutralisées (pas de migrant surprise dans une action libre).
- **Modèle :** réglable par la variable `GM_MODEL`. Défaut **`claude-haiku-5-5`** (choix des joueurs en V4.0, pour tenir un budget de moins de 1 $ par mois) ; `claude-opus-5-5` reste disponible pour une plume plus riche. Effort de raisonnement `low` par défaut (`GM_EFFORT`), délai de 45 s, 1 nouvelle tentative ; repli serveur sur refus (`fallbacks: "default"`) pour les modèles qui le permettent ; tout refus, délai dépassé, erreur ou réponse incomplète bascule sur le dictionnaire de secours.
- **Coût estimé** pour 10 à 20 appels par jour (Gazette, dossiers migrants, tentations, initiatives, actions libres) : moins de 1 $ par mois avec `claude-haiku-5-5` (défaut), environ 25 à 35 $ par mois avec `claude-opus-5-5`, 0 € sans clé API (dictionnaire de secours seul). Chaque appel est journalisé dans `ai_calls` (modèle, jetons, latence, repli, erreur).
- **Dictionnaire de secours :** règles par mots-clés pour les actions libres et les initiatives (fonds souverain, taxe, école, sécurité, fête, accueil, piste, sobriété, souveraineté…), générateur déterministe de dossiers migrants, banque de 94 tentations en 15 thèmes sans répétition rapprochée (V4.5, §6.2), Gazette composée à partir des événements du jour, de la météo et de l'actualité réelle.

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
│   └── lib/, demo/seed.ts                Libellés, formats, routeur par ancre, installation (V4.2), menu des actions,
│                                         « À faire », fil des événements, bouton retour (V4.4), seed du mode démo
├── index.html, vite.config.ts            Build statique (base relative) → dist/
├── public/                              manifest.webmanifest, sw.js, icons/ (application installable, V4.2)
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
- **Application installable (V4.2) :** le site est une *Progressive Web App*. Un manifeste (`public/manifest.webmanifest` : nom, icônes, affichage `standalone`, chemins relatifs pour GitHub Pages) et un service worker (`public/sw.js`) permettent l'installation ; l'interface propose un bouton « Installer l'appli » (`components/InstallApp.tsx`, `lib/install.ts`).

> **Précisions V4.2.** *Bouton :* encart sur l'écran de connexion tant que le jeu n'est pas ouvert comme une appli ; icône dans l'en-tête seulement si l'installation est réellement possible. *Comportement selon l'appareil :* Chrome, Edge et Android ouvrent l'invite native du navigateur (`beforeinstallprompt`, mise de côté au chargement) ; iPhone et iPad (y compris l'iPad qui se présente comme un Mac) affichent les 4 gestes Safari (Partager → « Sur l'écran d'accueil » → Ajouter) ; les autres navigateurs affichent les consignes du menu (Firefox sur ordinateur ne sait pas installer). Le mode est choisi par `installMode()` (`lib/installMode.ts`, testé). *Service worker :* enregistré uniquement sur le site publié ; il ne met en cache que les fichiers du site (même origine, GET), jamais les appels Supabase, Edge Functions ou météo. Page : réseau d'abord (une mise à jour publiée est visible au lancement suivant), copie de secours hors connexion ; fichiers `assets/` (noms hachés) : cache d'abord. Hors connexion, l'appli s'ouvre mais le jeu, qui vit sur le serveur, ne répond pas. *Icônes :* 192 px, 512 px, 512 px « maskable » (dessin dans la zone sûre), 180 px pour iOS, générées par `npm run icons` depuis `public/icons/icon.svg`.

- **Pastilles et notifications (V4.3) :** compteurs de non-lus calculés par la base (`unread_counts_for`, marques de lecture `player_read_marks`), notifications *Web Push* standard (Chrome, Edge, Firefox, Android, Safari iPhone / iPad 16.4+ une fois l'appli installée), sans service payant.

> **Précisions V4.3.** *Pastilles :* onglet Gazette = messages non lus de la place du village, de la salle de l'Agora et des chuchotements + Gazette du jour (1) ; onglet Agora = votes ouverts non exprimés + duels où l'on est engagé ; Mon métier = validations attendues par son rôle. Sans marque de lecture, seuls les 3 derniers jours comptent ; ses propres messages ne comptent pas. Ouvrir la Gazette ou un salon de la Taverne (onglet du navigateur affiché) le marque comme lu. Le total s'affiche sur l'icône de l'appli installée (Badging API). *Notifications :* déclencheurs SQL sur les nouveaux messages (place et salle de l'Agora → tous les autres joueurs ; chuchotement → destinataires ; messages système exclus), duels (les deux adversaires), propositions de l'Agora (« Une motion vous vise » pour la cible) et résultats des votes, validations demandées (joueurs du rôle requis), Gazette du jour, tentations (sans rien dévoiler). Une notification n'est mise en file que pour un joueur actif, abonné sur au moins un appareil et qui n'a pas coupé la catégorie ; les lignes réinsérées par une restauration (plus de 15 minutes) n'en produisent pas. La base réveille `daily-world-sync` (mode `push`, une fois par transaction, via `gaulois_call_world_sync` de `cron.sql`) ; la maintenance du quart d'heure vide aussi la file. Plusieurs messages d'une même catégorie sont regroupés (« · 3 nouveaux messages à la Taverne ») et remplacent la notification précédente sur l'appareil ; un clic ouvre l'écran concerné (`#/gazette/taverne`, `#/duel/<id>`…). *Sécurité :* messages chiffrés de bout en bout pour l'appareil (RFC 8291) et signés par le serveur (VAPID, RFC 8292), écrits en WebCrypto sans dépendance ; abonnements, préférences et file inaccessibles à la clé publique (RPC seulement) ; un abonnement refusé (404 / 410) est supprimé. *Clés :* paire VAPID générée une fois ; clé publique dans la variable GitHub `VITE_VAPID_PUBLIC_KEY` (site) et clé privée dans le secret GitHub `VAPID_PRIVATE_KEY`, recopiées dans les secrets Supabase par le workflow des Edge Functions. Sans clés, la file est vidée sans envoi. *iPhone / iPad :* les notifications exigent l'appli installée sur l'écran d'accueil.

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

> **Précisions V4.1.** *Clés Supabase :* le site accepte la nouvelle clé publique « Publishable » (`sb_publishable_…`) comme l'ancienne clé `anon` ; les Edge Functions lisent l'ancienne clé `SUPABASE_SERVICE_ROLE_KEY` si le projet la fournit, sinon la nouvelle clé secrète injectée dans `SUPABASE_SECRET_KEYS` (dictionnaire JSON, entrée `default`). Les secrets du jeu ne peuvent pas commencer par `SUPABASE_`. *Planification :* `cron.sql` refuse de s'exécuter tant que `<PROJECT_REF>` ou `<CRON_SECRET>` n'ont pas été remplacés, exige un secret d'au moins 24 caractères, et met à jour les secrets Vault et les tâches au lieu de les dupliquer s'il est rejoué. *Vérification :* `npm run deploy:check` contrôle en lecture seule la base, le refus des tables secrètes à la clé publique, le déploiement des trois fonctions (réponse du jeu et non de la passerelle, donc `verify_jwt = false` appliqué), le CORS pour l'adresse du site, le branchement du site sur Supabase (pas en mode démo) et, avec `--cron-secret`, la maintenance de bout en bout. *Garde-fou du code :* `npm run sql:check` vérifie que chaque RPC, vue, table, colonne, opération d'Edge Function et table Realtime utilisée par l'interface existe avec les droits de la clé publique. *Encodage (V4.2) :* les scripts SQL se copient avec `Get-Content … -Raw -Encoding UTF8` (sans cette option, Windows PowerShell 5.1 abîme accents et emojis) ; `deploy:check` signale un texte mal encodé en base et lit ses valeurs dans `.env.deploy` (que Vite ne charge pas : `npm run dev` reste en mode démo) et le secret dans `.env.cron`. *pg_safeupdate (V4.2) :* Supabase refuse tout `UPDATE` / `DELETE` sans `WHERE` venu de l'API, y compris à l'intérieur d'une fonction SQL (`village_state` n'a qu'une ligne : on écrit `WHERE revision = …` ou `WHERE TRUE`) ; `npm run sql:check` relit le corps de toutes les fonctions installées pour l'imposer, car PGlite n'a pas cette protection.

## Annexe A — Constantes d'équilibrage du moteur (générée depuis `src/engine/constants.ts`)

<!-- AUTO:CONSTANTS -->

## Annexe B — Catalogue des actions métiers (généré depuis `src/engine/actions.ts`)

<!-- AUTO:ACTIONS -->

## Annexe C — Catalogue fournisseurs (généré depuis `src/engine/catalog.ts`)

<!-- AUTO:CATALOG -->

## Annexe D — Historique des versions

<!-- AUTO:CHANGELOG -->
