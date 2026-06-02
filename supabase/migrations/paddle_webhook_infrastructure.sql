-- =============================================================================
-- paddle_webhook_infrastructure.sql
-- Phase Paddle-W1: Webhook受信インフラ
-- 実行方法: Naoya が Supabase SQL Editor で実行する（承認後）
-- 冪等設計: IF NOT EXISTS 使用
-- =============================================================================

-- 1. profiles.paddle_last_event_at 追加
-- --------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS paddle_last_event_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.paddle_last_event_at IS
  'Last Paddle webhook event occurred_at. Used for stale-event guard. Set by paddle-webhook Edge Function only.';

-- 2. paddle_webhook_events テーブル（冪等性・重複排除用）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paddle_webhook_events (
  event_id      TEXT        PRIMARY KEY,
  event_type    TEXT        NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL,
  payload       JSONB       NOT NULL,
  processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  result        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (result IN ('pending', 'processed', 'skipped', 'denied', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_paddle_webhook_events_event_type
  ON paddle_webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_paddle_webhook_events_occurred_at
  ON paddle_webhook_events (occurred_at DESC);

ALTER TABLE paddle_webhook_events ENABLE ROW LEVEL SECURITY;

-- 3. paddle_webhook_audit_log テーブル（拒否・スキップ・エラー追跡用）
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paddle_webhook_audit_log (
  id           BIGSERIAL   PRIMARY KEY,
  event_id     TEXT,
  event_type   TEXT,
  supabase_uid TEXT,
  reason       TEXT        NOT NULL,
    -- 使用する reason 値:
    -- invalid_signature / email_mismatch / denied_account / no_profile
    -- is_test_account / stale_event / error / paddle_customer_email_fetch_failed
  action       TEXT        NOT NULL CHECK (action IN ('denied', 'skipped', 'error')),
  detail       JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paddle_audit_log_event_id
  ON paddle_webhook_audit_log (event_id);
CREATE INDEX IF NOT EXISTS idx_paddle_audit_log_created_at
  ON paddle_webhook_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paddle_audit_log_reason
  ON paddle_webhook_audit_log (reason);

ALTER TABLE paddle_webhook_audit_log ENABLE ROW LEVEL SECURITY;

-- 4. REVOKE / GRANT（監査性のため明示）
-- --------------------------------------------------------------------------

-- anon / authenticated は両テーブルに一切アクセス不可
REVOKE ALL ON paddle_webhook_events     FROM anon, authenticated;
REVOKE ALL ON paddle_webhook_audit_log  FROM anon, authenticated;

-- service_role はデフォルトで RLS バイパス。追加権限は不要だが明示 GRANT
GRANT ALL ON paddle_webhook_events     TO service_role;
GRANT ALL ON paddle_webhook_audit_log  TO service_role;
-- BIGSERIAL sequence の権限
GRANT USAGE, SELECT ON SEQUENCE paddle_webhook_audit_log_id_seq TO service_role;

-- =============================================================================
-- 確認クエリ（実行後に使用）
-- =============================================================================
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name IN ('profiles','paddle_webhook_events','paddle_webhook_audit_log')
-- ORDER BY table_name, ordinal_position;
--
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('paddle_webhook_events','paddle_webhook_audit_log');
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_name IN ('paddle_webhook_events','paddle_webhook_audit_log')
-- ORDER BY table_name, grantee;
