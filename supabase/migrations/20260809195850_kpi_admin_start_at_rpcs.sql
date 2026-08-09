-- =============================================================================
-- 20260809195850_kpi_admin_start_at_rpcs.sql
-- KPI Phase 1: official_kpi_start_at 設定/解除 Admin RPC
--
-- 依存: 20260809195843 (tables: kpi_settings)
--
-- admin専用RPCを2つ新設:
-- 1. admin_set_kpi_start_at(p_start_at timestamptz) -- NULLは拒否
-- 2. admin_clear_kpi_start_at()                     -- NULLへセット
--
-- 両RPC:
-- - SECURITY DEFINER
-- - is_admin=true のuserのみ実行可
-- - service_role/postgres GRANT、anon/authenticated REVOKE（GRANT不要の場合でも明記）
--
-- 現時点の本番値はNULLのまま維持（設定は行わない）
-- =============================================================================

-- ---------------------------------------------------------------------------
-- admin_set_kpi_start_at: official_kpi_start_atを指定日時に設定
-- NULLは拒否（解除はadmin_clear_kpi_start_atを使用すること）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_kpi_start_at(
  p_start_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- NULL拒否
  IF p_start_at IS NULL THEN
    RAISE EXCEPTION 'admin_set_kpi_start_at: p_start_at must not be NULL. Use admin_clear_kpi_start_at() to clear.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 認証チェック
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'admin_set_kpi_start_at: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- admin権限チェック
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'admin_set_kpi_start_at: admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- official_kpi_start_atを設定
  UPDATE kpi_settings
    SET official_kpi_start_at = p_start_at,
        updated_at             = now(),
        updated_by             = v_uid
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_set_kpi_start_at: kpi_settings row not found (id=1)'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_kpi_start_at(TIMESTAMPTZ) IS
  'official_kpi_start_atをNULL以外の日時に設定するAdmin専用RPC。'
  'NULLを渡した場合は拒否。解除にはadmin_clear_kpi_start_at()を使用すること。';

REVOKE ALL ON FUNCTION public.admin_set_kpi_start_at(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_kpi_start_at(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_kpi_start_at(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_kpi_start_at(TIMESTAMPTZ)
  TO service_role, postgres;
-- authenticated（is_admin=true）からも呼べるよう GRANT
-- ただしRPC内部でis_admin=trueチェックを実施するため、非adminはERROR
GRANT EXECUTE ON FUNCTION public.admin_set_kpi_start_at(TIMESTAMPTZ)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- admin_clear_kpi_start_at: official_kpi_start_atをNULLに解除
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_clear_kpi_start_at()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- 認証チェック
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'admin_clear_kpi_start_at: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- admin権限チェック
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF v_is_admin IS NULL OR v_is_admin = FALSE THEN
    RAISE EXCEPTION 'admin_clear_kpi_start_at: admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- official_kpi_start_atをNULLに解除
  UPDATE kpi_settings
    SET official_kpi_start_at = NULL,
        updated_at             = now(),
        updated_by             = v_uid
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_clear_kpi_start_at: kpi_settings row not found (id=1)'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_clear_kpi_start_at() IS
  'official_kpi_start_atをNULLに解除するAdmin専用RPC。'
  'KPIカウントの開始日をリセットする。';

REVOKE ALL ON FUNCTION public.admin_clear_kpi_start_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_clear_kpi_start_at() FROM anon;
REVOKE ALL ON FUNCTION public.admin_clear_kpi_start_at() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_kpi_start_at()
  TO service_role, postgres;
-- authenticated（is_admin=true）からも呼べるよう GRANT
GRANT EXECUTE ON FUNCTION public.admin_clear_kpi_start_at()
  TO authenticated;
