-- =============================================================================
-- Migration: symmetry_group_stats RPC 追加
-- symmetry_group_stats 有効化フェーズ
-- =============================================================================

-- get_symmetry_group_win_rates は N-1b で v1（返り型: wins_black/white/draws/total のみ）として
-- 既に作成済みのため、返り型変更には DROP が必要。
DROP FUNCTION IF EXISTS get_symmetry_group_win_rates(text[], text);

-- -----------------------------------------------------------------------------
-- 1. batch_upsert_symmetry_group_stats
-- -----------------------------------------------------------------------------
-- 役割: Edge Function / バックフィルスクリプトから呼び出す
-- 設計: batch_upsert_position_stats と同じパターン

CREATE OR REPLACE FUNCTION batch_upsert_symmetry_group_stats(
  p_group_ids   TEXT[],
  p_winner      TEXT,
  p_mode_groups TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id  TEXT;
  v_mode      TEXT;
  v_unique    TEXT[];
BEGIN
  SELECT ARRAY(SELECT DISTINCT unnest(p_group_ids) WHERE unnest IS NOT NULL)
  INTO v_unique;

  FOREACH v_group_id IN ARRAY v_unique LOOP
    FOREACH v_mode IN ARRAY p_mode_groups LOOP
      INSERT INTO symmetry_group_stats
        (symmetry_group_id, mode_group, wins_black, wins_white, draws, total, last_updated_at)
      VALUES (
        v_group_id, v_mode,
        CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
        CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
        CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
        1, now()
      )
      ON CONFLICT (symmetry_group_id, mode_group) DO UPDATE SET
        wins_black      = symmetry_group_stats.wins_black + CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
        wins_white      = symmetry_group_stats.wins_white + CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
        draws           = symmetry_group_stats.draws      + CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
        total           = symmetry_group_stats.total      + 1,
        last_updated_at = now();
    END LOOP;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. get_symmetry_group_win_rates v2（win_rate + confidence 付き）
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_symmetry_group_win_rates(
  group_ids  TEXT[],
  mode_group TEXT DEFAULT 'all'
)
RETURNS TABLE (
  symmetry_group_id TEXT,
  wins_black        INTEGER,
  wins_white        INTEGER,
  draws             INTEGER,
  total             INTEGER,
  win_rate_black    NUMERIC,
  win_rate_white    NUMERIC,
  confidence        TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sgs.symmetry_group_id,
    sgs.wins_black,
    sgs.wins_white,
    sgs.draws,
    sgs.total,
    CASE WHEN sgs.total > 0
      THEN ROUND(sgs.wins_black::NUMERIC / sgs.total * 100, 2)
      ELSE NULL
    END AS win_rate_black,
    CASE WHEN sgs.total > 0
      THEN ROUND(sgs.wins_white::NUMERIC / sgs.total * 100, 2)
      ELSE NULL
    END AS win_rate_white,
    CASE
      WHEN sgs.total < 5  THEN 'hidden'
      WHEN sgs.total < 30 THEN 'reference'
      ELSE 'main'
    END AS confidence
  FROM symmetry_group_stats sgs
  WHERE sgs.symmetry_group_id = ANY(group_ids)
    AND sgs.mode_group = get_symmetry_group_win_rates.mode_group;
$$;

-- -----------------------------------------------------------------------------
-- 3. rebuild_symmetry_group_stats_from_match_logs
-- -----------------------------------------------------------------------------
-- 役割: symmetry_group_stats を match_logs から全件再構築（障害復旧用）
-- 前提: match_logs.full_record の各 MoveRecord に symmetry_group_id が付与済みであること

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
    SELECT id, mode, cpu_difficulty, winner, full_record
    FROM match_logs
    WHERE winner IS NOT NULL AND winner != ''
      AND full_record IS NOT NULL
      AND jsonb_array_length(full_record) > 0
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
