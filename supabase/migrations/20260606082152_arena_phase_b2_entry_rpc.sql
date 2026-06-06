-- =============================================================================
-- Official Arena Phase B-2 — enter_arena_event RPC
-- 実装: enter_arena_event(p_arena_event_id uuid) RETURNS jsonb
-- =============================================================================
-- 方針:
--   - SECURITY DEFINER / SET search_path = public
--   - GRANT EXECUTE to authenticated のみ (anon には付与しない)
--   - arena_entries INSERT GRANT / INSERT POLICY は付けない (direct INSERT 不可を維持)
--   - arena_points / arena_match_history / arena_master_history SELECT GRANT 復活禁止
--   - profiles schema 変更なし
--   - official_matches 変更なし
-- =============================================================================

CREATE OR REPLACE FUNCTION enter_arena_event(p_arena_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          UUID;
  v_event        arena_events%ROWTYPE;
  v_entry_deadline TIMESTAMPTZ;
  v_is_pro       BOOLEAN;
  v_entry_id     UUID;
  v_entered_at   TIMESTAMPTZ;
BEGIN
  -- 1. 認証チェック
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- 2. event存在確認 (FOR UPDATE: 同時実行対策)
  SELECT ae.*
  INTO v_event
  FROM arena_events ae
  WHERE ae.id = p_arena_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  -- 3. event status チェック
  IF v_event.status != 'scheduled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'event_not_open',
      'status', v_event.status
    );
  END IF;

  -- 4. entry deadline チェック
  SELECT v_event.scheduled_at - ((ad.entry_deadline_hours || ' hours')::INTERVAL)
  INTO v_entry_deadline
  FROM arena_definitions ad
  WHERE ad.id = v_event.arena_id;

  IF now() >= v_entry_deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'entry_deadline_passed');
  END IF;

  -- 5. Pro チェック
  -- isProActive と同等の判定:
  --   plan = 'pro'
  --   AND (
  --     (subscription_status = 'active' AND (current_period_end IS NULL OR current_period_end > now()))
  --     OR
  --     (subscription_status = 'canceled' AND current_period_end IS NOT NULL AND current_period_end > now())
  --   )
  SELECT (
    p.plan = 'pro'
    AND (
      (p.subscription_status = 'active' AND (p.current_period_end IS NULL OR p.current_period_end > now()))
      OR
      (p.subscription_status = 'canceled' AND p.current_period_end IS NOT NULL AND p.current_period_end > now())
    )
  )
  INTO v_is_pro
  FROM profiles p
  WHERE p.id = v_uid;

  IF v_is_pro IS NULL OR v_is_pro = FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pro_required');
  END IF;

  -- 6. duplicate entry チェック + INSERT (UNIQUE violation でも安全に返す)
  BEGIN
    INSERT INTO arena_entries (arena_event_id, user_id)
    VALUES (p_arena_event_id, v_uid)
    RETURNING id, entered_at
    INTO v_entry_id, v_entered_at;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_entered');
  END;

  -- 7. 成功レスポンス
  RETURN jsonb_build_object(
    'ok',             true,
    'entry_id',       v_entry_id,
    'arena_event_id', p_arena_event_id,
    'entered_at',     v_entered_at
  );
END;
$$;

-- authenticated のみ EXECUTE 許可 (anon / PUBLIC には付与しない)
-- PostgreSQL デフォルトの PUBLIC EXECUTE GRANT を明示的に剥奪
REVOKE EXECUTE ON FUNCTION enter_arena_event(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION enter_arena_event(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION enter_arena_event(UUID) TO authenticated;
