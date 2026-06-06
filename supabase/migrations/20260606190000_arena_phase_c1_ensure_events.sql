-- =============================================================================
-- Official Arena Phase C-1 — ensure_next_arena_events() RPC
-- 実装: ensure_next_arena_events() RETURNS jsonb
-- =============================================================================
-- 方針:
--   - SECURITY DEFINER / SET search_path = public
--   - GRANT EXECUTE to service_role, postgres のみ
--   - anon / authenticated には付与しない
--   - PUBLIC EXECUTE 明示的 REVOKE
--   - official_matches 変更なし
--   - arena_entries direct INSERT 許可維持しない
--   - arena_points / arena_match_history / arena_master_history SELECT GRANT 復活禁止
--   - profiles schema 変更なし
-- =============================================================================
-- 仕様概要:
--   - is_active=true の arena_definitions を全件処理
--   - 各ArenaにつきJST基準で「次回開催日時」を計算
--   - 未来の直近 scheduled event が未存在なら INSERT
--   - 存在すれば "existing" として返す
--   - 複数回呼んでも重複しない（冪等）
-- =============================================================================
-- 日時計算の方針:
--   - now() AT TIME ZONE 'Asia/Tokyo' → TIMESTAMP (without tz, JST相当値) として扱う
--   - DATE_TRUNC / EXTRACT はこのJST timestamp上で計算
--   - 計算結果 (TIMESTAMP without tz) を AT TIME ZONE 'Asia/Tokyo' でTIMESTAMPTZ変換
--     → PostgreSQLの AT TIME ZONE 変換規則:
--        timestamp (without tz) AT TIME ZONE tz → 「その時刻がtzにある」としてUTC基準のtimestamptz
-- =============================================================================

CREATE OR REPLACE FUNCTION ensure_next_arena_events()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arena          RECORD;
  v_next_dt        TIMESTAMPTZ;
  v_entry_deadline TIMESTAMPTZ;
  v_existing_id    UUID;
  v_existing_dt    TIMESTAMPTZ;
  v_new_id         UUID;
  v_action         TEXT;
  v_events_out     JSONB := '[]'::JSONB;
  v_event_entry    JSONB;

  -- JST timestamp (without tz): JST相当の時刻値として計算に使用
  v_jst_now_ts     TIMESTAMP;   -- now() AT TIME ZONE 'Asia/Tokyo' → TIMESTAMP
  v_jst_today_ts   TIMESTAMP;   -- DATE_TRUNC('day', v_jst_now_ts)
  v_dow_now        INTEGER;     -- PostgreSQL DOW: 0=Sun,1=Mon,...,6=Sat
  v_days_ahead     INTEGER;
  v_next_ts        TIMESTAMP;   -- 次回開催のJST時刻 (timestamp without tz)
BEGIN
  -- 現在時刻をJST timestamp (without tz) として取得
  -- now() AT TIME ZONE 'Asia/Tokyo' の型は TIMESTAMP (without tz)
  v_jst_now_ts := now() AT TIME ZONE 'Asia/Tokyo';

  -- is_active=true の Arena を順番に処理
  FOR v_arena IN
    SELECT id, code, weekday, start_time_jst, entry_deadline_hours
    FROM arena_definitions
    WHERE is_active = TRUE
    ORDER BY display_order
  LOOP
    -- =========================================================
    -- 次回開催日時の計算 (JST基準)
    -- =========================================================
    -- JSTの今日の0時 (truncate to day) → TIMESTAMP (without tz)
    v_jst_today_ts := DATE_TRUNC('day', v_jst_now_ts);

    -- 今日のPostgreSQL DOW (0=Sun, 1=Mon, ..., 6=Sat)
    v_dow_now := EXTRACT(DOW FROM v_jst_now_ts)::INTEGER;

    -- 対象weekdayまでの日数差 (0〜6)
    v_days_ahead := ((v_arena.weekday - v_dow_now + 7) % 7);

    -- 候補日時 = 今日JST 0時 + days_ahead日 + start_time_jst (TIMESTAMP without tz)
    v_next_ts := v_jst_today_ts
                 + (v_days_ahead * INTERVAL '1 day')
                 + v_arena.start_time_jst::INTERVAL;

    -- days_ahead=0 かつ 開催時刻が既に過ぎている場合は来週分
    IF v_days_ahead = 0 AND v_next_ts <= v_jst_now_ts THEN
      v_next_ts := v_next_ts + INTERVAL '7 days';
    END IF;

    -- TIMESTAMP (JST値) → TIMESTAMPTZ に変換
    -- 「この時刻はAsia/Tokyoにある」としてtimestamptzに変換
    v_next_dt := v_next_ts AT TIME ZONE 'Asia/Tokyo';

    -- entry_deadline = event_datetime - entry_deadline_hours
    v_entry_deadline := v_next_dt - (v_arena.entry_deadline_hours * INTERVAL '1 hour');

    -- =========================================================
    -- 既存event確認 (未来の直近 scheduled event)
    -- =========================================================
    SELECT id, scheduled_at INTO v_existing_id, v_existing_dt
    FROM arena_events
    WHERE arena_id = v_arena.id
      AND status = 'scheduled'
      AND scheduled_at > now()
    ORDER BY scheduled_at ASC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- 既存あり → そのeventの情報を返す
      v_action := 'existing';
      v_event_entry := jsonb_build_object(
        'arena_code',      v_arena.code,
        'event_id',        v_existing_id,
        'event_datetime',  v_existing_dt,
        'entry_deadline',  v_existing_dt - (v_arena.entry_deadline_hours * INTERVAL '1 hour'),
        'action',          v_action
      );
    ELSE
      -- 未存在 → INSERT
      INSERT INTO arena_events (arena_id, scheduled_at, status)
      VALUES (v_arena.id, v_next_dt, 'scheduled')
      RETURNING id INTO v_new_id;

      v_action := 'created';
      v_event_entry := jsonb_build_object(
        'arena_code',      v_arena.code,
        'event_id',        v_new_id,
        'event_datetime',  v_next_dt,
        'entry_deadline',  v_entry_deadline,
        'action',          v_action
      );
    END IF;

    -- 結果配列に追加
    v_events_out := v_events_out || jsonb_build_array(v_event_entry);

  END LOOP;

  RETURN jsonb_build_object(
    'ok',     true,
    'events', v_events_out
  );
END;
$$;

-- =============================================================================
-- GRANT / REVOKE
-- =============================================================================
-- PostgreSQL デフォルトの PUBLIC EXECUTE GRANT を明示的に剥奪
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM PUBLIC;
-- anon / authenticated にも付与しない（念のため明示 REVOKE）
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM anon;
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM authenticated;
-- service_role と postgres のみ EXECUTE 許可
GRANT EXECUTE ON FUNCTION ensure_next_arena_events() TO service_role;
GRANT EXECUTE ON FUNCTION ensure_next_arena_events() TO postgres;
