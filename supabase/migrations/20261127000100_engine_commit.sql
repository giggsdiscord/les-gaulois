-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Migration additive V3.9 : écriture atomique du moteur
-- ----------------------------------------------------------------------------
-- engine_commit() applique en UNE transaction tout ce qu'une Edge Function a calculé
-- avec le moteur déterministe : état du village, joueurs, migrants, enfants, carte,
-- unions, Agora, Constitution, verrous, tentations, duels, indicateurs cachés, Gazette,
-- puis les écritures « append-only » (événements, grand livre, auscultations, messages
-- système de La Taverne, journal des appels IA).
-- Concurrence optimiste : la révision attendue doit correspondre, sinon 40001
-- (« revision_conflict ») et l'Edge Function recharge puis recalcule.
-- Réservé au service_role (Edge Functions) — jamais exposé à la clé anon.
-- ============================================================================

CREATE OR REPLACE FUNCTION engine_commit(p_expected_revision bigint, p_changes jsonb) RETURNS bigint
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rev bigint;
  v_t record;
  v_row jsonb;
BEGIN
  IF NOT is_trusted_caller() THEN
    RAISE EXCEPTION 'engine_commit est réservé au moteur (service_role).' USING ERRCODE = '42501';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'object' THEN
    RAISE EXCEPTION 'Charge utile invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT revision INTO v_rev FROM village_state LIMIT 1 FOR UPDATE;
  IF v_rev IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'revision_conflict (attendue %, actuelle %)', p_expected_revision, v_rev USING ERRCODE = '40001';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  -- État du village (la révision et l'horodatage technique sont gérés ici)
  IF jsonb_typeof(p_changes->'village_state') = 'object' THEN
    PERFORM _restore_table('village_state', 'id',
      jsonb_build_array((p_changes->'village_state') - 'revision' - 'updated_at' - 'singleton'), false);
  END IF;

  -- Tables d'état : mise à jour des colonnes présentes / insertion des nouvelles lignes
  FOR v_t IN
    SELECT * FROM (VALUES
      ('players', 'id'), ('map_structures', 'id'), ('village_migrants', 'id'), ('village_children', 'id'),
      ('unions', 'id'), ('agora_proposals', 'id'), ('constitution_articles', 'id'), ('pending_approvals', 'id'),
      ('temptations', 'id'), ('carlage_duels', 'id'), ('role_hidden_indicators', 'role_code')
    ) AS t(tbl, pk)
  LOOP
    IF jsonb_typeof(p_changes->v_t.tbl) = 'array' THEN
      PERFORM _restore_table(v_t.tbl, v_t.pk, p_changes->v_t.tbl, false);
    END IF;
  END LOOP;

  -- La Gazette : une édition par jour (remplacée si régénérée)
  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p_changes->'gazette_editions', '[]'::jsonb)) LOOP
    INSERT INTO gazette_editions(edition_date, headline, body_markdown, sections, generated_by)
    VALUES ((v_row->>'edition_date')::date, v_row->>'headline', v_row->>'body_markdown',
            coalesce(v_row->'sections', '[]'::jsonb), coalesce(v_row->>'generated_by', 'ai'))
    ON CONFLICT (edition_date) DO UPDATE
      SET headline = EXCLUDED.headline, body_markdown = EXCLUDED.body_markdown,
          sections = EXCLUDED.sections, generated_by = EXCLUDED.generated_by;
  END LOOP;

  -- Écritures append-only
  INSERT INTO game_events(event_type, visibility, player_id, role_code, title, body, data, game_day)
  SELECT x.event_type, coalesce(x.visibility, 'public'), x.player_id, x.role_code, x.title, coalesce(x.body, ''),
         coalesce(x.data, '{}'::jsonb), coalesce(x.game_day, 0)
  FROM jsonb_to_recordset(coalesce(p_changes->'game_events', '[]'::jsonb))
       AS x(event_type text, visibility text, player_id uuid, role_code text, title text, body text, data jsonb, game_day int);

  INSERT INTO ledger_entries(account, player_id, amount_eur, label, category, supplier, approval_id, created_by, game_day)
  SELECT x.account, x.player_id, x.amount_eur, x.label, coalesce(x.category, 'misc'), x.supplier, x.approval_id,
         x.created_by, coalesce(x.game_day, 0)
  FROM jsonb_to_recordset(coalesce(p_changes->'ledger_entries', '[]'::jsonb))
       AS x(account text, player_id uuid, amount_eur numeric, label text, category text, supplier text,
            approval_id uuid, created_by uuid, game_day int);

  INSERT INTO migrant_screenings(migrant_id, screened_by, screening_type, findings)
  SELECT x.migrant_id, x.screened_by, x.screening_type, coalesce(x.findings, '{}'::jsonb)
  FROM jsonb_to_recordset(coalesce(p_changes->'migrant_screenings', '[]'::jsonb))
       AS x(migrant_id uuid, screened_by uuid, screening_type text, findings jsonb)
  ON CONFLICT (migrant_id, screened_by, screening_type) DO UPDATE
    SET findings = EXCLUDED.findings, created_at = now();

  INSERT INTO tavern_messages(channel, sender_id, recipient_ids, content, is_system_event)
  SELECT coalesce(x.channel, 'village_square'), NULL, x.recipient_ids, left(x.content, 2000), TRUE
  FROM jsonb_to_recordset(coalesce(p_changes->'tavern_messages', '[]'::jsonb))
       AS x(channel text, recipient_ids uuid[], content text)
  WHERE x.content IS NOT NULL AND char_length(x.content) > 0;

  INSERT INTO ai_calls(call_kind, player_id, used_fallback, model, input_tokens, output_tokens, latency_ms, error)
  SELECT x.call_kind, x.player_id, coalesce(x.used_fallback, false), x.model, x.input_tokens, x.output_tokens,
         x.latency_ms, x.error
  FROM jsonb_to_recordset(coalesce(p_changes->'ai_calls', '[]'::jsonb))
       AS x(call_kind text, player_id uuid, used_fallback boolean, model text, input_tokens int,
            output_tokens int, latency_ms int, error text);

  UPDATE village_state SET revision = v_rev + 1;
  RETURN v_rev + 1;
END;
$$;

-- Identifie le joueur d'un jeton de session (usage serveur : Edge Functions)
CREATE OR REPLACE FUNCTION session_player(p_token uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.player_id FROM player_sessions s
  WHERE s.token = p_token AND NOT s.revoked AND s.expires_at > now();
$$;

REVOKE ALL ON FUNCTION engine_commit(bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION session_player(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION engine_commit(bigint, jsonb), session_player(uuid) TO service_role;

-- Les fonctions créées après la migration initiale reçoivent par défaut EXECUTE pour anon dans
-- Supabase : on retire explicitement ce droit sur les helpers internes éventuellement recréés.
REVOKE ALL ON FUNCTION _restore_table(text, text, jsonb, boolean) FROM PUBLIC, anon, authenticated;
