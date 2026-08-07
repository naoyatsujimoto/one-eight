-- =============================================================================
-- Master報酬制度改定 Phase 1 — RPC修正（補正済み）
-- admin_generate_arena_prize_awards を拡張:
--   arena_definitions.master_reward_amount_cents / master_reward_currency が
--   両方設定済み (NOT NULL) の場合は arena 設定値を使用。
--   未設定 (いずれかまたは両方 NULL) の場合は master_reward_not_configured エラー。
--   設定済みの値と引数が不一致の場合は master_reward_amount_mismatch エラー。
--
--   p_amount_cents / p_currency 引数は後方互換のためシグネチャは維持するが、
--   未設定 Arena に対するフォールバックは廃止する。
--
-- 既存 prize_awards 行は一切変更しない。
-- commit / push / 本番 DB 適用禁止。
-- =============================================================================

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
  -- Phase 1: arena設定値
  v_arena_reward_cents   integer;
  v_arena_reward_currency text;
  -- 実効 amount / currency（arena設定値を正本とする）
  v_eff_amount_cents int;
  v_eff_currency     text;
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
  SELECT ae.arena_id, ad.code,
         ad.master_reward_amount_cents,
         ad.master_reward_currency
    INTO v_arena_id, v_arena_code,
         v_arena_reward_cents,
         v_arena_reward_currency
    FROM arena_events ae
    JOIN arena_definitions ad ON ad.id = ae.arena_id
   WHERE ae.id = p_arena_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'arena_event_not_found'
      USING DETAIL = 'No arena_event found for the given arena_event_id.';
  END IF;

  -- ── Phase 1（補正1）: arena設定値を正本として実効値を決定 ──────
  -- 両方設定済みの場合のみ arena 設定値を使用する。
  -- いずれかが NULL の場合は master_reward_not_configured エラーで停止（フォールバックなし）。
  IF v_arena_reward_cents IS NOT NULL AND v_arena_reward_currency IS NOT NULL THEN
    -- arena設定値と引数が不一致の場合は mismatch エラー
    IF p_amount_cents <> v_arena_reward_cents OR upper(p_currency) <> v_arena_reward_currency THEN
      RAISE EXCEPTION 'master_reward_amount_mismatch'
        USING DETAIL = format(
          'Arena master_reward is configured as %s %s, but arguments provided %s %s. Pass the configured values.',
          v_arena_reward_cents, v_arena_reward_currency,
          p_amount_cents, upper(p_currency)
        );
    END IF;
    v_eff_amount_cents := v_arena_reward_cents;
    v_eff_currency     := v_arena_reward_currency;
  ELSE
    -- 未設定（いずれかまたは両方 NULL）→ エラーで報酬生成を停止
    RAISE EXCEPTION 'master_reward_not_configured'
      USING DETAIL = format(
        'Arena "%s" does not have master_reward configured in arena_definitions. '
        'Set master_reward_amount_cents and master_reward_currency before generating awards.',
        COALESCE(v_arena_code, p_arena_event_id::text)
      );
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
        v_eff_amount_cents,
        v_eff_currency,
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
        v_eff_amount_cents,
        v_eff_currency,
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
          'amount_cents',          v_eff_amount_cents,
          'currency',              v_eff_currency,
          'source_arena_id',       v_arena_id,
          'source_arena_event_id', p_arena_event_id,
          'source_arena_match_id', r_hist.arena_match_id,
          'auto_generated',        true,
          'amount_source',         'arena_definition'
        )
      );

      RETURN QUERY SELECT
        v_award_id,
        v_arena_id,
        v_arena_code,
        p_arena_event_id,
        r_hist.arena_match_id,
        r_hist.winner_user_id,
        v_eff_amount_cents,
        v_eff_currency,
        p_prize_kind,
        'eligible'::text,
        NULL::text;
    END IF;

  END LOOP;

  -- 対象 match が 0 件の場合は空結果を返す（エラーにしない）
END;
$$;

-- ── 権限（既存と同一を維持） ────────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_generate_arena_prize_awards(uuid, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_generate_arena_prize_awards(uuid, int, text, text) TO authenticated;
