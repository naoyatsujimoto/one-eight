-- Migration: fix_search_path_all_public_functions
-- Generated: 2026-06-17
-- Purpose: Set search_path = public for all public functions missing it
-- Total functions: 16

-- Function: apply_online_move
CREATE OR REPLACE FUNCTION public.apply_online_move(p_game_id uuid, p_expected_move_number integer, p_new_game_state jsonb, p_next_player_id uuid, p_winner text DEFAULT NULL::text)
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
$function$
;

-- Function: cancel_official_match
CREATE OR REPLACE FUNCTION public.cancel_official_match(p_match_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_match    official_matches;
  v_now      timestamptz := clock_timestamp();
BEGIN
  -- admin チェック
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT FOUND OR NOT v_is_admin THEN
    RAISE EXCEPTION 'permission_denied: admin required';
  END IF;

  SELECT * INTO v_match FROM official_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: official match not found';
  END IF;

  -- live 以降はキャンセル不可
  IF v_match.status IN ('live','completed','forfeited') THEN
    RAISE EXCEPTION 'invalid_state: cannot cancel a match in status %', v_match.status;
  END IF;

  IF v_match.status = 'cancelled' THEN
    RETURN json_build_object('ok', true, 'note', 'already cancelled');
  END IF;

  UPDATE official_matches
  SET status     = 'cancelled',
      end_reason = 'cancelled',
      updated_at = v_now
  WHERE id = p_match_id;

  RETURN json_build_object('ok', true);
END;
$function$
;

-- Function: check_official_match_expiry
CREATE OR REPLACE FUNCTION public.check_official_match_expiry(p_match_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_match         official_matches;
  v_now           timestamptz := clock_timestamp();
  v_total_seconds int;
  v_expires_at    timestamptz;
  v_om_winner     text;
  v_om_end_reason text;
  v_og_winner     text;
  v_og_end_reason text;
BEGIN
  SELECT * INTO v_match FROM official_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- 参加者のみ呼び出し可能
  IF v_match.black_user_id != v_uid AND v_match.white_user_id != v_uid THEN
    RETURN json_build_object('ok', false, 'reason', 'permission_denied');
  END IF;

  -- 既に確定済み → 何もしない
  IF v_match.status IN ('completed', 'cancelled', 'forfeited', 'no_contest') THEN
    RETURN json_build_object('ok', true, 'status', v_match.status);
  END IF;

  -- 期限計算
  v_total_seconds := COALESCE((v_match.timer_config->>'totalSeconds')::int, 600);
  v_expires_at    := v_match.starts_at + (v_total_seconds || ' seconds')::interval;

  -- 期限前 → 何もしない
  IF v_now <= v_expires_at THEN
    RETURN json_build_object('ok', true, 'status', v_match.status);
  END IF;

  -- ──────────────────────────────────────────────────────────────────────────
  -- 期限超過: online_game_id の有無に関わらず entered_at で判定
  -- ──────────────────────────────────────────────────────────────────────────

  IF v_match.black_entered_at IS NULL AND v_match.white_entered_at IS NULL THEN
    -- レガシーデータガード:
    -- online_game_id があるが両 entered_at が NULL のケースは、
    -- om1e 以前に作成された既存データ（entered_at が記録される前）。
    -- 実際に入室済みの可能性が高いため、安全側に倒し何もしない。
    IF v_match.online_game_id IS NOT NULL THEN
      RETURN json_build_object(
        'ok',     true,
        'status', v_match.status,
        'reason', 'legacy_no_entered_at'
      );
    END IF;
    -- 両者未入室かつ online_game_id なし → no_contest
    v_om_winner     := NULL;
    v_om_end_reason := 'no_contest';

  ELSIF v_match.black_entered_at IS NULL AND v_match.white_entered_at IS NOT NULL THEN
    -- black 未入室 → white 勝利
    v_om_winner     := 'white_user';
    v_om_end_reason := 'forfeit_black';
    v_og_winner     := 'white';
    v_og_end_reason := 'forfeit_black';

  ELSIF v_match.white_entered_at IS NULL AND v_match.black_entered_at IS NOT NULL THEN
    -- white 未入室 → black 勝利
    v_om_winner     := 'black_user';
    v_om_end_reason := 'forfeit_white';
    v_og_winner     := 'black';
    v_og_end_reason := 'forfeit_white';

  ELSE
    -- 両者入室済み → 通常 timeout 処理に任せる（何もしない）
    -- claim_timeout / apply_online_move が対応するため、ここでは介入しない
    RETURN json_build_object('ok', true, 'status', v_match.status, 'reason', 'both_entered_normally');
  END IF;

  -- official_matches を更新
  UPDATE official_matches
  SET status     = CASE WHEN v_om_end_reason = 'no_contest' THEN 'no_contest' ELSE 'completed' END,
      winner     = v_om_winner,
      end_reason = v_om_end_reason,
      result     = CASE
                     WHEN v_om_winner = 'black_user' THEN 'black'
                     WHEN v_om_winner = 'white_user' THEN 'white'
                     WHEN v_om_winner = 'draw'       THEN 'draw'
                     ELSE NULL
                   END,
      updated_at = v_now
  WHERE id = p_match_id;

  -- online_game が存在する場合は online_games も更新（状態整合）
  IF v_match.online_game_id IS NOT NULL AND v_og_winner IS NOT NULL THEN
    UPDATE online_games
    SET status            = 'finished',
        winner            = v_og_winner,
        end_reason        = v_og_end_reason,
        timeout_player    = NULL,  -- forfeit は timeout_player ではなく end_reason で区別
        turn_started_at   = NULL,
        server_updated_at = v_now,
        updated_at        = v_now
    WHERE id = v_match.online_game_id
      AND status = 'playing';  -- 既に終局済みなら上書きしない
  END IF;

  RETURN json_build_object(
    'ok',        true,
    'status',    CASE WHEN v_om_end_reason = 'no_contest' THEN 'no_contest' ELSE 'completed' END,
    'end_reason', v_om_end_reason,
    'winner',    v_om_winner
  );
END;
$function$
;

-- Function: claim_timeout
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
$function$
;

-- Function: create_official_match
CREATE OR REPLACE FUNCTION public.create_official_match(p_black_user_id uuid, p_white_user_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_timer_config jsonb DEFAULT NULL::jsonb, p_tournament_id uuid DEFAULT NULL::uuid, p_round_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_is_admin   boolean;
  v_timer_mode text;
  v_match_id   uuid;
BEGIN
  -- admin チェック
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT FOUND OR NOT v_is_admin THEN
    RAISE EXCEPTION 'permission_denied: admin required';
  END IF;

  -- 基本バリデーション
  IF p_black_user_id = p_white_user_id THEN
    RAISE EXCEPTION 'invalid_input: black_user_id and white_user_id must differ';
  END IF;

  IF p_starts_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_input: starts_at must be in the future';
  END IF;

  -- timer_config バリデーション（none 禁止）
  IF p_timer_config IS NULL THEN
    RAISE EXCEPTION 'invalid_input: timer_config is required';
  END IF;
  v_timer_mode := p_timer_config->>'mode';
  IF v_timer_mode IS NULL OR v_timer_mode = 'none' THEN
    RAISE EXCEPTION 'invalid_input: timer_config.mode must be total_time or per_move (none is not allowed for official matches)';
  END IF;

  -- INSERT
  INSERT INTO official_matches (
    black_user_id,
    white_user_id,
    starts_at,
    ends_at,
    status,
    timer_config,
    tournament_id,
    round_id,
    created_by
  ) VALUES (
    p_black_user_id,
    p_white_user_id,
    p_starts_at,
    p_ends_at,
    'scheduled',
    p_timer_config,
    p_tournament_id,
    p_round_id,
    v_uid
  )
  RETURNING id INTO v_match_id;

  RETURN json_build_object(
    'match_id', v_match_id,
    'status',   'scheduled'
  );
END;
$function$
;

-- Function: enter_official_match
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
BEGIN
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
$function$
;

-- Function: get_medium_pattern_win_rates
CREATE OR REPLACE FUNCTION public.get_medium_pattern_win_rates(p_pattern_ids text[], p_mode_group text DEFAULT 'all'::text, p_min_total integer DEFAULT 5)
 RETURNS TABLE(medium_pattern_id text, wins_black integer, wins_white integer, draws integer, total integer, win_rate_black double precision, win_rate_white double precision)
 LANGUAGE sql
 STABLE
 SET search_path = public
AS $function$
  SELECT
    s.medium_pattern_id,
    s.wins_black,
    s.wins_white,
    s.draws,
    s.total,
    s.win_rate_black,
    s.win_rate_white
  FROM medium_pattern_stats s
  WHERE s.medium_pattern_id = ANY(p_pattern_ids)
    AND s.mode_group = p_mode_group
    AND s.total >= p_min_total
  ORDER BY s.medium_pattern_id;
$function$
;

-- Function: get_sim_medium_pattern_win_rates
CREATE OR REPLACE FUNCTION public.get_sim_medium_pattern_win_rates(p_pattern_ids text[], p_sim_policy text DEFAULT 'easy_vs_easy'::text, p_min_total integer DEFAULT 100)
 RETURNS TABLE(medium_pattern_id text, wins_black integer, wins_white integer, draws integer, total integer, win_rate_black double precision, win_rate_white double precision)
 LANGUAGE sql
 STABLE
 SET search_path = public
AS $function$
  SELECT
    s.medium_pattern_id,
    s.wins_black,
    s.wins_white,
    s.draws,
    s.total,
    s.win_rate_black,
    s.win_rate_white
  FROM sim_medium_pattern_stats s
  WHERE s.medium_pattern_id = ANY(p_pattern_ids)
    AND s.sim_policy = p_sim_policy
    AND s.total >= p_min_total
  ORDER BY s.medium_pattern_id;
$function$
;

-- Function: join_online_game
CREATE OR REPLACE FUNCTION public.join_online_game(p_room_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_game   online_games;
  v_now    timestamptz := clock_timestamp();
  v_mode   text;
BEGIN
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
$function$
;

-- Function: join_or_create_random_game
CREATE OR REPLACE FUNCTION public.join_or_create_random_game(p_user_id uuid, p_initial_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_game       online_games;
  v_now        timestamptz := clock_timestamp();
  v_room_code  text;
  v_chars      text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i          int;
  v_timer_config jsonb := '{"mode":"per_move","totalSeconds":600,"perMoveSeconds":60}'::jsonb;
BEGIN
  -- waiting 中の自分以外のゲームを検索（timer_config があるもの優先）
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
      white_player_id   = p_user_id,
      current_player_id = black_player_id,  -- Black 先手
      status            = 'playing',
      -- ランダムマッチのtimer_configがまだなければ per_move 60秒を設定
      timer_config      = COALESCE(timer_config, v_timer_config),
      -- per_move なので remaining_ms は NULL のまま
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
      turn_started_at   = v_now,  -- per_move なので常に設定
      server_updated_at = v_now,
      updated_at        = v_now
    WHERE id = v_game.id;

    RETURN jsonb_build_object(
      'game_id',   v_game.id,
      'color',     'white',
      'room_code', v_game.room_code
    );
  END IF;

  -- 既存ゲームなし → 新規作成（黒番）
  -- ルームコード生成（衝突時最大5回リトライ）
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
        timer_config,      -- ランダムマッチはper_move 60秒固定
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
      -- room_code 衝突: 次のイテレーションで再試行
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'failed_to_create_game';
END;
$function$
;

-- Function: list_my_official_matches
CREATE OR REPLACE FUNCTION public.list_my_official_matches(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text[] DEFAULT NULL::text[], p_include_arena boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_from   timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to     timestamptz := COALESCE(p_to,   now() + interval '90 days');
  v_result json;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO v_result
  FROM (
    SELECT
      m.id,
      m.starts_at,
      m.ends_at,
      m.status,
      m.timer_config,
      m.online_game_id,
      m.result,
      m.winner,
      m.end_reason,
      CASE WHEN m.black_user_id = v_uid THEN 'black' ELSE 'white' END AS my_color,
      CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END AS opponent_id,
      (SELECT p.display_name FROM profiles p
       WHERE p.id = CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END
      ) AS opponent_display_name,
      m.tournament_id,
      m.round_id,
      m.source_kind,
      m.created_at,
      m.updated_at
    FROM official_matches m
    WHERE (m.black_user_id = v_uid OR m.white_user_id = v_uid)
      AND m.starts_at >= v_from
      AND m.starts_at <= v_to
      AND (p_status IS NULL OR m.status = ANY(p_status))
      -- p_include_arena=FALSE: Arena由来matchを除外（通常カレンダー向け）
      -- p_include_arena=TRUE:  source_kindフィルタなし（Arenaカレンダー向け）
      AND (p_include_arena OR COALESCE(m.source_kind, 'standalone') = 'standalone')
    ORDER BY m.starts_at ASC
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$
;

-- Function: list_my_official_matches
CREATE OR REPLACE FUNCTION public.list_my_official_matches(p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone, p_status text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_from   timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to     timestamptz := COALESCE(p_to,   now() + interval '90 days');
  v_result json;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO v_result
  FROM (
    SELECT
      m.id,
      m.starts_at,
      m.ends_at,
      m.status,
      m.timer_config,
      m.online_game_id,
      m.result,
      m.winner,
      m.end_reason,
      CASE WHEN m.black_user_id = v_uid THEN 'black' ELSE 'white' END AS my_color,
      CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END AS opponent_id,
      (SELECT p.display_name FROM profiles p
       WHERE p.id = CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END
      ) AS opponent_display_name,
      m.tournament_id,
      m.round_id,
      m.created_at,
      m.updated_at
    FROM official_matches m
    WHERE (m.black_user_id = v_uid OR m.white_user_id = v_uid)
      AND m.starts_at >= v_from
      AND m.starts_at <= v_to
      AND (p_status IS NULL OR m.status = ANY(p_status))
      AND COALESCE(m.source_kind, 'standalone') = 'standalone'  -- Arena由来matchを除外
    ORDER BY m.starts_at ASC
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$function$
;

-- Function: mark_admin_message_read
CREATE OR REPLACE FUNCTION public.mark_admin_message_read(p_message_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  UPDATE admin_messages
  SET read_by = array_append(read_by, auth.uid())
  WHERE id = p_message_id
    AND NOT (auth.uid() = ANY(read_by));
END;
$function$
;

-- Function: prevent_archive_log_mutation
CREATE OR REPLACE FUNCTION public.prevent_archive_log_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  RAISE EXCEPTION 'archive_log_is_append_only'
    USING DETAIL = 'prize_archive_logs rows cannot be updated or deleted.';
END;
$function$
;

-- Function: prevent_paid_payout_mutation
CREATE OR REPLACE FUNCTION public.prevent_paid_payout_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  -- paid または failed status の payout は以下のフィールドを変更禁止
  IF OLD.status IN ('paid', 'failed') THEN

    -- status: paid → failed、failed → paid は禁止
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF (OLD.status = 'paid'   AND NEW.status != 'paid')   OR
         (OLD.status = 'failed' AND NEW.status != 'failed') THEN
        RAISE EXCEPTION 'paid_payout_status_change_denied'
          USING DETAIL = 'Status of paid/failed payout cannot be changed.';
      END IF;
    END IF;

    -- award_id: 変更禁止
    IF NEW.award_id IS DISTINCT FROM OLD.award_id THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'award_id of paid/failed payout cannot be changed.';
    END IF;

    -- amount_cents_snapshot: 変更禁止
    IF NEW.amount_cents_snapshot IS DISTINCT FROM OLD.amount_cents_snapshot THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'amount_cents_snapshot of paid/failed payout cannot be changed.';
    END IF;

    -- currency_snapshot: 変更禁止
    IF NEW.currency_snapshot IS DISTINCT FROM OLD.currency_snapshot THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'currency_snapshot of paid/failed payout cannot be changed.';
    END IF;

    -- recipient_email_snapshot: NULL化のみ許可（別値への変更は禁止）
    IF NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot THEN
      IF NEW.recipient_email_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_email_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- recipient_name_snapshot: NULL化のみ許可（別値への変更は禁止）
    IF NEW.recipient_name_snapshot IS DISTINCT FROM OLD.recipient_name_snapshot THEN
      IF NEW.recipient_name_snapshot IS NOT NULL THEN
        RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
          USING DETAIL = 'recipient_name_snapshot can only be set to NULL (redaction), not changed to another value.';
      END IF;
    END IF;

    -- payout_snapshot: 次の場合のみ許可
    --   1. NULL化（全削除）
    --   2. 機微情報keyが削除されるredact操作（snapshot_redacted_at が追加される場合）
    --   3. snapshot_redacted_at が既に設定済み（再redact禁止）
    IF NEW.payout_snapshot IS DISTINCT FROM OLD.payout_snapshot THEN
      -- NULL化は常に許可
      IF NEW.payout_snapshot IS NOT NULL THEN
        -- snapshot_redacted_at が追加される redact 操作のみ許可
        IF (NEW.payout_snapshot -> 'snapshot_redacted_at') IS NULL THEN
          RAISE EXCEPTION 'paid_payout_snapshot_change_denied'
            USING DETAIL = 'payout_snapshot of paid/failed payout can only be set to NULL or redacted (snapshot_redacted_at must be present).';
        END IF;
        -- 既にredact済みの場合は再変更禁止
        IF (OLD.payout_snapshot -> 'snapshot_redacted_at') IS NOT NULL THEN
          RAISE EXCEPTION 'paid_payout_snapshot_already_redacted'
            USING DETAIL = 'payout_snapshot has already been redacted and cannot be changed again.';
        END IF;
      END IF;
    END IF;

    -- recipient_email_hash / recipient_name_hash: 変更禁止
    IF NEW.recipient_email_hash IS DISTINCT FROM OLD.recipient_email_hash THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'recipient_email_hash of paid/failed payout cannot be changed.';
    END IF;
    IF NEW.recipient_name_hash IS DISTINCT FROM OLD.recipient_name_hash THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'recipient_name_hash of paid/failed payout cannot be changed.';
    END IF;

    -- paid_at: 変更禁止
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'paid_at of paid/failed payout cannot be changed.';
    END IF;

    -- paypal_payout_id: 変更禁止
    IF NEW.paypal_payout_id IS DISTINCT FROM OLD.paypal_payout_id THEN
      RAISE EXCEPTION 'paid_payout_mutation_denied'
        USING DETAIL = 'paypal_payout_id of paid/failed payout cannot be changed.';
    END IF;

  END IF;

  RETURN NEW;
END;
$function$
;

-- Function: sync_official_match_on_game_finish
CREATE OR REPLACE FUNCTION public.sync_official_match_on_game_finish()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_match_winner    text;
  v_match_result    text;
  v_match_end_reason text;
BEGIN
  IF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN

    v_match_winner := CASE NEW.winner
      WHEN 'black' THEN 'black_user'
      WHEN 'white' THEN 'white_user'
      WHEN 'draw'  THEN 'draw'
      ELSE NULL
    END;

    v_match_result := CASE NEW.winner
      WHEN 'black' THEN 'black'
      WHEN 'white' THEN 'white'
      WHEN 'draw'  THEN 'draw'
      ELSE NULL
    END;

    v_match_end_reason := NEW.end_reason;

    UPDATE official_matches
    SET
      status     = 'completed',
      winner     = v_match_winner,
      result     = v_match_result,
      end_reason = v_match_end_reason,
      updated_at = clock_timestamp()
    WHERE online_game_id = NEW.id
      AND status NOT IN ('completed', 'cancelled', 'forfeited');

  END IF;

  RETURN NEW;
END;
$function$
;

