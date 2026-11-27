# Idées d'amélioration du jeu — feuille de route

Liste demandée par l'utilisateur le 26/11/2026 : **toutes ces idées sont à réaliser**, une version à la fois, chacune **dans une nouvelle session** (moins de jetons consommés : une session neuve ne relit pas tout l'historique). Chaque session réalise l'élément suivant « À faire », le coche ici avec son commit, puis lance la session suivante.

## Ce qui a motivé ces idées (constats sur le moteur)
- Les tomates ne servaient qu'au lancer sur les BOR. *(réglé en V4.8)*
- Le bois, la pierre et le fer ne baissaient jamais tout seuls, et rien ne produisait du bois. *(bois réglé en V4.8)*
- Le pilier « dette » (20 points d'autonomie) bouge à peine : 360 € par semaine sur 295 000 €. *(remises d'emprunt des objectifs d'Acte en V5.1)*
- Peu de sources d'argent avant le gîte. *(marché ajouté en V4.8)*
- Les résidents (migrants) comptent surtout comme population : pas de travail à leur donner. *(réglé en V4.9)*
- Pas de collectif au quotidien : chacun joue ses 3 PA dans son coin. *(réglé en V5.0)*

## Ordre de réalisation

| Version | Contenu | État |
|---|---|---|
| V4.8 | **Marché d'Organyà** (vendre tomates, bois, conserves ; +30 % le samedi ; saturation hebdomadaire), **couper du bois**, **chauffage** des bâtisses chaque nuit froide, **conserves** de tomates | ✅ `0b2d35e` |
| V4.9 | **Travail des résidents** : affecter chaque résident à un poste (potager, forêt, chantier, forge, pâturage, réseau d'eau, piste…) ; production chaque nuit selon sa spécialité et son niveau ; interface dans Agora → Immigration (liste des résidents) ; Réserves et « À faire en priorité » à jour (résidents sans poste). **Complément V4.8** : droit de regard d'Ely sur les coupes de bois (elle peut interdire les coupes pour la semaine, comme son veto écologique) | ✅ `a650547` |
| V5.0 | **Chantier collectif de la semaine** : un projet choisi à l'Agora (ou proposé), tout le monde peut y mettre des PA, barre de progression commune, bonus si fini avant dimanche | ✅ `10f4091` |
| V5.1 | **Objectifs d'Acte en liste à cocher** (ex. Acte I : électricité, 20 lits, 300 m² de potager, gîte ouvert) avec une récompense à chaque étape | ✅ `954d9fa` |
| V5.2 | **Niveaux de métier visibles** (l'expérience `skill_xp` existe déjà : niveaux 2, 3, 4 = bonus), **mission du jour par métier** (petite récompense), **bonus d'action à deux** (deux joueurs agissent ensemble le même jour) | ✅ `18e6f8f` |
| V5.3 | **Élections vivantes** pour les places 8 à 10 à l'Acte II : candidats, programme, débat à la Taverne, vote | À faire |
| V5.4 | **Nouveaux bâtiments** : four à pain, fromagerie, chambre froide, scierie, moulin sur la rivière, lavoir (moins d'épidémies), infirmerie, poulailler, ruches, serre (légumes d'hiver), bar du hameau, hangar ; **choix d'une parcelle libre** sur la carte | À faire |
| V5.5 | **Améliorations par niveaux** (ex. Casa Gran niveau 2 : +2 lits, isolation → moins de bois) et **usure** des bâtiments (entretien régulier, plus rapide l'hiver) | À faire |
| V5.6 | **Filières** (lait → fromage, prunes → ratafia légal) avec **fromage vendu au marché d'Organyà**, **péremption** des vivres frais l'été sans chambre froide, **limites de stockage** (le hangar les relève) | À faire |
| V5.7 | **Calendrier catalan réel** : Sant Joan, Diada (11 septembre), Castanyada, Nadal et Caga Tió, Carnaval — chaque fête devient un événement avec une décision collective | À faire |
| V5.8 | **Résidents avec une personnalité** : prénom, humeur, relations, petites histoires dans la Gazette | À faire |
| V5.9 | **Relations avec les voisins** : jauges Organyà, mairie (Ayuntamiento), Mossos ; petites missions (« le maire d'Organyà demande de déneiger la route ») | À faire |
| V6.0 | **Visiteurs imprévus** à qui répondre vite : randonneur perdu, journaliste, inspecteur, vendeur ambulant | À faire |
| V6.1 | **Bilan de la semaine** dans la Gazette du dimanche (qui a fait quoi, records, « habitant de la semaine ») et **frise datée** des grandes étapes du hameau | À faire |

Les versions suivent le protocole de `CLAUDE.md` (+0,1 à chaque fois ; après V4.9 vient V5.0).

> **27/11/2026 :** l'utilisateur a retiré les **ambitions secrètes** de la feuille de route ; les versions suivantes ont été renumérotées (la colonne `players.ambition`, déjà créée, reste inutilisée).

## Liste complète des idées (texte proposé le 26/11/2026, à conserver tel quel)

L'utilisateur a demandé de **bien noter toutes ces idées** : rien ne doit être oublié. Entre crochets, la version qui s'en charge.

**Constats sur le moteur**
- Tomates : elles ne servent qu'au lancer sur les BOR. [✅ V4.8 : marché, conserves]
- Bois, pierre, fer : ces réserves ne baissent jamais toutes seules, et rien ne produit du bois : on ne peut que l'acheter. [✅ V4.8 pour le bois : coupe et chauffage ; pierre et fer : V5.5 usure et entretien]
- Dette : ce pilier (20 points d'autonomie) bouge à peine. Rembourser 295 000 € à 360 € par semaine prend des années. [à traiter au fil des versions : plus de revenus (marché, gîte, filières) et ✅ récompenses d'objectifs d'Acte V5.1 : remises d'emprunt]
- Argent : avant le gîte, presque rien ne rapporte. Une négociation donne 300 €, et l'autre source est une taxe votée à l'Agora. [✅ V4.8 marché ; V5.6 filières]
- Résidents : les migrants comptent surtout comme population, on ne peut pas leur donner de travail. [✅ V4.9]
- Pas de collectif : chacun joue ses 3 PA dans son coin, sans objectif commun du jour. [✅ V5.0]

**Progression**
- Objectifs d'Acte en liste à cocher : pour l'Acte I par exemple, électricité, 20 lits, 300 m² de potager, gîte ouvert. Chaque étape cochée donne une récompense, et c'est plus parlant qu'un pourcentage d'autonomie. [✅ V5.1]
- Chantier collectif de la semaine, voté à l'Agora : chacun peut y mettre des PA, une barre de progression est commune à tous, et un bonus tombe s'il est fini avant dimanche. [✅ V5.0]
- Niveaux de métier visibles : le moteur compte déjà l'expérience. Les niveaux 2, 3 ou 4 débloqueraient des bonus, par exemple +20 % sur les chantiers de Tiphaine ou une fournée double à la forge de Julio. [✅ V5.2]
- Frise du hameau : l'historique daté des grandes étapes, comme « groupe électrogène installé le… ». [V6.1]

**Ressources et économie**
- Marché du samedi à Organyà : vendre tomates, conserves, bois et fromage. L'argent viendrait alors du travail, pas seulement de la chance. [✅ V4.8 ; fromage en V5.6]
- Bois : une nouvelle action « Couper du bois » en forêt, avec un droit de regard d'Ely contre les coupes excessives. S'y ajoute le chauffage en hiver selon la température réelle : le bois devient vital quand il fait froid. [✅ V4.8 coupe et chauffage ; ✅ V4.9 droit de regard d'Ely]
- Filières de transformation : le lait devient du fromage, les tomates des conserves pour l'hiver, les prunes un ratafia légal. [✅ V4.8 conserves ; V5.6 fromage et ratafia]
- Péremption : les vivres frais se gâtent l'été sans chambre froide, ce qui donne une raison concrète de vouloir l'électricité. [V5.6]
- Stockage limité : un hangar augmente la quantité qu'on peut garder de chaque réserve. [V5.6]

**Rôles**
- Travail des résidents : affecter chaque migrant au potager, à la forêt, à un chantier ou à la forge, et il produit chaque nuit. Les migrants deviennent une vraie main-d'œuvre à gérer. [✅ V4.9]
- Ambitions secrètes : chaque joueur reçoit un objectif caché (devenir le plus riche, faire voter 3 lois…), révélé en fin de saison. Ça colle bien aux chuchotements, aux tentations et aux putschs. [❌ retirée le 27/11/2026 à la demande de l'utilisateur]
- Bonus d'action à deux : quand deux joueurs agissent ensemble le même jour (Tanguy et Brunel sur une cure, Ely et Julio en négociation), ils gagnent un bonus. [✅ V5.2]
- Mission du jour par métier : une action conseillée chaque jour, avec une petite récompense si elle est faite. [✅ V5.2]
- Élections vivantes pour les places 8 à 10 à l'Acte II : candidats, programme, débat à la Taverne. [V5.3]

**Constructions**
- Nouveaux bâtiments utiles : four à pain, fromagerie, chambre froide, scierie ; moulin sur la rivière, lavoir (moins d'épidémies), infirmerie ; poulailler et ruches, serre pour les légumes d'hiver, bar du hameau. [V5.4, avec le hangar]
- Améliorations par niveaux : par exemple Casa Gran niveau 2, avec 2 lits de plus et une meilleure isolation, donc moins de bois brûlé. [V5.5]
- Usure : les bâtiments s'abîment doucement (plus vite l'hiver), et l'entretien devient une tâche régulière. [V5.5]
- Choix d'une parcelle libre sur la carte pour un nouveau bâtiment. [V5.4]

**Vie du village**
- Calendrier catalan réel : Sant Joan, la Diada du 11 septembre, la Castanyada, Nadal et le Caga Tió, le Carnaval. Chaque fête devient un événement avec une décision collective. [V5.7]
- Résidents avec une personnalité : prénom, humeur, relations, petites histoires dans la Gazette. [V5.8]
- Relations avec les voisins : une jauge pour Organyà, une pour la mairie, une pour les Mossos, et de petites missions comme « le maire d'Organyà demande de déneiger la route ». [V5.9]
- Visiteurs imprévus à qui répondre vite : randonneur perdu, journaliste, inspecteur, vendeur ambulant. [V6.0]
- Bilan de la semaine dans la Gazette du dimanche : qui a fait quoi, les records, l'« habitant de la semaine ». [V6.1]

**Top 5 retenu en premier** (meilleur plaisir pour un effort raisonnable) : 1. marché du samedi avec de vrais usages pour les tomates et le bois [✅ V4.8] ; 2. travail des résidents [✅ V4.9] ; 3. chantier collectif de la semaine [✅ V5.0] ; 4. objectifs d'Acte à cocher avec récompenses [✅ V5.1] ; 5. ambitions secrètes [❌ retirée le 27/11/2026]. Le chauffage au bois en hiver, plus petit, a accompagné le premier [✅ V4.8].

## Méthode pour chaque session
1. Lire `CLAUDE.md` (protocole de documentation continue, conventions, section « Série vie du village ») puis ce fichier ; prendre la **première ligne « À faire »**.
2. Travailler dans `C:\dev\les-gaulois` (dépôt Git, branche `main`), jamais dans l'ancien dossier OneDrive.
3. Données nouvelles : d'abord la colonne JSONB `village_state.life` (clés facultatives, `lifeOf()` / `ensureLife()` dans `src/engine/life.ts`), puis les colonnes déjà préparées par la migration `20261201000100_vie_du_village.sql` (`village_migrants.work_post` et `traits`, `players.ambition`, `map_structures.variant` et `upgrade_level`). Une **nouvelle migration seulement si c'est indispensable** (l'utilisateur doit la coller à la main dans Supabase).
4. Moteur + tests Vitest + interface téléphone (mode démo) ; `npm run check`, `npm run functions:check` si les fonctions changent, `npm run sql:bundle`, `npm run gdd:pdf` (ancien PDF dans `docs/archive/`) ; GDD (+0,1, encadré « Précisions Vx.y »), `docs/CHANGELOG.md`, `CLAUDE.md`.
5. Cocher la ligne ici (« ✅ » + hash du commit), **commit local, sans pousser** (l'utilisateur décide de pousser). La migration de la V4.8 est déjà appliquée en production ; une éventuelle nouvelle migration devra l'être avant de pousser (l'utilisateur peut demander de l'appliquer via le connecteur Supabase).
6. Lancer la session suivante avec la même consigne, jusqu'à la fin de la liste. En cas d'échec bloquant, s'arrêter et le dire.

## Économiser les jetons
- Lire seulement les morceaux de fichiers utiles ; filtrer les sorties de commandes (`grep`, `tail`).
- Peu de captures d'écran (mesurer la mise en page par `getBoundingClientRect` plutôt).
- Modifier les fichiers avec l'outil Edit ; pas d'accent grave dans `node -e "…"`.
