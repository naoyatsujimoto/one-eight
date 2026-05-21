-- Phase T-2a: オンライン対戦タイムクロック対応 — RPC追加・拡張
-- 実行: Supabase SQL Editor で適用
-- 前提: phase_t2a_timer_columns.sql が適用済みであること

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. apply_online_move — タイマー処理を追加した拡張版
--    - timer_config IS NULL: 既存ロジックをスキップ（完全後方互換）
--    - DB基準時刻(clock_timestamp())で elapsed を計算
--    - per_move: elapsed >= perMoveMs → timeout → 相手勝利
--    - total_time: remaining -= elapsed → 0以下で timeout → 相手勝利
-- ─────────────────────────────────────────────────────────────────────────────
-- 戻り値型変更のため既存関数を先に削除する
DROP FUNCTION IF EXISTS apply_online_move(uuid, integer, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION apply_online_move(
  p_game_id              uuid,
  p_expected_move_number int,
  p_new_game_state       jsonb,
  p_next_player_id       uuid,
  p_winner               text DEFAULT NULL
  -- ※ timer情報はクライアントから受け取らない（不正防止）
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game          online_games;
  v_now           timestamptz := clock_timestamp();
  v_elapsed_ms    bigint;
  v_mode          text;
  v_mover_color   text;
  v_remaining_ms  bigint;
  v_per_move_ms   bigint;
  v_timed_out     bool := false;
  v_effective_winner text := p_winner;
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

      IF v_mode = 'per_move' THEN
        v_per_move_ms := (v_game.timer_config->>'perMoveSeconds')::bigint * 1000;
        IF v_elapsed_ms >= v_per_move_ms THEN
          v_timed_out := true;
        END IF;

      ELSIF v_mode = 'total_time' THEN
        -- 残り時間から消費時間を差し引く
        v_remaining_ms := CASE v_mover_color
          WHEN 'black' THEN COALESCE(v_game.black_remaining_ms, 0)::bigint - v_elapsed_ms
          ELSE           COALESCE(v_game.white_remaining_ms, 0)::bigint - v_elapsed_ms
        END;

        IF v_remaining_ms <= 0 THEN
          v_timed_out := true;
          v_remaining_ms := 0;
        END IF;

        -- 残り時間を v_game に反映（後のUPDATEで使用）
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
    -- タイマー残り時間（timer_config が NULL なら既存値を維持）
    black_remaining_ms = CASE
                           WHEN v_game.timer_config IS NOT NULL THEN v_game.black_remaining_ms
                           ELSE black_remaining_ms
                         END,
    white_remaining_ms = CASE
                           WHEN v_game.timer_config IS NOT NULL THEN v_game.white_remaining_ms
                           ELSE white_remaining_ms
                         END,
    -- 次の手番開始時刻（終局後は NULL）
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
      game_id, started_at, ended_at, mode,
      human_color, winner, move_count, full_record,
      timer_config, end_reason
    )
    SELECT
      v_game.id::text,
      v_game.created_at,
      v_now,
      'online_pvp',
      NULL,
      v_effective_winner,
      (p_new_game_state->'history'),
      p_new_game_state->'history',
      v_game.timer_config,
      CASE WHEN v_timed_out THEN 'timeout' ELSE 'normal' END
    ON CONFLICT (game_id) DO NOTHING;
  END IF;

  -- クライアントに返却（Realtime補完用）
  RETURN json_build_object(
    'ok',                true,
    'timed_out',         v_timed_out,
    'winner',            v_effective_winner,
    'black_remaining_ms', v_game.black_remaining_ms,
    'white_remaining_ms', v_game.white_remaining_ms,
    'turn_started_at',   v_now,
    'server_updated_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION apply_online_move(uuid, int, jsonb, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION apply_online_move(uuid, int, jsonb, uuid, text) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. claim_timeout — 相手が放置・時間切れになった場合にtimeoutを宣言するRPC
--    - 参加者（black / white どちらでも）が呼べる
--    - DBのturn_started_at + timer_config基準で検証（クライアント時刻無視）
--    - 実際に時間切れでなければ 'not_timed_out_yet' エラー
-- ─────────────────────────────────────────────────────────────────────────────
-- 戻り値型変更のため既存関数を先に削除する
DROP FUNCTION IF EXISTS claim_timeout(uuid);

CREATE OR REPLACE FUNCTION claim_timeout(p_game_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game              online_games;
  v_now               timestamptz := clock_timestamp();
  v_elapsed_ms        bigint;
  v_limit_ms          bigint;
  v_mover_color       text;
  v_remaining_ms      bigint;
  v_timed_out_player  text;
  v_winner            text;
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
    v_remaining_ms := CASE v_mover_color
      WHEN 'black' THEN COALESCE(v_game.black_remaining_ms, 0)::bigint
      ELSE           COALESCE(v_game.white_remaining_ms, 0)::bigint
    END - v_elapsed_ms;

    IF v_remaining_ms > 0 THEN
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
    game_id, started_at, ended_at, mode, human_color,
    winner, move_count, full_record, timer_config, end_reason
  )
  SELECT
    v_game.id::text,
    v_game.created_at,
    v_now,
    'online_pvp',
    NULL,
    v_winner,
    (v_game.game_state->'history'),
    v_game.game_state->'history',
    v_game.timer_config,
    'timeout'
  ON CONFLICT (game_id) DO NOTHING;

  RETURN json_build_object(
    'winner',         v_winner,
    'timeout_player', v_timed_out_player
  );
END;
$$;

GRANT EXECUTE ON FUNCTION claim_timeout(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION claim_timeout(uuid) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. join_online_game — フレンドマッチ参加時にtimer_configを確定・初期化
--    - ホストが部屋作成時に設定した timer_config をそのまま使用
--    - waiting → playing 遷移時に turn_started_at を設定（Black先手）
-- ─────────────────────────────────────────────────────────────────────────────
-- 戻り値型変更のため既存関数を先に削除する
DROP FUNCTION IF EXISTS join_online_game(text);

CREATE OR REPLACE FUNCTION join_online_game(p_room_code text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

GRANT EXECUTE ON FUNCTION join_online_game(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION join_online_game(text) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. join_or_create_random_game — ランダムマッチ: per_move 60秒を自動設定
--    - 既存ゲームに参加: timer_config / remaining_ms を初期化
--    - 新規ゲーム作成: timer_config = {"mode":"per_move","perMoveSeconds":60,...} をデフォルト設定
-- ─────────────────────────────────────────────────────────────────────────────
-- 戻り値型変更のため既存関数を先に削除する
DROP FUNCTION IF EXISTS join_or_create_random_game(uuid, jsonb);

CREATE OR REPLACE FUNCTION join_or_create_random_game(
  p_user_id      uuid,
  p_initial_state jsonb
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
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

    RETURN json_build_object(
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

      RETURN json_build_object(
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
$$;

GRANT EXECUTE ON FUNCTION join_or_create_random_game(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION join_or_create_random_game(uuid, jsonb) FROM anon;
