-- =============================================================================
-- test_account_exclusion.sql
-- -----------------------------------------------------------------------------
-- 目的: テスト用Proアカウントを Postmortem / 集計統計から除外する
-- 対象: profiles.is_test_account = TRUE のユーザー
-- Ghost RPC: 変更なし（テストアカウントの match_logs は Ghost に引き続き使用）
-- DB適用: Supabase SQL Editor で手動実行すること
-- =============================================================================

-- 1. profiles に is_test_account カラムを追加
-- -----------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.is_test_account IS
  'true: test account. match_logs remain usable for Ghost, but are excluded from population stats such as position_stats and symmetry_group_stats.';

-- =============================================================================
-- 2. rebuild_position_stats_from_match_logs — is_test_account=true を除外
-- -----------------------------------------------------------------------------
-- 変更点: FOR loop の WHERE 句に以下を追加
--   AND NOT EXISTS (
--     SELECT 1 FROM profiles p
--     WHERE p.id = ml.user_id AND p.is_test_account = TRUE
--   )
-- それ以外のロジックは変更なし

CREATE OR REPLACE FUNCTION rebuild_position_stats_from_match_logs()
RETURNS TABLE (processed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row           RECORD;
  v_move          JSONB;
  v_hash          TEXT;
  v_hashes        TEXT[];
  v_mode_groups   TEXT[];
  v_processed     INTEGER := 0;
  v_skipped       INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT ml.id, ml.mode, ml.cpu_difficulty, ml.winner, ml.full_record
    FROM match_logs ml
    WHERE ml.canonical_hashes_computed = TRUE
      AND ml.winner IS NOT NULL
      AND ml.winner != ''
      AND ml.full_record IS NOT NULL
      AND jsonb_array_length(ml.full_record) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = ml.user_id
          AND p.is_test_account = TRUE
      )
  LOOP
    -- canonical_hash を full_record から抽出
    v_hashes := ARRAY[]::TEXT[];
    FOR v_move IN SELECT * FROM jsonb_array_elements(v_row.full_record)
    LOOP
      v_hash := v_move->>'canonical_hash';
      IF v_hash IS NOT NULL AND v_hash != '' THEN
        v_hashes := array_append(v_hashes, v_hash);
      END IF;
    END LOOP;

    -- hash が1件もなければスキップ
    IF array_length(v_hashes, 1) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- mode_groups を決定
    v_mode_groups := ARRAY['all'];
    IF v_row.mode = 'human_vs_human' THEN
      v_mode_groups := array_append(v_mode_groups, 'pvp');
    ELSIF v_row.mode = 'online' THEN
      v_mode_groups := array_append(v_mode_groups, 'online');
    ELSIF v_row.mode = 'human_vs_cpu' AND v_row.cpu_difficulty IS NOT NULL THEN
      IF v_row.cpu_difficulty ~ '^[a-z0-9_]+$' THEN
        v_mode_groups := array_append(v_mode_groups, 'cpu_' || v_row.cpu_difficulty);
      END IF;
    END IF;

    -- UPSERT
    PERFORM batch_upsert_position_stats(v_hashes, v_row.winner, v_mode_groups);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_skipped;
END;
$$;

-- =============================================================================
-- 3. rebuild_symmetry_group_stats_from_match_logs — is_test_account=true を除外
-- -----------------------------------------------------------------------------
-- 変更点: FOR loop の WHERE 句に以下を追加
--   AND NOT EXISTS (
--     SELECT 1 FROM profiles p
--     WHERE p.id = ml.user_id AND p.is_test_account = TRUE
--   )
-- それ以外のロジックは変更なし

CREATE OR REPLACE FUNCTION rebuild_symmetry_group_stats_from_match_logs()
RETURNS TABLE (processed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row         RECORD;
  v_move        JSONB;
  v_gid         TEXT;
  v_gids        TEXT[];
  v_mode_groups TEXT[];
  v_processed   INTEGER := 0;
  v_skipped     INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT ml.id, ml.mode, ml.cpu_difficulty, ml.winner, ml.full_record
    FROM match_logs ml
    WHERE ml.winner IS NOT NULL AND ml.winner != ''
      AND ml.full_record IS NOT NULL
      AND jsonb_array_length(ml.full_record) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = ml.user_id
          AND p.is_test_account = TRUE
      )
  LOOP
    v_gids := ARRAY[]::TEXT[];
    FOR v_move IN SELECT * FROM jsonb_array_elements(v_row.full_record)
    LOOP
      v_gid := v_move->>'symmetry_group_id';
      IF v_gid IS NOT NULL AND v_gid != '' THEN
        v_gids := array_append(v_gids, v_gid);
      END IF;
    END LOOP;

    IF array_length(v_gids, 1) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_mode_groups := ARRAY['all'];
    IF v_row.mode = 'human_vs_human' THEN
      v_mode_groups := array_append(v_mode_groups, 'pvp');
    ELSIF v_row.mode = 'online' THEN
      v_mode_groups := array_append(v_mode_groups, 'online');
    ELSIF v_row.mode = 'human_vs_cpu' AND v_row.cpu_difficulty IS NOT NULL
      AND v_row.cpu_difficulty ~ '^[a-z0-9_]+$' THEN
      v_mode_groups := array_append(v_mode_groups, 'cpu_' || v_row.cpu_difficulty);
    END IF;

    PERFORM batch_upsert_symmetry_group_stats(v_gids, v_row.winner, v_mode_groups);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_skipped;
END;
$$;
