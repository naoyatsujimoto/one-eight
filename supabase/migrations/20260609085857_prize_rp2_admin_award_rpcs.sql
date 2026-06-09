-- ============================================================
-- RP-2: Prize Admin Award RPCs
-- prize_awards テーブル拡張 + admin専用 SECURITY DEFINER RPC
-- ============================================================
-- 追加カラム (prize_awards):
--   source_kind          text  -- source を source_kind に rename + 列追加
--   source_arena_id      uuid  -- arena_definitions.id
--   source_arena_event_id  uuid  -- arena_events.id
--   source_arena_match_id  uuid  -- arena_matches.id
--   prize_kind           text  -- 'cash' | 'merchandise' | 'title_only'
--   hold_reason          text
--   cancel_reason        text
--   canceled_at          timestamptz
--   created_by_user_id   uuid  -- admin who created this award
-- RPCs:
--   admin_create_prize_award(...)
--   admin_update_prize_award_status(...)
--   admin_list_prize_awards()
-- ============================================================

-- ============================================================
-- 1. prize_awards テーブル拡張
-- RP-1では source テキスト列があったため、新列 source_kind を追加し
-- 既存の source 列は互換のため残す（新RPC は source_kind を使う）
-- ============================================================

-- source_kind: arena_master / tournament / manual_admin / other
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS source_kind text
    CHECK (source_kind IN ('arena_master','tournament','manual_admin','other'));

-- source_arena_id: arena_definitions.id (nullable)
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS source_arena_id uuid;

-- source_arena_event_id: arena_events.id (nullable)
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS source_arena_event_id uuid;

-- source_arena_match_id: arena_matches.id (nullable)
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS source_arena_match_id uuid;

-- prize_kind: cash / merchandise / title_only
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS prize_kind text DEFAULT 'cash'
    CHECK (prize_kind IN ('cash','merchandise','title_only'));

-- hold_reason: on_hold 時の理由
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS hold_reason text;

-- cancel_reason: canceled 時の理由
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- canceled_at: canceled 時のタイムスタンプ
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

-- created_by_user_id: Award を作成した admin の user_id
ALTER TABLE prize_awards
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS prize_awards_created_by_idx
  ON prize_awards (created_by_user_id);

-- ============================================================
-- 2. admin_create_prize_award()
-- ============================================================
CREATE OR REPLACE FUNCTION admin_create_prize_award(
  p_recipient_user_id     uuid,
  p_source_kind           text,
  p_amount_cents          int,
  p_currency              text,
  p_source_arena_id       uuid    DEFAULT NULL,
  p_source_arena_event_id uuid    DEFAULT NULL,
  p_source_arena_match_id uuid    DEFAULT NULL,
  p_prize_kind            text    DEFAULT 'cash',
  p_notes                 text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin  boolean;
  v_award_id  uuid;
  v_result    jsonb;
BEGIN
  -- 呼び出し元の user_id を取得
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated to call this function.';
  END IF;

  -- is_admin を profiles から再確認
  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'not_admin'
      USING DETAIL = 'Only admins can create prize awards.';
  END IF;

  -- バリデーション
  IF p_amount_cents < 0 THEN
    RAISE EXCEPTION 'invalid_amount'
      USING DETAIL = 'amount_cents must be >= 0.';
  END IF;

  IF length(p_currency) != 3 THEN
    RAISE EXCEPTION 'invalid_currency'
      USING DETAIL = 'currency must be a 3-character ISO code.';
  END IF;

  IF p_source_kind NOT IN ('arena_master','tournament','manual_admin','other') THEN
    RAISE EXCEPTION 'invalid_source_kind'
      USING DETAIL = 'source_kind must be one of: arena_master, tournament, manual_admin, other.';
  END IF;

  IF p_prize_kind NOT IN ('cash','merchandise','title_only') THEN
    RAISE EXCEPTION 'invalid_prize_kind'
      USING DETAIL = 'prize_kind must be one of: cash, merchandise, title_only.';
  END IF;

  -- Insert prize_award
  INSERT INTO prize_awards (
    recipient_user_id,
    status,
    amount_cents,
    currency,
    source,
    source_kind,
    source_arena_id,
    source_arena_event_id,
    source_arena_match_id,
    prize_kind,
    notes,
    created_by_user_id
  ) VALUES (
    p_recipient_user_id,
    'eligible',
    p_amount_cents,
    p_currency,
    p_source_kind,     -- 既存 source 列にも source_kind を入れる
    p_source_kind,
    p_source_arena_id,
    p_source_arena_event_id,
    p_source_arena_match_id,
    p_prize_kind,
    p_notes,
    v_caller_id
  )
  RETURNING id INTO v_award_id;

  -- archive log (created イベント, PII なし)
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    after_state,
    notes
  ) VALUES (
    'created',
    'prize_award',
    v_award_id,
    v_caller_id,
    jsonb_build_object(
      'status',        'eligible',
      'source_kind',   p_source_kind,
      'prize_kind',    p_prize_kind,
      'amount_cents',  p_amount_cents,
      'currency',      p_currency
    ),
    p_notes
  );

  -- 戻り値
  SELECT to_jsonb(a) INTO v_result
    FROM prize_awards a WHERE a.id = v_award_id;

  RETURN v_result;
