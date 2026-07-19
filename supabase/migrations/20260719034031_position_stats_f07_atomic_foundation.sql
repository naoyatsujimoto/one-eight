-- =============================================================================
-- Migration: position_stats_f07_atomic_foundation
-- Phase F-07 — atomic position processing
--
-- 目的:
--   1. position_stats_ledger テーブルを作成し、処理済み match_log を追跡する
--   2. process_position_stats_once(UUID) RPC でアトミックに1棋譜を処理する
--      - ledger INSERT ON CONFLICT DO NOTHING で sequential/concurrent duplicate を防止
--      - SECURITY DEFINER / service_role のみ実行可
--
-- 既存の batch_upsert_position_stats / batch_upsert_symmetry_group_stats は
-- 内部から呼び出す。外部 EXECUTE 権限は変更しない（次 migration で閉鎖）。
-- =============================================================================

-- =============================================================================
-- 1. position_stats_ledger テーブル
-- =============================================================================

CREATE TABLE public.position_stats_ledger (
  match_log_id UUID PRIMARY KEY
    REFERENCES public.match_logs(id) ON DELETE CASCADE,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.position_stats_ledger ENABLE ROW LEVEL SECURITY;

-- 全ロールからアクセスを剥奪（service_role は RLS バイパス）
REVOKE ALL ON public.position_stats_ledger FROM PUBLIC;
REVOKE ALL ON public.position_stats_ledger FROM anon;
REVOKE ALL ON public.position_stats_ledger FROM authenticated;

-- =============================================================================
-- 2. process_position_stats_once(UUID)
--
-- mode_group 解決規則は Edge Function (update-position-stats/index.ts) と完全一致:
--   - 常に 'all' を含む
--   - human_vs_human → 'pvp' を追加
--   - online → 'online' を追加
--   - human_vs_cpu + 許可リスト内の difficulty → 'cpu_${difficulty}' を追加
--   - 不明 mode / null difficulty → 'all' のみ
--
-- batch RPC signature (確認済み):
--   batch_upsert_position_stats(p_hashes TEXT[], p_winner TEXT, p_mode_groups TEXT[])
--   batch_upsert_symmetry_group_stats(p_group_ids TEXT[], p_winner TEXT, p_mode_groups TEXT[])
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

  -- full_record 空チェック
  IF v_full_record IS NULL OR jsonb_array_length(v_full_record) = 0 THEN
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
    -- cpu_difficulty = null または許可リスト外 → 'all' のみ
  END IF;
  -- 不明な mode → 'all' のみ (初期値のまま)

  -- -------------------------------------------------------------------------
  -- 3. ledger INSERT ... ON CONFLICT DO NOTHING (アトミック duplicate 防止)
  -- -------------------------------------------------------------------------
  INSERT INTO public.position_stats_ledger (match_log_id)
  VALUES (p_match_log_id)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- 0行 = 既処理済み (duplicate)
  IF v_inserted = 0 THEN
    RETURN QUERY SELECT false, 'duplicate'::TEXT;
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- 4. position_stats 更新
  --    canonical_hash を DISTINCT 化してから batch_upsert に渡す
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
  --    symmetry_group_id を DISTINCT 化してから batch_upsert に渡す
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
