-- =============================================================================
-- Migration: fix(history): repair ambiguous column reference "id" in history RPCs
--
-- 目的:
--   get_user_match_history() および get_public_match_logs(UUID) が
--   "column reference "id" is ambiguous" エラーで全件0件を返す問題を修正する。
--
-- 原因:
--   RETURNS TABLE に `id UUID` が出力列として宣言されているため、
--   PL/pgSQL 内部で以下の列参照が曖昧になる:
--     - profiles.id         → 出力変数 id と衝突
--     - match_logs.id       → 出力変数 id と衝突
--     - online_games.id     → 出力変数 id と衝突
--
-- 修正方針:
--   すべてのテーブル参照に明示的なエイリアスを付与し、table_alias.column_name で修飾する:
--     - profiles     → alias p
--     - match_logs   → alias m
--     - online_games → alias og
--   JOIN条件・WHERE句・SELECT句の全列をエイリアスで完全修飾する。
--   `#variable_conflict` を使わずSQLを明示的に修正する。
--
-- 禁止事項の遵守:
--   - match_logsの削除・追加・backfillなし
--   - position stats再集計なし
--   - 適用済みmigration (20260804091805_*) の書き換えなし
-- =============================================================================


-- =============================================================================
-- 1. get_user_match_history() — id曖昧参照を修正
-- =============================================================================
DROP FUNCTION IF EXISTS get_user_match_history();

