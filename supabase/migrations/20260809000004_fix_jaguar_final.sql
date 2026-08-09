-- =============================================================================
-- 最終補正: JAGUAR Master履歴・online_game・Master報酬RPC
--
-- 背景:
--   20260809000001 Pass 1 の online_game_id 参照バグ（am → om）により
--   online_games が未更新のまま残存。
--   process_arena_results() の RECORD IS NOT NULL バグにより
--   7/5・8/2・8/9 の3件が master_effect='transferred' として誤処理。
--   20260809000002 が適用済みの場合、一部の補正は既完了であるため
--   冪等に処理する（既補正済み項目はスキップ、未補正項目のみ適用）。
--
-- 補正内容:
--   1. arena_matches 3件の master_effect を transferred → defended に変更（冪等）
--   2. arena_match_history 3件の master_effect を transferred → defended に変更（冪等）
--   3. 誤再戴冠 arena_master_history（8/9）を失冠させる（冪等）
--   4. 6/28 正当取得 arena_master_history を active に復元（冪等）
--   5. arena_definitions.current_master_since_event_id を 6/28 event に復元（冪等）
--   6. 8/9 online_game を finished に更新（冪等）
--   7. admin_generate_arena_prize_awards の no_show 除外条件修正
--      end_reason NOT IN ('no_show','no_contest','cancelled')
--      → end_reason NOT IN ('no_contest','cancelled')
--
-- 変更しないもの:
--   - ポイント（arena_points）
--   - 勝敗数・参加数・no_show_losses
--   - prize_awards（生成・支払いは行わない）
--   - Elephant 等の他 Arena のデータ
--   - admin_generate_arena_prize_awards の権限・バリデーション・重複防止・通知ロジック
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_arena_id        uuid := '6c39ec76-ea5f-4cd6-b123-c4615392fc33';
  v_master_user_id  uuid := 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f';
  v_legit_event_id  uuid := 'fb1d7a46-e801-4a61-8e92-ed3542c7b3a5';
  v_online_game_id  uuid := '61974f0f-715e-4d7a-958b-feee955e9aa3';
  v_legit_history_id uuid := '64e4dd45-b587-4cb9-ac60-91f264ce5c0b';

  -- 対象3件の arena_match id
  v_match_705       uuid := 'd36cbaca-67b0-4d5e-9b35-0d58d9bc366a';
  v_match_802       uuid := '724801fb-35ff-45d1-824c-f5de08b8807c';
  v_match_809       uuid := '29eb8a00-65eb-4a91-b755-80764acd9667';

  -- 誤再戴冠 history (8/9の active なもの)
  v_wrong_809_history_id uuid := 'e69e2865-11ad-45f0-a442-4a6e7e92a71d';

  v_check_count     int;
  v_current_master  uuid;
  v_online_status   text;
  v_legit_dethroned timestamptz;
  v_wrong_dethroned timestamptz;
