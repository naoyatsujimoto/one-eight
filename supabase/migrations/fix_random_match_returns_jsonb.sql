-- fix: join_or_create_random_game RETURNS json → RETURNS jsonb
-- 原因: Supabase JS v2 の RETURNS json RPC で data=null が返るバグ
-- 修正: RETURNS jsonb + jsonb_build_object() に変更
-- 実行: Supabase SQL Editor で実行
-- 冪等: DROP IF EXISTS で安全に再実行可能

DROP FUNCTION IF EXISTS join_or_create_random_game(uuid, jsonb);

CREATE OR REPLACE FUNCTION join_or_create_random_game(
  p_user_id      uuid,
  p_initial_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
$$;

GRANT EXECUTE ON FUNCTION join_or_create_random_game(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION join_or_create_random_game(uuid, jsonb) FROM anon;
