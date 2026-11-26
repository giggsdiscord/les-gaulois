-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Données initiales (GDD V3.8)
-- 7 fondateurs + 3 places évolutives, état initial du hameau (30 ha, Pyrénées de Lleida),
-- carte SVG (viewBox 1000 x 700), grand livre d'ouverture, Gazette n°0.
-- PIN initial de tous les personnages : 0000 (changement obligatoire à la 1re connexion).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. État global du village (valeurs par défaut du GDD §7.1)
-- ----------------------------------------------------------------------------
INSERT INTO village_state (id, real_weather_summary, real_news_headline)
VALUES ('00000000-0000-4000-8000-000000000001',
        'Ensoleillé, 14°C (Lleida)',
        'Arrivée des sept fondateurs au hameau');

-- ----------------------------------------------------------------------------
-- 2. Joueurs : 7 fondateurs + 3 places évolutives (inactives)
-- ----------------------------------------------------------------------------
INSERT INTO players (id, slot_number, display_name, character_name, role_code, role_title, avatar_emoji,
                     avatar_color, is_founder, is_active_slot, is_admin, veto_tokens, ministerial_portfolios)
VALUES
  ('10000000-0000-4000-8000-000000000001', 1, 'Ely', 'Pit', 'mayor_agri',
   'Maire, Agriculture & Écologie', '🌿', '#4d7c0f', TRUE, TRUE, FALSE, 1, '{}'),
  ('10000000-0000-4000-8000-000000000002', 2, 'Guillem', 'M. Lerme', 'treasurer_physio',
   'Trésorier & Kinésithérapeute', '💶', '#b45309', TRUE, TRUE, TRUE, 1, '{}'),
  ('10000000-0000-4000-8000-000000000003', 3, 'Tiphaine', 'Tiph', 'civil_eng',
   'Architecte, Génie Civil, PLU & Énergie', '📐', '#1d4ed8', TRUE, TRUE, FALSE, 1, '{}'),
  ('10000000-0000-4000-8000-000000000004', 4, 'Alex', 'Alex Joly', 'water_eng',
   'Ingénieur Polyvalent (Hydraulique, Réseaux & Génie Technique)', '💧', '#0e7490', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000005', 5, 'Julio', 'Julou', 'smith_diplo',
   'Forgeron, Subsistance & Co-diplomate', '⚒️', '#57534e', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000006', 6, 'Tanguy', 'Tango', 'druid',
   'Médecin-Druide & Scientifique Polyvalent (R&D, Chimie & Physique)', '🧪', '#7e22ce', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000007', 7, 'Guillaume B.', 'Brunel', 'priest_apoth',
   'Médecin-Apothicaire, Psychiatre-Psychologue & Prêtre', '✝️', '#991b1b', TRUE, TRUE, FALSE, 0, '{}'),
  ('10000000-0000-4000-8000-000000000008', 8, 'Place 8', 'À pourvoir', 'defense_sec',
   'Sécurité & Défense (Extérieure + Intérieure)', '🛡️', '#374151', FALSE, FALSE, FALSE, 0, '{defense,interior}'),
  ('10000000-0000-4000-8000-000000000009', 9, 'Place 9', 'À pourvoir', 'transport_customs',
   'Transports, Piste & Douanes', '🚚', '#374151', FALSE, FALSE, FALSE, 0, '{customs}'),
  ('10000000-0000-4000-8000-000000000010', 10, 'Place 10', 'À pourvoir', 'legal_media',
   'Chancellerie, Droit & Médias', '📰', '#374151', FALSE, FALSE, FALSE, 0, '{chancery,media}');

INSERT INTO player_pins (player_id, pin_hash)
SELECT id, extensions.crypt('0000', extensions.gen_salt('bf', 8)) FROM players;

-- ----------------------------------------------------------------------------
-- 3. Carte du hameau (30 ha) — bâtisses, réseaux, équipements
-- ----------------------------------------------------------------------------
INSERT INTO map_structures (code, kind, name, status, condition_pct, progress_pct, beds_capacity,
                            is_power_connected, plu_approved, x, y, width, height, path_points, notes)
