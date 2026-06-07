-- =============================================================================
-- Migration: Ghost Mode — get_ghost_moves RPC v7
-- v6からの変更: filtered CTE の jsonb_array_elements_text 呼び出しを安全化
-- IS NOT NULL → jsonb_typeof = 'array' に変更
-- 理由: JSONB null は SQL NULL ではないため IS NOT NULL = TRUE になり
--       jsonb_array_elements_text(null::jsonb) が例外を投げる
-- =============================================================================
DROP FUNCTION IF EXISTS get_ghost_moves(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION get_ghost_moves(
  p_canonical_hash TEXT,
  p_human_color    TEXT    DEFAULT NULL,
  p_move_index     INTEGER DEFAULT 0
)
RETURNS TABLE (
  positioning           TEXT,
  build_type            TEXT,
  build_gate            INTEGER,
  build_gates           INTEGER[],
  build_placed_gate_ids INTEGER[],
  frequency             INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID;
  v_plan       TEXT;
  v_status     TEXT;
  v_period_end TIMESTAMPTZ;
  v_is_pro     BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT plan, subscription_status, current_period_end
  INTO v_plan, v_status, v_period_end
  FROM profiles WHERE id = v_uid;

  v_is_pro := (
    v_plan = 'pro'
    AND v_status = 'active'
    AND (v_period_end IS NULL OR v_period_end > now())
  );
  IF NOT v_is_pro THEN RETURN; END IF;

  RETURN QUERY
  WITH
  target_logs AS (
    SELECT ml.full_record
    FROM match_logs ml
    WHERE ml.user_id = v_uid
      AND ml.mode IN ('human_vs_cpu', 'online_pvp')
      AND ml.full_record IS NOT NULL
      AND jsonb_typeof(ml.full_record) = 'array'
      AND ml.full_record <> '[]'::jsonb
  ),
  ghost_candidates AS (
    SELECT tl.full_record -> 0 AS ghost_move
    FROM target_logs tl
    WHERE p_move_index = 0

    UNION ALL

    SELECT tl.full_record -> (elem.ord::int) AS ghost_move
    FROM target_logs tl,
         jsonb_array_elements(tl.full_record) WITH ORDINALITY AS elem(move, ord)
    WHERE p_move_index > 0
      AND elem.move->>'canonical_hash' = p_canonical_hash
  ),
  filtered AS (
    SELECT
      COALESCE(gc.ghost_move->>'positioning', 'P')      AS pos,
      COALESCE(gc.ghost_move->'build'->>'type', 'skip') AS btype,
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'massive'
             AND jsonb_typeof(gc.ghost_move->'build'->'gate') = 'number'
          THEN (gc.ghost_move->'build'->>'gate')::INTEGER
        ELSE NULL
      END AS b_gate,
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'selective'
             AND jsonb_typeof(gc.ghost_move->'build'->'gates') = 'array'
          THEN ARRAY(
            SELECT v::INTEGER
            FROM jsonb_array_elements_text(gc.ghost_move->'build'->'gates') AS v
            WHERE v::INTEGER > 0
            ORDER BY 1
          )
        ELSE NULL
      END AS b_gates,
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'quad'
             AND jsonb_typeof(gc.ghost_move->'build'->'placedGateIds') = 'array'
          THEN ARRAY(
            SELECT v::INTEGER
            FROM jsonb_array_elements_text(gc.ghost_move->'build'->'placedGateIds') AS v
            ORDER BY 1
          )
        ELSE NULL
      END AS b_placed
    FROM ghost_candidates gc
    WHERE gc.ghost_move IS NOT NULL
      AND (
        p_human_color IS NULL
        OR gc.ghost_move->>'player' = p_human_color
      )
  )
  SELECT
    f.pos::TEXT              AS positioning,
    f.btype::TEXT            AS build_type,
    f.b_gate                 AS build_gate,
    f.b_gates                AS build_gates,
    f.b_placed               AS build_placed_gate_ids,
    COUNT(*)::INTEGER        AS frequency
  FROM filtered f
  GROUP BY f.pos, f.btype, f.b_gate, f.b_gates, f.b_placed
  ORDER BY COUNT(*) DESC;

END;
$$;

GRANT EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT, INTEGER) FROM anon;
