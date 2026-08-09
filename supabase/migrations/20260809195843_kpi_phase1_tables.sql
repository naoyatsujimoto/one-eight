-- =============================================================================
-- 20260809195843_kpi_phase1_tables.sql
-- KPI Phase 1: kpi_events, kpi_sessions, kpi_settings テーブル作成
-- =============================================================================
-- 除外条件:
--   - profiles.is_internal_test_account = true
--   - profiles.is_admin = true
--   - route = '/ai-check-login'
--   - environment IN ('localhost','preview','development','test')
--   - sim_match_logs（参照のみ）
--   - event_name = 'test_event'
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Migration A: kpi_events テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kpi_events (
  id                UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at       TIMESTAMPTZ  NOT NULL,
  received_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  event_name        TEXT         NOT NULL,
  user_id           UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id      UUID         NOT NULL,
  session_id        UUID         NOT NULL,
  locale            TEXT,
  route             TEXT         CHECK (char_length(route) <= 500),
  device_class      TEXT         CHECK (device_class IN ('desktop','mobile','tablet','unknown')),
  os_family         TEXT,
  browser_family    TEXT,
  app_version       TEXT,
  properties        JSONB        NOT NULL DEFAULT '{}',
  idempotency_key   TEXT         NOT NULL UNIQUE,
  environment       TEXT         NOT NULL CHECK (environment IN ('production','staging','development','test')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE kpi_events IS 'KPI tracking events. Raw event store. Retention managed by cleanup_old_kpi_events().';
COMMENT ON COLUMN kpi_events.user_id IS 'Resolved from auth.uid() by RPC. Never client-supplied directly.';
COMMENT ON COLUMN kpi_events.anonymous_id IS 'Persistent anonymous identifier (localStorage). Not linked to PII.';
COMMENT ON COLUMN kpi_events.session_id IS 'Tab-scoped session identifier (sessionStorage).';
COMMENT ON COLUMN kpi_events.idempotency_key IS 'Unique per send attempt. Duplicate sends are silently ignored.';
COMMENT ON COLUMN kpi_events.environment IS 'Production events only used for official KPIs.';

-- ---------------------------------------------------------------------------
-- Migration B: kpi_sessions テーブル
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kpi_sessions (
  session_id        UUID         NOT NULL PRIMARY KEY,
  anonymous_id      UUID         NOT NULL,
  user_id           UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at        TIMESTAMPTZ  NOT NULL,
  last_seen_at      TIMESTAMPTZ  NOT NULL,
  first_route       TEXT         CHECK (char_length(first_route) <= 500),
  locale            TEXT,
  device_class      TEXT         CHECK (device_class IN ('desktop','mobile','tablet','unknown')),
  authenticated_at  TIMESTAMPTZ,
  environment       TEXT         NOT NULL CHECK (environment IN ('production','staging','development','test')),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE kpi_sessions IS 'KPI session records. One row per tab session. Updated by upsert_kpi_session() RPC.';
COMMENT ON COLUMN kpi_sessions.user_id IS 'Set by RPC from auth.uid() when user authenticates. Never client-supplied.';
COMMENT ON COLUMN kpi_sessions.authenticated_at IS 'Timestamp when user_id was first resolved for this session.';

-- ---------------------------------------------------------------------------
-- Migration C: kpi_settings テーブル（単一行）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS kpi_settings (
  id                         INTEGER      NOT NULL PRIMARY KEY DEFAULT 1,
  official_kpi_start_at      TIMESTAMPTZ  DEFAULT NULL,
  raw_event_retention_days   INTEGER      NOT NULL DEFAULT 90,
  updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by                 UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT kpi_settings_single_row CHECK (id = 1)
);

COMMENT ON TABLE kpi_settings IS 'Global KPI settings. Single row only (id = 1 enforced by constraint).';
COMMENT ON COLUMN kpi_settings.official_kpi_start_at IS 'NULL until explicitly set by admin. Data before this date is warm-up/reference only.';
COMMENT ON COLUMN kpi_settings.raw_event_retention_days IS 'Days to retain raw kpi_events rows. Default 90.';

-- 初期行挿入（official_kpi_start_at は NULL のまま）
INSERT INTO kpi_settings (id, official_kpi_start_at, raw_event_retention_days)
VALUES (1, NULL, 90)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- kpi_events
CREATE INDEX IF NOT EXISTS idx_kpi_events_occurred_at
  ON kpi_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_events_event_name_occurred_at
  ON kpi_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_events_user_id_occurred_at
  ON kpi_events (user_id, occurred_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_events_session_id
  ON kpi_events (session_id);

CREATE INDEX IF NOT EXISTS idx_kpi_events_anonymous_id_occurred_at
  ON kpi_events (anonymous_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_events_environment_occurred_at
  ON kpi_events (environment, occurred_at DESC);

-- kpi_sessions
CREATE INDEX IF NOT EXISTS idx_kpi_sessions_anonymous_id
  ON kpi_sessions (anonymous_id);

CREATE INDEX IF NOT EXISTS idx_kpi_sessions_user_id
  ON kpi_sessions (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kpi_sessions_environment_started_at
  ON kpi_sessions (environment, started_at DESC);
