-- =============================================================================
-- BY-3: 秒読み (byoyomi) backend 最小実装
--   1. apply_online_move: total_time 分岐に byoyomiSeconds 対応追加
--   2. claim_timeout: total_time 分岐に byoyomiSeconds 対応追加
--   3. arena_definitions: ELEPHANT / JAGUAR に byoyomiSeconds:10 追加
-- 冪等: CREATE OR REPLACE FUNCTION / UPDATE
-- =============================================================================

-- =============================================================================
-- 1. apply_online_move (byoyomi 対応版)
--    ベース: om1c_official_match_updates.sql
--    変更箇所: total_time 分岐のみ
-- =============================================================================

DROP FUNCTION IF EXISTS apply_online_move(uuid, integer, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION apply_online_move(
  p_game_id              uuid,
  p_expected_move_number int,
  p_new_game_state       jsonb,
  p_next_player_id       uuid,
  p_winner               text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

GRANT EXECUTE ON FUNCTION apply_online_move(uuid, int, jsonb, uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION apply_online_move(uuid, int, jsonb, uuid, text) FROM anon;


-- =============================================================================
-- 2. claim_timeout (byoyomi 対応版)
--    ベース: phase_t2a_rpcs.sql
--    変更箇所: total_time 分岐のみ
-- =============================================================================

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
$$;

GRANT EXECUTE ON FUNCTION claim_timeout(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION claim_timeout(uuid) FROM anon;


-- =============================================================================
-- 3. arena_definitions: ELEPHANT / JAGUAR に byoyomiSeconds:10 追加
-- =============================================================================

UPDATE arena_definitions
SET timer_config = '{"mode":"total_time","totalSeconds":600,"byoyomiSeconds":10}'::jsonb,
    updated_at = clock_timestamp()
WHERE code IN ('ELEPHANT','JAGUAR');

-- 確認
SELECT code, timer_config
FROM arena_definitions
WHERE code IN ('ELEPHANT','JAGUAR')
ORDER BY display_order;
