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
  p_human_color TEXT DEFAULT NULL
)
RETURNS TABLE (
  positioning TEXT,
  build_type  TEXT,
  frequency   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID;
  v_plan      TEXT;
  v_status    TEXT;
  v_period_end TIMESTAMPTZ;
  v_is_pro    BOOLEAN;
BEGIN
  -- 呼び出しユーザーの UUID を取得
  v_uid := auth.uid();

  -- 認証チェック: 未ログインの場合は空を返す
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- Pro 判定: profiles テーブルから取得
  SELECT plan, subscription_status, current_period_end
  INTO v_plan, v_status, v_period_end
  FROM profiles
  WHERE id = v_uid;

  v_is_pro := (
    v_plan = 'pro'
    AND v_status = 'active'
    AND (v_period_end IS NULL OR v_period_end > now())
  );

  -- 非 Pro ユーザーは空を返す（エラーなし）
  IF NOT v_is_pro THEN
    RETURN;
  END IF;

  -- Ghost Move の集計:
  --   full_record (JSONB 配列) の各手を走査し、
  --   canonical_hash が p_canonical_hash に一致する手を見つけ、
  --   その「次の手」（index+1）が human_color プレイヤーの手であれば集計対象とする。
  --
  -- full_record の各要素 (MoveRecord) の構造:
  --   {
  --     "player": "black" | "white",
  --     "positioning": "A"〜"M" | "P",
  --     "build": { "type": "massive"|"selective"|"quad"|"skip", ... },
  --     "canonical_hash": "...",
  --     ...
  --   }
  --
  -- ロジック:
  --   1. user_id = v_uid かつ mode IN ('human_vs_cpu', 'online_pvp') の match_logs を取得
  --   2. full_record を jsonb_array_elements でインデックス付き展開
  --   3. index i の手の canonical_hash = p_canonical_hash を見つける
  --   4. index i+1 の手（次の手）を取得
  --   5. p_human_color が指定されている場合は next_move.player = p_human_color のもののみ
  --      p_human_color が NULL の場合は全て対象
  --   6. positioning + build_type でグループ化して frequency を集計

  RETURN QUERY
  WITH
  -- 対象となる match_logs（自分のデータ、対象モードのみ）
  target_logs AS (
    SELECT
      ml.full_record,
      ml.human_color
    FROM match_logs ml
    WHERE ml.user_id = v_uid
      AND ml.mode IN ('human_vs_cpu', 'online_pvp')
      AND ml.full_record IS NOT NULL
      AND jsonb_array_length(ml.full_record) > 0
  ),

  -- full_record を index 付きで展開
  moves_with_index AS (
    SELECT
      tl.full_record,
      tl.human_color AS log_human_color,
      idx.ord         AS move_index,
      idx.move        AS move_data
    FROM target_logs tl,
         jsonb_array_elements(tl.full_record) WITH ORDINALITY AS idx(move, ord)
  ),

  -- canonical_hash が一致する手のインデックスを見つける
  matching_moves AS (
    SELECT
      m.full_record,
      m.log_human_color,
      m.move_index
    FROM moves_with_index m
    WHERE m.move_data->>'canonical_hash' = p_canonical_hash
  ),

  -- 次の手（index+1）を取得
  next_moves AS (
    SELECT
      mm.log_human_color,
      -- 次の手（0-based インデックス: ord は 1-based なので mm.move_index は +1 済み）
      mm.full_record -> (mm.move_index::int) AS next_move
    FROM matching_moves mm
    WHERE mm.move_index::int < jsonb_array_length(mm.full_record)
  ),

  -- 次の手をフィルタリング（human_color の手のみ）
  filtered_next_moves AS (
    SELECT
      COALESCE(nm.next_move->>'positioning', 'P')   AS positioning,
      COALESCE(nm.next_move->'build'->>'type', 'skip') AS build_type
    FROM next_moves nm
    WHERE nm.next_move IS NOT NULL
      -- p_human_color が NULL の場合は全て対象、指定されている場合は該当プレイヤーのみ
      AND (
        p_human_color IS NULL
        OR nm.next_move->>'player' = p_human_color
      )
  )

  -- グループ化して frequency を集計
  SELECT
    fnm.positioning::TEXT,
    fnm.build_type::TEXT,
    COUNT(*)::INTEGER AS frequency
  FROM filtered_next_moves fnm
  WHERE fnm.positioning IS NOT NULL
    AND fnm.build_type IS NOT NULL
  GROUP BY fnm.positioning, fnm.build_type
  ORDER BY frequency DESC;

END;
$$;

-- -----------------------------------------------------------------------------
-- 権限設定
-- -----------------------------------------------------------------------------

-- authenticated ユーザーのみ実行可能
GRANT EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT) TO authenticated;

-- anon には実行権限を付与しない（明示的に剥奪）
REVOKE EXECUTE ON FUNCTION get_ghost_moves(TEXT, TEXT) FROM anon;

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
