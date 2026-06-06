-- =============================================================================
-- Official Arena Phase C-1 (fix) — ensure_next_arena_events() RPC 日時計算修正
-- 前migrationのJST timestamp計算バグを修正
-- =============================================================================
-- 修正内容:
--   v_jst_now を TIMESTAMP (without tz) として宣言し直す
--   AT TIME ZONE 変換を正しく適用:
--     timestamp (without tz) AT TIME ZONE 'Asia/Tokyo' 
--     → 「その時刻がAsia/Tokyoにある」としてtimestamptzに変換
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
  -- now() AT TIME ZONE 'Asia/Tokyo' の戻り値型は TIMESTAMP (without tz)
  v_jst_now_ts     TIMESTAMP;
  v_jst_today_ts   TIMESTAMP;
  v_dow_now        INTEGER;
  v_days_ahead     INTEGER;
  v_next_ts        TIMESTAMP;  -- 次回開催のJST時刻 (timestamp without tz)
BEGIN
  -- now() AT TIME ZONE 'Asia/Tokyo' → TIMESTAMP (without tz, JST値)
  v_jst_now_ts := now() AT TIME ZONE 'Asia/Tokyo';

  -- is_active=true の Arena を順番に処理
  FOR v_arena IN
    SELECT id, code, weekday, start_time_jst, entry_deadline_hours
    FROM arena_definitions
    WHERE is_active = TRUE
    ORDER BY display_order
  LOOP
    -- =========================================================
    -- 次回開催日時の計算 (JST基準、TIMESTAMP without tz で計算)
    -- =========================================================

    -- JSTの今日0時 (truncate to day) ← v_jst_now_ts は TIMESTAMP なのでJST基準で正しく動作
    v_jst_today_ts := DATE_TRUNC('day', v_jst_now_ts);

    -- 今日のDOW (PostgreSQL: 0=Sun, 1=Mon, ..., 6=Sat)
    v_dow_now := EXTRACT(DOW FROM v_jst_now_ts)::INTEGER;

    -- 対象weekdayまでの日数差 (0〜6)
    v_days_ahead := ((v_arena.weekday - v_dow_now + 7) % 7);

    -- 候補日時 (JST timestamp without tz)
    --   = 今日JST 0時 + days_ahead日 + start_time_jst
    v_next_ts := v_jst_today_ts
                 + (v_days_ahead * INTERVAL '1 day')
                 + v_arena.start_time_jst::INTERVAL;

    -- days_ahead=0 かつ 既に開催時刻を過ぎていれば来週分
    IF v_days_ahead = 0 AND v_next_ts <= v_jst_now_ts THEN
      v_next_ts := v_next_ts + INTERVAL '7 days';
    END IF;

    -- TIMESTAMP (JST値) → TIMESTAMPTZ:
    --   v_next_ts は「Asia/Tokyoにある時刻」なので AT TIME ZONE 'Asia/Tokyo' で変換
    v_next_dt := v_next_ts AT TIME ZONE 'Asia/Tokyo';

    -- entry_deadline
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
      -- 既存あり
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

    v_events_out := v_events_out || jsonb_build_array(v_event_entry);

  END LOOP;

  RETURN jsonb_build_object(
    'ok',     true,
    'events', v_events_out
  );
END;
$$;

-- GRANT / REVOKE は前migrationから引き継ぎ済み
-- 念のため再度設定
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM anon;
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM authenticated;
GRANT EXECUTE ON FUNCTION ensure_next_arena_events() TO service_role;
GRANT EXECUTE ON FUNCTION ensure_next_arena_events() TO postgres;
