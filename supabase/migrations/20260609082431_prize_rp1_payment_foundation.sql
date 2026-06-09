-- ============================================================
-- RP-1: Reward / Prize Payment Foundation
-- Opus監査版 DB基盤
-- ============================================================
-- Tables:
--   prize_awards
--   prize_payouts
--   prize_temp_tax_submissions
--   prize_archive_logs
-- Functions / Triggers:
--   prevent_paid_payout_mutation()
--   prize_payouts_paid_immutable
--   prevent_archive_log_mutation()
--   prize_archive_logs_no_update_or_delete
-- View:
--   prize_award_payment_state
-- ============================================================

-- ============================================================
-- 1. prize_awards
-- ============================================================
CREATE TABLE IF NOT EXISTS prize_awards (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','eligible','on_hold','canceled','expired')),
  amount_cents      int  NOT NULL CHECK (amount_cents >= 0),
  currency          text NOT NULL CHECK (length(currency) = 3),
  source            text NOT NULL
                    CHECK (source IN ('arena_master','tournament','manual_admin','other')),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prize_awards ENABLE ROW LEVEL SECURITY;

-- RLS: 本人のみ SELECT
CREATE POLICY prize_awards_select_own ON prize_awards
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- client 直接 INSERT / UPDATE / DELETE は不可
-- service_role は ALL（RLS を bypasses）
REVOKE INSERT, UPDATE, DELETE ON prize_awards FROM authenticated, anon;
GRANT SELECT ON prize_awards TO authenticated;
GRANT ALL ON prize_awards TO service_role;

CREATE INDEX IF NOT EXISTS prize_awards_recipient_idx
  ON prize_awards (recipient_user_id);
CREATE INDEX IF NOT EXISTS prize_awards_status_idx
  ON prize_awards (status);

-- ============================================================
-- 2. prize_payouts
-- ============================================================
CREATE TABLE IF NOT EXISTS prize_payouts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id                    uuid NOT NULL REFERENCES prize_awards(id) ON DELETE RESTRICT,
  status                      text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','in_csv','paid','failed','canceled')),
  payment_method              text NOT NULL
                              CHECK (payment_method IN ('paypal_csv','paypal_api','bank_transfer','manual')),
  -- Snapshot columns (NOT NULL — capture state at payout time)
  amount_cents_snapshot       int  NOT NULL,
  currency_snapshot           text NOT NULL CHECK (length(currency_snapshot) = 3),
  recipient_email_snapshot    text NOT NULL,
  recipient_name_snapshot     text NOT NULL,
  -- Lifecycle
  paid_at                     timestamptz,
  failed_at                   timestamptz,
  canceled_at                 timestamptz,
  failure_reason              text,
  external_ref                text,   -- PayPal payout item ID / batch ID etc.
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Partial UNIQUE index: 同一 award_id に active payout は最大 1 件
-- active = pending | in_csv | paid
CREATE UNIQUE INDEX IF NOT EXISTS prize_payouts_one_active_per_award
  ON prize_payouts (award_id)
  WHERE status IN ('pending','in_csv','paid');

ALTER TABLE prize_payouts ENABLE ROW LEVEL SECURITY;

-- RLS: 本人の award に紐づく payout のみ SELECT 可
CREATE POLICY prize_payouts_select_own ON prize_payouts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM prize_awards a
      WHERE a.id = prize_payouts.award_id
        AND a.recipient_user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON prize_payouts FROM authenticated, anon;
GRANT SELECT ON prize_payouts TO authenticated;
GRANT ALL ON prize_payouts TO service_role;

CREATE INDEX IF NOT EXISTS prize_payouts_award_id_idx
  ON prize_payouts (award_id);
CREATE INDEX IF NOT EXISTS prize_payouts_status_idx
  ON prize_payouts (status);

-- ============================================================
-- 2a. Trigger: paid payout immutability
-- paid後は critical フィールドを変更不可
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_paid_payout_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- paid payout の critical fields は変更禁止
  IF OLD.status = 'paid' THEN
    IF (
      NEW.status                   IS DISTINCT FROM OLD.status OR
      NEW.amount_cents_snapshot    IS DISTINCT FROM OLD.amount_cents_snapshot OR
      NEW.currency_snapshot        IS DISTINCT FROM OLD.currency_snapshot OR
      NEW.recipient_email_snapshot IS DISTINCT FROM OLD.recipient_email_snapshot OR
      NEW.recipient_name_snapshot  IS DISTINCT FROM OLD.recipient_name_snapshot OR
      NEW.payment_method           IS DISTINCT FROM OLD.payment_method OR
      NEW.paid_at                  IS DISTINCT FROM OLD.paid_at OR
      NEW.award_id                 IS DISTINCT FROM OLD.award_id
    ) THEN
      RAISE EXCEPTION 'paid_payout_critical_fields_immutable'
        USING DETAIL = 'A paid payout row cannot be modified.';
    END IF;
  END IF;

  -- failed / canceled payout は別 status への復活禁止
  IF OLD.status IN ('failed','canceled') AND NEW.status != OLD.status THEN
    RAISE EXCEPTION 'terminated_payout_immutable'
      USING DETAIL = 'A failed or canceled payout cannot change status.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER prize_payouts_paid_immutable
  BEFORE UPDATE ON prize_payouts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_paid_payout_mutation();

-- ============================================================
-- 3. prize_temp_tax_submissions
-- ============================================================
CREATE TABLE IF NOT EXISTS prize_temp_tax_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  award_id         uuid NOT NULL REFERENCES prize_awards(id) ON DELETE RESTRICT,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'submitted'
                   CHECK (status IN ('submitted','reviewed','archived','data_cleared')),
  submission_data  jsonb,
  delete_after     timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  data_cleared_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- data_cleared の整合性
  CONSTRAINT prize_temp_tax_data_cleared_check CHECK (
    (status = 'data_cleared' AND submission_data IS NULL AND data_cleared_at IS NOT NULL)
    OR
    (status != 'data_cleared' AND submission_data IS NOT NULL)
  )
);

