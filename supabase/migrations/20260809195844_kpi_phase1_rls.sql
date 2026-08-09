-- =============================================================================
-- 20260809195844_kpi_phase1_rls.sql
-- KPI Phase 1: RLS・権限設定
-- =============================================================================
-- 方針:
--   - clientからの直接INSERT/UPDATE禁止
--   - anonからraw eventをSELECT不可
--   - authenticatedからもraw eventをSELECT不可
--   - service_role/postgresには全権限
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RLS有効化
-- ---------------------------------------------------------------------------

ALTER TABLE kpi_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- kpi_events RLS
-- ---------------------------------------------------------------------------

-- anon: アクセス禁止
DROP POLICY IF EXISTS "kpi_events_anon_deny" ON kpi_events;
CREATE POLICY "kpi_events_anon_deny"
  ON kpi_events
  FOR ALL
  TO anon
  USING (false);

-- authenticated: SELECT/INSERT/UPDATE/DELETE 禁止
-- （SECURITY DEFINER RPCのみがwrite可能）
DROP POLICY IF EXISTS "kpi_events_authenticated_deny" ON kpi_events;
CREATE POLICY "kpi_events_authenticated_deny"
  ON kpi_events
  FOR ALL
  TO authenticated
  USING (false);

-- service_role: バイパス（Supabase デフォルト動作）
-- postgres: バイパス（Supabase デフォルト動作）

-- ---------------------------------------------------------------------------
-- kpi_sessions RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "kpi_sessions_anon_deny" ON kpi_sessions;
CREATE POLICY "kpi_sessions_anon_deny"
  ON kpi_sessions
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "kpi_sessions_authenticated_deny" ON kpi_sessions;
CREATE POLICY "kpi_sessions_authenticated_deny"
  ON kpi_sessions
  FOR ALL
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- kpi_settings RLS
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "kpi_settings_anon_deny" ON kpi_settings;
CREATE POLICY "kpi_settings_anon_deny"
  ON kpi_settings
  FOR ALL
  TO anon
  USING (false);

DROP POLICY IF EXISTS "kpi_settings_authenticated_deny" ON kpi_settings;
CREATE POLICY "kpi_settings_authenticated_deny"
  ON kpi_settings
  FOR ALL
  TO authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- GRANT（service_roleには全権限 - Supabase managed）
-- ---------------------------------------------------------------------------

-- RPCが使用するため公開スキーマへのアクセスを確認
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- テーブルへの直接アクセスは DENY（RLS経由）
-- service_role は RLS bypass なので追加 GRANT 不要
