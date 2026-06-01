-- =============================================================================
-- OM-1e: no-show / 未入室判定修正
--
-- 目的:
--   片方のみ入室済みで時間切れになった場合（no-show）を正しく検知し、
--   入室済みプレイヤーを勝者として確定する。
--
--   現状の課題（om1d時点）:
--   - check_official_match_expiry は online_game_id IS NOT NULL の場合を即 return していた
--   - そのため「black入室→online_game作成済み→white未入室で時間切れ」が
--     通常の timeout として処理され、black が forfeit 扱いになるケースがあった
--
-- 変更内容:
--   1. official_matches に black_entered_at / white_entered_at カラム追加
--   2. enter_official_match を更新: 入室時刻を記録する（初回のみ; 再入室で上書きしない）
--   3. check_official_match_expiry を拡張:
--      online_game_id が存在しても black/white_entered_at を見て forfeit 判定
--
-- 実行方法: Naoya が Supabase SQL Editor で実行する（本番適用時）
-- 冪等設計: ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE / DROP FUNCTION IF EXISTS
-- ステータス: 未適用（ドラフト）
-- =============================================================================

-- =============================================================================
-- 1. official_matches に入室時刻カラムを追加
--    初回入室時刻のみ記録する（再入室で上書きしない）
-- =============================================================================

ALTER TABLE official_matches
  ADD COLUMN IF NOT EXISTS black_entered_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE official_matches
  ADD COLUMN IF NOT EXISTS white_entered_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN official_matches.black_entered_at IS
  'blackプレイヤーの初回入室時刻。再入室では上書きしない。未入室の場合は NULL。';
COMMENT ON COLUMN official_matches.white_entered_at IS
  'whiteプレイヤーの初回入室時刻。再入室では上書きしない。未入室の場合は NULL。';


-- =============================================================================
-- 1b. online_games.end_reason CHECK 制約を拡張
--
-- om1e で forfeit_black / forfeit_white を online_games.end_reason に書き込むため、
-- CHECK 制約に値を追加する。
-- no_contest も合わせて明示的に列挙する。
-- =============================================================================

ALTER TABLE online_games
  DROP CONSTRAINT IF EXISTS online_games_end_reason_check;

ALTER TABLE online_games
  ADD CONSTRAINT online_games_end_reason_check
  CHECK (
    end_reason IN (
      'normal',
      'timeout',
      'resign',
      'draw_agreement',
      'forfeit_black',
      'forfeit_white',
      'no_contest'
    )
    OR end_reason IS NULL
  );


-- =============================================================================
-- 2. enter_official_match を更新
--
-- om1d からの変更点:
--   A. 新規入室時（online_game_id IS NULL）:
--      - 入室ユーザーの色が black → black_entered_at が NULL の場合のみ clock_timestamp() を記録
--      - 入室ユーザーの色が white → white_entered_at が NULL の場合のみ clock_timestamp() を記録
--   B. 再入室時（online_game_id IS NOT NULL）:
--      - 同様に entered_at が NULL なら記録（初回入室分を補完するケース）
--      - 既に記録済み（NOT NULL）なら上書きしない
--   C. その他の既存処理は om1d と同一（壊さない）
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
$$;

GRANT EXECUTE ON FUNCTION enter_official_match(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION enter_official_match(uuid, jsonb) FROM anon;


-- =============================================================================
-- 3. check_official_match_expiry を拡張
--
-- 概念的注意点:
--   【forfeit / no-show は timeout とは別概念】
--   timeout  : 対局開始後、持ち時間を使い切ったことによる敗北
--   forfeit  : 対局開始前（または入室前）に現れなかったことによる no-show 判定
--   両者は end_reason / timeout_player の扱いが異なる:
--     - timeout   : timeout_player に敗者の色を記録
--     - forfeit   : timeout_player = NULL（forfeit は time-out ではないため）
--
--   【match_logs への追記はこの migration では行わない】
--   forfeit / no-show の詳細記録は別途運用対応とし、ここでは行わない。
--
--   【レガシーデータの扱い】
--   om1e 以前に作成された対局では entered_at が記録されていない（両方 NULL）。
--   online_game_id があるにもかかわらず両 entered_at が NULL の場合は、
--   実際に入室済みである可能性が高いため、安全側に倒し何もせず return する。
--
-- om1d からの変更点:
--   - online_game_id IS NOT NULL の場合を即 return しない
--   - black_entered_at / white_entered_at を参照して forfeit 判定を追加:
--       black未入室 (black_entered_at IS NULL) かつ white入室済み
--         → white 勝利 / end_reason='forfeit_black'
--       white未入室 (white_entered_at IS NULL) かつ black入室済み
--         → black 勝利 / end_reason='forfeit_white'
--       両者未入室かつ online_game_id IS NULL → no_contest
--       両者未入室かつ online_game_id IS NOT NULL → レガシーデータ / 安全側で return
--       両者入室済み → 通常の timeout 処理に任せる（何もしない）
--   - 対応する online_games の winner / end_reason / status も更新して整合を保つ
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
$$;

GRANT EXECUTE ON FUNCTION check_official_match_expiry(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION check_official_match_expiry(uuid) FROM anon;


-- =============================================================================
-- 4. 既存対局の保守的 entered_at バックフィル
--
-- online_game_id があり、move_number から確実に入室済みと判断できる対局のみ
-- entered_at を補完する。
--   move_number >= 2: Black は少なくとも 1 手着手済み → black_entered_at を補完
--   move_number >= 3: White は少なくとも 1 手着手済み → white_entered_at を補完
-- COALESCE で既に記録済みの値は上書きしない（冪等）。
-- =============================================================================

-- Black 入室済みバックフィル（move_number >= 2 = Black が 1 手以上着手済み）
UPDATE official_matches om
SET black_entered_at = COALESCE(om.black_entered_at, og.created_at)
FROM online_games og
WHERE om.online_game_id = og.id
  AND om.black_entered_at IS NULL
  AND og.move_number >= 2;

-- White 入室済みバックフィル（move_number >= 3 = White が 1 手以上着手済み）
UPDATE official_matches om
SET white_entered_at = COALESCE(om.white_entered_at, og.created_at)
FROM online_games og
WHERE om.online_game_id = og.id
  AND om.white_entered_at IS NULL
  AND og.move_number >= 3;


-- =============================================================================
-- 確認クエリ（適用後に実行して状態を確認）
-- =============================================================================

-- -- 追加カラム確認
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'official_matches'
--   AND column_name IN ('black_entered_at', 'white_entered_at')
-- ORDER BY column_name;
--
-- -- RPC 確認
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('enter_official_match', 'check_official_match_expiry');
--
-- -- end_reason CHECK 制約確認（forfeit_black / forfeit_white が含まれていること）
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'official_matches'::regclass
--   AND contype = 'c'
--   AND conname LIKE '%end_reason%';
