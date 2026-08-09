-- =============================================================================
-- 20260809195849_kpi_service_role_grants.sql
-- KPI Phase 1: service_role / postgres への明示的 GRANT EXECUTE
--
-- 依存: 20260809195843 (tables), 20260809195845 (base RPCs),
--       20260809195846 (security: _kpi_check_pii_keys, _kpi_check_rate_limit),
--       20260809195847 (event validation: _kpi_validate_properties)
--
-- 方針:
-- PUBLICからREVOKEした関数について、service_role / postgres に
-- 明示的にGRANT EXECUTEする。
-- cleanup・rate-limit・PII check・validation等のAdmin/internal関数を対象とする。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 補助関数: service_role / postgres のみ実行可
-- ---------------------------------------------------------------------------

-- _kpi_check_pii_keys
GRANT EXECUTE ON FUNCTION public._kpi_check_pii_keys(JSONB)
  TO service_role, postgres;

-- _kpi_check_rate_limit
GRANT EXECUTE ON FUNCTION public._kpi_check_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role, postgres;

-- _kpi_validate_properties
GRANT EXECUTE ON FUNCTION public._kpi_validate_properties(TEXT, JSONB)
  TO service_role, postgres;

-- _kpi_allowed_event_names
-- この関数はSECURITY DEFINERではないため、track_kpi_event内から呼ばれる
-- service_role / postgres にも明示的にGRANT
GRANT EXECUTE ON FUNCTION public._kpi_allowed_event_names()
  TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- cleanup関数: service_role / postgres のみ
-- (pg_cronなどから呼ばれる)
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.cleanup_old_kpi_events()
  TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- admin系RPC: authenticated（is_admin=true check内蔵）
-- service_role / postgres にもGRANT (管理ツール等から呼ぶケース)
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.admin_get_kpi_settings()
  TO service_role, postgres;

GRANT EXECUTE ON FUNCTION public.admin_update_kpi_settings(TIMESTAMPTZ, INTEGER)
  TO service_role, postgres;

GRANT EXECUTE ON FUNCTION public.admin_get_kpi_event_catalog_summary()
  TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 本番確認クエリ（コメントアウト: 手動実行用）
-- ---------------------------------------------------------------------------
-- SELECT proname,
--        has_function_privilege('service_role', oid, 'EXECUTE') AS service_role,
--        has_function_privilege('postgres', oid, 'EXECUTE') AS postgres_role
-- FROM pg_proc
-- WHERE pronamespace = 'public'::regnamespace
--   AND proname IN (
--     'track_kpi_event',
--     'cleanup_old_kpi_events',
--     '_kpi_check_rate_limit',
--     '_kpi_validate_properties',
--     '_kpi_check_pii_keys',
--     '_kpi_allowed_event_names',
--     'admin_get_kpi_settings',
--     'admin_update_kpi_settings',
--     'admin_get_kpi_event_catalog_summary'
--   )
-- ORDER BY proname;