VALUES
  -- Paysage
  ('foret_nord', 'forest', 'Bosc de la Solana', 'operational', 100, 100, 0, FALSE, TRUE, 0, 0, 1000, 110,
   '[[0,0],[1000,0],[1000,70],[820,110],[600,90],[380,110],[160,80],[0,120]]', 'Forêt communale, risque de cultures clandestines'),
  ('foret_ouest', 'forest', 'Bosc de l''Obaga', 'operational', 100, 100, 0, FALSE, TRUE, 0, 120, 120, 420,
   '[[0,120],[110,160],[90,300],[120,420],[60,520],[0,540]]', NULL),
  ('riu', 'river', 'Riu de la Vall', 'operational', 100, 100, 0, FALSE, TRUE, 640, 60, 340, 640,
   '[[980,60],[900,160],[820,260],[760,380],[700,520],[640,700]]', 'Débit réservé obligatoire pour les poissons de Julio'),
  ('piste', 'track', 'Pista forestal de Lleida', 'operational', 45, 100, 0, FALSE, TRUE, 0, 380, 430, 270,
   '[[0,650],[120,610],[220,560],[300,500],[360,440],[430,390]]', 'Accès unique non goudronné ; état = track_condition_pct'),
  ('placa', 'square', 'Plaça del Poble', 'operational', 70, 100, 0, FALSE, TRUE, 430, 330, 70, 50, NULL,
   'Agora du dimanche, Tribunal Public, pilori'),
  -- Bâtisses habitables au départ (12 lits PLU)
  ('casa_gran', 'building', 'Casa Gran', 'operational', 55, 100, 6, FALSE, TRUE, 360, 250, 70, 45, NULL,
   'Logement commun sommaire des fondateurs'),
  ('borda_pi', 'building', 'Borda del Pi', 'operational', 45, 100, 6, FALSE, TRUE, 520, 260, 60, 40, NULL,
   'Grange aménagée en dortoir'),
  -- Équipements existants
  ('cal_ferrer', 'forge', 'Cal Ferrer (forge)', 'operational', 40, 100, 0, FALSE, TRUE, 300, 360, 50, 35, NULL,
   'Forge rudimentaire de Julio'),
  ('esglesia', 'church', 'Església de Sant Climent', 'damaged', 35, 100, 0, FALSE, TRUE, 470, 170, 55, 60, NULL,
   'Messe dominicale, mariages et confessions de Brunel'),
  ('font_bosc', 'water_source', 'Font del Bosc (captage)', 'operational', 60, 100, 0, FALSE, TRUE, 820, 200, 26, 26, NULL,
   'Captage d''eau potable'),
  ('conduite_principale', 'pipe', 'Conduite principale', 'operational', 60, 100, 0, FALSE, TRUE, 460, 200, 360, 120,
   '[[820,210],[700,230],[560,280],[460,320]]', 'Réseau d''Alex ; alertes de fuite'),
  ('fossa_nord', 'septic_tank', 'Fossa sèptica nord', 'operational', 60, 100, 0, FALSE, TRUE, 380, 560, 40, 24, NULL,
   'Capacité 8 personnes'),
  ('hort_ely', 'garden', 'Hort d''Ely (potager)', 'operational', 70, 100, 0, FALSE, TRUE, 520, 440, 110, 70, NULL,
   'Potager commun ; tomates stockées à part'),
  -- Ruines rénovables
  ('cal_mestre', 'school', 'Cal Mestre (salle de classe)', 'ruin', 20, 0, 0, FALSE, FALSE, 250, 260, 50, 35, NULL,
   'École du hameau et apprentissage'),
  ('torre_vella', 'jail', 'Torre Vella (cachot)', 'ruin', 30, 0, 0, FALSE, FALSE, 560, 380, 34, 34, NULL,
   'Isolement de 24 h'),
  ('mas_era', 'gite', 'Mas de l''Era (futur gîte rural)', 'ruin', 25, 0, 8, FALSE, FALSE, 180, 180, 75, 45, NULL,
   'Randonneurs pyrénéens et spectateurs des BOR'),
  ('borda_alta', 'building', 'Borda Alta', 'ruin', 25, 0, 6, FALSE, FALSE, 620, 180, 60, 40, NULL, NULL),
  ('cal_pastor', 'building', 'Cal Pastor', 'ruin', 20, 0, 4, FALSE, FALSE, 280, 120, 50, 35, NULL, NULL),
  ('casa_riu', 'building', 'Casa del Riu', 'ruin', 30, 0, 5, FALSE, FALSE, 660, 300, 55, 38, NULL, NULL),
  ('cabana_moli', 'building', 'Cabana del Molí', 'ruin', 15, 0, 3, FALSE, FALSE, 740, 420, 40, 30, NULL,
   'En bord de rivière (zone humide, grenouilles)'),
  ('paller_nou', 'building', 'Paller Nou', 'ruin', 25, 0, 4, FALSE, FALSE, 420, 470, 50, 34, NULL, NULL),
  ('apotecaria', 'lab', 'Apotecària (laboratoire de Tango)', 'ruin', 25, 0, 0, FALSE, FALSE, 610, 470, 46, 32, NULL,
   'Laboratoire, apothicairerie, R&D'),
  -- Projets planifiés (Actes I à III)
  ('cleda', 'livestock_pen', 'Cleda (enclos brebis & cochons)', 'planned', 100, 0, 0, FALSE, FALSE, 150, 330, 90, 60, NULL,
   'Cheptel pastoral d''Ely et Julio'),
  ('grup_electrogen', 'generator', 'Grup electrogen', 'planned', 100, 0, 0, FALSE, FALSE, 330, 430, 30, 22, NULL,
   'Palier énergétique 2'),
  ('linia_aeria', 'power_line', 'Línia aèria (réseau de Tiphaine)', 'planned', 100, 0, 0, FALSE, FALSE, 0, 120, 400, 180,
   '[[0,120],[150,160],[300,250],[400,300]]', 'Palier énergétique 3, compteurs individuels'),
  ('microcentral', 'dam', 'Microcentral del Riu (barrage)', 'planned', 100, 0, 0, FALSE, FALSE, 860, 130, 50, 30, NULL,
   'Palier 4 ; veto écologique possible (famille de grenouilles)'),
  ('camp_solar', 'solar', 'Camp solar', 'planned', 100, 0, 0, FALSE, FALSE, 640, 560, 80, 50, NULL, 'Palier 4'),
  ('granja_calcul', 'mining_farm', 'Granja de càlcul (minage)', 'planned', 100, 0, 0, FALSE, FALSE, 760, 520, 50, 34, NULL,
   'Acte III : surplus hydroélectrique'),
  ('mirador_pista', 'watchtower', 'Mirador de la Pista', 'planned', 100, 0, 0, FALSE, FALSE, 140, 560, 22, 22, NULL,
   'Acte II : Défense'),
  ('barrera_pista', 'gate', 'Barrera de la Pista (herse)', 'planned', 100, 0, 0, FALSE, FALSE, 60, 625, 30, 14, NULL,
   'Acte II : Défense'),
  ('duana', 'border_post', 'Duana de la Pista (poste-frontière)', 'planned', 100, 0, 0, FALSE, FALSE, 15, 590, 34, 24, NULL,
   'Acte III : contrôle des passeports');

