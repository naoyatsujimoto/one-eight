-- =============================================================================
-- OM-1c: 公式戦競技挙動修正
--   1. online_games に official_starts_at カラム追加
--   2. enter_official_match: turn_started_at = GREATEST(starts_at, now()) / 戻り値に is_official・starts_at 追加
--   3. apply_online_move: official_starts_at 前の着手を拒否
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- 冪等設計: IF NOT EXISTS / DROP FUNCTION IF EXISTS 使用（再実行可能）
-- =============================================================================

-- =============================================================================
-- 1. online_games に official_starts_at カラム追加
--    公式戦由来のゲームでのみ設定。通常対戦は NULL。
-- =============================================================================

ALTER TABLE online_games
  ADD COLUMN IF NOT EXISTS official_starts_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN online_games.official_starts_at IS
  '公式戦由来ゲームのみ。starts_at 前はタイマーを進めず着手を拒否する。通常対戦は NULL。';


-- =============================================================================
-- 2. enter_official_match を更新
--    - online_games INSERT: turn_started_at = GREATEST(starts_at, now())
--                           official_starts_at = starts_at を設定
--    - 戻り値に is_official: true, starts_at を追加
--    - 冪等(再入室)時も is_official: true, starts_at を返す
-- =============================================================================

DROP FUNCTION IF EXISTS enter_official_match(uuid, jsonb);
DROP FUNCTION IF EXISTS enter_official_match(uuid);

CREATE OR REPLACE FUNCTION enter_official_match(
  p_match_id      uuid,
  p_initial_state jsonb
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  v_turn_start     timestamptz;
  v_chars          text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i              int;
BEGIN
  -- 行ロック取得（同時入室レースコンディション対策）
  SELECT * INTO v_match
  FROM official_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: official match not found';
  END IF;

  -- 参加者チェック
  IF v_match.black_user_id != v_uid AND v_match.white_user_id != v_uid THEN
    RAISE EXCEPTION 'permission_denied: not a participant of this match';
  END IF;

  -- ステータスチェック（cancelled / forfeited / completed は入室不可）
  IF v_match.status IN ('cancelled','forfeited','completed') THEN
    RAISE EXCEPTION 'invalid_state: match is %, cannot enter', v_match.status;
  END IF;

  -- 色を決定
  v_my_color := CASE WHEN v_match.black_user_id = v_uid THEN 'black' ELSE 'white' END;

  -- online_game_id が既にある場合: 冪等返却（再入室）
  -- 重要: 「新規入室の受付期限」と「既存試合への再入室」を分ける。
  -- 再入室は時間条件で弾かない（completed/cancelled/forfeited のみ不可）。
  IF v_match.online_game_id IS NOT NULL THEN
    -- status を live に更新（live でなければ）
    IF v_match.status NOT IN ('live','completed') THEN
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

  -- 時間条件チェック（15分前〜30分後）— 新規入室のみ適用
  v_joinable_from  := v_match.starts_at - interval '15 minutes';
  v_joinable_until := v_match.starts_at + interval '30 minutes';

  IF v_now < v_joinable_from THEN
    RAISE EXCEPTION 'not_yet_joinable: match opens at %', v_joinable_from;
  END IF;

  IF v_now > v_joinable_until THEN
    RAISE EXCEPTION 'too_late: join window closed at %', v_joinable_until;
  END IF;

  -- online_game_id が NULL → online_games レコードを新規作成
  -- turn_started_at = GREATEST(starts_at, now())
  --   starts_at 前に入室した場合: starts_at まで時計を進めない
  --   starts_at 後に入室した場合: 即座にタイマー開始
  v_timer_mode  := v_match.timer_config->>'mode';
  v_turn_start  := GREATEST(v_match.starts_at, v_now);

  -- room_code は公式戦専用プレフィックス "OM-" + ランダム6文字
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
        v_match.black_user_id,      -- 黒番が先手
        'playing',                   -- waiting を経由せず直接 playing
        p_initial_state,             -- フロントが createInitialState() で生成
        1,
        v_match.timer_config,        -- official_matches から直接コピー（ユーザー変更不可）
        CASE WHEN v_timer_mode = 'total_time'
          THEN (v_match.timer_config->>'totalSeconds')::int * 1000
          ELSE NULL
        END,
        CASE WHEN v_timer_mode = 'total_time'
          THEN (v_match.timer_config->>'totalSeconds')::int * 1000
          ELSE NULL
        END,
        v_turn_start,               -- GREATEST(starts_at, now()): 定刻前なら starts_at 基準
        v_match.starts_at,          -- official_starts_at: 着手ガード用
        v_now
      )
      RETURNING id INTO v_game_id;

      EXIT; -- 成功したらループを抜ける
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'internal_error: failed to create online_game';
  END IF;

  -- official_matches を更新
  UPDATE official_matches
  SET online_game_id = v_game_id,
      status         = 'live',
      updated_at     = v_now
  WHERE id = p_match_id;

  RETURN json_build_object(
    'online_game_id', v_game_id,
    'color',          v_my_color,
    'is_official',    true,
    'starts_at',      v_match.starts_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION enter_official_match(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION enter_official_match(uuid, jsonb) FROM anon;


-- =============================================================================
-- 3. apply_online_move に official_starts_at チェックを追加
--    official_starts_at が NOT NULL かつ now() < official_starts_at の場合は着手拒否
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
        -- turn_started_at が starts_at より前の場合（保険 — 上記の GREATEST で基本起きない）
        v_elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_game.official_starts_at)) * 1000)::bigint;
      END IF;

      IF v_mode = 'per_move' THEN
        v_per_move_ms := (v_game.timer_config->>'perMoveSeconds')::bigint * 1000;
        IF v_elapsed_ms >= v_per_move_ms THEN
          v_timed_out := true;
        END IF;

      ELSIF v_mode = 'total_time' THEN
        v_remaining_ms := CASE v_mover_color
          WHEN 'black' THEN COALESCE(v_game.black_remaining_ms, 0)::bigint - v_elapsed_ms
          ELSE           COALESCE(v_game.white_remaining_ms, 0)::bigint - v_elapsed_ms
        END;

        IF v_remaining_ms <= 0 THEN
          v_timed_out := true;
          v_remaining_ms := 0;
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
-- 確認クエリ（実行後に状態確認）
-- =============================================================================
-- -- online_games.official_starts_at カラム確認
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'online_games' AND column_name = 'official_starts_at';
--
-- -- enter_official_match RPC 確認
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name = 'enter_official_match';
--
-- -- apply_online_move RPC 確認
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name = 'apply_online_move';