ALTER TABLE prize_temp_tax_submissions ENABLE ROW LEVEL SECURITY;

-- RLS: 本人は自分の submission のみ SELECT / INSERT 可
CREATE POLICY prize_temp_tax_select_own ON prize_temp_tax_submissions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY prize_temp_tax_insert_own ON prize_temp_tax_submissions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE / DELETE は client 不可
REVOKE UPDATE, DELETE ON prize_temp_tax_submissions FROM authenticated, anon;
GRANT SELECT, INSERT ON prize_temp_tax_submissions TO authenticated;
GRANT ALL ON prize_temp_tax_submissions TO service_role;

CREATE INDEX IF NOT EXISTS prize_temp_tax_user_id_idx
  ON prize_temp_tax_submissions (user_id);
CREATE INDEX IF NOT EXISTS prize_temp_tax_delete_after_idx
  ON prize_temp_tax_submissions (delete_after);

-- ============================================================
-- 4. prize_archive_logs
-- append-only 監査ログ
-- ============================================================
CREATE TABLE IF NOT EXISTS prize_archive_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  actor_user_id uuid,
  before_state  jsonb,  -- redacted snapshot (後続 RPC で設定)
  after_state   jsonb,  -- redacted snapshot (後続 RPC で設定)
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prize_archive_logs ENABLE ROW LEVEL SECURITY;

-- authenticated / anon には直接 SELECT させない
REVOKE ALL ON prize_archive_logs FROM authenticated, anon;
GRANT ALL ON prize_archive_logs TO service_role;

CREATE INDEX IF NOT EXISTS prize_archive_logs_entity_idx
  ON prize_archive_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS prize_archive_logs_created_at_idx
  ON prize_archive_logs (created_at);

-- ============================================================
-- 4a. Trigger: append-only
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_archive_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'archive_log_is_append_only'
    USING DETAIL = 'prize_archive_logs rows cannot be updated or deleted.';
END;
$$;

CREATE TRIGGER prize_archive_logs_no_update_or_delete
  BEFORE UPDATE OR DELETE ON prize_archive_logs
  FOR EACH ROW
  EXECUTE FUNCTION prevent_archive_log_mutation();

-- ============================================================
-- 5. prize_award_payment_state view
-- PII を含まない補助 view
-- security_invoker = true → RLS は呼び出し元ユーザーで評価
-- ============================================================
CREATE OR REPLACE VIEW prize_award_payment_state
  WITH (security_invoker = true)
AS
SELECT
  a.id                    AS award_id,
  a.recipient_user_id,
  a.status                AS award_status,
  a.amount_cents,
  a.currency,
  a.source,
  -- 最新 active payout（paid > in_csv > pending 優先）
  p.id                    AS payout_id,
  p.status                AS payout_status,
  p.payment_method,
  p.paid_at,
  p.created_at            AS payout_created_at
FROM prize_awards a
LEFT JOIN LATERAL (
  SELECT pp.id, pp.status, pp.payment_method, pp.paid_at, pp.created_at
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
) p ON true;

GRANT SELECT ON prize_award_payment_state TO authenticated;
