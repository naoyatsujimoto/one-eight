-- =============================================================================
-- Migration: position_stats_f07_normalize_history
-- Phase F-07 — historical normalization
--
-- 目的:
--   1. rebuild_all_position_stats_from_match_logs() を作成
--      - process_position_stats_once() を全 match_logs に適用
--      - position_stats / symmetry_group_stats / ledger を TRUNCATE して再構築
--   2. migration 内で rebuild を1回実行してデータを正規化
--   3. 旧 batch RPC の外部 EXECUTE 権限を撤去（内部呼出しは維持）
--   4. 旧 rebuild RPC を明示例外に変更（外部からの誤呼出しを防止）
-- =============================================================================

-- =============================================================================
-- 0. process_position_stats_once 修正 (full_record 型ガード追加)
--    jsonb_array_length() は非array型でエラーになるため、
--    jsonb_typeof() で事前チェックする
-- =============================================================================

CREATE OR REPLACE FUNCTION public.process_position_stats_once(
  p_match_log_id UUID
)
RETURNS TABLE (
  processed BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_mode         TEXT;
  v_cpu_diff     TEXT;
  v_winner       TEXT;
  v_full_record  JSONB;
  v_is_test      BOOLEAN;
  v_mode_groups  TEXT[];
  v_norm_diff    TEXT;
  v_hashes       TEXT[];
  v_sym_ids      TEXT[];
  v_inserted     INT;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. match_log 取得・validation
  -- -------------------------------------------------------------------------
  SELECT
    ml.user_id,
    ml.mode,
    ml.cpu_difficulty,
    ml.winner,
    ml.full_record,
    COALESCE(p.is_test_account, false)
  INTO
    v_user_id, v_mode, v_cpu_diff, v_winner, v_full_record, v_is_test
  FROM public.match_logs ml
  LEFT JOIN public.profiles p ON p.id = ml.user_id
  WHERE ml.id = p_match_log_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_log not found: %', p_match_log_id;
  END IF;

  -- test account skip
  IF v_is_test THEN
    RETURN QUERY SELECT false, 'test_account'::TEXT;
    RETURN;
  END IF;

  -- winner validation
  IF v_winner NOT IN ('black', 'white', 'draw') THEN
    RETURN QUERY SELECT false, 'invalid_winner'::TEXT;
    RETURN;
  END IF;

  -- full_record 空チェック: NULL または非array型はスキップ
  IF v_full_record IS NULL OR jsonb_typeof(v_full_record) != 'array' OR jsonb_array_length(v_full_record) = 0 THEN
    RETURN QUERY SELECT false, 'empty_full_record'::TEXT;
    RETURN;
  END IF;

  -- canonical_hash 存在確認
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_full_record) AS step
    WHERE step->>'canonical_hash' IS NOT NULL AND step->>'canonical_hash' != ''
  ) THEN
    RETURN QUERY SELECT false, 'no_canonical_hashes'::TEXT;
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. mode_groups 解決 (Edge Function と完全一致)
  --    ALLOWED_MODES: human_vs_human / human_vs_cpu / online
  --    ALLOWED_DIFFICULTIES: normal / hard / very_hard
  -- -------------------------------------------------------------------------
  v_mode_groups := ARRAY['all'];

  IF v_mode = 'human_vs_human' THEN
    v_mode_groups := array_append(v_mode_groups, 'pvp');
  ELSIF v_mode = 'online' THEN
    v_mode_groups := array_append(v_mode_groups, 'online');
  ELSIF v_mode = 'human_vs_cpu' THEN
    IF v_cpu_diff IS NOT NULL THEN
      v_norm_diff := lower(trim(v_cpu_diff));
      IF v_norm_diff IN ('normal', 'hard', 'very_hard') THEN
        v_mode_groups := array_append(v_mode_groups, 'cpu_' || v_norm_diff);
      END IF;
    END IF;
  END IF;

  -- -------------------------------------------------------------------------
  -- 3. ledger INSERT ... ON CONFLICT DO NOTHING
  -- -------------------------------------------------------------------------
  INSERT INTO public.position_stats_ledger (match_log_id)
  VALUES (p_match_log_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN QUERY SELECT false, 'duplicate'::TEXT;
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. position_stats 更新
  -- -------------------------------------------------------------------------
  SELECT ARRAY(
    SELECT DISTINCT step->>'canonical_hash'
    FROM jsonb_array_elements(v_full_record) AS step
    WHERE step->>'canonical_hash' IS NOT NULL AND step->>'canonical_hash' != ''
  ) INTO v_hashes;

  PERFORM public.batch_upsert_position_stats(
    v_hashes,
    v_winner,
    v_mode_groups
  );

  -- -------------------------------------------------------------------------
  -- 5. symmetry_group_stats 更新
  -- -------------------------------------------------------------------------
  SELECT ARRAY(
    SELECT DISTINCT step->>'symmetry_group_id'
    FROM jsonb_array_elements(v_full_record) AS step
    WHERE step->>'symmetry_group_id' IS NOT NULL AND step->>'symmetry_group_id' != ''
  ) INTO v_sym_ids;

  IF array_length(v_sym_ids, 1) > 0 THEN
    PERFORM public.batch_upsert_symmetry_group_stats(
      v_sym_ids,
      v_winner,
      v_mode_groups
    );
  END IF;

  -- -------------------------------------------------------------------------
  -- 6. 全成功
  -- -------------------------------------------------------------------------
  RETURN QUERY SELECT true, 'processed'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.process_position_stats_once(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_position_stats_once(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.process_position_stats_once(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_position_stats_once(UUID) TO service_role;

-- =============================================================================
-- 1. rebuild_all_position_stats_from_match_logs()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_all_position_stats_from_match_logs()
RETURNS TABLE (
  total_processed INT,
  total_duplicate INT,
  total_test_account INT,
  total_invalid_winner INT,
  total_empty_full_record INT,
  total_no_canonical_hashes INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id UUID;
  v_result   RECORD;
  cnt_processed  INT := 0;
  cnt_duplicate  INT := 0;
  cnt_test       INT := 0;
  cnt_invalid    INT := 0;
  cnt_empty      INT := 0;
  cnt_no_hash    INT := 0;
BEGIN
  -- 同時実行防止: 対象テーブルに EXCLUSIVE LOCK
  LOCK TABLE public.position_stats IN EXCLUSIVE MODE;
  LOCK TABLE public.symmetry_group_stats IN EXCLUSIVE MODE;
  LOCK TABLE public.position_stats_ledger IN EXCLUSIVE MODE;

  -- テーブル初期化（全件削除）
  TRUNCATE public.position_stats;
  TRUNCATE public.symmetry_group_stats;
  TRUNCATE public.position_stats_ledger;

  -- match_logs を安定順序で全件走査
  FOR v_match_id IN
    SELECT id FROM public.match_logs ORDER BY created_at ASC, id ASC
  LOOP
    SELECT * INTO v_result
    FROM public.process_position_stats_once(v_match_id);

    CASE v_result.reason
      WHEN 'processed'           THEN cnt_processed := cnt_processed + 1;
      WHEN 'duplicate'           THEN cnt_duplicate := cnt_duplicate + 1;
      WHEN 'test_account'        THEN cnt_test      := cnt_test      + 1;
      WHEN 'invalid_winner'      THEN cnt_invalid   := cnt_invalid   + 1;
      WHEN 'empty_full_record'   THEN cnt_empty     := cnt_empty     + 1;
      WHEN 'no_canonical_hashes' THEN cnt_no_hash   := cnt_no_hash   + 1;
      ELSE NULL;
    END CASE;
  END LOOP;

  RETURN QUERY SELECT
    cnt_processed,
    cnt_duplicate,
    cnt_test,
    cnt_invalid,
    cnt_empty,
    cnt_no_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_all_position_stats_from_match_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_all_position_stats_from_match_logs() FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_all_position_stats_from_match_logs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_all_position_stats_from_match_logs() TO service_role;

-- =============================================================================
-- 2. migration 内で rebuild を1回実行（正規化）
--    match_logs 99件想定 → ledger と stats を整合状態に初期化
-- =============================================================================

DO $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result FROM public.rebuild_all_position_stats_from_match_logs();
  RAISE NOTICE 'rebuild complete: processed=%, duplicate=%, test_skip=%, invalid_winner=%, empty_full_record=%, no_canonical_hashes=%',
    v_result.total_processed,
    v_result.total_duplicate,
    v_result.total_test_account,
    v_result.total_invalid_winner,
    v_result.total_empty_full_record,
    v_result.total_no_canonical_hashes;
END;
$$;

-- =============================================================================
-- 3. 旧 batch RPC の外部 EXECUTE 権限撤去
--    process_position_stats_once() 内部からの呼出しは SECURITY DEFINER により維持
-- =============================================================================

-- batch_upsert_position_stats
REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM service_role;
-- owner (postgres) 経由の内部呼出しだけ維持

-- batch_upsert_symmetry_group_stats
REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM service_role;
-- owner (postgres) 経由の内部呼出しだけ維持

-- =============================================================================
-- 4. 旧 rebuild RPC を明示例外に変更（外部から呼んでもエラーで止まる）
--    EXECUTE 権限は維持（既存 service_role 付与のまま）
-- =============================================================================

-- 旧 rebuild_position_stats_from_match_logs (no args)
CREATE OR REPLACE FUNCTION public.rebuild_position_stats_from_match_logs()
RETURNS TABLE (processed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated: use rebuild_all_position_stats_from_match_logs() instead';
END;
$$;

-- 旧 rebuild_symmetry_group_stats_from_match_logs (no args)
CREATE OR REPLACE FUNCTION public.rebuild_symmetry_group_stats_from_match_logs()
RETURNS TABLE (processed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'deprecated: use rebuild_all_position_stats_from_match_logs() instead';
END;
$$;
