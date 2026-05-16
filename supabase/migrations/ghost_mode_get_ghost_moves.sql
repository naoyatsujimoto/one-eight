-- =============================================================================
-- Migration: Ghost Mode — get_ghost_moves RPC
-- Phase G-1: 自分の過去手から Ghost Move を取得する RPC
-- =============================================================================
-- 実行方法: Naoya が Supabase SQL Editor にこのファイルの内容を貼り付けて実行
-- 冪等設計: CREATE OR REPLACE を使用（再実行可能）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- RPC: get_ghost_moves(p_canonical_hash TEXT, p_human_color TEXT DEFAULT NULL)
-- -----------------------------------------------------------------------------
-- 役割:
--   指定した局面 (canonical_hash) において、自分（auth.uid()）が過去の対局で
--   どのポジション・ビルドタイプを選択したかを集計して返す。
--
-- 対象モード:
--   - mode IN ('human_vs_cpu', 'online_pvp') のみ
--   - human_vs_human（オフライン PvP）は対象外
--
-- Pro 制限:
--   - profiles.plan='pro' AND subscription_status='active'
--     AND (current_period_end IS NULL OR current_period_end > now()) のみ
--   - 非 Pro ユーザーは空配列を返す（エラーなし）
--   - anon ユーザーには EXECUTE 権限なし
--
-- 引数:
--   p_canonical_hash  TEXT  — 現在局面の canonical_hash
--   p_human_color     TEXT  — 'black' | 'white' | NULL
--                             NULL の場合はどちらの手番も対象（全手番）
--
-- 返却値:
--   positioning TEXT  — PositionId ('A'〜'M') または 'P'（パス）
--   build_type  TEXT  — 'massive' | 'selective' | 'quad' | 'skip'
--   frequency   INTEGER — 出現回数
--
-- セキュリティ:
--   - SECURITY DEFINER: クライアントが auth.uid() を偽装できない
--   - user_id = auth.uid() で必ず自分のデータのみ参照
--   - 他ユーザーのデータを参照しない
-- =============================================================================

CREATE OR REPLACE FUNCTION get_ghost_moves(
  p_canonical_hash TEXT,
  p_human_color    TEXT DEFAULT NULL,
  p_move_index     INTEGER DEFAULT 0  -- 現在の手番インデックス（state.history.length）
)
RETURNS TABLE (
  positioning      TEXT,
  build_type       TEXT,
  gate_ids_str     TEXT,    -- massive:単一gate / selective:カンマ区切り2gate / quad:カンマ区切り複数gate / skip:NULL
  frequency        INTEGER
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
    SELECT ml.full_record, ml.human_color
    FROM match_logs ml
    WHERE ml.user_id = v_uid
      AND ml.mode IN ('human_vs_cpu', 'online_pvp')
      AND ml.full_record IS NOT NULL
      AND jsonb_array_length(ml.full_record) > 0
  ),
  -- Ghost候補手の取得方法：
  --   p_move_index = 0 (初手前): full_record[0] を直接返す
  --     理由: canonical_hash は手実行後の状態に付属するため、
  --             初手前の状態（初期状態）はどの MoveRecord にも保存されていない。
  --             初手を返すには full_record[0] を直接参照する必要がある。
  --   p_move_index > 0: 現状の canonical_hash で対履を検索し、次の手を返す
  ghost_candidates AS (
    -- 初手前: full_record[0] を直接使用
    SELECT
      tl.human_color,
      tl.full_record -> 0 AS ghost_move
    FROM target_logs tl
    WHERE p_move_index = 0
      AND jsonb_array_length(tl.full_record) > 0

    UNION ALL

    -- 2手目以降: canonical_hash マッチした次の手を返す
    SELECT
      tl.human_color,
      tl.full_record -> (elem.ord::int) AS ghost_move
    FROM target_logs tl,
         jsonb_array_elements(tl.full_record) WITH ORDINALITY AS elem(move, ord)
    WHERE p_move_index > 0
      AND elem.move->>'canonical_hash' = p_canonical_hash
      AND elem.ord::int < jsonb_array_length(tl.full_record)
  ),
  -- 自分の手番の候補のみに絞り込む
  filtered AS (
    SELECT
      COALESCE(gc.ghost_move->>'positioning', 'P')      AS pos,
      COALESCE(gc.ghost_move->'build'->>'type', 'skip') AS btype,
      -- ゲートIDの抽出: buildタイプに応じて
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'massive'
          THEN gc.ghost_move->'build'->>'gate'
        WHEN gc.ghost_move->'build'->>'type' = 'selective'
          THEN (
            COALESCE(gc.ghost_move->'build'->'gates'->>0, '') || ',' ||
            COALESCE(gc.ghost_move->'build'->'gates'->>1, '')
          )
        WHEN gc.ghost_move->'build'->>'type' = 'quad'
          THEN (
            SELECT string_agg(v::text, ',')
            FROM jsonb_array_elements(gc.ghost_move->'build'->'placedGateIds') AS v
          )
        ELSE NULL
      END AS gate_ids_str
    FROM ghost_candidates gc
    WHERE gc.ghost_move IS NOT NULL
      AND (
        p_human_color IS NULL
        OR gc.ghost_move->>'player' = p_human_color
      )
  )
  SELECT
    f.pos::TEXT          AS positioning,
    f.btype::TEXT        AS build_type,
    f.gate_ids_str::TEXT AS gate_ids_str,
    COUNT(*)::INTEGER    AS frequency
  FROM filtered f
  GROUP BY f.pos, f.btype, f.gate_ids_str
  ORDER BY frequency DESC;

END;
$$;

-- -----------------------------------------------------------------------------
-- 権限設定
-- -----------------------------------------------------------------------------

-- authenticated ユーザーのみ実行可能
-- 旧シグネチャが残っている場合は先に削除してから実行
-- DROP FUNCTION IF EXISTS get_ghost_moves(text, text);
-- DROP FUNCTION IF EXISTS get_ghost_moves(text, text, integer);

GRANT EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT, INTEGER) TO authenticated;

-- anon には実行権限を付与しない（明示的に剥奪）
REVOKE EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT, INTEGER) FROM anon;

-- =============================================================================
-- 確認クエリ（実行後にこれで状態を確認する）
-- =============================================================================
-- SELECT routine_name, security_type, external_language
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name = 'get_ghost_moves';
--
-- SELECT grantee, routine_name, privilege_type
-- FROM information_schema.role_routine_grants
-- WHERE routine_name = 'get_ghost_moves';