CREATE OR REPLACE FUNCTION get_user_match_history()
RETURNS TABLE (
  id                        UUID,
  user_id                   UUID,
  game_id                   TEXT,
  started_at                TIMESTAMPTZ,
  ended_at                  TIMESTAMPTZ,
  mode                      TEXT,
  human_color               TEXT,
  winner                    TEXT,
  move_count                INTEGER,
  created_at                TIMESTAMPTZ,
  full_record               JSONB,
  cpu_difficulty            TEXT,
  canonical_hashes_computed BOOLEAN,
  timer_config              JSONB,
  end_reason                TEXT
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

  -- プラン取得: profiles を明示alias p で修飾 → profiles.id の曖昧参照を排除
  SELECT p.plan, p.subscription_status, p.current_period_end
  INTO v_plan, v_status, v_period_end
  FROM public.profiles AS p
  WHERE p.id = v_uid;

  -- F-05と同一のPro判定: active + canceled期限内
  v_is_pro := (
    v_plan = 'pro'
    AND (
      (v_status = 'active'   AND (v_period_end IS NULL OR v_period_end > now()))
      OR
      (v_status = 'canceled' AND v_period_end IS NOT NULL AND v_period_end > now())
    )
  );

  IF v_is_pro THEN
    -- 有料: 対象となる全履歴
    RETURN QUERY
      SELECT
        m.id,          -- match_logs.id (alias m で修飾 → 出力変数idとの曖昧参照を排除)
        m.user_id,
        m.game_id,
        m.started_at,
        m.ended_at,
        m.mode,
        -- online対局でauth.uid()が参加者の場合、視点に応じたhuman_colorを返す
        CASE
          WHEN m.mode = 'online_pvp' AND og.id IS NOT NULL THEN
            CASE
              WHEN og.black_player_id = v_uid THEN 'black'
              WHEN og.white_player_id = v_uid THEN 'white'
              ELSE m.human_color
            END
          ELSE m.human_color
        END AS human_color,
        m.winner,
        m.move_count,
        m.created_at,
        m.full_record,
        m.cpu_difficulty,
        m.canonical_hashes_computed,
        m.timer_config,
        m.end_reason
      FROM public.match_logs AS m
      LEFT JOIN public.online_games AS og
        ON m.mode = 'online_pvp'
        AND m.game_id = og.id::text
        AND (og.black_player_id = v_uid OR og.white_player_id = v_uid)
      WHERE
        m.user_id = v_uid
        OR (m.mode = 'online_pvp' AND og.id IS NOT NULL)
      ORDER BY m.created_at DESC;
  ELSE
    -- 無料: 対象となる履歴をcreated_at降順で直近10件
    RETURN QUERY
      SELECT
        m.id,
        m.user_id,
        m.game_id,
        m.started_at,
        m.ended_at,
        m.mode,
        CASE
          WHEN m.mode = 'online_pvp' AND og.id IS NOT NULL THEN
            CASE
              WHEN og.black_player_id = v_uid THEN 'black'
              WHEN og.white_player_id = v_uid THEN 'white'
              ELSE m.human_color
            END
          ELSE m.human_color
        END AS human_color,
        m.winner,
        m.move_count,
        m.created_at,
        m.full_record,
        m.cpu_difficulty,
        m.canonical_hashes_computed,
        m.timer_config,
        m.end_reason
      FROM public.match_logs AS m
      LEFT JOIN public.online_games AS og
        ON m.mode = 'online_pvp'
        AND m.game_id = og.id::text
        AND (og.black_player_id = v_uid OR og.white_player_id = v_uid)
      WHERE
        m.user_id = v_uid
        OR (m.mode = 'online_pvp' AND og.id IS NOT NULL)
      ORDER BY m.created_at DESC
      LIMIT 10;
  END IF;
END;
$$;

-- authenticated のみ実行可能
GRANT EXECUTE ON FUNCTION get_user_match_history() TO authenticated;
REVOKE EXECUTE ON FUNCTION get_user_match_history() FROM anon;


-- =============================================================================
-- 2. get_public_match_logs(target_user_id) — id曖昧参照を修正
-- =============================================================================
DROP FUNCTION IF EXISTS get_public_match_logs(UUID);

CREATE OR REPLACE FUNCTION get_public_match_logs(target_user_id UUID)
RETURNS TABLE (
  id                        UUID,
  user_id                   UUID,
  game_id                   TEXT,
  started_at                TIMESTAMPTZ,
  ended_at                  TIMESTAMPTZ,
  mode                      TEXT,
  human_color               TEXT,
  winner                    TEXT,
  move_count                INTEGER,
  created_at                TIMESTAMPTZ,
  full_record               JSONB,
  cpu_difficulty            TEXT,
  canonical_hashes_computed BOOLEAN,
  timer_config              JSONB,
  end_reason                TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_public BOOLEAN;
BEGIN
  -- 閲覧対象ユーザーのstats_publicを確認
  -- profiles を明示alias p で修飾 → profiles.id の曖昧参照を排除
  SELECT p.stats_public INTO v_is_public
  FROM public.profiles AS p
  WHERE p.id = target_user_id;

  IF NOT FOUND OR NOT v_is_public THEN
    -- stats_public = false または ユーザー不存在 → 空を返す
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      m.id,          -- match_logs.id (alias m で修飾)
      m.user_id,
      m.game_id,
      m.started_at,
      m.ended_at,
      m.mode,
      -- target_user_id視点のhuman_colorを返す
      CASE
        WHEN m.mode = 'online_pvp' AND og.id IS NOT NULL THEN
          CASE
            WHEN og.black_player_id = target_user_id THEN 'black'
            WHEN og.white_player_id = target_user_id THEN 'white'
            ELSE m.human_color
          END
        ELSE m.human_color
      END AS human_color,
      m.winner,
      m.move_count,
      m.created_at,
      m.full_record,
      m.cpu_difficulty,
      m.canonical_hashes_computed,
      m.timer_config,
      m.end_reason
    FROM public.match_logs AS m
    LEFT JOIN public.online_games AS og
      ON m.mode = 'online_pvp'
      AND m.game_id = og.id::text
      AND (og.black_player_id = target_user_id OR og.white_player_id = target_user_id)
    WHERE
      m.user_id = target_user_id
      OR (m.mode = 'online_pvp' AND og.id IS NOT NULL)
    ORDER BY m.created_at DESC
    LIMIT 100;
END;
$$;

-- anon・authenticated 両方に公開（公開プロフィール設計）
GRANT EXECUTE ON FUNCTION get_public_match_logs(UUID) TO anon;
GRANT EXECUTE ON FUNCTION get_public_match_logs(UUID) TO authenticated;
