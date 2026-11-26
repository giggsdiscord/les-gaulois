-- ============================================================================
-- LES GAULOIS & MICRO-ÉTAT — Migration additive V4.0 : épreuve de la cible
-- ----------------------------------------------------------------------------
-- Les duels (veto contesté, putsch, duel amical) se jouent au choix du challenger :
--   * 'carlage' : Carlage 2×2 en direct (les deux joueurs en ligne, manches de 10 s) ;
--   * 'target'  : épreuve de la cible en différé (5 cibles, précision + rapidité),
--                 chaque joueur joue quand il veut avant l'échéance (round_deadline_at).
-- Les taps sont déposés par RPC ; le score est calculé par le moteur (Edge Function).
-- ============================================================================

ALTER TABLE carlage_duels
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'carlage' CHECK (mode IN ('carlage', 'target')),
  ADD COLUMN IF NOT EXISTS result_json JSONB DEFAULT NULL;   -- scores de la cible ou équilibres finaux

CREATE TABLE IF NOT EXISTS target_trial_results (
  duel_id UUID NOT NULL REFERENCES carlage_duels(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('a', 'b')),
  player_id UUID REFERENCES players(id) DEFERRABLE INITIALLY IMMEDIATE,
  taps JSONB NOT NULL CHECK (jsonb_typeof(taps) = 'array' AND jsonb_array_length(taps) <= 5),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (duel_id, side)
);

ALTER TABLE target_trial_results ENABLE ROW LEVEL SECURITY;

-- Résultats secrets tant que le duel n'est pas terminé (chacun voit le sien)
CREATE POLICY read_target_results ON target_trial_results FOR SELECT TO anon, authenticated
  USING (player_id = (SELECT current_player_id())
         OR EXISTS (SELECT 1 FROM carlage_duels d WHERE d.id = duel_id AND d.status <> 'active'));

REVOKE ALL ON target_trial_results FROM anon, authenticated;
GRANT SELECT ON target_trial_results TO anon, authenticated;
GRANT ALL ON target_trial_results TO service_role;

-- Dépôt des 5 taps d'un joueur (une seule fois, avant l'échéance)
CREATE OR REPLACE FUNCTION target_submit(p_duel_id uuid, p_taps jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_duel carlage_duels;
  v_side text;
  v_count int;
BEGIN
  v_me := _require_player(false);
  SELECT * INTO v_duel FROM carlage_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.status <> 'active' OR v_duel.mode <> 'target' THEN
    RAISE EXCEPTION 'Épreuve introuvable ou terminée.' USING ERRCODE = 'P0002';
  END IF;
  IF v_duel.player_a_id = v_me.id THEN
    v_side := 'a';
  ELSIF v_duel.player_b_id = v_me.id THEN
    v_side := 'b';
  ELSE
    RAISE EXCEPTION 'Vous ne participez pas à cette épreuve.' USING ERRCODE = '42501';
  END IF;
  IF now() > v_duel.round_deadline_at THEN
    RAISE EXCEPTION 'Trop tard : l''échéance de l''épreuve est passée.' USING ERRCODE = '42501';
  END IF;
  IF p_taps IS NULL OR jsonb_typeof(p_taps) <> 'array' OR jsonb_array_length(p_taps) > 5 THEN
    RAISE EXCEPTION 'Résultat invalide (5 taps au plus).' USING ERRCODE = '22023';
  END IF;
  INSERT INTO target_trial_results(duel_id, side, player_id, taps)
  VALUES (p_duel_id, v_side, v_me.id, p_taps)
  ON CONFLICT (duel_id, side) DO NOTHING;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vous avez déjà joué cette épreuve.' USING ERRCODE = '23505';
  END IF;
  SELECT count(*) INTO v_count FROM target_trial_results WHERE duel_id = p_duel_id;
  RETURN jsonb_build_object('side', v_side, 'both_submitted', v_count >= 2 OR v_duel.opponent_migrant_id IS NOT NULL);
END;
$$;

-- Le Carlage 2×2 refuse désormais les coups sur une épreuve de la cible
CREATE OR REPLACE FUNCTION carlage_submit_move(p_duel_id uuid, p_move text, p_pivot_target text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me players;
  v_duel carlage_duels;
  v_side text;
  v_pos text;
  v_other_pos text;
  v_count int;
BEGIN
  v_me := _require_player(false);
  SELECT * INTO v_duel FROM carlage_duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND OR v_duel.status <> 'active' THEN
    RAISE EXCEPTION 'Duel introuvable ou terminé.' USING ERRCODE = 'P0002';
  END IF;
  IF v_duel.mode <> 'carlage' THEN
    RAISE EXCEPTION 'Ce duel se joue à l''épreuve de la cible.' USING ERRCODE = '22023';
  END IF;
  IF v_duel.player_a_id = v_me.id THEN
    v_side := 'a'; v_pos := v_duel.player_a_pos; v_other_pos := v_duel.player_b_pos;
  ELSIF v_duel.player_b_id = v_me.id THEN
    v_side := 'b'; v_pos := v_duel.player_b_pos; v_other_pos := v_duel.player_a_pos;
  ELSE
    RAISE EXCEPTION 'Vous n''êtes pas combattant de ce duel.' USING ERRCODE = '42501';
  END IF;
  IF now() > v_duel.round_deadline_at + INTERVAL '2 seconds' THEN
    RAISE EXCEPTION 'Trop tard pour cette manche.' USING ERRCODE = '42501';
  END IF;
  IF p_move NOT IN ('push','pivot','anchor','shoulder') THEN
    RAISE EXCEPTION 'Coup inconnu.' USING ERRCODE = '22023';
  END IF;
  IF p_move = 'pivot' THEN
    IF p_pivot_target IS NULL OR p_pivot_target = v_other_pos OR NOT (
         (v_pos = 'TL' AND p_pivot_target IN ('TR','BL')) OR (v_pos = 'TR' AND p_pivot_target IN ('TL','BR'))
      OR (v_pos = 'BL' AND p_pivot_target IN ('TL','BR')) OR (v_pos = 'BR' AND p_pivot_target IN ('TR','BL'))) THEN
      RAISE EXCEPTION 'Pivot : carreau adjacent libre requis.' USING ERRCODE = '22023';
    END IF;
  ELSE
    p_pivot_target := NULL;
  END IF;
  INSERT INTO carlage_moves(duel_id, round, side, player_id, move, pivot_target)
  VALUES (p_duel_id, v_duel.current_round, v_side, v_me.id, p_move, p_pivot_target)
  ON CONFLICT (duel_id, round, side) DO NOTHING;
  SELECT count(*) INTO v_count FROM carlage_moves WHERE duel_id = p_duel_id AND round = v_duel.current_round;
  RETURN jsonb_build_object('round', v_duel.current_round, 'side', v_side,
                            'both_submitted', v_count >= 2 OR v_duel.opponent_migrant_id IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION target_submit(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION carlage_submit_move(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION target_submit(uuid, jsonb), carlage_submit_move(uuid, text, text) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'target_trial_results') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.target_trial_results;
  END IF;
END;
$$;
