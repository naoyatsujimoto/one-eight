-- =============================================================================
-- ai_inspection_accounts.sql
-- AI確認専用アカウントのDB基盤
-- =============================================================================

-- 1. profiles に内部テストフラグを追加
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_internal_test_account BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS internal_plan_override TEXT
    CHECK (internal_plan_override IN ('free', 'pro'))
    DEFAULT NULL;

COMMENT ON COLUMN profiles.is_internal_test_account IS
  'true: AI inspection test account. Plan override is via internal_plan_override.';
COMMENT ON COLUMN profiles.internal_plan_override IS
  'Internal Pro override for is_internal_test_account=true accounts only. NULL=no override. Only service_role can set.';

-- Note: authenticated UPDATE は display_name/lang/stats_public のみ許可（F-06済み）。
-- 新規カラムは自動的にクライアント更新不可。追加 trigger 不要。

-- =============================================================================
-- 2. enter_official_match に内部テストアカウント拒否を追加
--    (om1e + fix_search_path の最新版ベース)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enter_official_match(p_match_id uuid, p_initial_state jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_match          official_matches;
  v_now            timestamptz := clock_timestamp();
  v_joinable_from  timestamptz;
  v_joinable_until timestamptz;
  v_my_color       text;
  v_game_id        uuid;
  v_room_code      text;
  v_timer_mode     text;
  v_total_seconds  int;
  v_chars          text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i              int;
  v_is_internal    boolean;
BEGIN
  -- 内部テストアカウントチェック
  SELECT COALESCE(is_internal_test_account, false)
    INTO v_is_internal
    FROM profiles WHERE id = v_uid;
  IF v_is_internal THEN
    RAISE EXCEPTION 'forbidden: internal test accounts cannot enter official matches';
  END IF;

  -- 行ロック取得
  SELECT * INTO v_match FROM official_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: official match not found';
  END IF;

  -- 参加者チェック
  IF v_match.black_user_id != v_uid AND v_match.white_user_id != v_uid THEN
    RAISE EXCEPTION 'permission_denied: not a participant of this match';
  END IF;

  -- 終了済みステータスは入室不可
  IF v_match.status IN ('cancelled', 'forfeited', 'completed', 'no_contest') THEN
    RAISE EXCEPTION 'invalid_state: match is %, cannot enter', v_match.status;
  END IF;

  -- 色を決定
  v_my_color := CASE WHEN v_match.black_user_id = v_uid THEN 'black' ELSE 'white' END;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 再入室: online_game_id が既にある場合
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_match.online_game_id IS NOT NULL THEN
    -- ★ om1e 追加: 再入室でも entered_at が未記録なら記録（補完）
    IF v_my_color = 'black' AND v_match.black_entered_at IS NULL THEN
      UPDATE official_matches
      SET black_entered_at = v_now, updated_at = v_now
      WHERE id = p_match_id;
    ELSIF v_my_color = 'white' AND v_match.white_entered_at IS NULL THEN
      UPDATE official_matches
      SET white_entered_at = v_now, updated_at = v_now
      WHERE id = p_match_id;
    END IF;

    IF v_match.status NOT IN ('live', 'completed') THEN
      UPDATE official_matches
      SET status = 'live', updated_at = v_now
      WHERE id = p_match_id;
    END IF;
    RETURN json_build_object(
      'online_game_id', v_match.online_game_id,
      'color',          v_my_color,
      'is_official',    true,
      'starts_at',      v_match.starts_at
    );
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 新規入室: 時間条件チェック
  -- ──────────────────────────────────────────────────────────────────────────
  v_timer_mode    := v_match.timer_config->>'mode';
  v_total_seconds := COALESCE((v_match.timer_config->>'totalSeconds')::int, 600);

  -- 入室ウィンドウ: [starts_at - 15分, starts_at + totalSeconds]
  v_joinable_from  := v_match.starts_at - interval '15 minutes';
  v_joinable_until := v_match.starts_at + (v_total_seconds || ' seconds')::interval;

  IF v_now < v_joinable_from THEN
    RAISE EXCEPTION 'not_yet_joinable: match opens at %', v_joinable_from;
  END IF;

  -- 入室ウィンドウ超過かつ online_game なし → no_contest
  IF v_now > v_joinable_until THEN
    UPDATE official_matches
    SET status     = 'no_contest',
        end_reason = 'no_contest',
        updated_at = v_now
    WHERE id = p_match_id;
    RAISE EXCEPTION 'no_contest: match expired without any entry (starts_at + % seconds)', v_total_seconds;
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- online_game 新規作成
  -- turn_started_at = starts_at 固定（om1d と同じ）
  -- ──────────────────────────────────────────────────────────────────────────
  FOR v_i IN 1..5 LOOP
    v_room_code := 'OM-';
    FOR v_i IN 1..6 LOOP
      v_room_code := v_room_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO online_games (
        room_code,
        black_player_id,
        white_player_id,
        current_player_id,
        status,
        game_state,
        move_number,
        timer_config,
        black_remaining_ms,
        white_remaining_ms,
        turn_started_at,
        official_starts_at,
        server_updated_at
      ) VALUES (
        v_room_code,
        v_match.black_user_id,
        v_match.white_user_id,
        v_match.black_user_id,   -- Black 先手
        'playing',
        p_initial_state,
        1,
        v_match.timer_config,
        CASE WHEN v_timer_mode = 'total_time'
          THEN v_total_seconds * 1000
          ELSE NULL
        END,
        CASE WHEN v_timer_mode = 'total_time'
          THEN v_total_seconds * 1000
          ELSE NULL
        END,
        v_match.starts_at,       -- starts_at 固定（om1d 踏襲）
        v_match.starts_at,
        v_now
      )
      RETURNING id INTO v_game_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'internal_error: failed to create online_game';
  END IF;

  -- official_matches 更新: online_game_id, status, ★entered_at 記録
  UPDATE official_matches
  SET online_game_id   = v_game_id,
      status           = 'live',
      -- ★ om1e 追加: 新規入室者の entered_at を記録（初回のみ）
      black_entered_at = CASE WHEN v_my_color = 'black' AND black_entered_at IS NULL
                              THEN v_now ELSE black_entered_at END,
      white_entered_at = CASE WHEN v_my_color = 'white' AND white_entered_at IS NULL
                              THEN v_now ELSE white_entered_at END,
      updated_at       = v_now
  WHERE id = p_match_id;

  RETURN json_build_object(
    'online_game_id', v_game_id,
    'color',          v_my_color,
    'is_official',    true,
    'starts_at',      v_match.starts_at
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enter_official_match(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.enter_official_match(uuid, jsonb) FROM anon;

-- =============================================================================
-- 3. join_online_game に内部テストアカウント拒否を追加
-- =============================================================================

CREATE OR REPLACE FUNCTION public.join_online_game(p_room_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_game        online_games;
  v_now         timestamptz := clock_timestamp();
  v_mode        text;
  v_is_internal boolean;
BEGIN
  -- 内部テストアカウントチェック
  SELECT COALESCE(is_internal_test_account, false)
    INTO v_is_internal
    FROM profiles WHERE id = auth.uid();
  IF v_is_internal THEN
    RAISE EXCEPTION 'forbidden: internal test accounts cannot join online games';
  END IF;

  SELECT * INTO v_game
  FROM online_games
  WHERE room_code = p_room_code AND status = 'waiting'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room_not_found';
  END IF;
  IF v_game.black_player_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_join_own_game';
  END IF;

  -- timer_config のモードを取得
  v_mode := CASE
    WHEN v_game.timer_config IS NOT NULL THEN v_game.timer_config->>'mode'
    ELSE NULL
  END;

  UPDATE online_games SET
    white_player_id   = auth.uid(),
    current_player_id = black_player_id,  -- Black 先手
    status            = 'playing',
    -- タイマー初期化: timer_config がある場合のみ
    black_remaining_ms = CASE
      WHEN v_mode = 'total_time'
        THEN (v_game.timer_config->>'totalSeconds')::int * 1000
      ELSE black_remaining_ms
    END,
    white_remaining_ms = CASE
      WHEN v_mode = 'total_time'
        THEN (v_game.timer_config->>'totalSeconds')::int * 1000
      ELSE white_remaining_ms
    END,
    -- 手番開始時刻: タイマーがあれば設定
    turn_started_at   = CASE
      WHEN v_mode IS NOT NULL AND v_mode != 'none' THEN v_now
      ELSE turn_started_at
    END,
    server_updated_at = v_now,
    updated_at        = v_now
  WHERE id = v_game.id;

  RETURN json_build_object(
    'game_id', v_game.id,
    'color',   'white'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_online_game(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_online_game(text) FROM anon;

-- =============================================================================
-- 4. submit_prize_tax_submission に内部テストアカウント拒否を追加 (確認)
-- =============================================================================

DO $$
DECLARE
  v_body text;
BEGIN
  SELECT prosrc INTO v_body
  FROM pg_proc
  WHERE proname = 'submit_prize_tax_submission';

  IF v_body IS NOT NULL AND v_body NOT LIKE '%is_internal_test_account%' THEN
    RAISE NOTICE 'submit_prize_tax_submission: is_internal check not present. Manual addition may be needed.';
  ELSE
    RAISE NOTICE 'submit_prize_tax_submission: check already present or function not found.';
  END IF;
END;
$$;
