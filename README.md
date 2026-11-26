# Les Gaulois & Micro-État

Simulation coopérative asynchrone pour 7 à 10 amis : un hameau en ruines des Pyrénées de Lleida, 295 000 € de dette, 3 Points d'Action par jour, une Agora le dimanche, des duels (Carlage 2×2 en direct ou épreuve de la cible en différé) pour trancher les vetos et un Maître du Jeu IA pince-sans-rire. Objectif : l'autonomie, puis le Micro-État souverain.

- **Game Design Document (source vivante) :** [docs/GDD.md](docs/GDD.md) → PDF à la racine : `Les Gaulois - Game Design Document & Architecture Technique V4.6.pdf` (versions précédentes dans `docs/archive/`)
- **Historique des versions :** [docs/CHANGELOG.md](docs/CHANGELOG.md)
- **Mise en ligne (≈ 20 min, 0 €) :** [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md)

## État d'avancement

| Étape | Contenu | État |
|---|---|---|
| 1 | Architecture, schéma SQL complet (tables, CHECK, index, RLS, RPC), seed | ✅ Livré, vérifié sur PostgreSQL (PGlite) |
| 2 | Moteur déterministe TypeScript `src/engine/` | ✅ Livré et testé |
| 3 | Edge Functions Supabase : `game-engine`, `gm-ai-action` (System Prompt + fallback), `daily-world-sync` (Open-Meteo, RSS, sauvegardes) + pg_cron | ✅ Livré, vérifié (Vitest, Deno, PGlite) — pas encore déployé |
| 4 | Interface React mobile-first : connexion PIN, 5 écrans, carte SVG, Agora, administration, arène du Carlage, épreuve de la cible, mode démo | ✅ Livré, testé dans un navigateur mobile (mode démo) — pas encore branché sur un vrai projet Supabase |
| 5 | Guide de déploiement express (Supabase + GitHub Pages), workflows GitHub Actions, `npm run deploy:check` | ✅ Livré — déploiement réel à faire en suivant [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) |

## Essayer tout de suite (mode démo)

```powershell
npm install
```

```powershell
npm run dev
```

