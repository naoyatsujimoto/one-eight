-- =============================================================================
-- 20260810000008_kpi_phase4_training_events.sql
-- KPI Phase 4-A: Training Events — training_run_id 導入
--
-- 変更内容:
--   1. _kpi_strip_training_run_id(): 8 training event から training_run_id を
--      UUID 検証後に strip し、既存 _kpi_validate_properties へ渡す internal wrapper
--   2. track_kpi_event を再作成: _kpi_strip_training_run_id を経由してから
--      _kpi_validate_properties を呼ぶ（最小変更: 1箇所のみ）
--
-- 設計方針:
--   - 既存 _kpi_validate_properties は変更しない（巨大な退行リスク回避）
--   - training_run_id は 8 training event 専用。他 event はそのまま通す
--   - helper は PUBLIC / anon / authenticated から直接実行不可
--   - track_kpi_event の既存セキュリティ/rate limit/PII/timestamp/所有権検査を維持
--   - official_kpi_start_at は NULL のまま（変更なし）
--   - event 名は 27 件のまま変更なし
--   - training_run_id は DB の properties JSONB カラムにそのまま保存（strip はvalidation用のみ）
--
-- Training events 対象 (8件):
--   training_started / training_step_reached / training_attempted / training_incorrect
--   training_hint_shown / training_step_advanced / training_resumed / training_completed
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. _kpi_strip_training_run_id: internal helper
--    - training event の場合: training_run_id を UUID v4 検証後に strip して返す
--    - 非 training event: props をそのまま返す
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_strip_training_run_id(
  p_event_name  TEXT,
  p_props       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_training_events TEXT[] := ARRAY[
    'training_started',
    'training_step_reached',
    'training_attempted',
    'training_incorrect',
    'training_hint_shown',
    'training_step_advanced',
    'training_resumed',
    'training_completed'
  ];
  v_run_id TEXT;
BEGIN
  -- 非 training event: そのまま返す
  IF NOT (p_event_name = ANY(v_training_events)) THEN
    RETURN p_props;
  END IF;

  -- training event: training_run_id の存在を確認
  v_run_id := p_props->>'training_run_id';
  IF v_run_id IS NULL OR v_run_id = '' THEN
    RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=% key=training_run_id', p_event_name
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- UUID v4 形式を検証 (case-insensitive)
  IF v_run_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'KPI_PROPS_INVALID_UUID: event=% key=training_run_id value must be UUID v4', p_event_name
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- training_run_id を strip して残りの props を返す
  RETURN p_props - 'training_run_id';
END;
$$;

COMMENT ON FUNCTION public._kpi_strip_training_run_id(TEXT, JSONB) IS
  'Internal helper: training event の training_run_id を UUID v4 検証後に strip して返す。非 training event はそのまま返す。Phase 4-A';

-- helper は直接実行不可 (SECURITY DEFINER + REVOKE)
REVOKE ALL ON FUNCTION public._kpi_strip_training_run_id(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_strip_training_run_id(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_strip_training_run_id(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_strip_training_run_id(TEXT, JSONB) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 2. track_kpi_event を再作成（最小変更: _kpi_validate_properties 呼び出し前に
--    _kpi_strip_training_run_id を挟む。それ以外は 20260809195847 と同一）
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_kpi_event(
  p_event_name        TEXT,
  p_anonymous_id      UUID,
  p_session_id        UUID,
  p_occurred_at       TIMESTAMPTZ,
  p_locale            TEXT        DEFAULT NULL,
  p_route             TEXT        DEFAULT NULL,
  p_device_class      TEXT        DEFAULT NULL,
  p_os_family         TEXT        DEFAULT NULL,
  p_browser_family    TEXT        DEFAULT NULL,
  p_app_version       TEXT        DEFAULT NULL,
  p_properties        JSONB       DEFAULT '{}',
  p_idempotency_key   TEXT        DEFAULT NULL,
  p_environment       TEXT        DEFAULT 'production'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID;
  v_idem_key          TEXT;
  v_props_text        TEXT;
  v_props_bytes       INTEGER;
  v_bucket_key        TEXT;
  v_k                 TEXT;
  v_v                 JSONB;
  v_stripped_props    JSONB;
BEGIN
  -- 1. event名検証（許可リストのみ）
  IF p_event_name IS NULL OR NOT (p_event_name = ANY(_kpi_allowed_event_names())) THEN
    RAISE EXCEPTION 'track_kpi_event: unknown event_name: %', p_event_name
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 2. environment検証
  IF p_environment IS NULL OR p_environment NOT IN ('production','staging','development','test') THEN
    RAISE EXCEPTION 'track_kpi_event: invalid environment: %', p_environment
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 3. route長検証
  IF p_route IS NOT NULL AND char_length(p_route) > 500 THEN
    p_route := left(p_route, 500);
  END IF;

  -- 4. device_class検証
  IF p_device_class IS NOT NULL AND p_device_class NOT IN ('desktop','mobile','tablet','unknown') THEN
    p_device_class := 'unknown';
  END IF;

  -- 5. propertiesサイズ上限（10KB）
  IF p_properties IS NOT NULL THEN
    v_props_text  := p_properties::TEXT;
    v_props_bytes := octet_length(v_props_text);
    IF v_props_bytes > 10240 THEN
      RAISE EXCEPTION 'track_kpi_event: properties exceed 10KB limit (% bytes)', v_props_bytes
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END IF;

  -- occurred_at NULL fallback
  p_occurred_at := COALESCE(p_occurred_at, now());

  -- 未来拒否（5分超）
  IF p_occurred_at > now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'KPI_EVENT_FUTURE_TIMESTAMP'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- 過去拒否（7日超）
  IF p_occurred_at < now() - INTERVAL '7 days' THEN
    RAISE EXCEPTION 'KPI_EVENT_TOO_OLD'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- properties構造検証（共通）
  IF p_properties IS NOT NULL THEN
    -- TOP levelのみkey数チェック（最大20key）
    IF (SELECT count(*) FROM jsonb_object_keys(p_properties)) > 20 THEN
      RAISE EXCEPTION 'KPI_PROPS_TOO_MANY_KEYS'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- PII keyチェック（再帰）
    IF _kpi_check_pii_keys(p_properties) THEN
      RAISE EXCEPTION 'KPI_PROPS_PII_KEY_DETECTED'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;

    -- 配列・ネストobjectチェック（top levelのvalueがobjectや配列は不可）
    FOR v_k, v_v IN SELECT key, value FROM jsonb_each(p_properties) LOOP
      IF jsonb_typeof(v_v) IN ('object', 'array') THEN
        RAISE EXCEPTION 'KPI_PROPS_NESTED_NOT_ALLOWED: key=%', v_k
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- 文字列長上限 500文字
      IF jsonb_typeof(v_v) = 'string' AND char_length(v_v #>> '{}') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: key=%', v_k
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END LOOP;

    -- [Phase 4-A] training_run_id を strip してから event別詳細検証へ渡す
    v_stripped_props := _kpi_strip_training_run_id(p_event_name, p_properties);
    PERFORM _kpi_validate_properties(p_event_name, v_stripped_props);
  END IF;

  -- 6. user_id は auth.uid() から決定（client指定を信用しない）
  v_user_id := auth.uid();

  -- 7. idempotency_key
  IF p_idempotency_key IS NULL OR p_idempotency_key = '' THEN
    v_idem_key := gen_random_uuid()::TEXT;
  ELSE
    v_idem_key := p_idempotency_key;
  END IF;

  -- idempotency_key長さ上限（200文字）
  IF v_idem_key IS NOT NULL AND char_length(v_idem_key) > 200 THEN
    RAISE EXCEPTION 'KPI_IDEMPOTENCY_KEY_TOO_LONG'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- rate-limit
  v_bucket_key := CASE
    WHEN v_user_id IS NOT NULL THEN 'uid:' || v_user_id::TEXT
    ELSE 'anon:' || p_anonymous_id::TEXT
  END;

  IF NOT _kpi_check_rate_limit(v_bucket_key, 600, 60) THEN
    RAISE EXCEPTION 'KPI_RATE_LIMIT_EXCEEDED'
      USING ERRCODE = 'too_many_requests';
  END IF;

  -- idempotency: atomic INSERT ... ON CONFLICT DO NOTHING
  -- NOTE: p_properties (original, with training_run_id) を保存する
  INSERT INTO kpi_events (
    occurred_at,
    received_at,
    event_name,
    user_id,
    anonymous_id,
    session_id,
    locale,
    route,
    device_class,
    os_family,
    browser_family,
    app_version,
    properties,
    idempotency_key,
    environment
  ) VALUES (
    p_occurred_at,
    now(),
    p_event_name,
    v_user_id,
    p_anonymous_id,
    p_session_id,
    p_locale,
    p_route,
    COALESCE(p_device_class, 'unknown'),
    p_os_family,
    p_browser_family,
    p_app_version,
    COALESCE(p_properties, '{}'),
    v_idem_key,
    p_environment
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  -- DO NOTHINGで重複は静かに無視
END;
$$;

COMMENT ON FUNCTION public.track_kpi_event IS
  'KPI event送信RPC。user_idはauth.uid()から決定。event名は許可リストのみ。'
  'PII検証・timestamp検証・rate-limit・idempotency・event別properties詳細検証対応。Phase 4-A: training_run_id strip wrapper追加。';

REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) TO anon, authenticated;
