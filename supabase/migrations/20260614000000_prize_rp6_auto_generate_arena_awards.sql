-- ============================================================
-- RP-6: admin_generate_arena_prize_awards
-- Arena event の arena_match_history から賞金対象 winner を特定し
-- prize_awards を自動生成する Admin 専用 RPC
--
-- 対象条件:
--   - match_kind = 'master'（ポイント戦は対象外）
--   - winner_user_id IS NOT NULL
--   - end_reason NOT IN ('no_show', 'no_contest', 'cancelled')
--   - arena_matches.status = 'processed'
--
-- 重複防止:
--   source_kind='arena_master' + source_arena_event_id + source_arena_match_id
--   + recipient_user_id が一致する prize_awards が既存の場合、
--   新規作成せず既存 award を返す（skipped_reason='already_exists'）
--
-- 禁止:
--   - Arena match 結果の変更
--   - winner / loser の変更
--   - points / master_history の変更
--   - 既存 prize_awards の破壊
-- ============================================================

CREATE OR REPLACE FUNCTION admin_generate_arena_prize_awards(
  p_arena_event_id uuid,
  p_amount_cents   int,
  p_currency       text DEFAULT 'JPY',
  p_prize_kind     text DEFAULT 'cash'
)
RETURNS TABLE (
  award_id          uuid,
  arena_id          uuid,
  arena_code        text,
  arena_event_id    uuid,
  arena_match_id    uuid,
  recipient_user_id uuid,
  amount_cents      int,
  currency          text,
  prize_kind        text,
  status            text,
  skipped_reason    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id  uuid;
  v_is_admin   boolean;
  v_arena_id   uuid;
  v_arena_code text;
  r_hist       RECORD;
  v_award_id   uuid;
  v_award_status text;
BEGIN
  -- ── Admin 確認 ─────────────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated to call this function.';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'not_admin'
      USING DETAIL = 'Only admins can generate arena prize awards.';
  END IF;

  -- ── 引数バリデーション ────────────────────────────────────
  IF p_amount_cents < 0 THEN
    RAISE EXCEPTION 'invalid_amount'
      USING DETAIL = 'amount_cents must be >= 0.';
  END IF;
  IF length(p_currency) != 3 THEN
    RAISE EXCEPTION 'invalid_currency'
      USING DETAIL = 'currency must be a 3-character ISO code.';
  END IF;
  IF p_prize_kind NOT IN ('cash', 'merchandise', 'title_only') THEN
    RAISE EXCEPTION 'invalid_prize_kind'
      USING DETAIL = 'prize_kind must be one of: cash, merchandise, title_only.';
  END IF;

  -- ── Arena event / definition 取得 ─────────────────────────
  SELECT ae.arena_id, ad.code
    INTO v_arena_id, v_arena_code
    FROM arena_events ae
    JOIN arena_definitions ad ON ad.id = ae.arena_id
   WHERE ae.id = p_arena_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_event_not_found'
      USING DETAIL = 'No arena_event found for the given arena_event_id.';
  END IF;

  -- ── 対象 match を arena_match_history から取得 ─────────────
  --   条件:
  --     match_kind = 'master'
  --     winner_user_id IS NOT NULL
  --     end_reason NOT IN ('no_show', 'no_contest', 'cancelled')
  --     対応する arena_matches.status = 'processed'
  FOR r_hist IN
    SELECT
      amh.arena_match_id,
      amh.winner_user_id
    FROM arena_match_history amh
    JOIN arena_matches am ON am.id = amh.arena_match_id
   WHERE amh.arena_event_id = p_arena_event_id
     AND amh.match_kind = 'master'
     AND amh.winner_user_id IS NOT NULL
     AND amh.end_reason NOT IN ('no_show', 'no_contest', 'cancelled')
     AND am.status = 'processed'
   ORDER BY amh.created_at
  LOOP

    -- ── 重複チェック ──────────────────────────────────────────
    SELECT pa.id, pa.status
      INTO v_award_id, v_award_status
      FROM prize_awards pa
     WHERE pa.source_kind           = 'arena_master'
       AND pa.source_arena_event_id = p_arena_event_id
       AND pa.source_arena_match_id = r_hist.arena_match_id
       AND pa.recipient_user_id     = r_hist.winner_user_id
     LIMIT 1;

    IF FOUND THEN
      -- 既存 award を返す（重複作成しない）
      RETURN QUERY SELECT
        v_award_id,
        v_arena_id,
        v_arena_code,
        p_arena_event_id,
        r_hist.arena_match_id,
        r_hist.winner_user_id,
        p_amount_cents,
        p_currency,
        p_prize_kind,
        v_award_status,
        'already_exists'::text;

    ELSE
      -- ── 新規 prize_award 作成 ──────────────────────────────
      INSERT INTO prize_awards (
        recipient_user_id,
        status,
        amount_cents,
        currency,
        source,
        source_kind,
        source_arena_id,
        source_arena_event_id,
        source_arena_match_id,
        prize_kind,
        created_by_user_id
      ) VALUES (
        r_hist.winner_user_id,
        'eligible',
        p_amount_cents,
        p_currency,
        'arena_master',
        'arena_master',
        v_arena_id,
        p_arena_event_id,
        r_hist.arena_match_id,
        p_prize_kind,
        v_caller_id
      )
      RETURNING id INTO v_award_id;

      -- ── archive log (append-only, PIIなし) ────────────────
      INSERT INTO prize_archive_logs (
        event_type,
        entity_type,
        entity_id,
        actor_user_id,
        after_state
      ) VALUES (
        'created',
        'prize_award',
        v_award_id,
        v_caller_id,
        jsonb_build_object(
          'status',                'eligible',
          'source_kind',           'arena_master',
          'prize_kind',            p_prize_kind,
          'amount_cents',          p_amount_cents,
          'currency',              p_currency,
          'source_arena_id',       v_arena_id,
          'source_arena_event_id', p_arena_event_id,
          'source_arena_match_id', r_hist.arena_match_id,
          'auto_generated',        true
        )
      );

      RETURN QUERY SELECT
        v_award_id,
        v_arena_id,
        v_arena_code,
        p_arena_event_id,
        r_hist.arena_match_id,
        r_hist.winner_user_id,
        p_amount_cents,
        p_currency,
        p_prize_kind,
        'eligible'::text,
        NULL::text;
    END IF;

  END LOOP;

  -- 対象 match が 0 件の場合は空結果を返す（エラーにしない）
END;
$$;

-- ── 権限 ─────────────────────────────────────────────────────────────────────
-- authenticated のみ実行可（RPC内部で is_admin を再確認）
REVOKE ALL ON FUNCTION admin_generate_arena_prize_awards(uuid, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_generate_arena_prize_awards(uuid, int, text, text) TO authenticated;
