-- ============================================================================
-- V4.2 — Correctif : clause WHERE obligatoire sur Supabase (pg_safeupdate)
-- ============================================================================
-- Sur Supabase, l'extension pg_safeupdate refuse tout UPDATE / DELETE sans WHERE
-- lancé depuis l'API (« UPDATE requires a WHERE clause »), y compris dans une fonction.
-- village_state n'a qu'une ligne : les deux UPDATE ci-dessous n'avaient pas de WHERE,
-- ce qui faisait échouer toute action du moteur (engine_commit) et la restauration.
-- Redéfinition à l'identique, avec une clause WHERE explicite. Les droits sont conservés
-- (CREATE OR REPLACE ne touche pas aux GRANT / REVOKE existants).
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

  UPDATE village_state SET revision = v_rev + 1 WHERE revision = v_rev;
  RETURN v_rev + 1;
END;
$$;

CREATE OR REPLACE FUNCTION restore_daily_snapshot(p_snapshot_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_data jsonb;
  v_label text;
  v_t record;
  v_prev_revision bigint;
BEGIN
  PERFORM _require_admin();
  SELECT full_state_json, label INTO v_data, v_label FROM daily_snapshots WHERE id = p_snapshot_id;
  IF v_data IS NULL THEN
    RETURN FALSE;
  END IF;
  SELECT revision INTO v_prev_revision FROM village_state LIMIT 1;

  -- Filet de sécurité : la restauration elle-même est annulable
  PERFORM create_daily_snapshot('pre_restore', NULL);

  SET CONSTRAINTS ALL DEFERRED;
  FOR v_t IN SELECT * FROM _snapshot_tables() WHERE restorable LOOP
    PERFORM _restore_table(v_t.table_name, v_t.pk, v_data->v_t.table_name, v_t.delete_missing);
  END LOOP;
  -- les sessions des joueurs restent valides ; le moteur repart d'une révision supérieure
  UPDATE village_state SET revision = coalesce(v_prev_revision, 0) + 1, last_tick_at = now() WHERE TRUE;
  UPDATE carlage_duels SET status = 'cancelled' WHERE status = 'active';

  INSERT INTO game_events(event_type, title, body, data)
  VALUES ('village_restored', 'Village restauré', format('Le hameau a été restauré : %s', v_label),
          jsonb_build_object('snapshot_id', p_snapshot_id));
  INSERT INTO tavern_messages(channel, sender_id, content, is_system_event)
  VALUES ('village_square', NULL, format('⏪ Le village a été restauré à l''état « %s ».', v_label), TRUE);
  RETURN TRUE;
END;
$$;
