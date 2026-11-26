# Idées d'amélioration du jeu — feuille de route

Liste demandée par l'utilisateur le 26/11/2026 : **toutes ces idées sont à réaliser**, une version à la fois, chacune **dans une nouvelle session** (moins de jetons consommés : une session neuve ne relit pas tout l'historique). Chaque session réalise l'élément suivant « À faire », le coche ici avec son commit, puis lance la session suivante.

## Ce qui a motivé ces idées (constats sur le moteur)
- Les tomates ne servaient qu'au lancer sur les BOR. *(réglé en V4.8)*
- Le bois, la pierre et le fer ne baissaient jamais tout seuls, et rien ne produisait du bois. *(bois réglé en V4.8)*
- Le pilier « dette » (20 points d'autonomie) bouge à peine : 360 € par semaine sur 295 000 €.
- Peu de sources d'argent avant le gîte. *(marché ajouté en V4.8)*
- Les résidents (migrants) comptent surtout comme population : pas de travail à leur donner.
- Pas de collectif au quotidien : chacun joue ses 3 PA dans son coin.

## Ordre de réalisation

| Version | Contenu | État |
|---|---|---|
| V4.8 | **Marché d'Organyà** (vendre tomates, bois, conserves ; +30 % le samedi ; saturation hebdomadaire), **couper du bois**, **chauffage** des bâtisses chaque nuit froide, **conserves** de tomates | ✅ `0b2d35e` |
| V4.9 | **Travail des résidents** : affecter chaque résident à un poste (potager, forêt, chantier, forge, pâturage, réseau d'eau, piste…) ; production chaque nuit selon sa spécialité et son niveau ; interface dans Agora → Immigration (liste des résidents) ; Réserves et « À faire en priorité » à jour (résidents sans poste) | À faire |
| V5.0 | **Chantier collectif de la semaine** : un projet choisi à l'Agora (ou proposé), tout le monde peut y mettre des PA, barre de progression commune, bonus si fini avant dimanche | À faire |
| V5.1 | **Objectifs d'Acte en liste à cocher** (ex. Acte I : électricité, 20 lits, 300 m² de potager, gîte ouvert) avec une récompense à chaque étape | À faire |
| V5.2 | **Ambitions secrètes** : chaque joueur reçoit un objectif caché (devenir le plus riche, faire voter 3 lois…), révélé en fin de saison | À faire |
| V5.3 | **Niveaux de métier visibles** (l'expérience `skill_xp` existe déjà : niveaux 2, 3, 4 = bonus), **mission du jour par métier** (petite récompense), **bonus d'action à deux** (deux joueurs agissent ensemble le même jour) | À faire |
| V5.4 | **Élections vivantes** pour les places 8 à 10 à l'Acte II : candidats, programme, débat à la Taverne, vote | À faire |
| V5.5 | **Nouveaux bâtiments** : four à pain, fromagerie, chambre froide, scierie, moulin sur la rivière, lavoir (moins d'épidémies), infirmerie, poulailler, ruches, serre (légumes d'hiver), bar du hameau, hangar ; **choix d'une parcelle libre** sur la carte | À faire |
| V5.6 | **Améliorations par niveaux** (ex. Casa Gran niveau 2 : +2 lits, isolation → moins de bois) et **usure** des bâtiments (entretien régulier, plus rapide l'hiver) | À faire |
| V5.7 | **Filières** (lait → fromage, prunes → ratafia légal), **péremption** des vivres frais l'été sans chambre froide, **limites de stockage** (le hangar les relève) | À faire |
| V5.8 | **Calendrier catalan réel** : Sant Joan, Diada (11 septembre), Castanyada, Nadal et Caga Tió, Carnaval — chaque fête devient un événement avec une décision collective | À faire |
| V5.9 | **Résidents avec une personnalité** : prénom, humeur, relations, petites histoires dans la Gazette | À faire |
| V6.0 | **Relations avec les voisins** : jauges Organyà, mairie (Ayuntamiento), Mossos ; petites missions (« le maire d'Organyà demande de déneiger la route ») | À faire |
| V6.1 | **Visiteurs imprévus** à qui répondre vite : randonneur perdu, journaliste, inspecteur, vendeur ambulant | À faire |
| V6.2 | **Bilan de la semaine** dans la Gazette du dimanche (qui a fait quoi, records, « habitant de la semaine ») et **frise datée** des grandes étapes du hameau | À faire |

Les versions suivent le protocole de `CLAUDE.md` (+0,1 à chaque fois ; après V4.9 vient V5.0).

## Méthode pour chaque session
1. Lire `CLAUDE.md` (protocole de documentation continue, conventions, section « Série vie du village ») puis ce fichier ; prendre la **première ligne « À faire »**.
2. Travailler dans `C:\dev\les-gaulois` (dépôt Git, branche `main`), jamais dans l'ancien dossier OneDrive.
3. Données nouvelles : d'abord la colonne JSONB `village_state.life` (clés facultatives, `lifeOf()` / `ensureLife()` dans `src/engine/life.ts`), puis les colonnes déjà préparées par la migration `20261201000100_vie_du_village.sql` (`village_migrants.work_post` et `traits`, `players.ambition`, `map_structures.variant` et `upgrade_level`). Une **nouvelle migration seulement si c'est indispensable** (l'utilisateur doit la coller à la main dans Supabase).
4. Moteur + tests Vitest + interface téléphone (mode démo) ; `npm run check`, `npm run functions:check` si les fonctions changent, `npm run sql:bundle`, `npm run gdd:pdf` (ancien PDF dans `docs/archive/`) ; GDD (+0,1, encadré « Précisions Vx.y »), `docs/CHANGELOG.md`, `CLAUDE.md`.
5. Cocher la ligne ici (« ✅ » + hash du commit), **commit local, sans pousser** (l'utilisateur décide de pousser ; la migration de la V4.8 doit être collée dans le SQL Editor avant).
6. Lancer la session suivante avec la même consigne, jusqu'à la fin de la liste. En cas d'échec bloquant, s'arrêter et le dire.

## Économiser les jetons
- Lire seulement les morceaux de fichiers utiles ; filtrer les sorties de commandes (`grep`, `tail`).
- Peu de captures d'écran (mesurer la mise en page par `getBoundingClientRect` plutôt).
- Modifier les fichiers avec l'outil Edit ; pas d'accent grave dans `node -e "…"`.
