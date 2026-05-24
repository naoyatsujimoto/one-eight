-- =============================================================================
-- Migration: Ghost Mode — get_ghost_moves RPC v2
-- 変更内容:
--   - gate_ids_str（文字列連結）を廃止
--   - build_gate / build_gates / build_placed_gate_ids として型付きカラムで返却
--   - selective の gates 配列から 0 を除去（RPC層で正規化）
--   - GROUP BY を文字列結合に依存しない形に変更
-- =============================================================================
-- 実行方法: Naoya が Supabase SQL Editor にこのファイルの内容を貼り付けて実行
-- 冪等設計: DROP → CREATE (シグネチャが同一のため DROP が必要)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 旧関数を削除（シグネチャが同一のため DROP してから再作成）
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS get_ghost_moves(TEXT, TEXT, INTEGER);

-- -----------------------------------------------------------------------------
-- RPC v2: get_ghost_moves(p_canonical_hash, p_human_color, p_move_index)
-- -----------------------------------------------------------------------------
-- 変更点 (v1 → v2):
--   旧: gate_ids_str TEXT (例: "8,12" / "4,0")
--   新: build_gate INTEGER        — massive の gate ID (others: NULL)
--       build_gates INTEGER[]     — selective の有効ゲートID配列 (0除去・昇順)
--       build_placed_gate_ids INTEGER[] — quad の配置ゲートID配列 (昇順)
--
-- 初手 (p_move_index=0) 不変条件:
--   - 全 Gate が空なので selective は必ず 2 Gate
--   - build_gates に 0 は含まれない
--   - p_move_index=0 で selective build_gates.length = 1 は異常（ログ相当の結果となる）
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_ghost_moves(
  p_canonical_hash TEXT,
  p_human_color    TEXT    DEFAULT NULL,
  p_move_index     INTEGER DEFAULT 0
)
RETURNS TABLE (
  positioning           TEXT,
  build_type            TEXT,
  build_gate            INTEGER,   -- massive: gate id / others: NULL
  build_gates           INTEGER[], -- selective: valid gate ids (0 removed, asc) / others: NULL
  build_placed_gate_ids INTEGER[], -- quad: placed gate ids (asc) / others: NULL
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
  -- 自分の対象モード対局だけ取得
  target_logs AS (
    SELECT ml.full_record
    FROM match_logs ml
    WHERE ml.user_id = v_uid
      AND ml.mode IN ('human_vs_cpu', 'online_pvp')
      AND ml.full_record IS NOT NULL
      AND jsonb_array_length(ml.full_record) > 0
  ),
  -- Ghost候補手の取得
  --   p_move_index = 0 (初手): full_record[0] を直接返す
  --   p_move_index > 0      : canonical_hash マッチした次の手を返す
  ghost_candidates AS (
    -- 初手: full_record[0] を直接使用
    SELECT tl.full_record -> 0 AS ghost_move
    FROM target_logs tl
    WHERE p_move_index = 0

    UNION ALL

    -- 2手目以降: canonical_hash マッチした次の手
    SELECT tl.full_record -> (elem.ord::int) AS ghost_move
    FROM target_logs tl,
         jsonb_array_elements(tl.full_record) WITH ORDINALITY AS elem(move, ord)
    WHERE p_move_index > 0
      AND elem.move->>'canonical_hash' = p_canonical_hash
      AND elem.ord::int < jsonb_array_length(tl.full_record)
  ),
  -- player フィルタ + build 情報の構造化展開
  filtered AS (
    SELECT
      COALESCE(gc.ghost_move->>'positioning', 'P')      AS pos,
      COALESCE(gc.ghost_move->'build'->>'type', 'skip') AS btype,

      -- massive: gate ID (NULL if not massive or gate is null)
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'massive'
             AND gc.ghost_move->'build'->>'gate' IS NOT NULL
          THEN (gc.ghost_move->'build'->>'gate')::INTEGER
        ELSE NULL
      END AS b_gate,

      -- selective: 有効ゲートID配列（0 を除去、昇順ソート）
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'selective'
             AND gc.ghost_move->'build'->'gates' IS NOT NULL
          THEN ARRAY(
            SELECT v::INTEGER
            FROM jsonb_array_elements_text(gc.ghost_move->'build'->'gates') AS v
            WHERE v::INTEGER > 0
            ORDER BY 1
          )
        ELSE NULL
      END AS b_gates,

      -- quad: 配置ゲートID配列（昇順ソート）
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'quad'
             AND gc.ghost_move->'build'->'placedGateIds' IS NOT NULL
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

-- -----------------------------------------------------------------------------
-- 権限設定
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT, INTEGER) TO authenticated;
REVOKE EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT, INTEGER) FROM anon;

-- =============================================================================
-- 確認クエリ（実行後に状態確認）
-- =============================================================================
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'get_ghost_moves';
--
-- SELECT grantee, privilege_type
-- FROM information_schema.role_routine_grants
-- WHERE routine_name = 'get_ghost_moves';
