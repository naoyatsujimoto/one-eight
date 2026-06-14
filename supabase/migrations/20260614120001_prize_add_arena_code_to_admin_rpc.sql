-- prize_add_arena_code_to_admin_rpc
-- admin_list_prize_awards() に arena_code カラムを追加する。
-- arena_events.arena_id → arena_definitions.code の JOIN で取得。

DROP FUNCTION IF EXISTS admin_list_prize_awards();

CREATE OR REPLACE FUNCTION admin_list_prize_awards()
RETURNS TABLE (
  award_id                          uuid,
  recipient_user_id                 uuid,
  recipient_display_name            text,
  source_kind                       text,
  source_arena_event_id             uuid,
  source_arena_match_id             uuid,
  arena_code                        text,
  amount_cents                      int,
  currency                          text,
  prize_kind                        text,
  award_status                      text,
  latest_payout_status              text,
  notes                             text,
  hold_reason                       text,
  cancel_reason                     text,
  canceled_at                       timestamptz,
  created_by_user_id                uuid,
  created_at                        timestamptz,
  -- RP-4 追加
  latest_submission_id              uuid,
  latest_submission_status          text,
  latest_submission_submitted_at    timestamptz,
  latest_submission_delete_after    timestamptz,
  latest_submission_data_cleared_at timestamptz
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
    ad.code                 AS arena_code,
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
    a.created_at,
    -- RP-4: latest submission（PII なし）
    sub.id                  AS latest_submission_id,
    sub.status              AS latest_submission_status,
    sub.created_at          AS latest_submission_submitted_at,
    sub.delete_after        AS latest_submission_delete_after,
    sub.data_cleared_at     AS latest_submission_data_cleared_at
  FROM prize_awards a
  LEFT JOIN profiles p ON p.id = a.recipient_user_id
  LEFT JOIN arena_events ae ON ae.id = a.source_arena_event_id
  LEFT JOIN arena_definitions ad ON ad.id = ae.arena_id
  LEFT JOIN LATERAL (
    SELECT s.id, s.status, s.created_at, s.delete_after, s.data_cleared_at
    FROM prize_temp_tax_submissions s
    WHERE s.award_id = a.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) sub ON true
  ORDER BY a.created_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION admin_list_prize_awards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_list_prize_awards() TO authenticated;
