-- ============================================================
-- fix_admin_list_unprocessed_arena_events_master_reward
--
-- 目的:
--   admin_list_unprocessed_arena_events() の RETURNS TABLE に
--   master_reward_amount_cents と master_reward_currency の2フィールドが
--   含まれていなかったため、Prize/Reward Awards 候補画面で
--   JAGUAR が「Master報酬：未設定」と表示される問題を修正する。
--
-- 根本原因:
--   20260621004900_admin_list_unprocessed_arena_events.sql で定義された
--   関数の RETURNS TABLE に master_reward フィールドが含まれていなかった。
--   arena_definitions には master_reward_amount_cents / master_reward_currency が
--   存在する（20260806230000_master_reward_phase1.sql で追加済み）が、
--   この RPC の SELECT・RETURNS TABLE に反映されていなかった。
--
-- 対応:
--   RETURNS TABLE の型変更を伴うため DROP + CREATE OR REPLACE で再定義。
--   arena_definitions の master_reward フィールドを SELECT に追加する。
-- ============================================================

-- DROP is required because OUT/RETURNS TABLE type changes cannot use
-- CREATE OR REPLACE alone in PostgreSQL.
DROP FUNCTION IF EXISTS public.admin_list_unprocessed_arena_events();

CREATE OR REPLACE FUNCTION public.admin_list_unprocessed_arena_events()
RETURNS TABLE (
  arena_event_id              uuid,
  arena_id                    uuid,
  arena_code                  text,
  arena_display_name          text,
  scheduled_at                timestamptz,
  arena_match_id              uuid,
  official_match_id           uuid,
  match_kind                  text,
  master_subtype              text,
  master_effect               text,
  winner_user_id              uuid,
  winner_display_name         text,
  loser_user_id               uuid,
  loser_display_name          text,
  end_reason                  text,
  processed_at                timestamptz,
  existing_award_count        bigint,
  master_reward_amount_cents  integer,
  master_reward_currency      text
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
    )                                AS existing_award_count,
    -- Phase 1 追加: arena_definitions の master_reward フィールド
    ad.master_reward_amount_cents    AS master_reward_amount_cents,
    ad.master_reward_currency        AS master_reward_currency
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
REVOKE ALL ON FUNCTION public.admin_list_unprocessed_arena_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_unprocessed_arena_events() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_unprocessed_arena_events() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_unprocessed_arena_events() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_unprocessed_arena_events() TO postgres;
