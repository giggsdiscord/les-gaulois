-- ============================================================================
-- V4.3 — Notifications : pastilles « non lu » et notifications push (Web Push)
-- ============================================================================
-- * player_read_marks  : dernière lecture de chaque zone (Taverne, salle de l'Agora,
--                        chuchotements, Gazette) → compteurs de non-lus (pastilles rouges).
-- * push_subscriptions : appareils abonnés aux notifications (un par navigateur / appli installée).
-- * notification_prefs : catégories choisies par chaque joueur.
-- * notification_queue : notifications à envoyer, remplie par des déclencheurs ; l'Edge Function
--                        daily-world-sync (mode « push ») la vide et envoie les messages chiffrés.
-- Aucun accès direct pour la clé anon : RPC uniquement. Migration additive.
-- Sur Supabase, tout UPDATE / DELETE porte une clause WHERE (pg_safeupdate).
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_read_marks (
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  area TEXT NOT NULL CHECK (area IN ('village_square', 'agora_hall', 'whisper', 'gazette')),
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, area)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_player ON push_subscriptions(player_id);

CREATE TABLE IF NOT EXISTS notification_prefs (
  player_id UUID PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  categories TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id BIGSERIAL PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('taverne', 'chuchotement', 'duel', 'agora', 'validation', 'gazette', 'prive')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '#/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending ON notification_queue(id) WHERE sent_at IS NULL;

ALTER TABLE player_read_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON player_read_marks, push_subscriptions, notification_prefs, notification_queue FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE notification_queue_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON player_read_marks, push_subscriptions, notification_prefs, notification_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE notification_queue_id_seq TO service_role;

-- ----------------------------------------------------------------------------
-- Catégories (toutes actives par défaut)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _notification_categories() RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY['taverne', 'chuchotement', 'duel', 'agora', 'validation', 'gazette', 'prive']::text[];
$$;

-- ----------------------------------------------------------------------------
-- Compteurs de non-lus d'un joueur (pastilles de l'interface et de l'icône de l'appli)
-- Sans marque de lecture, seuls les 3 derniers jours comptent.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION unread_counts_for(p_player uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_floor timestamptz := now() - interval '3 days';
  v_square int; v_hall int; v_whisper int; v_gazette int; v_votes int; v_approvals int; v_duels int;
  v_seen_square timestamptz; v_seen_hall timestamptz; v_seen_whisper timestamptz; v_seen_gazette timestamptz;
BEGIN
  SELECT * INTO v_me FROM players WHERE id = p_player;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('village_square', 0, 'agora_hall', 0, 'whisper', 0, 'gazette', 0, 'votes', 0, 'approvals', 0, 'duels', 0, 'total', 0);
  END IF;
  SELECT
    max(seen_at) FILTER (WHERE area = 'village_square'),
    max(seen_at) FILTER (WHERE area = 'agora_hall'),
    max(seen_at) FILTER (WHERE area = 'whisper'),
    max(seen_at) FILTER (WHERE area = 'gazette')
  INTO v_seen_square, v_seen_hall, v_seen_whisper, v_seen_gazette
  FROM player_read_marks WHERE player_id = p_player;

  SELECT count(*) INTO v_square FROM tavern_messages
   WHERE channel = 'village_square' AND sender_id IS DISTINCT FROM p_player
     AND created_at > greatest(coalesce(v_seen_square, v_floor), v_floor);
  SELECT count(*) INTO v_hall FROM tavern_messages
   WHERE channel = 'agora_hall' AND sender_id IS DISTINCT FROM p_player
     AND created_at > greatest(coalesce(v_seen_hall, v_floor), v_floor);
  SELECT count(*) INTO v_whisper FROM tavern_messages
   WHERE channel = 'whisper' AND p_player = ANY(recipient_ids) AND sender_id IS DISTINCT FROM p_player
     AND created_at > greatest(coalesce(v_seen_whisper, v_floor), v_floor);
  SELECT least(count(*), 1) INTO v_gazette FROM gazette_editions
   WHERE created_at > greatest(coalesce(v_seen_gazette, v_floor), v_floor);
  SELECT count(*) INTO v_votes FROM agora_proposals
   WHERE status = 'open' AND closes_at > now()
     AND NOT (p_player = ANY(votes_yes) OR p_player = ANY(votes_no));
  SELECT count(*) INTO v_approvals FROM pending_approvals
   WHERE status = 'pending' AND required_role = v_me.role_code;
  SELECT count(*) INTO v_duels FROM carlage_duels
   WHERE status = 'active' AND (player_a_id = p_player OR player_b_id = p_player);

  RETURN jsonb_build_object(
    'village_square', v_square, 'agora_hall', v_hall, 'whisper', v_whisper, 'gazette', v_gazette,
    'votes', v_votes, 'approvals', v_approvals, 'duels', v_duels,
    'total', v_square + v_hall + v_whisper + v_gazette + v_votes + v_approvals + v_duels);
END;
$$;

-- ----------------------------------------------------------------------------
-- RPC joueur (jeton x-player-token)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION my_unread_counts() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  RETURN unread_counts_for(v_me.id);
END;
$$;

CREATE OR REPLACE FUNCTION mark_seen(p_area text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  IF p_area NOT IN ('village_square', 'agora_hall', 'whisper', 'gazette') THEN
    RAISE EXCEPTION 'Zone inconnue.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO player_read_marks(player_id, area, seen_at) VALUES (v_me.id, p_area, now())
  ON CONFLICT (player_id, area) DO UPDATE SET seen_at = EXCLUDED.seen_at;
  RETURN unread_counts_for(v_me.id);
END;
$$;

CREATE OR REPLACE FUNCTION my_notification_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  RETURN jsonb_build_object(
    'categories', to_jsonb(coalesce((SELECT categories FROM notification_prefs WHERE player_id = v_me.id), _notification_categories())),
    'devices', (SELECT count(*) FROM push_subscriptions WHERE player_id = v_me.id));
END;
$$;

CREATE OR REPLACE FUNCTION set_notification_categories(p_categories text[]) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_clean text[];
BEGIN
  v_me := _require_player(false);
  SELECT coalesce(array_agg(DISTINCT c ORDER BY c), '{}') INTO v_clean
    FROM unnest(coalesce(p_categories, '{}')) c WHERE c = ANY(_notification_categories());
  INSERT INTO notification_prefs(player_id, categories, updated_at) VALUES (v_me.id, v_clean, now())
  ON CONFLICT (player_id) DO UPDATE SET categories = EXCLUDED.categories, updated_at = EXCLUDED.updated_at;
  RETURN my_notification_settings();
END;
$$;

CREATE OR REPLACE FUNCTION save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  IF p_endpoint IS NULL OR p_endpoint NOT LIKE 'https://%' OR char_length(p_endpoint) > 1000
     OR coalesce(char_length(p_p256dh), 0) NOT BETWEEN 40 AND 200 OR coalesce(char_length(p_auth), 0) NOT BETWEEN 10 AND 100 THEN
    RAISE EXCEPTION 'Abonnement aux notifications invalide.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO push_subscriptions(player_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_me.id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE
    SET player_id = EXCLUDED.player_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
        user_agent = EXCLUDED.user_agent, failure_count = 0;
  RETURN my_notification_settings();
END;
$$;

CREATE OR REPLACE FUNCTION delete_push_subscription(p_endpoint text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
BEGIN
  v_me := _require_player(false);
  DELETE FROM push_subscriptions WHERE endpoint = p_endpoint AND player_id = v_me.id;
  RETURN my_notification_settings();
END;
$$;

-- ----------------------------------------------------------------------------
-- Service (Edge Function) : réserve les notifications à envoyer, purge l'historique
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_notifications(p_limit int DEFAULT 200) RETURNS SETOF notification_queue
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_trusted_caller() THEN
    RAISE EXCEPTION 'claim_notifications est réservé au serveur.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM notification_queue WHERE created_at < now() - interval '3 days';
  RETURN QUERY
    UPDATE notification_queue q SET sent_at = now()
     WHERE q.id IN (SELECT id FROM notification_queue WHERE sent_at IS NULL ORDER BY id
                    LIMIT greatest(1, least(coalesce(p_limit, 200), 500)) FOR UPDATE SKIP LOCKED)
    RETURNING q.*;
END;
$$;

-- ----------------------------------------------------------------------------
-- Mise en file : seulement si le joueur est actif, a au moins un appareil abonné
-- et n'a pas désactivé la catégorie.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION _notify(p_player uuid, p_category text, p_title text, p_body text, p_url text) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO notification_queue(player_id, category, title, body, url)
  SELECT p.id, p_category, left(p_title, 120), left(coalesce(p_body, ''), 240), coalesce(p_url, '#/')
    FROM players p
   WHERE p.id = p_player AND p.is_active_slot AND p.status IN ('active', 'forced_labor')
     AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.player_id = p.id)
     AND p_category = ANY(coalesce((SELECT n.categories FROM notification_prefs n WHERE n.player_id = p.id), _notification_categories()));
$$;

-- Lignes vraiment nouvelles (une restauration de sauvegarde réinsère des lignes anciennes : pas de notification)
CREATE OR REPLACE FUNCTION _is_fresh(p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT p_at IS NOT NULL AND p_at > now() - interval '15 minutes';
$$;

CREATE OR REPLACE FUNCTION _player_name(p_player uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT display_name FROM players WHERE id = p_player), 'Quelqu''un');
$$;

-- Taverne : place du village et salle de l'Agora → tous les autres ; chuchotement → destinataires
CREATE OR REPLACE FUNCTION _notify_tavern() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender text;
  v_r uuid;
BEGIN
  IF NEW.is_system_event OR NEW.sender_id IS NULL OR NOT _is_fresh(NEW.created_at) THEN
    RETURN NULL;
  END IF;
  v_sender := _player_name(NEW.sender_id);
  IF NEW.channel = 'whisper' THEN
    FOREACH v_r IN ARRAY coalesce(NEW.recipient_ids, '{}'::uuid[]) LOOP
      IF v_r <> NEW.sender_id THEN
        PERFORM _notify(v_r, 'chuchotement', '🤫 ' || v_sender || ' vous chuchote', NEW.content, '#/gazette/chuchotements');
      END IF;
    END LOOP;
  ELSE
    PERFORM _notify(p.id, 'taverne',
      CASE NEW.channel WHEN 'agora_hall' THEN '🏛️ ' || v_sender || ' — salle de l''Agora' ELSE '🍺 ' || v_sender || ' à la Taverne' END,
      NEW.content, CASE NEW.channel WHEN 'agora_hall' THEN '#/gazette/agora' ELSE '#/gazette/taverne' END)
      FROM players p WHERE p.id <> NEW.sender_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Duel : les deux adversaires
CREATE OR REPLACE FUNCTION _notify_duel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_body text;
  v_r uuid;
BEGIN
  IF NEW.status <> 'active' OR NOT _is_fresh(NEW.created_at) THEN
    RETURN NULL;
  END IF;
  v_body := _player_name(NEW.player_a_id) || ' contre '
    || CASE WHEN NEW.player_b_id IS NULL THEN 'un migrant' ELSE _player_name(NEW.player_b_id) END
    || CASE NEW.mode WHEN 'target' THEN ' — épreuve de la cible, 24 h pour jouer.' ELSE ' — Carlage en direct : entrez dans l''arène !' END;
  FOREACH v_r IN ARRAY ARRAY[NEW.player_a_id, NEW.player_b_id] LOOP
    IF v_r IS NOT NULL THEN
      PERFORM _notify(v_r, 'duel', '⚔️ Vous êtes appelé en duel', v_body, '#/duel/' || NEW.id);
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Agora : nouvelle proposition (motion visant un joueur signalée à part) et résultat d'un vote
CREATE OR REPLACE FUNCTION _notify_agora() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' OR NOT _is_fresh(NEW.created_at) THEN
      RETURN NULL;
    END IF;
    PERFORM _notify(p.id, 'agora',
      CASE WHEN p.id = NEW.target_player_id THEN '⚖️ Une motion vous vise' ELSE '🏛️ Nouvelle proposition à l''Agora' END,
      NEW.title || ' — ' || _player_name(NEW.proposer_id), '#/agora')
      FROM players p WHERE p.id IS DISTINCT FROM NEW.proposer_id;
  ELSIF OLD.status = 'open' AND NEW.status IN ('passed', 'rejected', 'vetoed') AND _is_fresh(coalesce(NEW.closed_at, now())) THEN
    PERFORM _notify(p.id, 'agora', '🏛️ Résultat du vote',
      NEW.title || ' : ' || CASE NEW.status WHEN 'passed' THEN 'adoptée' WHEN 'rejected' THEN 'rejetée' ELSE 'frappée de veto' END || '.',
      '#/agora')
      FROM players p;
  END IF;
  RETURN NULL;
END;
$$;

-- Validation demandée : les joueurs du rôle concerné
CREATE OR REPLACE FUNCTION _notify_approval() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status <> 'pending' OR NOT _is_fresh(NEW.created_at) THEN
    RETURN NULL;
  END IF;
  PERFORM _notify(p.id, 'validation', '✅ Une validation vous attend',
    _player_name(NEW.requested_by) || ' demande votre accord.', '#/metier')
    FROM players p WHERE p.role_code = NEW.required_role AND p.id IS DISTINCT FROM NEW.requested_by;
  RETURN NULL;
END;
$$;

-- Gazette du jour : tout le monde
CREATE OR REPLACE FUNCTION _notify_gazette() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT _is_fresh(NEW.created_at) THEN
    RETURN NULL;
  END IF;
  PERFORM _notify(p.id, 'gazette', '📰 La Gazette du jour', NEW.headline, '#/gazette') FROM players p;
  RETURN NULL;
END;
$$;

-- Tentation : le joueur concerné, sans rien dévoiler
CREATE OR REPLACE FUNCTION _notify_temptation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.choice <> 'pending' OR NOT _is_fresh(NEW.created_at) THEN
    RETURN NULL;
  END IF;
  PERFORM _notify(NEW.player_id, 'prive', '🕯️ Une proposition discrète vous attend', 'Ouvrez le jeu pour y répondre.', '#/carte');
  RETURN NULL;
END;
$$;

-- Réveil de l'envoi : un seul appel par transaction, seulement si cron.sql a installé
-- gaulois_call_world_sync (Vault + pg_net). Ne fait jamais échouer l'écriture d'origine.
CREATE OR REPLACE FUNCTION _kick_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF coalesce(current_setting('gaulois.push_kicked', true), '') = 'on' THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('gaulois.push_kicked', 'on', true);
  IF to_regprocedure('public.gaulois_call_world_sync(text)') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT public.gaulois_call_world_sync($1)' USING 'push';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Notifications : appel de daily-world-sync impossible (%)', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_tavern ON tavern_messages;
CREATE TRIGGER trg_notify_tavern AFTER INSERT ON tavern_messages FOR EACH ROW EXECUTE FUNCTION _notify_tavern();
DROP TRIGGER IF EXISTS trg_notify_duel ON carlage_duels;
CREATE TRIGGER trg_notify_duel AFTER INSERT ON carlage_duels FOR EACH ROW EXECUTE FUNCTION _notify_duel();
DROP TRIGGER IF EXISTS trg_notify_agora ON agora_proposals;
CREATE TRIGGER trg_notify_agora AFTER INSERT OR UPDATE OF status ON agora_proposals FOR EACH ROW EXECUTE FUNCTION _notify_agora();
DROP TRIGGER IF EXISTS trg_notify_approval ON pending_approvals;
CREATE TRIGGER trg_notify_approval AFTER INSERT ON pending_approvals FOR EACH ROW EXECUTE FUNCTION _notify_approval();
DROP TRIGGER IF EXISTS trg_notify_gazette ON gazette_editions;
CREATE TRIGGER trg_notify_gazette AFTER INSERT ON gazette_editions FOR EACH ROW EXECUTE FUNCTION _notify_gazette();
DROP TRIGGER IF EXISTS trg_notify_temptation ON temptations;
CREATE TRIGGER trg_notify_temptation AFTER INSERT ON temptations FOR EACH ROW EXECUTE FUNCTION _notify_temptation();
DROP TRIGGER IF EXISTS trg_kick_push ON notification_queue;
CREATE TRIGGER trg_kick_push AFTER INSERT ON notification_queue FOR EACH STATEMENT EXECUTE FUNCTION _kick_push();

-- ----------------------------------------------------------------------------
-- Droits : RPC joueur ouvertes à la clé anon (identification par jeton), le reste réservé
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION _notification_categories(), unread_counts_for(uuid), claim_notifications(int),
  _notify(uuid, text, text, text, text), _is_fresh(timestamptz), _player_name(uuid),
  _notify_tavern(), _notify_duel(), _notify_agora(), _notify_approval(), _notify_gazette(), _notify_temptation(), _kick_push()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION unread_counts_for(uuid), claim_notifications(int) TO service_role;
REVOKE ALL ON FUNCTION my_unread_counts(), mark_seen(text), my_notification_settings(), set_notification_categories(text[]),
  save_push_subscription(text, text, text, text), delete_push_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_unread_counts(), mark_seen(text), my_notification_settings(), set_notification_categories(text[]),
  save_push_subscription(text, text, text, text), delete_push_subscription(text) TO anon, authenticated, service_role;
