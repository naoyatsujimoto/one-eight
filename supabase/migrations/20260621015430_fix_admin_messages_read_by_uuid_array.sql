-- ============================================================
-- fix: admin_generate_arena_prize_awards
-- admin_messages INSERT 時の read_by 型不一致を修正
--
-- 原因:
--   read_by カラムは uuid[] 型だが、INSERT式で ARRAY[]::text[] を
--   渡していたため、型不一致エラーが発生していた。
--
-- 修正:
--   ARRAY[]::text[] → ARRAY[]::uuid[]
--
-- その他の変更なし:
--   - 関数名・引数・戻り値形式は変更しない
--   - admin チェック・search_path・GRANT/REVOKE は変更しない
--   - prize_awards / prize_archive_logs / admin_messages の
--     作成ロジックの意味は変更しない
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
  v_caller_id    uuid;
  v_is_admin     boolean;
  v_arena_id     uuid;
  v_arena_code   text;
  r_hist         RECORD;
  v_award_id     uuid;
  v_award_status text;

  -- MAIL通知用
  v_arena_label  text;
  v_ja_title     text;
  v_en_title     text;
  v_ja_body      text;
  v_en_body      text;
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

  -- ── Arena表示名（大文字コードをそのまま使用。ELEPHANT / JAGUAR 等）
  v_arena_label := COALESCE(v_arena_code, '');

  -- ── 対象 match を arena_match_history から取得 ─────────────
  --   条件:
  --     match_kind = 'master'
  --     winner_user_id IS NOT NULL
  --     end_reason NOT IN ('no_contest', 'cancelled')
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
     AND amh.end_reason NOT IN ('no_contest', 'cancelled')
     AND am.status = 'processed'
   ORDER BY amh.created_at
  LOOP

    -- ── 重複チェック（prize_awards） ─────────────────────────
    SELECT pa.id, pa.status
      INTO v_award_id, v_award_status
      FROM prize_awards pa
     WHERE pa.source_kind           = 'arena_master'
       AND pa.source_arena_event_id = p_arena_event_id
       AND pa.source_arena_match_id = r_hist.arena_match_id
       AND pa.recipient_user_id     = r_hist.winner_user_id
     LIMIT 1;

    IF FOUND THEN
      -- 既存 award → MAIL通知もINSERTしない
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

      -- ── archive log ────────────────────────────────────────
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

      -- ── 個人向け MAIL 通知（admin_messages）──────────────────
      -- タイトル・本文を組み立て
      IF v_arena_label <> '' THEN
        v_ja_title := v_arena_label || ' Master Reward のお知らせ';
        v_en_title := 'Notice: ' || v_arena_label || ' Master Reward';
      ELSE
        v_ja_title := 'Master Reward のお知らせ';
        v_en_title := 'Notice: Master Reward';
      END IF;

      IF v_arena_label <> '' THEN
        v_ja_body :=
          'おめでとうございます。' || E'\n\n' ||
          'あなたは ' || v_arena_label || ' のMaster称号に関わる対局結果により、Reward / Prize の対象になりました。' || E'\n\n' ||
          'Reward / Prizeを受け取るには、受取情報・税務確認・PayPal受取メールの提出が必要です。' || E'\n\n' ||
          'User Pageの受賞・報酬セクションから、必要情報を提出してください。' || E'\n\n' ||
          '提出された機微情報は、Winner Fileとして保存後、情報セキュリティ対策として原則72時間以内にオンラインDBから削除されます。';

        v_en_body :=
          'Congratulations.' || E'\n\n' ||
          'Based on your result in an Arena Master-related match for ' || v_arena_label || ', you are eligible for a Reward / Prize.' || E'\n\n' ||
          'To receive the Reward / Prize, you need to submit payout information, tax confirmation, and a PayPal receiving email.' || E'\n\n' ||
          'Please submit the required information from the Reward / Prize section on your User Page.' || E'\n\n' ||
          'After the submitted sensitive information is saved as a Winner File, it will generally be deleted from the online database within 72 hours as an information security measure.';
      ELSE
        v_ja_body :=
          'おめでとうございます。' || E'\n\n' ||
          'あなたはMaster称号に関わる対局結果により、Reward / Prize の対象になりました。' || E'\n\n' ||
          'Reward / Prizeを受け取るには、受取情報・税務確認・PayPal受取メールの提出が必要です。' || E'\n\n' ||
          'User Pageの受賞・報酬セクションから、必要情報を提出してください。' || E'\n\n' ||
          '提出された機微情報は、Winner Fileとして保存後、情報セキュリティ対策として原則72時間以内にオンラインDBから削除されます。';

        v_en_body :=
          'Congratulations.' || E'\n\n' ||
          'Based on your result in an Arena Master-related match, you are eligible for a Reward / Prize.' || E'\n\n' ||
          'To receive the Reward / Prize, you need to submit payout information, tax confirmation, and a PayPal receiving email.' || E'\n\n' ||
          'Please submit the required information from the Reward / Prize section on your User Page.' || E'\n\n' ||
          'After the submitted sensitive information is saved as a Winner File, it will generally be deleted from the online database within 72 hours as an information security measure.';
      END IF;

      -- ON CONFLICT DO NOTHING: UNIQUE INDEX (source_id, target) で重複を防ぐ
      INSERT INTO admin_messages (
        title,
        body,
        target,
        read_by,
        translations,
        source_id
      )
      VALUES (
        v_ja_title,
        v_ja_body,
        r_hist.winner_user_id::text,
        ARRAY[]::uuid[],          -- fix: was ARRAY[]::text[], corrected to uuid[]
        jsonb_build_object(
          'ja', jsonb_build_object('title', v_ja_title, 'body', v_ja_body),
          'en', jsonb_build_object('title', v_en_title, 'body', v_en_body)
        ),
        v_award_id::text
      )
      ON CONFLICT (source_id, target) WHERE source_id IS NOT NULL
        DO NOTHING;

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

-- ── 権限（変更なし）──────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION admin_generate_arena_prize_awards(uuid, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_generate_arena_prize_awards(uuid, int, text, text) TO authenticated;