-- ----------------------------------------------------------------------------
-- 4. Grand livre d'ouverture (M. Lerme)
-- ----------------------------------------------------------------------------
INSERT INTO ledger_entries (account, player_id, amount_eur, label, category)
VALUES
  ('treasury', NULL, 50000.00, 'Fonds de roulement initial (apports des fondateurs)', 'opening'),
  ('land_debt', NULL, 295000.00, 'Emprunt foncier — achat du hameau (30 ha, PLU 2013)', 'opening');

INSERT INTO ledger_entries (account, player_id, amount_eur, label, category)
SELECT 'private', id, 2000.00, 'Épargne personnelle d''ouverture', 'opening' FROM players WHERE is_founder;

-- ----------------------------------------------------------------------------
-- 5. Gazette n°0, événement de lancement & message de bienvenue
-- ----------------------------------------------------------------------------
INSERT INTO gazette_editions (edition_date, headline, body_markdown, generated_by)
VALUES ((now() AT TIME ZONE 'Europe/Madrid')::date,
        'Sept Français rachètent un hameau fantôme au-dessus de Lleida',
        E'**Pyrénées de Lleida** — L''Ayuntamiento confirme la vente d''un hameau abandonné de 30 hectares, '
        'à 18 km d''Andorre, pour 295 000 €. Ni eau courante ni électricité : une piste forestière, des ruines, '
        'un potager et une famille de grenouilles. Les nouveaux propriétaires annoncent « une simple rénovation ». '
        'Personne n''y croit.',
        'manual');

INSERT INTO game_events (event_type, title, body, data)
VALUES ('game_started', 'Fondation du hameau',
        'Les sept fondateurs prennent possession des ruines. Acte I : le Chantier des Ruines.',
        '{"act": 1}'::jsonb);

INSERT INTO tavern_messages (channel, sender_id, content, is_system_event)
VALUES ('village_square', NULL,
        '🏔️ Bienvenue au hameau ! Caisse commune : 50 000 €. Dette foncière : 295 000 €. Bon courage.', TRUE);

COMMIT;
