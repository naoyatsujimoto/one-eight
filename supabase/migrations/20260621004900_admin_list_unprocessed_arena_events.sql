-- ============================================================
-- admin_list_unprocessed_arena_events()
--
-- 目的:
--   Prize Award がまだ生成されていない processed 済み Arena master match
--   候補を Admin 用に返す。
--
-- 返却対象条件:
--   - arena_match_history.match_kind = 'master'
--   - arena_match_history.winner_user_id IS NOT NULL
--   - arena_match_history.end_reason NOT IN ('no_contest', 'cancelled')
--   - arena_matches.status = 'processed'
--   - arena_matches.processed_at IS NOT NULL
--   - 同一 (source_kind='arena_master', source_arena_event_id,
--           source_arena_match_id, recipient_user_id) の prize_awards が
--     まだ存在しない
--
-- 権限:
--   - SECURITY DEFINER
--   - 関数内で is_admin チェック
--   - anon: EXECUTE 付与しない
--   - authenticated: EXECUTE 付与（内部 Admin チェック必須）
--   - service_role / postgres: EXECUTE 付与
--
-- PII制限:
--   - profiles.display_name のみ返却（メールアドレス・個人情報は返さない）
-- ============================================================

CREATE OR REPLACE FUNCTION admin_list_unprocessed_arena_events()
RETURNS TABLE (
  arena_event_id       uuid,
  arena_id             uuid,
  arena_code           text,
  arena_display_name   text,
  scheduled_at         timestamptz,
  arena_match_id       uuid,
  official_match_id    uuid,
  match_kind           text,
  master_subtype       text,
  master_effect        text,
  winner_user_id       uuid,
  winner_display_name  text,
  loser_user_id        uuid,
  loser_display_name   text,
  end_reason           text,
  processed_at         timestamptz,
  existing_award_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin  boolean;
BEGIN
  -- ── Admin 確認 ──────────────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated to call this function.';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'not_admin'
      USING DETAIL = 'Only admins can list unprocessed arena events.';
  END IF;

  -- ── 候補クエリ ──────────────────────────────────────────────
  RETURN QUERY
  SELECT
    amh.arena_event_id,
    amh.arena_id,
    ad.code                          AS arena_code,
    ad.display_name                  AS arena_display_name,
    ae.scheduled_at,
    amh.arena_match_id,
    amh.official_match_id,
    amh.match_kind,
    amh.master_subtype,
    amh.master_effect,
    amh.winner_user_id,
    pw.display_name                  AS winner_display_name,
    amh.loser_user_id,
    pl.display_name                  AS loser_display_name,
    amh.end_reason,
    am.processed_at,
    -- 既存 Award 数（重複チェック用: 通常 0 のみ表示するが念のため返す）
    (
      SELECT COUNT(*)
      FROM prize_awards pa
      WHERE pa.source_kind           = 'arena_master'
        AND pa.source_arena_event_id = amh.arena_event_id
        AND pa.source_arena_match_id = amh.arena_match_id
        AND pa.recipient_user_id     = amh.winner_user_id
    )                                AS existing_award_count
  FROM arena_match_history amh
  JOIN arena_matches am
    ON am.id = amh.arena_match_id
  JOIN arena_events ae
    ON ae.id = amh.arena_event_id
  JOIN arena_definitions ad
    ON ad.id = amh.arena_id
  LEFT JOIN profiles pw
    ON pw.id = amh.winner_user_id
  LEFT JOIN profiles pl
    ON pl.id = amh.loser_user_id
  WHERE amh.match_kind         = 'master'
    AND amh.winner_user_id     IS NOT NULL
    AND amh.end_reason         NOT IN ('no_contest', 'cancelled')
    AND am.status              = 'processed'
    AND am.processed_at        IS NOT NULL
    -- Prize Award 未生成のもののみ
    AND NOT EXISTS (
      SELECT 1
      FROM prize_awards pa
      WHERE pa.source_kind           = 'arena_master'
        AND pa.source_arena_event_id = amh.arena_event_id
        AND pa.source_arena_match_id = amh.arena_match_id
        AND pa.recipient_user_id     = amh.winner_user_id
    )
  ORDER BY ae.scheduled_at DESC;
END;
$$;

-- ── 権限 ─────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_list_unprocessed_arena_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_unprocessed_arena_events() FROM anon;
GRANT EXECUTE ON FUNCTION admin_list_unprocessed_arena_events() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_unprocessed_arena_events() TO service_role;
GRANT EXECUTE ON FUNCTION admin_list_unprocessed_arena_events() TO postgres;
