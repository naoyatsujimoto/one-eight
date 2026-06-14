-- prize_add_arena_code_to_view
-- prize_award_payment_state ビューに arena_code を追加する。
-- arena_events.arena_id → arena_definitions.id → arena_definitions.code の JOIN で取得。

DROP VIEW IF EXISTS prize_award_payment_state;

CREATE OR REPLACE VIEW prize_award_payment_state
  WITH (security_invoker = true)
AS
SELECT
  a.id                    AS award_id,
  a.recipient_user_id,
  a.status                AS award_status,
  a.amount_cents,
  a.currency,
  a.source_kind,
  a.source_arena_event_id,
  a.source_arena_match_id,
  ad.code                 AS arena_code,
  -- 最新 active payout（paid > prepared 優先）
  p.id                    AS payout_id,
  p.status                AS payout_status,
  p.paid_at,
  p.created_at            AS payout_created_at
FROM prize_awards a
LEFT JOIN arena_events ae ON ae.id = a.source_arena_event_id
LEFT JOIN arena_definitions ad ON ad.id = ae.arena_id
LEFT JOIN LATERAL (
  SELECT pp.id, pp.status, pp.paid_at, pp.created_at
  FROM prize_payouts pp
  WHERE pp.award_id = a.id
    AND pp.status IN ('prepared', 'paid')
  ORDER BY
    CASE pp.status
      WHEN 'paid'     THEN 1
      WHEN 'prepared' THEN 2
    END
  LIMIT 1
) p ON true;

GRANT SELECT ON prize_award_payment_state TO authenticated;
