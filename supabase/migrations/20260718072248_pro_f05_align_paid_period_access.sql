-- =============================================================================
-- Migration: F-05 — サーバー側 Pro 判定の統一
--
-- 目的:
--   解約済み（canceled）でも支払済み期間内（current_period_end > now()）の
--   ユーザーが Ghost および全対局履歴 RPC でも Pro として扱われるよう修正する。
--
-- 不整合の概要:
--   - クライアント (profile.ts isProActive): canceled + 期限内 → Pro 許可
--   - enter_arena_event RPC: canceled + 期限内 → Pro 許可
--   - terms.html section 4: 「解約は現在の請求期間の終了時に有効。その日付までアクセスを維持。」
--   - get_ghost_moves v7: canceled → 拒否（不整合）
--   - get_user_match_history v2: canceled → 拒否（不整合）
--
-- 正規 Pro 判定（enter_arena_event / profile.ts と同一）:
--   plan = 'pro'
--   AND (
--     (subscription_status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
--     OR
--     (subscription_status = 'canceled' AND current_period_end IS NOT NULL AND current_period_end > now())
--   )
--
-- 変更対象: Pro 判定 predicate のみ
-- 変更対象外: signature / RETURNS / SECURITY DEFINER / search_path / GRANT / その他ロジック
--
-- 禁止: RLS / table privilege 変更 / プロファイルデータ更新 / ユーザーデータ変更
-- =============================================================================


-- =============================================================================
-- 1. get_ghost_moves — Pro 判定のみ正規判定へ変更
--    v7 からの変更: v_status = 'active' のみ → active + canceled（期限内）
--    signature / RETURNS / SECURITY DEFINER / search_path / GRANT は不変
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

  -- ▼ F-05: canceled + 期限内も Pro として許可（enter_arena_event / profile.ts と統一）
  v_is_pro := (
    v_plan = 'pro'
    AND (
      (v_status = 'active'   AND (v_period_end IS NULL OR v_period_end > now()))
      OR
      (v_status = 'canceled' AND v_period_end IS NOT NULL AND v_period_end > now())
    )
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


-- =============================================================================
-- 2. get_user_match_history — Pro 判定のみ正規判定へ変更
--    v2 からの変更: v_status = 'active' のみ → active + canceled（期限内）
--    signature / RETURNS / SECURITY DEFINER / search_path / GRANT は不変
-- =============================================================================
CREATE OR REPLACE FUNCTION get_user_match_history()
RETURNS SETOF match_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan       TEXT;
  v_status     TEXT;
  v_period_end TIMESTAMPTZ;
  v_is_pro     BOOLEAN;
BEGIN
  SELECT plan, subscription_status, current_period_end
  INTO v_plan, v_status, v_period_end
  FROM profiles
  WHERE id = auth.uid();

  -- ▼ F-05: canceled + 期限内も Pro として許可（enter_arena_event / profile.ts と統一）
  v_is_pro := (
    v_plan = 'pro'
    AND (
      (v_status = 'active'   AND (v_period_end IS NULL OR v_period_end > now()))
      OR
      (v_status = 'canceled' AND v_period_end IS NOT NULL AND v_period_end > now())
    )
  );

  IF v_is_pro THEN
    -- 有料: 全件
    RETURN QUERY
      SELECT m.*
      FROM match_logs m
      WHERE m.user_id = auth.uid()
      ORDER BY m.created_at DESC;
  ELSE
    -- 無料 / 期限切れ: 直近10局
    RETURN QUERY
      SELECT m.*
      FROM match_logs m
      WHERE m.user_id = auth.uid()
      ORDER BY m.created_at DESC
      LIMIT 10;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_match_history() TO authenticated;
REVOKE EXECUTE ON FUNCTION get_user_match_history() FROM anon;
