# Guide de déploiement express — Les Gaulois & Micro-État

Environ **20 minutes**, entièrement gratuit (seule l'API de l'IA est payante, et facultative). À la fin :

- le jeu en ligne sur `https://<pseudo>.github.io/les-gaulois/`, jouable sur téléphone et ordinateur ;
- la base, le temps réel et les 3 Edge Functions sur l'offre gratuite de Supabase ;
- les tâches automatiques (Gazette de minuit, Agora du dimanche, sauvegardes) planifiées ;
- chaque mise à jour du code publiée automatiquement par un simple `git push`.

**Rien à installer en plus** de Node.js et Git (déjà présents). La CLI Supabase n'est pas nécessaire : les Edge Functions sont déployées par GitHub Actions. Sur un PC Windows protégé par le contrôle intelligent des applications, l'exécutable non signé de la CLI est d'ailleurs bloqué : ne désactivez pas cette protection, ce guide l'évite.

Dans ce guide, remplacez :

| Repère | Exemple | Où le trouver |
|---|---|---|
| `<ref>` | `abcdefghijklmnop` | Supabase > Settings > General > Project ID |
| `<clé publique>` | `sb_publishable_…` (ou l'ancienne clé `anon`, longue chaîne `eyJ…`) | Supabase > Settings > API Keys |
| `<pseudo>` | `monpseudo` | votre identifiant GitHub |
| `<CRON_SECRET>` | 48 caractères aléatoires | généré à l'étape 0 |

> Ne mettez **jamais** la clé secrète (`sb_secret_…` ou `service_role`) dans le site, GitHub ou ce guide : seules les Edge Functions l'utilisent, et Supabase la leur fournit tout seul.

---

## 0. Préparer (3 min)

1. Créez si besoin un compte [GitHub](https://github.com/signup) et un compte [Supabase](https://supabase.com/dashboard) (connexion avec GitHub possible). Pour l'IA : un compte sur la [console Anthropic](https://console.anthropic.com), une clé API et quelques dollars de crédit (Claude Haiku 5.5 coûte moins de 1 $ par mois pour ce jeu). Pensez à fixer une limite de dépense mensuelle dans la console.
2. **Sortez le projet de OneDrive** (recommandé : OneDrive synchronise inutilement `node_modules` et peut verrouiller des fichiers pendant `git`). Depuis le dossier actuel du projet :

```powershell
robocopy . C:\dev\les-gaulois /E /XD node_modules dist .vite
```

(`robocopy` renvoie le code 1 quand la copie a réussi.) Puis travaillez dans la copie :

```powershell
cd C:\dev\les-gaulois
```

```powershell
npm ci
```

```powershell
npm run check
```

3. Générez le secret partagé avec les tâches planifiées et gardez-le dans votre gestionnaire de mots de passe :

```powershell
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## 1. Créer le projet Supabase (3 min)

1. [Tableau de bord Supabase](https://supabase.com/dashboard) → **New project**.
2. Nom : `les-gaulois` · mot de passe de base : générez-le et conservez-le · région : **Europe** (Paris ou Francfort) · offre **Free**.
3. Attendez la fin de la création (1 à 2 minutes), puis notez :
   - le **Project ID** (`<ref>`) : Settings > General ;
   - l'**URL** du projet : `https://<ref>.supabase.co` ;
   - la **clé publique** : Settings > API Keys > *Publishable key* (`sb_publishable_…`). Si l'onglet des anciennes clés est affiché, la clé `anon` convient aussi.

## 2. Installer la base de données (2 min)

1. Copiez le script complet dans le presse-papiers :

```powershell
Get-Content supabase\setup_complete.sql -Raw -Encoding UTF8 | Set-Clipboard
```

> **`-Encoding UTF8` est indispensable** : sans lui, Windows PowerShell 5.1 lit le fichier en ANSI et tous les accents et emojis arrivent abîmés dans la base (`TrÃ©sorier` au lieu de `Trésorier`).

2. Supabase > **SQL Editor** > **New query** → collez → **Run**. Résultat attendu : *Success. No rows returned*.
3. Contrôle (nouvelle requête) :

```sql
SELECT display_name, is_active_slot FROM players_public ORDER BY slot_number;
```

10 lignes : les 7 fondateurs actifs et 3 places libres. Tous les PIN valent `0000` pour l'instant.

> `setup_complete.sql` est fait pour un projet **vide**. Ne le relancez jamais sur une partie en cours : les évolutions futures arrivent sous forme de petites migrations (voir « Mettre à jour le jeu »).

## 3. Poser les secrets des Edge Functions (2 min)

Supabase > **Edge Functions** > **Secrets** ([lien direct](https://supabase.com/dashboard/project/_/functions/secrets)) → ajoutez :

| Nom | Valeur | Obligatoire |
|---|---|---|
| `CRON_SECRET` | le secret généré à l'étape 0 | oui |
| `ALLOWED_ORIGIN` | `https://<pseudo>.github.io` (sans `/les-gaulois`, sans `/` final) | oui |
| `GM_MODEL` | `claude-haiku-5-5` | conseillé (c'est aussi la valeur par défaut) |
| `ANTHROPIC_API_KEY` | `sk-ant-…` | non : sans clé, le Maître du Jeu utilise son dictionnaire de secours (0 €) |

Facultatifs : `GM_EFFORT` (`low`), `GM_TIMEOUT_MS` (`45000`), `TEMPTATION_CHANCE_PCT` (`20`), `RSS_FEEDS`, `WEATHER_LAT`, `WEATHER_LON`, `WEATHER_LABEL` (modèle commenté : `supabase/functions/.env.example`). Les noms commençant par `SUPABASE_` sont réservés : l'URL et la clé secrète du projet sont injectées automatiquement.

## 4. Publier sur GitHub (5 min)

1. **Créez un dépôt vide** : [github.com/new](https://github.com/new) → nom `les-gaulois` → **Public** → ne cochez ni README ni .gitignore.
   - Public est nécessaire pour GitHub Pages gratuit (privé : abonnement GitHub Pro). Le dépôt public montre le code et le GDD (prénoms et surnoms des joueurs) ; les PIN et la partie restent dans Supabase.
2. Dans le dépôt : **Settings > Secrets and variables > Actions**.
   - Onglet **Variables** → *New repository variable* (trois fois) :

| Variable | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `<clé publique>` (publishable ou anon) |
| `SUPABASE_PROJECT_REF` | `<ref>` |

   - Onglet **Secrets** → *New repository secret* : `SUPABASE_ACCESS_TOKEN` = un jeton personnel Supabase créé sur [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) (*Generate new token*, nom `github-les-gaulois`).
3. **Settings > Pages** > *Build and deployment* > Source : **GitHub Actions**.
4. Envoyez le code (dans `C:\dev\les-gaulois`) :

```powershell
git init -b main
```

```powershell
git add .
```

```powershell
git commit -m "Les Gaulois V4"
```

```powershell
git remote add origin https://github.com/<pseudo>/les-gaulois.git
```

```powershell
git push -u origin main
```

   Si `git commit` réclame une identité : `git config --global user.name "Votre nom"` et `git config --global user.email "adresse@exemple.fr"`. Le premier `git push` ouvre une fenêtre de connexion GitHub.

5. Onglet **Actions** du dépôt : deux workflows démarrent.
   - **Déploiement GitHub Pages** (≈ 1 min) : tests, build, publication du site.
   - **Déploiement des Edge Functions** (≈ 2 min) : tests, puis `game-engine`, `gm-ai-action` et `daily-world-sync` envoyées sur Supabase (vérification JWT désactivée par `supabase/config.toml`).

   Les deux doivent finir en vert. Si l'un a démarré avant que vous ayez posé les variables : ouvrez-le > **Run workflow** (ou *Re-run all jobs*).

> Avec la CLI GitHub (`gh auth login` au préalable), l'étape 2 peut se faire en ligne de commande, par exemple `gh variable set SUPABASE_PROJECT_REF --body "<ref>" --repo <pseudo>/les-gaulois` et `gh secret set SUPABASE_ACCESS_TOKEN --repo <pseudo>/les-gaulois` (la valeur est alors demandée sans apparaître à l'écran).

## 5. Planifier les tâches automatiques (2 min)

Une fois les Edge Functions déployées :

1. Copiez le script :

```powershell
Get-Content supabase\cron.sql -Raw -Encoding UTF8 | Set-Clipboard
```

2. SQL Editor > New query → collez → remplacez **`<PROJECT_REF>`** par votre `<ref>` et **`<CRON_SECRET>`** par votre secret (le même qu'à l'étape 3) → **Run**. Le script refuse de s'exécuter si un chevron reste, et peut être relancé sans risque (il met à jour au lieu de dupliquer).
3. Contrôle :

```sql
SELECT jobname, schedule, active FROM cron.job;
```

Deux tâches : `gaulois-nightly` (23:05 UTC, soit 00:05 à Madrid en hiver) et `gaulois-maintenance` (toutes les 15 minutes : Agora du dimanche 11:00, veto, duels, sauvegarde pré-Agora). Un quart d'heure plus tard, les appels doivent répondre 200 :

```sql
SELECT id, status_code, left(content, 120) FROM net._http_response ORDER BY id DESC LIMIT 5;
```

## 6. Vérifier le déploiement (1 min)

Depuis le PC :

```powershell
npm run deploy:check -- --url https://<ref>.supabase.co --key <clé publique> --site https://<pseudo>.github.io/les-gaulois/
```

Le script contrôle, **sans rien modifier** : la base installée, les tables secrètes bien refusées à la clé publique, les 3 Edge Functions déployées et joignables depuis le site (CORS), et le site branché sur Supabase (et non en mode démo). Ajoutez `--cron-secret <CRON_SECRET>` pour tester aussi la maintenance planifiée de bout en bout. Les valeurs peuvent aussi être placées dans un fichier `.env.deploy` à la racine (`VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…`, `SITE_URL=…`) et le secret seul dans `.env.cron` : tous deux sont ignorés par Git, et la commande devient simplement `npm run deploy:check`. Évitez `.env.local` : Vite le lit aussi, et `npm run dev` se brancherait alors sur la vraie partie au lieu du mode démo.

## 7. Première connexion et PIN (2 min)

1. Ouvrez `https://<pseudo>.github.io/les-gaulois/` : plus de bandeau « Mode démo ».
2. **Guillem** (administrateur) se connecte avec `0000` : le jeu impose aussitôt un nouveau PIN.
3. Onglet **Admin** > *Maître du Jeu* : vérifiez « Modèle : claude-haiku-5-5 » et « clé API configurée ». Facultatif : *Lancer la nuit* pour publier une première Gazette.
4. Envoyez le lien aux 6 autres **dans votre groupe privé**, et demandez-leur de se connecter le jour même : tant qu'un joueur n'a pas choisi son PIN, `0000` reste valable pour son personnage. Un PIN oublié se réinitialise dans Admin > *Joueurs & places* (le joueur devra en choisir un nouveau).
5. Installez l'appli : sur l'écran de connexion, bouton **Installer** de l'encart « Installer l'appli ». Sur Android, Chrome et Edge, le navigateur propose aussitôt l'installation ; sur iPhone / iPad, suivez les consignes affichées (Safari > Partager > **Sur l'écran d'accueil**). L'icône Les Gaulois apparaît alors parmi les applications et le jeu s'ouvre en plein écran.
6. Notifications : icône de **cloche** en haut de l'écran > *Activer les notifications*, puis choisir ce que l'on veut recevoir (sur iPhone / iPad, installer l'appli d'abord). Les pastilles rouges fonctionnent sans rien activer.
7. Places 8 à 10 : Admin > *Ouvrir la place*, prénom, personnage et PIN provisoire.

---

## Mettre à jour le jeu

| Changement | Que faire |
|---|---|
| Interface, moteur, Edge Functions | `npm run check` puis `git add .`, `git commit`, `git push`. Le site se republie tout seul ; les Edge Functions aussi si `src/engine/`, `supabase/functions/` ou `supabase/config.toml` ont changé. Après une modification du moteur, lancez `npm run engine:sync` avant le commit (le workflow le vérifie). |
| Notifications push (clés VAPID) | Une paire de clés, générée une fois : variable GitHub `VITE_VAPID_PUBLIC_KEY` (clé publique, lue par le site) et secret GitHub `VAPID_PRIVATE_KEY`. Le workflow « Déploiement des Edge Functions » les recopie dans les secrets Supabase à chaque exécution. Sans elles, les pastilles marchent mais aucune notification n'est envoyée. |
| Base de données | Le nouveau fichier `supabase/migrations/AAAAMMJJHHMMSS_….sql` **seul** dans le SQL Editor, après une sauvegarde (Admin > *Sauvegarder* et *Exporter (JSON)*). Jamais `setup_complete.sql` sur une partie en cours. |
| Réglages de l'IA | Supabase > Edge Functions > Secrets (ex. `GM_MODEL` = `claude-opus-5-5` pour une plume plus riche, ≈ 25-35 $/mois). Si le changement ne semble pas pris en compte, relancez le workflow « Déploiement des Edge Functions ». |
| Redéployer à la main | Onglet Actions > workflow voulu > **Run workflow**. |

## Sauvegardes et offre gratuite

- Le jeu sauvegarde **chaque nuit** (30 jours conservés) et **avant chaque Agora** ; restauration en un clic dans Admin. L'offre gratuite de Supabase ne fait pas de sauvegarde automatique de son côté : exportez la partie en JSON (Admin > *Exporter*) chaque semaine et gardez le fichier hors de Supabase.
- Un projet gratuit est **mis en pause après environ une semaine sans activité**. Avec des joueurs quotidiens, cela n'arrive pas ; sinon : tableau de bord Supabase > le projet > **Restore** (les données sont conservées), puis attendez quelques minutes.

| Poste | Coût |
|---|---|
| GitHub Pages + GitHub Actions (dépôt public) | 0 € |
| Supabase Free (base, temps réel, Edge Functions, pg_cron) | 0 € |
| Maître du Jeu IA | `claude-haiku-5-5` < 1 $/mois · `claude-opus-5-5` ≈ 25-35 $/mois · sans clé : 0 € |

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Accents et emojis illisibles (`TrÃ©sorier`, `ðŸŒ¿`) | Script SQL copié sans `-Encoding UTF8` | Partie encore vierge uniquement : effacer le schéma `public`, puis recoller `setup_complete.sql` (avec `-Encoding UTF8`) et `cron.sql`. Demandez de l'aide avant si des joueurs ont déjà joué. |
| Le site affiche « Mode démo » | Variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` absentes au moment du build | Posez-les (étape 4.2), puis Actions > *Déploiement GitHub Pages* > Run workflow. |
| Workflow Pages en échec à l'étape *deploy* | Pages pas encore réglé sur « GitHub Actions » | Settings > Pages > Source : GitHub Actions, puis *Re-run all jobs*. |
| Workflow Edge Functions « skipped » | Variable `SUPABASE_PROJECT_REF` absente | Ajoutez-la, puis Run workflow. |
| Workflow Edge Functions : *Unauthorized* / *invalid access token* | Secret `SUPABASE_ACCESS_TOKEN` absent, faux ou révoqué | Recréez un jeton sur supabase.com/dashboard/account/tokens et remplacez le secret. |
| Workflow : « Copie du moteur périmée » (`engine:check`) | Moteur modifié sans `npm run engine:sync` | Lancez-le, commitez `supabase/functions/_shared/engine`, poussez. |
| « Impossible de joindre le hameau » ou erreur CORS dans la console du navigateur | `ALLOWED_ORIGIN` différent de l'adresse du site | Exactement `https://<pseudo>.github.io` (sans chemin ni `/` final). |
| `deploy:check` : « réponse de la passerelle et non du jeu » | Vérification JWT active sur la fonction | Relancez le workflow des Edge Functions (il applique `verify_jwt = false`), ou désactivez la vérification JWT dans les réglages de la fonction sur Supabase. |
| « Session invalide ou expirée » | PIN réinitialisé ou session révoquée | Se reconnecter avec le PIN. |
| « Trop de tentatives » | 5 PIN faux de suite | Attendre 5 minutes, ou réinitialisation par l'administrateur. |
| Pas de Gazette au réveil | Tâches cron absentes ou secret différent | `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;` et `net._http_response` : un code 401 signifie que `CRON_SECRET` diffère entre Vault et les secrets des fonctions → relancez `cron.sql` avec le bon secret. |
| Gazette « édition de secours » | Pas de clé IA, clé invalide ou crédit épuisé | Admin > Maître du Jeu > *Derniers appels* affiche l'erreur ; vérifiez `ANTHROPIC_API_KEY` et le crédit Anthropic. |
| PIN administrateur oublié | — | SQL Editor (remplace le PIN de Guillem par `0000`, à changer à la connexion) : voir ci-dessous. |

```sql
UPDATE player_pins
   SET pin_hash = extensions.crypt('0000', extensions.gen_salt('bf', 8)), failed_attempts = 0, locked_until = NULL
 WHERE player_id = '10000000-0000-4000-8000-000000000002';
UPDATE players SET must_change_pin = TRUE WHERE id = '10000000-0000-4000-8000-000000000002';
```