Ouvrir l'adresse affichée (http://localhost:5173). Sans configuration Supabase, le jeu démarre une **partie locale au navigateur** : PIN `0000` pour tous, même moteur et mêmes règles que le serveur, et une « machine à remonter le temps » dans l'Administration (menu du compte sous l'avatar, connecté en Guillem).

## Coûts

| Poste | Coût |
|---|---|
| Site (GitHub Pages) | 0 € pour un dépôt public (dépôt privé : GitHub Pro) |
| Base, temps réel, Edge Functions (offre gratuite de Supabase) | 0 € — projet mis en pause après ~1 semaine sans activité, pas de sauvegardes Supabase automatiques (le jeu fait les siennes) |
| Maître du Jeu IA (API Claude, 10 à 20 appels/jour) | `claude-haiku-5-5` (défaut) < 1 $/mois · `claude-opus-5-5` ≈ 25-35 $/mois · sans clé : 0 € (dictionnaire de secours) |

Le modèle se règle par le secret `GM_MODEL` des Edge Functions, sans toucher au code.

## Où trouver quoi

| Chemin | Rôle |
|---|---|
| `docs/GDD.md` | GDD complet (règles, formules, SQL de référence, System Prompt IA, précisions V3.8-V4.0). Annexes A-D générées automatiquement. |
| `src/engine/` | Moteur : `simulation.ts` (`applyElapsedTime`), `actions.ts` (84 actions métiers), `formulas.ts`, `agora.ts`, `justice.ts`, `carlage.ts`, `targetTrial.ts` (épreuve de la cible), `migrants.ts`, `temptations.ts`, `aiDeltas.ts` (bornage IA), `hiddenIndicators.ts`, `constants.ts` (équilibrage). |
| `src/app/` | Interface React 19 + Vite + Tailwind v4 : `api/` (`supabase.ts` production, `demo.ts` mode démo), `state/`, `screens/` (Connexion, Carte, Métier, Agora, Trésor, Gazette, Duel, Admin), `components/`, `lib/`. |
| `supabase/migrations/` | Schéma SQL (migrations additives) : schéma V3.8, `engine_commit` (V3.9), épreuve de la cible (V4.0). |
| `supabase/seed.sql` | 7 fondateurs + 3 places, carte du hameau, grand livre d'ouverture. PIN initial : `0000`. |
| `supabase/setup_complete.sql` | Migrations + seed en un seul fichier à coller dans l'éditeur SQL Supabase (généré). |
| `supabase/functions/` | Edge Functions `game-engine`, `gm-ai-action`, `daily-world-sync` ; `_shared/core` (logique pure testée), `_shared/runtime` (Deno, Supabase, SDK Claude), `_shared/engine` (copie générée du moteur). Secrets : `.env.example`. |
| `supabase/cron.sql` | Planification pg_cron (nuit + maintenance toutes les 15 min), à exécuter une fois après déploiement. |
| `.github/workflows/deploy-pages.yml` | Tests + build + publication GitHub Pages à chaque push sur `main` (variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). |
| `.github/workflows/deploy-functions.yml` | Déploiement des 3 Edge Functions sur Supabase depuis GitHub (secret `SUPABASE_ACCESS_TOKEN`, variable `SUPABASE_PROJECT_REF`) : aucune CLI à installer. |
| `docs/DEPLOIEMENT.md` | Guide de déploiement express, mises à jour, sauvegardes, dépannage. |
| `tests/` | Tests Vitest du moteur (`tests/*.test.ts`), des fonctions (`tests/functions/`) et du mode démo (`tests/app/`). |
| `public/` | Application installable (V4.2) : `manifest.webmanifest`, `sw.js` (service worker : cache, notifications push V4.3), `icons/` (`npm run icons`). |
| `scripts/` | `check-sql.mjs` (PGlite + contrat interface ↔ base), `check-deploy.mjs` (vérification d'un déploiement réel), `bundle-sql.mjs`, `sync-engine.mjs`, `check-functions.mjs` (Deno), `build-gdd-pdf.mjs`, `build-icons.mjs`. |

## Commandes

```powershell
npm run check
```

`npm run check` = copie du moteur à jour + typecheck (moteur et interface) + tests + vérification SQL. Autres commandes :

| Commande | Effet |
|---|---|
| `npm run dev` | Interface en local (mode démo ; Supabase seulement si `.env.local` renseigne `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : à éviter une fois la partie en ligne) |
| `npm run build` | Build de production dans `dist/` (typecheck de l'interface inclus) |
| `npm test` | Tests Vitest (moteur, fonctions, mode démo) |
| `npm run typecheck` | Vérification TypeScript stricte (moteur + fonctions, puis interface) |
| `npm run engine:sync` | Recopie `src/engine` dans `supabase/functions/_shared/engine` (à lancer après toute modification du moteur ; `dev` et `build` le font) |
| `npm run functions:check` | Contrôle de types des 3 Edge Functions avec Deno (via npx, rien d'installé dans le projet) |
| `npm run sql:check` | Rejoue migrations + seed dans un PostgreSQL WebAssembly et exerce les RPC (PIN, Agora, veto, Taverne, RLS, sauvegardes, engine_commit, épreuve de la cible), simule `cron.sql` et vérifie que tout ce qu'appelle l'interface existe avec les bons droits |
| `npm run deploy:check` | Vérifie en lecture seule le projet Supabase et le site en ligne (valeurs dans `.env.deploy` et `.env.cron`, ou `--url … --key … --site …`) |
| `npm run icons` | Régénère les icônes PNG de l'application installable depuis `public/icons/icon.svg` (Chrome ou Edge requis) |
| `npm run sql:bundle` | Régénère `supabase/setup_complete.sql` |
| `npm run gdd:pdf` | Régénère le PDF du GDD depuis `docs/GDD.md` (Chrome ou Edge requis ; variable `CHROME_PATH` sinon) |

## Ajouter une idée ou une fonctionnalité

1. Décrire la mécanique dans `docs/GDD.md` (section concernée), incrémenter `version` dans l'en-tête et ajouter une entrée en tête de `docs/CHANGELOG.md`.
2. Si elle touche aux règles : l'implémenter dans `src/engine/` (+ tests), puis `npm run engine:sync` ; côté base, une **nouvelle** migration additive dans `supabase/migrations/` ; côté interface, `src/app/` (et le mode démo `src/app/api/demo.ts` s'il émule une nouvelle RPC).
3. `npm run check`, `npm run functions:check`, puis `npm run sql:bundle` et `npm run gdd:pdf` (l'ancien PDF va dans `docs/archive/`).

## Choix d'architecture (résumé)

- **Pas de Supabase Auth :** connexion par personnage + PIN haché ; la RPC `verify_player_pin` renvoie un jeton de session envoyé dans l'en-tête `x-player-token`, ce qui permet des politiques RLS par joueur, rôle et portefeuille.
- **Indicateurs cachés réellement cachés :** les tables `village_state` et `players` ne sont pas lisibles directement ; le client lit des vues publiques et ses propres indicateurs via RPC.
- **Moteur = source de vérité côté serveur :** `game-engine` charge l'état, applique le moteur, puis écrit tout en une transaction (`engine_commit`, contrôle de révision, 3 essais en cas d'écriture concurrente). L'interface n'écrit jamais l'état du village elle-même.
- **IA bornée et facultative :** le Maître du Jeu répond en JSON strict, le moteur plafonne chaque effet, et un dictionnaire déterministe prend le relais sans clé, en cas d'erreur ou de refus.
- **Déterminisme :** générateur pseudo-aléatoire à graine ; un tour rejoué donne exactement le même résultat (et les deux joueurs d'une épreuve de la cible voient la même séquence de cibles).

> Le projet est dans un dossier OneDrive : `node_modules/` (plusieurs centaines de Mo) est donc synchronisé lui aussi. Recommandation : déplacer le projet hors de OneDrive (ex. `C:\dev\les-gaulois`) avant de le mettre sous Git : c'est la première étape du [guide de déploiement](docs/DEPLOIEMENT.md).
