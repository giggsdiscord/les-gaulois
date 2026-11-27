# Historique des versions du GDD

### V5.7 — 27/11/2026 — Résidents avec une personnalité
- **Caractère** (§4.8) : chaque résident est bosseur, boute-en-train, ronchon, frileux, gourmand, solitaire ou bavard (tiré de son identifiant, stable).
- **Humeur** 0–100 chaque nuit : le travail, le repas et les amis la font monter ; l'inactivité, la faim, le froid, une blessure ou un rival au même poste la font baisser. Joyeux (≥ 75) : rendement +10 % ; maussade (< 30) : −15 %.
- **Relations** : un ami pour chacun (sauf le solitaire), un rival pour le ronchon.
- **Petites histoires** dans la Gazette (section « Petite histoire du hameau », « Au coin du feu » dans l'édition de secours) : écrites par le moteur, sans IA.
- Nouvelle action « Encourager un résident » (1 PA, +15 d'humeur, une fois par jour) ; humeur et caractère dans Agora → Immigration ; priorité « Remonter le moral ». Aucune migration (`village_migrants.traits`, `village_state.life.story_last`) ; 11 nouveaux tests Vitest (dont l'écriture réelle de `traits` par `engine_commit`).

### V5.6 — 27/11/2026 — Filières, péremption & stockage
- **Filières** (§5.8) : le lait devient du **fromage** (fromagerie : 2 kg par nuit avec au moins 2 bêtes ; action « Faire du fromage » : 4 rations de lait → 3 kg) ; le verger donne des **prunes** l'été et l'automne, distillées en **ratafia légal** (10 kg + 15 € → 6 bouteilles).
- **Marché d'Organyà** : fromage (14 €/kg) et ratafia (11 € la bouteille) s'ajoutent aux tomates, au bois et aux conserves.
- **Péremption** : l'été ou par forte chaleur, sans chambre froide, une part des rations, des tomates et des prunes se gâte chaque nuit.
- **Limites de stockage** : chaque réserve a une capacité, relevée par le hangar (×1,5 / ×2 / ×2,5 selon son niveau) ; le surplus se perd la nuit.
- Réserves du Trésor (fromage, prunes, ratafia, capacités, pertes) et quatre nouvelles priorités. Aucune migration (`village_state.life.pantry`, `supply_last`) ; 13 nouveaux tests Vitest.

### V5.5 — 27/11/2026 — Niveaux & usure des bâtisses
- **Usure** (§5.7) : chaque nuit, les bâtisses en service perdent un peu d'état (0,25 à 0,7 point selon la saison, +0,2 les nuits de gel) ; sous 30 %, elles sont **endommagées** (lits et effet perdus jusqu'à la réparation).
- **Entretien** : nouvelle action « Entretenir une bâtisse » (1 PA, 2 pierres et 1 fer, +20 % d'état, sans dépense) ; les résidents du chantier entretiennent aussi les bâtisses sous 70 %. La pierre et le fer retrouvent un usage régulier.
- **Améliorations par niveaux** : nouvelle action « Améliorer une bâtisse (niveau) » pour les logements, le gîte et les nouveaux bâtiments, jusqu'au niveau 3 (800 € puis 1 500 €, avec pierre, fer et bois) : +2 lits, isolation (−25 % puis −50 % de bois de chauffage), +50 % de production par niveau pour un nouveau bâtiment, usure plus lente.
- Fiche d'une bâtisse : carte « Entretien & niveau » (étoiles, usure par nuit, coût du niveau suivant) ; priorité « Entretenir » ; Réserves de pierre, fer et bois à jour. Aucune migration (`upgrade_level`, `condition_pct`, `village_state.life.wear_acc`) ; 15 nouveaux tests Vitest (dont l'écriture réelle par `engine_commit`).

