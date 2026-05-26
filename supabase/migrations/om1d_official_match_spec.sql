-- =============================================================================
-- OM-1d: 公式戦仕様再整理
--   1. official_matches.status / end_reason CHECK に no_contest 追加
--   2. enter_official_match: turn_started_at = starts_at 固定 / 入室ウィンドウを totalSeconds ベースに
--   3. check_official_match_expiry RPC 追加（両者未入室 no_contest 判定）
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- 冪等設計: ALTER ... IF NOT EXISTS / DROP FUNCTION IF EXISTS 使用
-- =============================================================================

-- =============================================================================
-- 1. official_matches.status CHECK に 'no_contest' 追加
-- =============================================================================

-- CHECK 制約は ALTER TABLE で直接変更できないため、DROP → ADD で置換する
ALTER TABLE official_matches
  DROP CONSTRAINT IF EXISTS official_matches_status_check;

ALTER TABLE official_matches
  ADD CONSTRAINT official_matches_status_check
  CHECK (status IN (
    'scheduled', 'joinable', 'live', 'completed',
    'cancelled', 'forfeited', 'no_contest'
  ));

-- =============================================================================
-- 2. official_matches.end_reason CHECK に 'no_contest' 追加
-- =============================================================================

ALTER TABLE official_matches
  DROP CONSTRAINT IF EXISTS official_matches_end_reason_check;

ALTER TABLE official_matches
  ADD CONSTRAINT official_matches_end_reason_check
  CHECK (end_reason IN (
    'normal', 'timeout', 'resign', 'draw_agreement',
    'forfeit_black', 'forfeit_white', 'forfeit_both',
    'cancelled', 'no_contest'
  ) OR end_reason IS NULL);

-- =============================================================================
-- 3. enter_official_match を更新
--
-- 変更点:
--   A. turn_started_at = starts_at 固定（GREATEST(starts_at, now()) を廃止）
--      → Black の持ち時間は常に starts_at から消費。
--        入室が starts_at 後でも Black remaining = totalSeconds - (now - starts_at) になる。
--   B. 入室ウィンドウ上限を starts_at + totalSeconds に変更（旧: starts_at + 30分固定）
--   C. online_game_id が NULL かつ starts_at + totalSeconds 超過 → no_contest 確定
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
  -- 再入室: online_game_id が既にある場合は時間条件チェックなしで返す
  -- ──────────────────────────────────────────────────────────────────────────
  IF v_match.online_game_id IS NOT NULL THEN
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
  -- ※ totalSeconds = Black の持ち時間。これを超えたら Black は既に時間切れのはず。
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
  -- turn_started_at = starts_at 固定（GREATEST 廃止）
  --   → Black の持ち時間は starts_at から消費開始。
  --   → 入室が starts_at より後の場合: elapsed = now - starts_at がすでに発生している。
  --   → claim_timeout は turn_started_at = starts_at 基準で残り時間を正しく計算する。
  -- ──────────────────────────────────────────────────────────────────────────
  FOR v_i IN 1..5 LOOP
    -- room_code: 公式戦専用 "OM-" + ランダム6文字
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
        turn_started_at,       -- ★ starts_at 固定（GREATEST廃止）
        official_starts_at,    -- 着手ガード用（apply_online_move で starts_at 前の着手を拒否）
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
        -- total_time のみ remaining_ms を初期化（per_move は NULL）
        CASE WHEN v_timer_mode = 'total_time'
          THEN v_total_seconds * 1000
          ELSE NULL
        END,
        CASE WHEN v_timer_mode = 'total_time'
          THEN v_total_seconds * 1000
          ELSE NULL
        END,
        v_match.starts_at,       -- ★ 常に starts_at（GREATEST廃止）
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
-- 4. check_official_match_expiry RPC（新規）
--
-- 両者未入室かつ starts_at + totalSeconds 超過 → no_contest に更新。
-- User Page ロード時などに参加者のクライアントから呼び出す。
-- 冪等: 既に確定済みのステータスには何もしない。
-- =============================================================================

DROP FUNCTION IF EXISTS check_official_match_expiry(uuid);

CREATE OR REPLACE FUNCTION check_official_match_expiry(p_match_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_match         official_matches;
  v_now           timestamptz := clock_timestamp();
  v_total_seconds int;
  v_expires_at    timestamptz;
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

  -- online_game が存在する → 対局成立済み（no_contest にしない）
  IF v_match.online_game_id IS NOT NULL THEN
    RETURN json_build_object('ok', true, 'status', v_match.status);
  END IF;

  -- starts_at + totalSeconds を超えていれば no_contest
  v_total_seconds := COALESCE((v_match.timer_config->>'totalSeconds')::int, 600);
  v_expires_at    := v_match.starts_at + (v_total_seconds || ' seconds')::interval;

  IF v_now > v_expires_at THEN
    UPDATE official_matches
    SET status     = 'no_contest',
        end_reason = 'no_contest',
        updated_at = v_now
    WHERE id = p_match_id;
    RETURN json_build_object('ok', true, 'status', 'no_contest');
  END IF;

  RETURN json_build_object('ok', true, 'status', v_match.status);
END;
$$;

GRANT EXECUTE ON FUNCTION check_official_match_expiry(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION check_official_match_expiry(uuid) FROM anon;


-- =============================================================================
-- 確認クエリ
-- =============================================================================
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'official_matches'::regclass
--   AND contype = 'c';
--
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('enter_official_match', 'check_official_match_expiry');
