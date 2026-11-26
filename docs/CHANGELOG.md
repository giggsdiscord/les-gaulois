# Historique des versions du GDD

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
