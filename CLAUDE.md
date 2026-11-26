# CLAUDE.md — Mémoire de travail du projet « Les Gaulois & Micro-État »

Lu automatiquement au début de chaque session. À tenir à jour à chaque étape livrée.

## Contexte
- Jeu web mobile-first asynchrone pour 7 amis (10 max), en **français**. L'utilisateur écrit en français : répondre en français.
- Spécification de référence : `docs/GDD.md` (version dans l'en-tête YAML, actuellement 4.1). Les PDF précédents (dont la V3.7 d'origine) sont dans `docs/archive/`.
- Mission découpée en 5 étapes (voir README « État d'avancement ») : 1 SQL ✅, 2 moteur ✅, 3 Edge Functions ✅ (non déployées), 4 React ✅ (testé en mode démo), 5 guide de déploiement ✅ (`docs/DEPLOIEMENT.md`). Tout est livré ; reste le déploiement réel par l'utilisateur.
- Rien n'est déployé ; pas encore de dépôt Git (le guide fait copier le projet hors de OneDrive vers `C:\dev\les-gaulois` avant `git init`). L'utilisateur veut un coût limité à l'API de l'IA (infra gratuite : GitHub Pages + Supabase Free).

## Règle permanente demandée par l'utilisateur : documentation continue
À **chaque** nouvelle idée / fonctionnalité / règle donnée par l'utilisateur :
1. Mettre à jour `docs/GDD.md` (section concernée ; détails chiffrés dans un encadré « > **Précisions Vx.y.** »), incrémenter `version` (+0.1) et `date` dans l'en-tête.
2. Ajouter l'entrée en tête de `docs/CHANGELOG.md`.
3. Si la mécanique est implémentable : moteur `src/engine/` + tests `tests/`, puis `npm run engine:sync` ; SQL via une **nouvelle** migration additive (`supabase/migrations/AAAAMMJJHHMMSS_xxx.sql`, jamais `DROP`/renommage ; `REVOKE` explicite pour anon sur toute nouvelle fonction).
4. `npm run check` (copie moteur + typecheck + tests + SQL PGlite), `npm run functions:check` si les fonctions changent, puis `npm run sql:bundle` et `npm run gdd:pdf`.
5. Le nouveau PDF est écrit à la racine ; déplacer l'ancien PDF dans `docs/archive/`.
6. Mettre à jour ce fichier (état, décisions) et le README si la structure change.

## Conventions du moteur (`src/engine/`)
- Zéro dépendance ; imports relatifs **avec l'extension `.ts`** (compatibilité Deno pour les Edge Functions et `node` en strip-types pour `build-gdd-pdf.mjs`).
- Déterminisme strict : jamais `Math.random()` ni `Date.now()` dans le moteur ; utiliser `createRng(seed)` et le paramètre `now`.
- Fonctions pures : elles clonent l'instantané (`deepClone`) et renvoient `{ snapshot, events, ledger, screenings, approvals, triggers }`. Exceptions qui mutent l'instantané reçu : `closeProposal`, `executeProposal`, `applySentence`, `decideApproval`, `respondToTemptation`, `publishScandals`, `applyDuelConsequences` (appelées sur la copie de travail de `GameSession`).
- Champs en snake_case = colonnes SQL. Toute nouvelle colonne : `types.ts` + migration + `tests/fixtures.ts`.
- Constantes d'équilibrage uniquement dans `constants.ts`, annotées `[GDD §x]` quand elles viennent du GDD (Annexe A du PDF générée depuis ce fichier, Annexe B depuis `ACTIONS`, Annexe C depuis `CATALOG`).
- Jauges du village en `NUMERIC(5,2)` ; stocks entiers ; montants à 2 décimales.

## Conventions des Edge Functions (`supabase/functions/`)
- `_shared/engine/` = copie **générée** de `src/engine` (`npm run engine:sync`, vérifiée par `npm run engine:check`). Ne jamais l'éditer.
- `_shared/core/` = logique pure (aucun Deno/npm) testée par Vitest dans `tests/functions/` : `session.ts` (GameSession), `duel.ts`, `changes.ts` (diff → engine_commit), `world.ts` (Open-Meteo, RSS), `gm/` (prompt, schéma JSON, runner, dictionnaire de secours).
- `_shared/runtime/` = Deno / Supabase / SDK Claude, imports nus (`@supabase/supabase-js`, `@anthropic-ai/sdk`) résolus par `deno.json` (Deno) et `node_modules` (tsc). Les `index.ts` se limitent à `Deno.serve(handler(readEnv(Deno.env.get)))`.
- Contrôle Deno : `npm run functions:check` (npx deno@2.9.6). Les `deno.lock` des fonctions sont conservés.

## Conventions de l'interface (`src/app/`)
- React 19 + Vite 8 + Tailwind CSS v4 (thème dans `styles.css` via `@theme` : parchment, wood, moss, ember, river, gold, ink). Build : `base: './'` (marche quel que soit le nom du dépôt), routeur par ancre `#/nom/param` (`lib/router.ts`).
- Le front importe le moteur via `src/app/engine.ts` (ré-export de `_shared/engine`) ; `dev`/`build` lancent `engine:sync`.
- Contrat `GameApi` (`api/types.ts`) à deux implémentations : `SupabaseApi` (vues, RPC, Edge Functions, Realtime) et `DemoApi` (même `GameSession` dans le navigateur, localStorage `les-gaulois-demo-v4`, RLS émulée). Toute nouvelle RPC/op doit être ajoutée aux **deux**, et testée dans `tests/app/demoApi.test.ts`.
- `demo/seed.ts` est le miroir de `supabase/seed.sql` + défauts de `village_state` : `tests/app/demoSeed.test.ts` échoue s'ils divergent.
- `GameContext` : `perform(fn, succès)` = appel + toast + rechargement ; `useNow(ms)` = horloge du jeu (`api.now()`, décalable en démo). Ne pas passer de rappels instables comme dépendances d'effets longs (bug corrigé dans `TargetArena` : rappel lu via une ref).
- Typecheck séparé : `tsconfig.app.json` (DOM) ; `npm run typecheck` lance les deux configurations.
- Aperçu navigateur : `.claude/launch.json` (config `gaulois-demo`, port 5173).

## Déploiement (V4.1)
- **Jamais de CLI Supabase locale** : sur le PC de l'utilisateur, Windows (contrôle intelligent des applications) bloque `supabase.exe` non signé (notification « Une partie de cette application a été bloquée »). Ne pas tenter de contourner ; ne pas relancer `npx supabase`. Les Edge Functions se déploient par `.github/workflows/deploy-functions.yml` (`supabase/setup-cli@v3`, `supabase functions deploy --remote=$PROJECT_REF --yes`, secret `SUPABASE_ACCESS_TOKEN`, variable `SUPABASE_PROJECT_REF`).
- SQL : `setup_complete.sql` une seule fois (projet vide) ; ensuite chaque nouvelle migration seule dans le SQL Editor. `cron.sql` est rejouable et refuse les chevrons non remplacés.
- Clés : site = clé publique (`sb_publishable_…` ou ancienne `anon`) dans la variable `VITE_SUPABASE_ANON_KEY` ; fonctions = `serverSecretKey()` (`SUPABASE_SERVICE_ROLE_KEY`, sinon `SUPABASE_SECRET_KEYS` JSON, sinon `SB_SECRET_KEY`).
- `npm run sql:check` contient le **contrat interface ↔ base** (RPC + paramètres, relations + colonnes, droits anon, ops des fonctions, tables Realtime) : toute nouvelle lecture/RPC du client doit le passer. `npm run deploy:check` vérifie un vrai déploiement en lecture seule.
- Toute modification du parcours de déploiement : mettre à jour `docs/DEPLOIEMENT.md` et §7.8 du GDD.

## Décisions d'architecture prises
- (V3.8) PIN haché dans `player_pins` ; `verify_player_pin` → `{session_token, player}` ou `NULL` ; jeton dans l'en-tête `x-player-token` ; `current_player_id()` alimente la RLS ; `session_player(token)` pour les Edge Functions.
- (V3.8) `village_state`, `players`, `village_migrants` sans accès direct pour anon : vues publiques + RPC privées.
- (V3.9) Écriture moteur : `runGame()` → `engine_commit(révision, changements)` en une transaction, 3 essais sur `revision_conflict` ; le runner IA mémorise ses réponses (pas de double facturation). Maintenance : pas d'écriture si rien ne change (`isTrivial`).
- (V3.8) Agora : clôture dimanche 11:00 (Europe/Madrid), veto 6 h, puis exécution. Initiatives → tâche IA `initiative` (plafond ×2).
- Verrous : PA payés à la demande ; ré-exécution via `performAction(..., { executingApprovalGroup })`. `sanitizeActionInput` retire `approval_group` et impose l'acteur : ne jamais contourner.
- (V3.9) IA : SDK officiel `@anthropic-ai/sdk`, `client.beta.messages.create`, system prompt stable avec `cache_control`, `output_config.format` (schéma JSON strict), effort `low`, `fallbacks: "default"` pour Opus 5.5 / Opus 5 / Sonnet 5.5 / Fable 5.1-5.2, timeout 45 s, 1 nouvel essai. Modèle par défaut **`claude-haiku-5-5`** (< 1 $/mois) — **décidé par l'utilisateur** en V4.0 ; `claude-opus-5-5` reste possible via `GM_MODEL`.
- (V3.9) `verify_jwt = false` (config.toml) : authentification par jeton de session ou `x-cron-secret` (pg_cron, secrets dans Vault via `supabase/cron.sql`).
- (V3.9) Carlage : fenêtre de 120 s pour la 1re manche, manches de 10 s + 3 s de révélation, abandon > 60 s résolu par la maintenance ; putsch créé la nuit du samedi.
- (V4.0) Duels « Les deux » (décision de l'utilisateur) : le challenger choisit `mode` = `carlage` (direct, condition des 3 PA, champion sinon) ou `target` (épreuve de la cible, différé 24 h, tout joueur libre, sans blessure). Le putsch se joue en `target` avec échéance Agora + 6 h (17:00). Séquence de cibles déterministe par id de duel ; le serveur recalcule le score depuis les taps (`sanitizeTaps`, `scoreTargetTrial`). Résultats secrets tant que le duel est actif (RLS de `target_trial_results`). Côté client, une épreuve commencée est mémorisée (localStorage, clé duel + joueur) et envoyée partielle si l'écran est quitté.
- Realtime : chuchotements protégés par RLS non diffusés à anon → la Taverne les relit toutes les 15 s (onglet Chuchotements) et à chaque envoi.
- PGlite (check-sql) ne sait pas revenir d'un `SET SESSION AUTHORIZATION` : les tests « appel non fiable » restent en fin de script.

## Reste à faire (prochaines étapes)
- Accompagner le déploiement réel (suivre `docs/DEPLOIEMENT.md`) ; à la première mise en ligne, faire tourner `npm run deploy:check` et corriger ce qui ne passe pas contre un vrai projet (`SupabaseApi`, Realtime, CLI v3 dans le workflow n'ont jamais tourné en réel).
- Ensuite : nouvelles idées de l'utilisateur selon le protocole de documentation continue.

## Commandes utiles
`npm run dev` · `npm run build` · `npm run check` · `npm test` · `npm run engine:sync` · `npm run functions:check` · `npm run sql:check` · `npm run sql:bundle` · `npm run gdd:pdf` · `npm run deploy:check -- --url … --key … --site …`