### V5.4 — 27/11/2026 — Nouveaux bâtiments & parcelles libres
- **Douze nouveaux bâtiments** (§5.6) : four à pain, fromagerie, chambre froide, scierie, moulin sur la rivière, lavoir, infirmerie, poulailler, ruches, serre, bar du hameau, hangar ; chacun donne son effet chaque nuit une fois en service (rations, santé, moral et recettes, outils, bois à la coupe, épidémies divisées par deux).
- **Choix d'une parcelle libre sur la carte** : 11 parcelles (3 en bord de rivière pour le moulin et le lavoir) ; on touche le « + », on choisit le bâtiment, la caisse paie le plan (1 PA) ; le chantier avance ensuite par la rénovation, plus vite pour les petits bâtiments. Deux projets à la fois, un bâtiment de chaque sorte.
- Carte : icône, toit et libellé propres à chaque bâtiment ; Réserves du Trésor et « À faire en priorité » à jour. Aucune migration (`kind = 'building'` + `variant`, `village_state.life.parcels`) ; 18 nouveaux tests Vitest (dont l'insertion réelle par `engine_commit`).

### V5.3 — 27/11/2026 — Élections vivantes des portefeuilles
- **Élections vivantes** (§2.2) : tant qu'une place 8 à 10 est vacante, ses portefeuilles débloqués sont mis en jeu un à un (Défense, Intérieur, Douanes dès l'Acte II ; Chancellerie, Médias à l'Acte III).
- **Candidatures avec programme** (3 jours, 1 PA), **débat à la Taverne** (1 intervention par jour et par candidat, 1 PA), **vote secret** (2 jours, 0 PA, pas pour soi) ; dépouillement de nuit, égalité départagée par la présence au débat.
- **Mandat de 4 semaines** pour l'élu·e (+10 XP ; participation ≥ 50 % : moral +2 %) ; sans candidat, report d'une semaine. La motion « Élection à un portefeuille » vaut mandat.
- Carte « Élection » (accueil, Agora, Taverne) et priorités « Voter / Se présenter / Défendre votre programme ». Aucune migration (`village_state.life.election`, `election_last`, `mandates`) ; 15 nouveaux tests Vitest.

### V5.2 — 27/11/2026 — Niveaux de métier, mission du jour & binômes
- **Niveaux de métier visibles** (§2.3) : 150 / 400 / 800 XP pour les niveaux 2, 3, 4 ; +10 / +20 / +30 % de rendement dans son métier ; fournée double à la forge de Julio au niveau 4 ; passage de niveau annoncé.
- **Mission du jour** par joueur : une action conseillée de son métier (faisable ce jour-là), +20 XP et moral du village +1 % si elle est faite ; carte « Niveau & mission » en tête du menu Agir et ligne dans « À faire en priorité ».
- **Binômes** : deux joueurs qui font une action du même groupe (négociation, soins, chantier, terre & forêt, réseaux, forge) le même jour : +25 % de rendement (+15 points en négociation), +10 XP chacun, annonce publique.
- Aucune migration (`village_state.life.missions_done`, `duo_day`) ; 15 nouveaux tests Vitest.

### V5.1 — 27/11/2026 — Objectifs d'Acte en liste à cocher
- **Une liste à cocher par Acte** (§1.3) : Acte I électricité, 20 lits, 500 m² de potager, piste à 70 %, gîte ouvert ; Acte II barrage ou solaire, 30 lits, 10 bêtes, 5 résidents au travail, un quart de l'emprunt remboursé ; Acte III Constitution, dissuasion 3, moitié de l'emprunt, indépendance.
- **Une récompense par étape**, versée une seule fois dès que l'étape est atteinte (action, nuit ou maintenance) : surtout des **remises sur l'emprunt foncier** (le pilier dette bouge enfin), plus moral ou matériaux ; **prime de fin de liste** (10 000 €, 20 000 €, 30 000 € d'emprunt effacés).
- Accueil : pastilles des étapes et prochaine étape dans « À faire en priorité », fenêtre « Objectifs de l'Acte » ; les priorités qui cochent une étape portent le badge « 🎯 Objectif d'Acte ».
- Aucune nouvelle migration (`village_state.life.act_goals`) ; 11 nouveaux tests Vitest.

### V5.0 — 27/11/2026 — Chantier collectif de la semaine
- **Un projet commun par semaine** (§5.5) : corvée de bois, journée de la piste, curage des canaux, agrandissement du potager, coup de main au chantier le plus avancé ou fête du hameau.
- Tout le monde y met des PA (1 point par PA, 2 pour le métier du projet ; objectif 2 points par fondateur actif) ; **barre de progression commune** sur l'accueil et à l'Agora.
- **Achevé avant dimanche** : effet ×1,5 et moral +3 % ; achevé le dimanche : effet simple ; inachevé le lundi : moral −2 %.
- **Vote** pour le projet de la semaine suivante parmi trois propositions (0 PA) ; sans vote, le hameau retient le plus utile du moment. Le premier chantier s'ouvre à la première nuit.
- « À faire en priorité » rappelle le chantier en cours ; aucune nouvelle migration (`village_state.life`).
- 13 nouveaux tests Vitest.

### V4.9 — 27/11/2026 — Travail des résidents & droit de regard d'Ely sur la forêt
- **Un poste pour chaque résident** (§4.7) : potager, forêt, chantier, forge, pâturage, réseau d'eau ou piste ; tout le monde l'affecte, sans PA. Chaque nuit, il produit selon son poste : rations et tomates, bois, avancement ou réparation des bâtisses (1 pierre par nuit), entretien des outils et recyclage de la ferraille, lait, réseau d'eau, piste.
- Au poste de sa **spécialité**, un résident rend +25 % par niveau (×1,25 à ×2,25) ; places comptées (un jardinier par 100 m², un berger pour 10 bêtes) ; sans poste, au chantier privé, au cachot, blessé ou trop faible, il ne produit rien ; la grève divise le travail par deux.
- **Droit de regard d'Ely** (§5.4) : elle peut interdire les coupes de bois jusqu'au lundi (motif obligatoire) et rouvrir la forêt plus tôt ; les bûcherons résidents entretiennent alors la forêt.
- Agora → Immigration : carte « Résidents au travail » (production prévue cette nuit, nuit dernière) et fenêtre de choix du poste ; Réserves du hameau et « À faire en priorité » tiennent compte des résidents (résidents sans poste, bois de chauffage bûcherons déduits).
- Aucune nouvelle migration (colonne `work_post` et `village_state.life` préparées en V4.8).
- 19 nouveaux tests Vitest.

### V4.8 — 26/11/2026 — Marché, bois de chauffage & conserves
- **Marché d'Organyà** (§5.4) : tout le monde peut vendre tomates, bois et conserves pour la caisse commune ; +30 % le samedi, prix qui baissent à mesure que la semaine sature, plafond hebdomadaire par produit, meilleurs prix avec l'espagnol.
- **Couper du bois** dans la forêt communale (≈ 8 stères par séance) ; au-delà de 10 coupes par semaine, la forêt souffre et les agents rurals peuvent verbaliser.
- **Chauffage** : chaque nuit sous 10 °C (température réelle), les bâtisses habitées brûlent 1 à 3 stères ; sans bois, moral −2 % et santé −1 par fondateur.
- **Conserves** : 10 kg de tomates → 8 rations pour l'hiver.
- Réserves du hameau et « À faire en priorité » mis à jour (bois de chauffage, tomates à écouler, marché pour renflouer la caisse).
- Migration additive `20261201000100_vie_du_village.sql` (à exécuter seule dans le SQL Editor) : prépare aussi les versions suivantes (postes des résidents, ambitions secrètes, nouveaux bâtiments).
- 8 nouveaux tests Vitest.

### V4.7 — 26/11/2026 — Carte du hameau illustrée et pratique
- Plan dessiné (§6.3) : prés et courbes de niveau, forêts plantées, rivière au courant animé, piste colorée selon son état, conduite d'eau et ligne électrique avec poteaux ; bâtisses avec ombre et toits (église et clocher, forge et cheminée…), ruines en pointillés avec gravats, chantiers sous échafaudage avec le toit posé à mesure de l'avancement ; neige ou pluie réelles affichées.
- Pastilles lisibles sur téléphone pour chaque ouvrage : icône, couleur de l'état, badges ⚡ 🐸 💧, avancement en % ; les ouvrages des priorités du moment pulsent.
- Calques avec compteurs : À faire, Logements, Chantiers, Énergie, Eau.
- Mode **Explorer** plein écran : glisser, pincer ou double-toucher pour zoomer, boutons + / − / vue d'ensemble, boussole, échelle, noms des lieux, vue **Liste** classée (à traiter, chantiers, ruines, projets…) ; le bouton retour du téléphone le ferme.
- Fiche d'ouvrage repensée : **prochaine étape** expliquée (séances restantes, raccordement, gîte à ouvrir, ce qui attend un Acte suivant), qui peut le faire, bouton pour agir sur le bon ouvrage, chiffres clés.
- 11 nouveaux tests Vitest (cadrage et zoom, calques, liste, prochaine étape pour tous les ouvrages et fondateurs, ouvrage visé).

### V4.6 — 26/11/2026 — Le jeu s'explique : priorités et réserves
- Accueil : carte **« À faire en priorité »** (§6.3) — barre d'autonomie jusqu'au prochain Acte et les 3 prochaines étapes selon l'avancement du hameau (groupe électrogène d'abord, puis raccordements, ligne aérienne, eau, potager, gîte…), urgences en tête (vivres, outils, échéances impayées, courant, fuites, pression administrative, gasoil).
- Chaque priorité explique **pourquoi maintenant**, ce que ça rapporte, **qui peut le faire** (« vous » si c'est votre métier), les verrous (validation du trésorier au-delà de 500 €, accord PLU, caisse insuffisante, veto, matériaux) et propose **« Faire maintenant »** avec la fenêtre d'action pré-remplie.
- Fenêtre **« Comprendre la progression »** : le but, les deux verrous, l'Acte et les six piliers de l'autonomie (énergie, eau, nourriture, dette, logement, souveraineté) avec la façon de les faire monter.
- Trésor : les **Réserves du hameau** affichent le rythme de chaque stock et la durée restante ; un appui détaille ce qui le remplit et le vide chaque jour, à quoi il sert et comment s'en procurer (actions des métiers, catalogue au prix du jour, boutons « Faire » / « Commander »).
- 7 nouveaux tests Vitest (priorités selon l'avancement, urgences, « vous », réserves calculées comme le moteur).

### V4.5 — 26/11/2026 — Propositions discrètes plus variées
- Banque de **94 situations en 15 thèmes** pour les Tentations & Dérives (§6.2) : tournées, fêtes de village (Festa Major, calçotada, matança, correfoc), contrebande andorrane, jeux d'argent, stupéfiants et alambics, escapades (Caldea, Port Ainé, Salou), romances, affaires de cœur, pots-de-vin, combines sur la caisse, militantisme, rivalités entre fondateurs, ressources du village, médias, et tentations propres au métier de chaque fondateur.
- **Plus de répétition rapprochée** : un joueur ne reçoit pas deux fois la même situation à moins de 24 dilemmes d'écart, change de thème à chaque fois (3 derniers thèmes évités) et alterne les catégories ; la météo réelle écarte les situations hors saison.
- Le **Maître du Jeu IA** reçoit le thème imposé et les titres des 8 derniers dilemmes du joueur, avec consigne de ne rien reprendre ; system prompt élargi à des dilemmes variés et concrets.
- Les Edge Functions relisent l'historique des dilemmes (120 jours) la nuit et lors d'un envoi par l'administrateur ; le mode démo profite des mêmes règles. Aucune migration SQL (les trois catégories restent celles de la base).
- 16 nouveaux tests Vitest (variété, déterminisme, rôles, météo, effets bornés, historique, message à l'IA).

### V4.4 — 26/11/2026 — Ergonomie téléphone
- L'application est pensée pour le seul téléphone (§6.3) : 5 onglets pour tous (Hameau, Métier, Agora, Trésor, Gazette) ; l'administration passe dans le **menu du compte** (avatar) avec Ma fiche, Notifications, Installer l'appli, PIN et déconnexion ; toucher les PA de l'en-tête ouvre le Métier.
- Fenêtres : le **bouton retour du téléphone** les ferme (au lieu de quitter l'écran), comme la croix, le fond ou un glissé vers le bas ; bouton principal collé en bas ; sous-onglets dans l'adresse (`#/metier/fiche`, `#/agora/duels`…).
- Accueil : carte **« Aujourd'hui »** (proposition discrète en suspens, validations, scrutins non votés, PA restants, non-lus, candidats, compte à rebours de l'Agora), un appui pour y aller.
- Métier : fiche compacte, sous-onglets Agir / Ma fiche / Journal ; **menu d'actions classées par type** (10 catégories en tuiles, métier en tête) au lieu d'une longue liste, recherche, actions récentes, raison affichée quand une action n'est pas jouable ; fenêtre d'action avec verrous expliqués, joueurs en boutons, quantités − / +, résultat affiché dans la fenêtre et « Refaire ».
- Administration en 4 sous-onglets : Partie (état, points à surveiller, activité des joueurs), Joueurs (liste → fiche), Sauvegardes (restauration expliquée), MJ (IA) ; gestes lourds confirmés par double appui.
- Gazette : **duels à part** dans le fil des événements (Faits de jeu / Duels), faits majeurs mis en relief.
- Correctifs : statut et action des validations affichés en français ; candidat présélectionné depuis l'Immigration ; 156 tests Vitest (dont menu d'actions, raisons de blocage, « À faire », fil des événements).

### V4.3 — 26/11/2026 — Pastilles rouges & notifications
- Pastilles de non-lus sur les onglets (Taverne, chuchotements, Gazette, votes, validations, duels) et sur l'icône de l'appli installée ; lecture marquée à l'ouverture d'un salon ou de la Gazette (§7.6).
- Notifications push sur téléphone et ordinateur, même appli fermée : Taverne, chuchotement, duel, Agora (proposition, motion visant le joueur, résultat), validation, Gazette, proposition discrète ; réglage par catégorie (icône de cloche) ; regroupement des messages d'une même catégorie.
- Migration `20261130000100_notifications.sql` (marques de lecture, abonnements, préférences, file, déclencheurs, RPC) ; envoi par `daily-world-sync` (mode `push`) avec chiffrement RFC 8291 et VAPID en WebCrypto ; clés VAPID via GitHub.
- Correctif IA : chaque appel au Maître du Jeu échouait (« The compiled grammar is too large ») et tombait sur le dictionnaire de secours ; un schéma JSON par tâche (`GM_SCHEMAS`), au plus deux unions, testé.
- Les fenêtres (feuilles) s'affichent au-dessus de la navigation basse, même ouvertes depuis l'en-tête.

### V4.2 — 26/11/2026 — Application installable
- Le jeu s'installe comme une application depuis le navigateur (§7.6) : manifeste `public/manifest.webmanifest`, icônes (192, 512, maskable, iOS ; `npm run icons`), service worker `public/sw.js` (fichiers du site uniquement, jamais les appels Supabase ; page réseau d'abord).
- Bouton « Installer l'appli » : encart sur l'écran de connexion, icône dans l'en-tête quand c'est possible ; invite native sur Chrome / Edge / Android, consignes Safari sur iPhone / iPad, consignes du menu ailleurs.
- Correctif : toute action jouée en ligne échouait (« Erreur interne du moteur ») car Supabase (pg_safeupdate) refuse un `UPDATE` sans `WHERE`, même dans une fonction ; migration `20261129000100_safeupdate_where.sql` (`engine_commit`, `restore_daily_snapshot`). `sql:check` contrôle désormais toutes les fonctions installées, et un test rejoue une action réelle jusqu'à `engine_commit`.
- `deploy:check` lit `.env.deploy` (et le secret dans `.env.cron`) : un `.env.local` rempli faisait passer `npm run dev` sur la vraie partie au lieu du mode démo.

### V4.1 — 26/11/2026 — Déploiement express
- Guide pas à pas `docs/DEPLOIEMENT.md` (≈ 20 min, §7.8) : projet Supabase, `setup_complete.sql`, secrets, dépôt GitHub, tâches planifiées, vérification, premières connexions, mises à jour, sauvegardes, dépannage.
- Aucune CLI requise sur le PC : nouveau workflow `.github/workflows/deploy-functions.yml` (déploiement des Edge Functions par GitHub Actions, `supabase/setup-cli@v3`).
- `npm run deploy:check` : vérification en lecture seule d'un déploiement réel (base, droits de la clé publique, fonctions, CORS, site branché sur Supabase, maintenance).
- `supabase/cron.sql` rejouable et protégé (valeurs à remplacer, secret ≥ 24 caractères) ; Edge Functions compatibles avec les nouvelles clés Supabase (`SUPABASE_SECRET_KEYS`, clé publique `sb_publishable_…`).
- Correctif (premier déploiement réel) : les commandes de copie des scripts SQL utilisent `-Encoding UTF8` (sinon Windows PowerShell 5.1 abîme accents et emojis) ; `deploy:check` détecte désormais un texte mal encodé en base.
- `npm run sql:check` vérifie désormais le contrat complet entre l'interface et la base (RPC, colonnes, droits, opérations, Realtime) et simule la planification ; 129 tests Vitest.

### V4.0 — 26/11/2026 — Interface mobile, épreuve de la cible & mode démo
- Interface React 19 + Vite + Tailwind CSS v4 (§6.3, §7.6) : connexion par PIN, carte SVG interactive, Mon Métier (actions, validations, délégation, indicateurs cachés), Agora (initiatives, motions, immigration & démographie, Tribunal, Constitution, duels), Trésorerie & fournisseurs, Gazette & Taverne en temps réel, administration (sauvegardes, import/export, places 8-10, PIN, Maître du Jeu).
- Nouveau duel en différé, **l'épreuve de la cible** (§6.1 bis) : 5 cibles, 50 % précision + 50 % rapidité, faux départ et cible manquée à 0, même séquence pour les deux joueurs, 24 h pour jouer, sans blessure. Le challenger choisit Carlage 2 × 2 (en direct) ou épreuve de la cible ; le putsch se joue à la cible jusqu'à 17:00 (Agora + 6 h).
- Migration additive `20261128000100_target_trial.sql` (mode du duel, résultats, RPC `target_submit`), moteur `targetTrial.ts`, opération `carlage_challenge` avec `mode`.
- **Mode démo** : partie locale au navigateur, même moteur et même session que les Edge Functions, règles d'accès émulées, machine à remonter le temps.
- Maître du Jeu IA : modèle par défaut **`claude-haiku-5-5`** (< 1 $/mois), décision des joueurs (§7.2).
- Publication automatique GitHub Pages (`.github/workflows/deploy-pages.yml`) ; 125 tests Vitest (dont mode démo et cohérence du seed démo avec `seed.sql`).

### V3.9 — 26/11/2026 — Edge Functions & Maître du Jeu IA
- Trois Edge Functions Deno écrites et vérifiées (§7.7) : `game-engine` (moteur faisant autorité : tick, actions, verrous, tentations, Carlage), `gm-ai-action` (Action Libre IA et tâches d'administration), `daily-world-sync` (nuit : sauvegarde, météo Open-Meteo, RSS, scandales, Gazette, migrants, tentations ; maintenance toutes les 15 min : Agora, veto, duels, sauvegarde pré-Agora).
- Maître du Jeu IA (§7.2) : SDK officiel Anthropic, *system prompt* stable mis en cache, sortie JSON stricte par schéma, effort `low`, repli serveur sur refus, modèle réglable (`GM_MODEL`, défaut `claude-opus-5-5`), journal des appels, dictionnaire de secours déterministe complet.
- Migration additive `engine_commit` : écriture atomique de toutes les conséquences d'une requête, avec concurrence optimiste.
- Planification pg_cron + Vault (`supabase/cron.sql`), configuration Supabase (`config.toml`), modèle de secrets (`.env.example`).
- Précisions de règles : déroulé exact d'un duel (fenêtre de 2 min, manches de 10 s, abandon, champions, répression du putsch), cadence des dossiers migrants (lundi, mercredi, vendredi) et des tentations (20 % par nuit), Gazette quotidienne.
- 108 tests Vitest, vérifications SQL PGlite étendues, contrôle de types et essai d'exécution sous Deno.

### V3.8 — 26/11/2026 — Consolidation technique & moteur implémenté
- §7.1 et §7.2 complets (schéma SQL V3.7 et System Prompt V3.7 intégraux) ; §7.1 bis liste les écarts du schéma exécutable.
- Sécurité : PIN haché (bcrypt) dans `player_pins`, jetons de session, en-tête `x-player-token`, RLS par joueur / rôle / portefeuille, vues publiques sans indicateurs cachés.
- Moteur déterministe TypeScript livré (`src/engine/`) : `applyElapsedTime()`, 84 actions métiers, verrous PLU / budget / veto écologique, délégation, Agora, Tribunal, migrants, natalité, Carlage, tentations, bornage IA, indicateurs cachés — 79 tests.
- Précisions chiffrées ajoutées dans chaque section (encadrés « Précisions V3.8 ») ; matrice de résolution exacte du Carlage (§6.1) ; bornage chiffré des réponses IA (§7.2) ; calcul de l'autonomie (§1.3).
- Nouvelles tables : carte (`map_structures`), unions, auscultations, Constitution, coups secrets du Carlage, grand livre, verrous, tentations, Gazette, journal d'événements, appels IA.
- Restauration de sauvegarde robuste (compatible migrations additives, sauvegarde « avant restauration »).
- Annexes A à C générées automatiquement depuis le code (constantes, actions, catalogue fournisseurs).

### V3.7 — Sauvegardes quotidiennes multi-jours
- Table `daily_snapshots`, captures chaque nuit et avant l'Agora sur 30 jours glissants, restauration à J−1, J−2, J−7… en un clic, export / import JSON manuel.

### V3.6 — Initiatives législatives hebdomadaires
- Table `agora_proposals` : 1 initiative par joueur et par semaine avec détail explicatif complet, vote nominatif OUI / NON, exécution des effets par le moteur et l'IA.

### V3.5 — Authentification légère par PIN
- Grille des 7 fondateurs + 3 places, connexion par code PIN à 4 chiffres (`verify_player_pin`), mémorisation sur l'appareil, délégation de poste et isolement au cachot.

### V3.3 – V3.4 — Idéologie, productivité & économie parallèle
- Spectre Droite / Gauche, malus collectiviste et effondrement soviétique, factions et putsch, Tribunal Public ; propriété privée vs collectivisation, contrebande andorrane, marché noir, élevage, gîte, minage et dissuasion.

### V3.2 — Alcool, stupéfiants & insécurité
- Jauges d'alcool, de stupéfiants et d'addiction, paliers d'exposition, formules de productivité et d'insécurité.

### V3.1 — Démographie & natalité
- Taux d'homosexualité, natalité effective saisonnière, pérennité démographique, unions, école du hameau, apprentissage et extinction démographique.
