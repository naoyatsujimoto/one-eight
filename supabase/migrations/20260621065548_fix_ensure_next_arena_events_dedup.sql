-- ============================================================
-- fix_ensure_next_arena_events_dedup
--
-- 目的:
--   ensure_next_arena_events() の重複生成バグを修正する。
--
-- 問題:
--   既存 event 確認条件が `status = 'scheduled' AND scheduled_at > now()`
--   に限定されていたため、開催後（completed 等）になった event を見落とし、
--   同一 (arena_id, scheduled_at) で再 INSERT して重複を生成していた。
--
-- 修正内容:
--   1. 既存 event 確認を「計算した v_next_dt と同一 scheduled_at のeventが
--      status 不問で存在するか」に変更
--   2. INSERT 時に ON CONFLICT (arena_id, scheduled_at) DO NOTHING を追加
--      （前 migration で追加した UNIQUE INDEX と整合）
--
-- 変更しないもの:
--   JST タイムゾーン計算ロジック
--   ELEPHANT / JAGUAR の開催曜日・時刻
--   entry deadline 計算
--   戻り値形式
--   SECURITY DEFINER / SET search_path = public
--   GRANT / REVOKE 方針（service_role / postgres のみ EXECUTE 許可）
-- ============================================================

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

  v_jst_now_ts     TIMESTAMP;
  v_jst_today_ts   TIMESTAMP;
  v_dow_now        INTEGER;
  v_days_ahead     INTEGER;
  v_next_ts        TIMESTAMP;
BEGIN
  v_jst_now_ts := now() AT TIME ZONE 'Asia/Tokyo';

  FOR v_arena IN
    SELECT id, code, weekday, start_time_jst, entry_deadline_hours
    FROM arena_definitions
    WHERE is_active = TRUE
    ORDER BY display_order
  LOOP
    -- ── 次回開催日時の計算（JST 基準、変更なし） ───────────────────────
    v_jst_today_ts := DATE_TRUNC('day', v_jst_now_ts);
    v_dow_now      := EXTRACT(DOW FROM v_jst_now_ts)::INTEGER;
    v_days_ahead   := ((v_arena.weekday - v_dow_now + 7) % 7);

    v_next_ts := v_jst_today_ts
                 + (v_days_ahead * INTERVAL '1 day')
                 + v_arena.start_time_jst::INTERVAL;

    IF v_days_ahead = 0 AND v_next_ts <= v_jst_now_ts THEN
      v_next_ts := v_next_ts + INTERVAL '7 days';
    END IF;

    v_next_dt        := v_next_ts AT TIME ZONE 'Asia/Tokyo';
    v_entry_deadline := v_next_dt - (v_arena.entry_deadline_hours * INTERVAL '1 hour');

    -- ── 既存 event 確認（修正: status 不問 / 計算済み scheduled_at と一致するもの）
    --    旧: status = 'scheduled' AND scheduled_at > now() → completed 後を見落として重複生成
    --    新: scheduled_at = v_next_dt で status 不問に確認し、重複生成を防止
    SELECT id, scheduled_at
      INTO v_existing_id, v_existing_dt
      FROM arena_events
     WHERE arena_id    = v_arena.id
       AND scheduled_at = v_next_dt
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- 既存あり（status 不問）
      v_action := 'existing';
      v_event_entry := jsonb_build_object(
        'arena_code',     v_arena.code,
        'event_id',       v_existing_id,
        'event_datetime', v_existing_dt,
        'entry_deadline', v_existing_dt - (v_arena.entry_deadline_hours * INTERVAL '1 hour'),
        'action',         v_action
      );
    ELSE
      -- 未存在 → INSERT（ON CONFLICT DO NOTHING で二重防止）
      INSERT INTO arena_events (arena_id, scheduled_at, status)
      VALUES (v_arena.id, v_next_dt, 'scheduled')
      ON CONFLICT (arena_id, scheduled_at) DO NOTHING
      RETURNING id INTO v_new_id;

      IF v_new_id IS NOT NULL THEN
        v_action := 'created';
      ELSE
        -- ON CONFLICT で skip された場合（競合 INSERT）: 改めて取得
        SELECT id INTO v_new_id
          FROM arena_events
         WHERE arena_id    = v_arena.id
           AND scheduled_at = v_next_dt
         LIMIT 1;
        v_action := 'existing_conflict_skip';
      END IF;

      v_event_entry := jsonb_build_object(
        'arena_code',     v_arena.code,
        'event_id',       v_new_id,
        'event_datetime', v_next_dt,
        'entry_deadline', v_entry_deadline,
        'action',         v_action
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

-- GRANT / REVOKE（既存方針を維持: service_role / postgres のみ）
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM anon;
REVOKE EXECUTE ON FUNCTION ensure_next_arena_events() FROM authenticated;
GRANT EXECUTE ON FUNCTION ensure_next_arena_events() TO service_role;
GRANT EXECUTE ON FUNCTION ensure_next_arena_events() TO postgres;

COMMENT ON FUNCTION ensure_next_arena_events() IS
  'Ensures the next scheduled arena event exists for each active arena. '
  'Dedup fix: checks existing event by (arena_id, scheduled_at) regardless of status; '
  'INSERT uses ON CONFLICT (arena_id, scheduled_at) DO NOTHING to prevent duplicate generation.';
