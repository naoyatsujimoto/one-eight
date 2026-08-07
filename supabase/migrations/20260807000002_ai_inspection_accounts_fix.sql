-- =============================================================================
-- 20260807000002_ai_inspection_accounts_fix.sql
-- AI確認アカウント補正migration
-- 20260807000001_ai_inspection_accounts.sql の不足・誤実装を補正する
-- 既存migrationの変更・rollbackは禁止。補正のみ。
-- =============================================================================

-- =============================================================================
-- 1. 内部テストアカウント判定ヘルパー（SECURITY DEFINER / authenticated悪用不可）
-- =============================================================================

-- 注: この関数は authenticated ロールに EXECUTE を付与しない。
-- SECURITY DEFINER で実行されるRPCからのみ呼ばれる内部ヘルパー。

CREATE OR REPLACE FUNCTION public._is_internal_test_account(p_uid uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public
  STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_internal_test_account FROM profiles WHERE id = p_uid),
    false
  );
$$;

-- 一般ユーザーが直接呼び出せないよう REVOKE
REVOKE ALL ON FUNCTION public._is_internal_test_account(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._is_internal_test_account(uuid) FROM anon;
REVOKE ALL ON FUNCTION public._is_internal_test_account(uuid) FROM authenticated;
-- postgres / service_role はデフォルトで実行可能

-- =============================================================================
-- 2. enter_arena_event — 内部テストアカウント拒否ガードを追加
--    本番最新版 (pg_get_functiondef 取得済み) にガードのみ追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enter_arena_event(p_arena_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid            UUID;
  v_event          arena_events%ROWTYPE;
  v_entry_deadline TIMESTAMPTZ;
  v_is_pro         BOOLEAN;
  v_entry_id       UUID;
  v_entered_at     TIMESTAMPTZ;
  v_prev_event_id  UUID;
  v_has_unprocessed BOOLEAN;
BEGIN
  -- 1. 認証チェック
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- ★ 内部テストアカウント拒否 (補正追加)
  IF public._is_internal_test_account(v_uid) THEN
    RAISE EXCEPTION 'forbidden: internal inspection accounts are read-only';
  END IF;

  -- 2. event存在確認 (FOR UPDATE: 同時実行対策)
  SELECT ae.*
  INTO v_event
  FROM arena_events ae
  WHERE ae.id = p_arena_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  -- 3. event status チェック
  IF v_event.status != 'scheduled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'event_not_open',
      'status', v_event.status
    );
  END IF;

  -- 4. entry deadline チェック
  SELECT v_event.scheduled_at - ((ad.entry_deadline_hours || ' hours')::INTERVAL)
  INTO v_entry_deadline
  FROM arena_definitions ad
  WHERE ad.id = v_event.arena_id;

  IF now() >= v_entry_deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'entry_deadline_passed');
  END IF;

  -- 5. Pro チェック
  SELECT (
    p.plan = 'pro'
    AND (
      (p.subscription_status = 'active' AND (p.current_period_end IS NULL OR p.current_period_end > now()))
      OR
      (p.subscription_status = 'canceled' AND p.current_period_end IS NOT NULL AND p.current_period_end > now())
    )
  )
  INTO v_is_pro
  FROM profiles p
  WHERE p.id = v_uid;

  IF v_is_pro IS NULL OR v_is_pro = FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pro_required');
  END IF;

  -- 6. 前回Event結果未処理チェック
  --    同一Arenaの直近前回Eventに未processed の arena_match が残っていれば Entry拒否
  SELECT prev_ae.id
  INTO v_prev_event_id
  FROM arena_events prev_ae
  WHERE prev_ae.arena_id = v_event.arena_id
    AND prev_ae.scheduled_at < v_event.scheduled_at
    AND prev_ae.status IN ('generated', 'matched', 'completed', 'closed', 'scheduled', 'open')
  ORDER BY prev_ae.scheduled_at DESC
  LIMIT 1;

  IF v_prev_event_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM arena_matches prev_am
      WHERE prev_am.arena_event_id = v_prev_event_id
        AND prev_am.status NOT IN ('processed', 'cancelled')
    )
    INTO v_has_unprocessed;

    IF v_has_unprocessed THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'previous_results_pending');
    END IF;
  END IF;

  -- 7. duplicate entry チェック + INSERT (UNIQUE violation でも安全に返す)
  BEGIN
    INSERT INTO arena_entries (arena_event_id, user_id)
    VALUES (p_arena_event_id, v_uid)
    RETURNING id, entered_at
    INTO v_entry_id, v_entered_at;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_entered');
  END;

  -- 8. 成功レスポンス
  RETURN jsonb_build_object(
    'ok',             true,
    'entry_id',       v_entry_id,
    'arena_event_id', p_arena_event_id,
    'entered_at',     v_entered_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enter_arena_event(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.enter_arena_event(uuid) FROM anon;

-- =============================================================================
-- 3. join_or_create_random_game — 内部テストアカウント拒否ガードを追加
--    本番最新版 (pg_get_functiondef 取得済み) にガードのみ追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_or_create_random_game(p_user_id uuid, p_initial_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_game         online_games;
  v_now          timestamptz := clock_timestamp();
  v_room_code    text;
  v_chars        text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i            int;
  v_timer_config jsonb := '{"mode":"per_move","totalSeconds":600,"perMoveSeconds":60}'::jsonb;
BEGIN
  -- セキュリティ: p_user_id が呼び出し元と一致することを強制（spoofing防止）
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_id_mismatch'
      USING DETAIL = 'p_user_id must match the authenticated user';
  END IF;

  -- ★ 内部テストアカウント拒否 (補正追加)
  IF public._is_internal_test_account(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: internal inspection accounts are read-only';
  END IF;

  -- waiting 中の自分以外のゲームを検索
  SELECT * INTO v_game
  FROM online_games
  WHERE status = 'waiting'
    AND black_player_id != p_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    -- 既存ゲームに参加（白番）
    UPDATE online_games SET
      white_player_id    = p_user_id,
      current_player_id  = black_player_id,
      status             = 'playing',
      timer_config       = COALESCE(timer_config, v_timer_config),
      black_remaining_ms = CASE
        WHEN COALESCE(timer_config, v_timer_config)->>'mode' = 'total_time'
          THEN (COALESCE(timer_config, v_timer_config)->>'totalSeconds')::int * 1000
        ELSE NULL
      END,
      white_remaining_ms = CASE
        WHEN COALESCE(timer_config, v_timer_config)->>'mode' = 'total_time'
          THEN (COALESCE(timer_config, v_timer_config)->>'totalSeconds')::int * 1000
        ELSE NULL
      END,
      turn_started_at    = v_now,
      server_updated_at  = v_now,
      updated_at         = v_now
    WHERE id = v_game.id;

    RETURN jsonb_build_object(
      'game_id',   v_game.id,
      'color',     'white',
      'room_code', v_game.room_code
    );
  END IF;

  -- 既存ゲームなし → 新規作成（黒番）
  FOR v_i IN 1..5 LOOP
    v_room_code := '';
    FOR v_i IN 1..6 LOOP
      v_room_code := v_room_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO online_games (
        room_code,
        black_player_id,
        current_player_id,
        status,
        game_state,
        move_number,
        timer_config,
        server_updated_at
      ) VALUES (
        v_room_code,
        p_user_id,
        NULL,
        'waiting',
        p_initial_state,
        1,
        v_timer_config,
        v_now
      )
      RETURNING * INTO v_game;

      RETURN jsonb_build_object(
        'game_id',   v_game.id,
        'color',     'black',
        'room_code', v_room_code
      );
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'failed_to_create_game';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_or_create_random_game(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_or_create_random_game(uuid, jsonb) FROM anon;

-- =============================================================================
-- 4. apply_online_move — 内部テストアカウント拒否ガードを追加
--    本番最新版 (pg_get_functiondef 取得済み) にガードのみ追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.apply_online_move(
  p_game_id uuid,
  p_expected_move_number integer,
  p_new_game_state jsonb,
  p_next_player_id uuid,
  p_winner text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_game             online_games;
  v_now              timestamptz := clock_timestamp();
  v_elapsed_ms       bigint;
  v_mode             text;
  v_mover_color      text;
  v_remaining_ms     bigint;
  v_per_move_ms      bigint;
  v_timed_out        bool := false;
  v_effective_winner text := p_winner;
  v_byoyomi_ms       bigint;
  v_player_total_ms  bigint;
BEGIN
  -- ★ 内部テストアカウント拒否 (補正追加) — 行ロック前に早期リターン
  IF public._is_internal_test_account(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: internal inspection accounts are read-only';
  END IF;

  -- 行ロック取得
  SELECT * INTO v_game FROM online_games WHERE id = p_game_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game_not_found';
  END IF;
  IF v_game.status != 'playing' THEN
    RAISE EXCEPTION 'game_not_active';
  END IF;
  IF v_game.current_player_id != auth.uid() THEN
    RAISE EXCEPTION 'not_your_turn';
  END IF;
  IF v_game.move_number != p_expected_move_number THEN
    RAISE EXCEPTION 'conflict';
  END IF;

  -- ── 公式戦: 定刻前の着手を拒否 ────────────────────────────────────────────
  IF v_game.official_starts_at IS NOT NULL AND v_now < v_game.official_starts_at THEN
    RAISE EXCEPTION 'match_not_started: official match starts at %', v_game.official_starts_at;
  END IF;

  -- ── タイマー処理（timer_config が NULL なら完全スキップ）─────────────────
  IF v_game.timer_config IS NOT NULL THEN
    v_mode := v_game.timer_config->>'mode';

    IF v_mode IS NOT NULL AND v_mode != 'none' THEN
      -- 手番者の色を特定
      v_mover_color := CASE
        WHEN v_game.current_player_id = v_game.black_player_id THEN 'black'
        ELSE 'white'
      END;

      -- turn_started_at から消費時間を計算（DBサーバー基準時刻）
      IF v_game.turn_started_at IS NOT NULL THEN
        v_elapsed_ms := EXTRACT(EPOCH FROM (v_now - v_game.turn_started_at)) * 1000;
      ELSE
        v_elapsed_ms := 0;
      END IF;

      -- 公式戦: タイマーは starts_at から計算（starts_at 前の elapsed は 0）
      IF v_game.official_starts_at IS NOT NULL AND v_game.turn_started_at < v_game.official_starts_at THEN
        v_elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_game.official_starts_at)) * 1000)::bigint;
      END IF;

      IF v_mode = 'per_move' THEN
        v_per_move_ms := (v_game.timer_config->>'perMoveSeconds')::bigint * 1000;
        IF v_elapsed_ms >= v_per_move_ms THEN
          v_timed_out := true;
        END IF;

      ELSIF v_mode = 'total_time' THEN
        -- BY-3: byoyomi 対応
        v_byoyomi_ms := COALESCE((v_game.timer_config->>'byoyomiSeconds')::bigint, 0) * 1000;

        v_player_total_ms := CASE v_mover_color
          WHEN 'black' THEN COALESCE(v_game.black_remaining_ms, 0)::bigint
          ELSE COALESCE(v_game.white_remaining_ms, 0)::bigint
        END;

        IF v_elapsed_ms >= v_player_total_ms + v_byoyomi_ms THEN
          v_timed_out := true;
          v_remaining_ms := 0;
        ELSE
          v_remaining_ms := GREATEST(0, v_player_total_ms - v_elapsed_ms);
        END IF;

        IF v_mover_color = 'black' THEN
          v_game.black_remaining_ms := v_remaining_ms::int;
        ELSE
          v_game.white_remaining_ms := v_remaining_ms::int;
        END IF;
      END IF;
    END IF;
  END IF;

  -- タイムアウト確定 → 勝者は相手プレイヤー
  IF v_timed_out THEN
    v_effective_winner := CASE WHEN v_mover_color = 'black' THEN 'white' ELSE 'black' END;
  END IF;

  -- ── online_games 更新 ────────────────────────────────────────────────────
  UPDATE online_games SET
    game_state        = p_new_game_state,
    move_number       = move_number + 1,
    current_player_id = CASE
                          WHEN (v_timed_out OR v_effective_winner IS NOT NULL) THEN current_player_id
                          ELSE p_next_player_id
                        END,
    winner            = CASE
                          WHEN (v_timed_out OR v_effective_winner IS NOT NULL) THEN v_effective_winner
                          ELSE NULL
                        END,
    status            = CASE
                          WHEN (v_timed_out OR v_effective_winner IS NOT NULL) THEN 'finished'
                          ELSE status
                        END,
    end_reason        = CASE
                          WHEN v_timed_out       THEN 'timeout'
                          WHEN v_effective_winner IS NOT NULL THEN 'normal'
                          ELSE 'normal'
                        END,
    timeout_player    = CASE WHEN v_timed_out THEN v_mover_color ELSE NULL END,
    black_remaining_ms = CASE
                           WHEN v_game.timer_config IS NOT NULL THEN v_game.black_remaining_ms
                           ELSE black_remaining_ms
                         END,
    white_remaining_ms = CASE
                           WHEN v_game.timer_config IS NOT NULL THEN v_game.white_remaining_ms
                           ELSE white_remaining_ms
                         END,
    turn_started_at   = CASE
                          WHEN (v_timed_out OR v_effective_winner IS NOT NULL) THEN NULL
                          ELSE v_now
                        END,
    server_updated_at = v_now,
    updated_at        = v_now
  WHERE id = p_game_id;

  -- ── 終局時: match_logs に保存 ───────────────────────────────────────────
  IF v_timed_out OR v_effective_winner IS NOT NULL THEN
    INSERT INTO match_logs (
      user_id, game_id, started_at, ended_at, mode,
      human_color, winner, move_count, full_record,
      timer_config, end_reason
    )
    VALUES (
      auth.uid(),
      p_game_id,
      v_game.created_at,
      v_now,
      'online_pvp',
      CASE WHEN v_game.current_player_id = v_game.black_player_id THEN 'black' ELSE 'white' END,
      v_effective_winner,
      jsonb_array_length(p_new_game_state->'history'),
      p_new_game_state,
      v_game.timer_config,
      CASE WHEN v_timed_out THEN 'timeout' ELSE 'normal' END
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object(
    'ok',                 true,
    'timed_out',          v_timed_out,
    'winner',             v_effective_winner,
    'black_remaining_ms', v_game.black_remaining_ms,
    'white_remaining_ms', v_game.white_remaining_ms,
    'turn_started_at',    CASE
                            WHEN (v_timed_out OR v_effective_winner IS NOT NULL) THEN NULL
                            ELSE v_now
                          END,
    'server_updated_at',  v_now
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.apply_online_move(uuid, integer, jsonb, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_online_move(uuid, integer, jsonb, uuid, text) FROM anon;

-- =============================================================================
-- 5. claim_timeout — 内部テストアカウント拒否ガードを追加
--    本番最新版 (pg_get_functiondef 取得済み) にガードのみ追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_timeout(p_game_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_game              online_games;
  v_now               timestamptz := clock_timestamp();
  v_elapsed_ms        bigint;
  v_limit_ms          bigint;
  v_mover_color       text;
  v_remaining_ms      bigint;
  v_timed_out_player  text;
  v_winner            text;
  v_byoyomi_ms        bigint;
  v_player_total_ms   bigint;
BEGIN
  -- ★ 内部テストアカウント拒否 (補正追加)
  IF public._is_internal_test_account(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: internal inspection accounts are read-only';
  END IF;

  SELECT * INTO v_game FROM online_games WHERE id = p_game_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'game_not_found';
  END IF;
  IF v_game.status != 'playing' THEN
    RAISE EXCEPTION 'game_not_active';
  END IF;

  -- 参加者（black / white）のみ呼べる
  IF auth.uid() != v_game.black_player_id AND auth.uid() != v_game.white_player_id THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  IF v_game.timer_config IS NULL OR v_game.timer_config->>'mode' = 'none' THEN
    RAISE EXCEPTION 'no_timer_configured';
  END IF;

  IF v_game.turn_started_at IS NULL THEN
    RAISE EXCEPTION 'turn_not_started';
  END IF;

  -- 現在の手番者の色
  v_mover_color := CASE
    WHEN v_game.current_player_id = v_game.black_player_id THEN 'black'
    ELSE 'white'
  END;

  -- 消費時間（DB基準）
  v_elapsed_ms := EXTRACT(EPOCH FROM (v_now - v_game.turn_started_at)) * 1000;

  -- タイムアウト検証
  IF (v_game.timer_config->>'mode') = 'per_move' THEN
    v_limit_ms := (v_game.timer_config->>'perMoveSeconds')::bigint * 1000;
    IF v_elapsed_ms < v_limit_ms THEN
      RAISE EXCEPTION 'not_timed_out_yet';
    END IF;

  ELSIF (v_game.timer_config->>'mode') = 'total_time' THEN
    -- BY-3: byoyomi 対応
    v_byoyomi_ms := COALESCE((v_game.timer_config->>'byoyomiSeconds')::bigint, 0) * 1000;

    v_player_total_ms := CASE v_mover_color
      WHEN 'black' THEN COALESCE(v_game.black_remaining_ms, 0)::bigint
      ELSE COALESCE(v_game.white_remaining_ms, 0)::bigint
    END;

    IF v_elapsed_ms < v_player_total_ms + v_byoyomi_ms THEN
      RAISE EXCEPTION 'not_timed_out_yet';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported_timer_mode';
  END IF;

  -- タイムアウト確定
  v_timed_out_player := v_mover_color;
  v_winner := CASE WHEN v_timed_out_player = 'black' THEN 'white' ELSE 'black' END;

  UPDATE online_games SET
    status            = 'finished',
    winner            = v_winner,
    end_reason        = 'timeout',
    timeout_player    = v_timed_out_player,
    turn_started_at   = NULL,
    server_updated_at = v_now,
    updated_at        = v_now
  WHERE id = p_game_id;

  -- match_logs 保存
  INSERT INTO match_logs (
    user_id, game_id, started_at, ended_at, mode, human_color,
    winner, move_count, full_record, timer_config, end_reason
  )
  SELECT
    auth.uid(),
    v_game.id::text,
    v_game.created_at,
    v_now,
    'online_pvp',
    NULL,
    v_winner,
    jsonb_array_length(v_game.game_state->'history'),
    v_game.game_state->'history',
    v_game.timer_config,
    'timeout'
  ON CONFLICT (game_id) DO NOTHING;

  RETURN json_build_object(
    'winner',         v_winner,
    'timeout_player', v_timed_out_player
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_timeout(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_timeout(uuid) FROM anon;

-- =============================================================================
-- 6. submit_prize_tax_submission — 内部テストアカウント拒否を本実装
--    本番最新版 (pg_get_functiondef 取得済み) にガードのみ追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_prize_tax_submission(
  p_award_id uuid,
  p_legal_name text,
  p_display_name text,
  p_residence_country text,
  p_address_line1 text,
  p_address_line2 text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_region text DEFAULT NULL::text,
  p_postal_code text DEFAULT NULL::text,
  p_country text DEFAULT NULL::text,
  p_tax_residence_country text DEFAULT NULL::text,
  p_domestic_or_foreign text DEFAULT NULL::text,
  p_paypal_email text DEFAULT NULL::text,
  p_preferred_currency text DEFAULT 'USD'::text,
  p_user_confirmed_legal_responsibility boolean DEFAULT false,
  p_user_confirmed_paypal_name_match boolean DEFAULT false
)
 RETURNS TABLE(submission_id uuid, award_id uuid, status text, delete_after timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_caller_id   uuid;
  v_award       prize_awards%ROWTYPE;
  v_sub_id      uuid;
  v_delete_after timestamptz;
  v_data        jsonb;
BEGIN
  -- ── 認証確認 ─────────────────────────────────────────────
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated to submit prize tax information.';
  END IF;

  -- ★ 内部テストアカウント拒否 (補正: 以前はNOTICEのみだったが実際の拒否を実装)
  IF public._is_internal_test_account(v_caller_id) THEN
    RAISE EXCEPTION 'forbidden: internal inspection accounts are read-only';
  END IF;

  -- ── award 取得 ─────────────────────────────────────────────
  SELECT *
    INTO v_award
    FROM prize_awards
   WHERE id = p_award_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_not_found'
      USING DETAIL = 'Prize award not found.';
  END IF;

  -- ── recipient 確認 ────────────────────────────────────────
  IF v_award.recipient_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'permission_denied'
      USING DETAIL = 'You are not the recipient of this award.';
  END IF;

  -- ── award status 確認 ─────────────────────────────────────
  IF v_award.status NOT IN ('eligible', 'pending') THEN
    IF v_award.status = 'on_hold' THEN
      RAISE EXCEPTION 'award_on_hold'
        USING DETAIL = 'This award is currently on hold. Please contact admin.';
    ELSIF v_award.status = 'canceled' THEN
      RAISE EXCEPTION 'award_canceled'
        USING DETAIL = 'This award has been canceled.';
    ELSIF v_award.status = 'expired' THEN
      RAISE EXCEPTION 'award_expired'
        USING DETAIL = 'This award has expired.';
    ELSE
      RAISE EXCEPTION 'award_status_invalid'
        USING DETAIL = 'This award is not eligible for submission.';
    END IF;
  END IF;

  -- ── 重複提出チェック（table alias で ambiguous 解消）─────
  PERFORM 1
    FROM prize_temp_tax_submissions pts
   WHERE pts.award_id = p_award_id
     AND pts.status IN ('submitted', 'reviewed', 'archived', 'data_cleared');

  IF FOUND THEN
    RAISE EXCEPTION 'submission_already_exists'
      USING DETAIL = 'A submission for this award already exists. Duplicate submissions are not allowed.';
  END IF;

  -- ── 必須フィールドバリデーション ─────────────────────────
  IF p_legal_name IS NULL OR trim(p_legal_name) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'legal_name is required.';
  END IF;

  IF p_residence_country IS NULL OR trim(p_residence_country) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'residence_country is required.';
  END IF;

  IF p_address_line1 IS NULL OR trim(p_address_line1) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'address_line1 is required.';
  END IF;

  IF p_city IS NULL OR trim(p_city) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'city is required.';
  END IF;

  IF p_postal_code IS NULL OR trim(p_postal_code) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'postal_code is required.';
  END IF;

  IF p_country IS NULL OR trim(p_country) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'country is required.';
  END IF;

  IF p_tax_residence_country IS NULL OR trim(p_tax_residence_country) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'tax_residence_country is required.';
  END IF;

  IF p_paypal_email IS NULL OR trim(p_paypal_email) = '' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'paypal_email is required.';
  END IF;

  -- PayPal email 形式チェック
  IF p_paypal_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'paypal_email must be a valid email address.';
  END IF;

  -- ── 同意チェック ─────────────────────────────────────────
  IF p_user_confirmed_legal_responsibility IS NOT TRUE THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'user_confirmed_legal_responsibility must be true.';
  END IF;

  IF p_user_confirmed_paypal_name_match IS NOT TRUE THEN
    RAISE EXCEPTION 'validation_error'
      USING DETAIL = 'user_confirmed_paypal_name_match must be true.';
  END IF;

  -- ── submission_data 構築 ──────────────────────────────────
  v_delete_after := NOW() + INTERVAL '72 hours';
  v_data := jsonb_build_object(
    'legal_name',                         p_legal_name,
    'display_name',                       p_display_name,
    'residence_country',                  p_residence_country,
    'address_line1',                      p_address_line1,
    'address_line2',                      p_address_line2,
    'city',                               p_city,
    'region',                             p_region,
    'postal_code',                        p_postal_code,
    'country',                            p_country,
    'tax_residence_country',              p_tax_residence_country,
    'domestic_or_foreign',                p_domestic_or_foreign,
    'paypal_email',                       p_paypal_email,
    'preferred_currency',                 p_preferred_currency,
    'user_confirmed_legal_responsibility', p_user_confirmed_legal_responsibility,
    'user_confirmed_paypal_name_match',   p_user_confirmed_paypal_name_match,
    'submitted_at',                       NOW()
  );

  -- ── INSERT ────────────────────────────────────────────────
  INSERT INTO prize_temp_tax_submissions (
    award_id,
    user_id,
    status,
    submission_data,
    delete_after
  ) VALUES (
    p_award_id,
    v_caller_id,
    'submitted',
    v_data,
    v_delete_after
  )
  RETURNING id INTO v_sub_id;

  -- ── archive log（PII なし） ────────────────────────────────
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    after_state
  ) VALUES (
    'submission_created',
    'prize_temp_tax_submissions',
    v_sub_id,
    v_caller_id,
    jsonb_build_object(
      'award_id',      p_award_id,
      'status',        'submitted',
      'delete_after',  v_delete_after
    )
  );

  -- ── 戻り値（PIIなし） ─────────────────────────────────────
  RETURN QUERY
  SELECT
    v_sub_id       AS submission_id,
    p_award_id     AS award_id,
    'submitted'::text AS status,
    v_delete_after AS delete_after;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_prize_tax_submission(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, boolean) FROM anon;

-- =============================================================================
-- 7. online_games 直接INSERT 拒否 (is_internal_test_account=true のみ)
--    既存ポリシー "authenticated users can create games" を補正する
--    service_role / SECURITY DEFINER 経由は影響なし (RLSを迂回する)
-- =============================================================================

-- 既存ポリシーを削除して補正版に置き換える
DROP POLICY IF EXISTS "authenticated users can create games" ON online_games;

-- 補正版: is_internal_test_account=true のユーザーはINSERT不可
CREATE POLICY "authenticated users can create games"
  ON online_games
  FOR INSERT
  TO public
  WITH CHECK (
    auth.uid() = black_player_id
    AND NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND is_internal_test_account = true
    )
  );

-- =============================================================================
-- 動作確認用コメント
-- =============================================================================
-- 適用後に以下で確認:
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'enter_arena_event' AND pronamespace = 'public'::regnamespace;
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'join_or_create_random_game' AND pronamespace = 'public'::regnamespace;
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'apply_online_move' AND pronamespace = 'public'::regnamespace;
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'claim_timeout' AND pronamespace = 'public'::regnamespace;
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'submit_prize_tax_submission' AND pronamespace = 'public'::regnamespace;
-- SELECT policyname, cmd, with_check FROM pg_policies WHERE tablename = 'online_games' AND cmd = 'INSERT';