END;
$$;

-- GRANT: authenticated のみ実行可（内部で is_admin 再確認）
REVOKE ALL ON FUNCTION admin_create_prize_award(
  uuid, text, int, text, uuid, uuid, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_create_prize_award(
  uuid, text, int, text, uuid, uuid, uuid, text, text
) TO authenticated;

-- ============================================================
-- 3. admin_update_prize_award_status()
-- ============================================================
CREATE OR REPLACE FUNCTION admin_update_prize_award_status(
  p_award_id uuid,
  p_status   text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id  uuid;
  v_is_admin   boolean;
  v_old_status text;
  v_result     jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING DETAIL = 'You must be authenticated.';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'not_admin'
      USING DETAIL = 'Only admins can update prize award status.';
  END IF;

  -- 許可する status のみ
  IF p_status NOT IN ('eligible','on_hold','canceled') THEN
    RAISE EXCEPTION 'invalid_status'
      USING DETAIL = 'Allowed statuses: eligible, on_hold, canceled.';
  END IF;

  -- 現在のステータスを取得
  SELECT status INTO v_old_status
    FROM prize_awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_not_found'
      USING DETAIL = 'No prize_award found with the given id.';
  END IF;

  -- 既に canceled なら変更不可
  IF v_old_status = 'canceled' THEN
    RAISE EXCEPTION 'award_already_canceled'
      USING DETAIL = 'A canceled award cannot be changed.';
  END IF;

  -- expired / paid 状態変更禁止
  IF v_old_status = 'expired' THEN
    RAISE EXCEPTION 'award_expired'
      USING DETAIL = 'An expired award cannot be changed.';
  END IF;

  -- 更新
  UPDATE prize_awards
  SET
    status      = p_status,
    hold_reason = CASE
                    WHEN p_status = 'on_hold'   THEN COALESCE(p_reason, hold_reason)
                    WHEN p_status = 'eligible'  THEN NULL
                    ELSE hold_reason
                  END,
    cancel_reason = CASE
                      WHEN p_status = 'canceled' THEN p_reason
                      ELSE cancel_reason
                    END,
    canceled_at   = CASE
                      WHEN p_status = 'canceled' THEN now()
                      ELSE canceled_at
                    END,
    updated_at  = now()
  WHERE id = p_award_id;

  -- archive log (append-only)
  INSERT INTO prize_archive_logs (
    event_type,
    entity_type,
    entity_id,
    actor_user_id,
    before_state,
    after_state,
    notes
  ) VALUES (
    'status_changed',
    'prize_award',
    p_award_id,
    v_caller_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_status),
    p_reason
  );

  SELECT to_jsonb(a) INTO v_result
    FROM prize_awards a WHERE a.id = p_award_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION admin_update_prize_award_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_update_prize_award_status(uuid, text, text) TO authenticated;

-- ============================================================
-- 4. admin_list_prize_awards()
-- ============================================================
CREATE OR REPLACE FUNCTION admin_list_prize_awards()
RETURNS TABLE (
  award_id               uuid,
  recipient_user_id      uuid,
  recipient_display_name text,
  source_kind            text,
  source_arena_event_id  uuid,
  source_arena_match_id  uuid,
  amount_cents           int,
  currency               text,
  prize_kind             text,
  award_status           text,
  latest_payout_status   text,
  notes                  text,
  hold_reason            text,
  cancel_reason          text,
  canceled_at            timestamptz,
  created_by_user_id     uuid,
  created_at             timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_is_admin  boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT is_admin INTO v_is_admin
    FROM profiles WHERE id = v_caller_id;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'not_admin'
      USING DETAIL = 'Only admins can list prize awards.';
  END IF;

  RETURN QUERY
  SELECT
    a.id                    AS award_id,
    a.recipient_user_id,
    p.display_name          AS recipient_display_name,
    a.source_kind,
    a.source_arena_event_id,
    a.source_arena_match_id,
    a.amount_cents,
    a.currency,
    a.prize_kind,
    a.status                AS award_status,
    -- 最新 payout status (active: pending / in_csv / paid)
    (
      SELECT pp.status
      FROM prize_payouts pp
      WHERE pp.award_id = a.id
        AND pp.status IN ('pending','in_csv','paid')
      ORDER BY
        CASE pp.status
          WHEN 'paid'    THEN 1
          WHEN 'in_csv'  THEN 2
          WHEN 'pending' THEN 3
        END
      LIMIT 1
    )                       AS latest_payout_status,
    a.notes,
    a.hold_reason,
    a.cancel_reason,
    a.canceled_at,
    a.created_by_user_id,
    a.created_at
  FROM prize_awards a
  LEFT JOIN profiles p ON p.id = a.recipient_user_id
  ORDER BY a.created_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_prize_awards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_prize_awards() TO authenticated;