BEGIN

  -- ==========================================================================
  -- 基本前提確認（冪等補正の前提として必須）
  -- ==========================================================================

  -- 1. arena が存在する
  PERFORM 1 FROM arena_definitions WHERE id = v_arena_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: arena_id % が見つかりません', v_arena_id;
  END IF;

  -- 2. 対象3件の winner_user_id が全件 v_master_user_id
  SELECT count(*) INTO v_check_count
  FROM arena_matches
  WHERE id IN (v_match_705, v_match_802, v_match_809)
    AND winner_user_id = v_master_user_id;
  IF v_check_count <> 3 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 対象3件の winner_user_id が期待値と不一致 (found=%, expected=3)', v_check_count;
  END IF;

  -- 3. current_master_user_id が v_master_user_id
  SELECT current_master_user_id INTO v_current_master
  FROM arena_definitions WHERE id = v_arena_id;
  IF v_current_master IS DISTINCT FROM v_master_user_id THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: current_master_user_id が期待値と不一致 (actual=%, expected=%)',
      v_current_master, v_master_user_id;
  END IF;

  -- 4. 正当取得 event が存在する
  PERFORM 1 FROM arena_events WHERE id = v_legit_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 正当取得 event % が見つかりません', v_legit_event_id;
  END IF;

  -- 5. online_game が存在する（status に関わらず）
  SELECT status INTO v_online_status FROM online_games WHERE id = v_online_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: online_game % が見つかりません', v_online_game_id;
  END IF;

  -- 6. 正当取得 history が存在することを確認
  SELECT dethroned_at INTO v_legit_dethroned
  FROM arena_master_history WHERE id = v_legit_history_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 正当取得 history (id=%) が見つかりません', v_legit_history_id;
  END IF;

  -- 7. 誤再戴冠 history (8/9) が存在することを確認
  SELECT dethroned_at INTO v_wrong_dethroned
  FROM arena_master_history WHERE id = v_wrong_809_history_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 誤再戴冠 history (id=%) が見つかりません', v_wrong_809_history_id;
  END IF;

  -- ==========================================================================
  -- 補正1: arena_matches.master_effect を defended へ変更（冪等）
  -- ==========================================================================
  UPDATE arena_matches
  SET
    master_effect = 'defended',
    updated_at    = NOW()
  WHERE id IN (v_match_705, v_match_802, v_match_809)
    AND master_effect = 'transferred';

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  RAISE NOTICE '補正1: arena_matches 更新 %件 (0件は既に補正済み)', v_check_count;

  -- ==========================================================================
  -- 補正2: arena_match_history.master_effect を defended へ変更（冪等）
  -- ==========================================================================
  UPDATE arena_match_history
  SET master_effect = 'defended'
  WHERE arena_match_id IN (v_match_705, v_match_802, v_match_809)
    AND master_effect = 'transferred';

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  RAISE NOTICE '補正2: arena_match_history 更新 %件 (0件は既に補正済み)', v_check_count;

  -- ==========================================================================
  -- 補正3: 誤再戴冠 history (8/9) を失冠させる（冪等）
  --        7/5・8/2 の誤再戴冠は既に dethroned 済み
  -- ==========================================================================
  -- unique partial index の制約回避のため正当を復元する前に実行
  IF v_wrong_dethroned IS NULL THEN
    UPDATE arena_master_history
    SET dethroned_at = NOW()
    WHERE id = v_wrong_809_history_id;
    RAISE NOTICE '補正3: 誤再戴冠 history (id=%) を失冠させました', v_wrong_809_history_id;
  ELSE
    RAISE NOTICE '補正3: 誤再戴冠 history (id=%) は既に失冠済みです（スキップ）', v_wrong_809_history_id;
  END IF;

  -- ==========================================================================
  -- 補正4: 6/28 正当取得 history を active に復元（冪等）
  -- ==========================================================================
  IF v_legit_dethroned IS NOT NULL THEN
    UPDATE arena_master_history
    SET dethroned_at = NULL
    WHERE id = v_legit_history_id;
    RAISE NOTICE '補正4: 正当取得 history (id=%) を active に復元しました', v_legit_history_id;
  ELSE
    RAISE NOTICE '補正4: 正当取得 history (id=%) は既に active です（スキップ）', v_legit_history_id;
  END IF;

  -- ==========================================================================
  -- 補正5: arena_definitions.current_master_since_event_id を 6/28 event に復元（冪等）
  -- ==========================================================================
  UPDATE arena_definitions
  SET
    current_master_since_event_id  = v_legit_event_id,
    current_master_user_id         = v_master_user_id,
    current_interim_master_user_id = NULL,
    current_interim_since_event_id = NULL,
    updated_at = NOW()
  WHERE id = v_arena_id
    AND current_master_user_id = v_master_user_id
    AND current_master_since_event_id IS DISTINCT FROM v_legit_event_id;

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  RAISE NOTICE '補正5: arena_definitions 更新 %件 (0件は既に補正済み)', v_check_count;

  -- ==========================================================================
  -- 補正6: 8/9 online_game を finished へ更新（冪等）
  -- ==========================================================================
  UPDATE online_games
  SET
    status            = 'finished',
    winner            = 'black',
    end_reason        = 'forfeit_white',
    timeout_player    = NULL,
    turn_started_at   = NULL,
    server_updated_at = NOW(),
    updated_at        = NOW()
  WHERE id = v_online_game_id
    AND status = 'playing';

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  RAISE NOTICE '補正6: online_game 更新 %件 (0件は既に補正済み)', v_check_count;

  -- ==========================================================================
  -- 最終確認ログ
  -- ==========================================================================
  RAISE NOTICE '全補正処理完了 (冪等):';
  RAISE NOTICE '  arena_id              = %', v_arena_id;
  RAISE NOTICE '  master_user_id        = %', v_master_user_id;
  RAISE NOTICE '  legit_event_id        = %', v_legit_event_id;
  RAISE NOTICE '  legit_history_id      = %', v_legit_history_id;
  RAISE NOTICE '  online_game_id        = %', v_online_game_id;

END;
$$;

-- ==========================================================================
-- 補正7: admin_generate_arena_prize_awards の no_show 除外条件修正
--        end_reason NOT IN ('no_show','no_contest','cancelled')
--        → end_reason NOT IN ('no_contest','cancelled')
--
-- 理由: no_show (challenger 未入室による forfeit) は Master 防衛勝利であり
--       報酬対象とすべき。Master 戦での no_show は Master 側勝利なので報酬生成可。
--
-- 変更しないもの:
--   - 権限 (SECURITY DEFINER / GRANT / REVOKE)
--   - 引数バリデーション
--   - arena設定値の正本ロジック (master_reward_amount_cents / master_reward_currency)
--   - 重複防止 (prize_awards 重複チェック)
--   - prize_archive_logs への通知ログ
-- ==========================================================================

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

  -- ── Phase 1: arena設定値を正本として実効値を決定 ──────────
  IF v_arena_reward_cents IS NOT NULL AND v_arena_reward_currency IS NOT NULL THEN
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
  --     end_reason NOT IN ('no_contest', 'cancelled')      ← FIX: no_show を除外リストから削除
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

COMMIT;
