-- =============================================================================
-- 20260810000001_kpi_phase3_match_event.sql
-- KPI Phase 3: match_started / rpc_call_completed event validation追加
--
-- 依存: 20260809195847 (kpi_phase1_event_validation)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. _kpi_allowed_event_names に新eventを追加
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_allowed_event_names()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ARRAY[
    'page_view',
    'session_started',
    'session_heartbeat',
    'auth_started',
    'auth_succeeded',
    'auth_failed',
    'language_changed',
    'training_started',
    'training_step_reached',
    'training_attempted',
    'training_incorrect',
    'training_hint_shown',
    'training_step_advanced',
    'training_resumed',
    'training_completed',
    'postmortem_started',
    'postmortem_completed',
    'postmortem_failed',
    'postmortem_refreshed',
    'postmortem_candidates_opened',
    'pro_feature_used',
    'frontend_error',
    'rpc_error',
    'realtime_reconnected',
    'performance_measure',
    'match_started',
    'rpc_call_completed'
  ]::TEXT[];
$$;

REVOKE ALL ON FUNCTION public._kpi_allowed_event_names() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_allowed_event_names() TO service_role, postgres;

COMMENT ON FUNCTION public._kpi_allowed_event_names() IS
  'Phase 3更新: match_started / rpc_call_completed を追加した許可event名一覧。';

-- ---------------------------------------------------------------------------
-- 2. _kpi_validate_properties に match_started / rpc_call_completed を追加
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._kpi_validate_properties(
  p_event_name  TEXT,
  p_props       JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_route             TEXT;
  v_method            TEXT;
  v_referrer_type     TEXT;
  v_elapsed           NUMERIC;
  v_move_index        NUMERIC;
  v_step              NUMERIC;
  v_total_steps       NUMERIC;
  v_attempt_number    NUMERIC;
  v_result_val        TEXT;
  v_total_attempts    NUMERIC;
  v_elapsed_secs      NUMERIC;
  v_move_count        NUMERIC;
  v_candidate_count   NUMERIC;
  v_from_step         NUMERIC;
  v_to_step           NUMERIC;
  v_last_completed    NUMERIC;
  v_stage             TEXT;
  v_trigger           TEXT;
  v_match_mode        TEXT;
  v_position_idx      NUMERIC;
  v_metric_name       TEXT;
  v_value_ms          NUMERIC;
  v_error_type        TEXT;
  v_attempt_num2      NUMERIC;
  v_from_locale       TEXT;
  v_to_locale         TEXT;
  v_feature_name      TEXT;
  v_channel           TEXT;
  v_attempt_num3      NUMERIC;
  v_elapsed_disc      NUMERIC;
  v_is_new_user       BOOLEAN;
  v_restored          BOOLEAN;
  v_resumed           BOOLEAN;
  v_error_code        TEXT;
  v_rpc_name          TEXT;
  v_component         TEXT;
  -- Phase 3 追加変数
  v_match_key         TEXT;
  v_cpu_difficulty    TEXT;
  v_outcome           TEXT;
  v_elapsed_ms        NUMERIC;
  -- 全event許可key検証用
  v_allowed_keys      TEXT[];
  v_key               TEXT;
BEGIN
  IF p_props IS NULL THEN
    RAISE EXCEPTION 'KPI_PROPS_NULL'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(p_props) <> 'object' THEN
    RAISE EXCEPTION 'KPI_PROPS_NOT_OBJECT: must be a JSON object, got %', jsonb_typeof(p_props)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  CASE p_event_name

    -- -----------------------------------------------------------------------
    -- page_view
    -- -----------------------------------------------------------------------
    WHEN 'page_view' THEN
      v_allowed_keys := ARRAY['route', 'referrer_route', 'title'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=page_view key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=page_view key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=page_view'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'referrer_route') IS NOT NULL AND char_length(p_props->>'referrer_route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_REF_ROUTE_TOO_LONG: event=page_view'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'title') IS NOT NULL AND char_length(p_props->>'title') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_TITLE_TOO_LONG: event=page_view'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- session_started
    -- -----------------------------------------------------------------------
    WHEN 'session_started' THEN
      v_allowed_keys := ARRAY['referrer_type', 'restored'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=session_started key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'referrer_type') IS NOT NULL THEN
        IF (p_props->>'referrer_type') NOT IN ('direct', 'internal', 'external_unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=session_started key=referrer_type value=%',
            (p_props->>'referrer_type')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'restored') IS NOT NULL AND jsonb_typeof(p_props->'restored') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=session_started key=restored must be boolean'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- session_heartbeat
    -- -----------------------------------------------------------------------
    WHEN 'session_heartbeat' THEN
      v_allowed_keys := ARRAY['route', 'elapsed_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=session_heartbeat key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=session_heartbeat key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=session_heartbeat'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'elapsed_seconds') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=session_heartbeat key=elapsed_seconds'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'elapsed_seconds') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=session_heartbeat key=elapsed_seconds must be number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_elapsed := (p_props->>'elapsed_seconds')::NUMERIC;
      IF v_elapsed < 0 THEN
        RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=session_heartbeat key=elapsed_seconds'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- auth_started
    -- -----------------------------------------------------------------------
    WHEN 'auth_started' THEN
      v_allowed_keys := ARRAY['method', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=auth_started key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=auth_started key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=auth_started'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'method') IS NOT NULL THEN
        IF (p_props->>'method') NOT IN ('magic_link', 'oauth', 'password', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=auth_started key=method value=%',
            (p_props->>'method')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- auth_succeeded
    -- -----------------------------------------------------------------------
    WHEN 'auth_succeeded' THEN
      v_allowed_keys := ARRAY['method', 'is_new_user'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=auth_succeeded key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'method') IS NOT NULL THEN
        IF (p_props->>'method') NOT IN ('magic_link', 'oauth', 'password', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=auth_succeeded key=method value=%',
            (p_props->>'method')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'is_new_user') IS NOT NULL AND jsonb_typeof(p_props->'is_new_user') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=auth_succeeded key=is_new_user must be boolean'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- auth_failed
    -- -----------------------------------------------------------------------
    WHEN 'auth_failed' THEN
      v_allowed_keys := ARRAY['method', 'error_code'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=auth_failed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'method') IS NOT NULL THEN
        IF (p_props->>'method') NOT IN ('magic_link', 'oauth', 'password', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=auth_failed key=method value=%',
            (p_props->>'method')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=auth_failed'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- language_changed
    -- -----------------------------------------------------------------------
    WHEN 'language_changed' THEN
      v_allowed_keys := ARRAY['from_locale', 'to_locale'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=language_changed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'from_locale') IS NULL OR (p_props->>'from_locale') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=language_changed key=from_locale'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'to_locale') IS NULL OR (p_props->>'to_locale') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=language_changed key=to_locale'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'from_locale') > 20 THEN
        RAISE EXCEPTION 'KPI_PROPS_LOCALE_TOO_LONG: event=language_changed key=from_locale'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'to_locale') > 20 THEN
        RAISE EXCEPTION 'KPI_PROPS_LOCALE_TOO_LONG: event=language_changed key=to_locale'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- training_* (全種)
    -- -----------------------------------------------------------------------
    WHEN 'training_started' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'resumed'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_started key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'move_index') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=move_index'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'move_index') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=training_started key=move_index must be number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_started key=move_index must be non-negative integer, got %', v_move_index
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'resumed') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=resumed'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'resumed') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=training_started key=resumed must be boolean'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_step_reached' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'step', 'total_steps'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_step_reached key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=move_index must be non-negative integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=step must be positive integer, got %', v_step
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_total_steps := (p_props->>'total_steps')::NUMERIC;
      IF v_total_steps < 1 OR v_total_steps <> floor(v_total_steps) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=total_steps must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_step > v_total_steps THEN
        RAISE EXCEPTION 'KPI_PROPS_STEP_EXCEEDS_TOTAL: event=training_step_reached step=% total_steps=%', v_step, v_total_steps
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_attempted' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'step', 'attempt_number', 'result'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_attempted key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_attempted key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_attempt_number := (p_props->>'attempt_number')::NUMERIC;
      IF v_attempt_number < 1 OR v_attempt_number <> floor(v_attempt_number) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_attempted key=attempt_number must be >= 1 integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'result') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=result'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'result') NOT IN ('correct', 'incorrect') THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=training_attempted key=result value=%', (p_props->>'result')
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_incorrect' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'step', 'attempt_number'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_incorrect key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_incorrect key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_incorrect key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_incorrect key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_attempt_number := (p_props->>'attempt_number')::NUMERIC;
      IF v_attempt_number < 1 OR v_attempt_number <> floor(v_attempt_number) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_incorrect key=attempt_number must be >= 1'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_hint_shown' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'step'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_hint_shown key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_hint_shown key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_hint_shown key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_hint_shown key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_step_advanced' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'from_step', 'to_step'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_step_advanced key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_advanced key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_advanced key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_from_step := (p_props->>'from_step')::NUMERIC;
      IF v_from_step < 1 OR v_from_step <> floor(v_from_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_advanced key=from_step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_to_step := (p_props->>'to_step')::NUMERIC;
      IF v_to_step < 1 OR v_to_step <> floor(v_to_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_advanced key=to_step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_resumed' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'step', 'last_completed_step'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_resumed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_resumed key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_resumed key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_resumed key=move_index must be non-negative integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_resumed key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_last_completed := (p_props->>'last_completed_step')::NUMERIC;
      IF v_last_completed < 0 OR v_last_completed <> floor(v_last_completed) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_resumed key=last_completed_step must be non-negative integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_completed' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'total_attempts', 'elapsed_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_completed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=task_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=move_id'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'move_index') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=move_index'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_completed key=move_index must be non-negative integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'total_attempts') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=total_attempts'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_total_attempts := (p_props->>'total_attempts')::NUMERIC;
      IF v_total_attempts < 0 OR v_total_attempts <> floor(v_total_attempts) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_completed key=total_attempts must be >= 0 integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'elapsed_seconds') IS NOT NULL THEN
        v_elapsed_secs := (p_props->>'elapsed_seconds')::NUMERIC;
        IF v_elapsed_secs < 0 THEN
          RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=training_completed key=elapsed_seconds'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF v_elapsed_secs > 86400 THEN
          RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=training_completed key=elapsed_seconds max=86400'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- postmortem_*
    -- -----------------------------------------------------------------------
    WHEN 'postmortem_started' THEN
      v_allowed_keys := ARRAY['match_mode', 'move_count'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_started key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'match_mode') IS NOT NULL THEN
        IF (p_props->>'match_mode') NOT IN ('human_vs_cpu', 'online', 'official', 'arena', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_started key=match_mode value=%', (p_props->>'match_mode')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'move_count') IS NOT NULL THEN
        v_move_count := (p_props->>'move_count')::NUMERIC;
        IF v_move_count < 0 OR v_move_count <> floor(v_move_count) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_started key=move_count must be non-negative integer'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_completed' THEN
      v_allowed_keys := ARRAY['match_mode', 'candidate_count', 'elapsed_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_completed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'match_mode') IS NOT NULL THEN
        IF (p_props->>'match_mode') NOT IN ('human_vs_cpu', 'online', 'official', 'arena', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_completed key=match_mode value=%', (p_props->>'match_mode')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'candidate_count') IS NOT NULL THEN
        v_candidate_count := (p_props->>'candidate_count')::NUMERIC;
        IF v_candidate_count < 0 OR v_candidate_count <> floor(v_candidate_count) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_completed key=candidate_count must be >= 0 integer'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'elapsed_seconds') IS NOT NULL THEN
        v_elapsed_secs := (p_props->>'elapsed_seconds')::NUMERIC;
        IF v_elapsed_secs < 0 THEN
          RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=postmortem_completed key=elapsed_seconds'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF v_elapsed_secs > 86400 THEN
          RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=postmortem_completed key=elapsed_seconds max=86400'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_failed' THEN
      v_allowed_keys := ARRAY['error_code', 'stage'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_failed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=postmortem_failed'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'stage') IS NOT NULL THEN
        IF (p_props->>'stage') NOT IN ('rpc', 'worker', 'parse', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_failed key=stage value=%', (p_props->>'stage')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_refreshed' THEN
      v_allowed_keys := ARRAY['trigger'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_refreshed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'trigger') IS NOT NULL THEN
        IF (p_props->>'trigger') NOT IN ('user', 'auto') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_refreshed key=trigger value=%', (p_props->>'trigger')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_candidates_opened' THEN
      v_allowed_keys := ARRAY['candidate_count', 'position_index'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_candidates_opened key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->'candidate_count') IS NOT NULL THEN
        v_candidate_count := (p_props->>'candidate_count')::NUMERIC;
        IF v_candidate_count < 0 OR v_candidate_count <> floor(v_candidate_count) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_candidates_opened key=candidate_count must be >= 0 integer'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'position_index') IS NOT NULL THEN
        v_position_idx := (p_props->>'position_index')::NUMERIC;
        IF v_position_idx < 0 OR v_position_idx <> floor(v_position_idx) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_candidates_opened key=position_index must be >= 0 integer'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- pro_feature_used
    -- -----------------------------------------------------------------------
    WHEN 'pro_feature_used' THEN
      v_allowed_keys := ARRAY['feature_name', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=pro_feature_used key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'feature_name') IS NULL OR (p_props->>'feature_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=pro_feature_used key=feature_name'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'feature_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=pro_feature_used key=feature_name max=100'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=pro_feature_used key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=pro_feature_used'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- frontend_error
    -- -----------------------------------------------------------------------
    WHEN 'frontend_error' THEN
      v_allowed_keys := ARRAY['error_code', 'error_type', 'component', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=frontend_error key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=frontend_error key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=frontend_error'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=frontend_error'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'error_type') IS NOT NULL AND char_length(p_props->>'error_type') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=frontend_error key=error_type max=100'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'component') IS NOT NULL AND char_length(p_props->>'component') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_COMPONENT_TOO_LONG: event=frontend_error'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- rpc_error
    -- -----------------------------------------------------------------------
    WHEN 'rpc_error' THEN
      v_allowed_keys := ARRAY['rpc_name', 'error_code', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=rpc_error key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'rpc_name') IS NULL OR (p_props->>'rpc_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_error key=rpc_name'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'rpc_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_RPC_NAME_TOO_LONG: event=rpc_error'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_error key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=rpc_error'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=rpc_error'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- realtime_reconnected
    -- -----------------------------------------------------------------------
    WHEN 'realtime_reconnected' THEN
      v_allowed_keys := ARRAY['channel', 'attempt_number', 'elapsed_since_disconnect_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=realtime_reconnected key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'channel') IS NOT NULL AND char_length(p_props->>'channel') > 200 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=realtime_reconnected key=channel max=200'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'attempt_number') IS NOT NULL THEN
        v_attempt_num3 := (p_props->>'attempt_number')::NUMERIC;
        IF v_attempt_num3 < 1 OR v_attempt_num3 <> floor(v_attempt_num3) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=realtime_reconnected key=attempt_number must be >= 1 integer'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'elapsed_since_disconnect_seconds') IS NOT NULL THEN
        v_elapsed_disc := (p_props->>'elapsed_since_disconnect_seconds')::NUMERIC;
        IF v_elapsed_disc < 0 THEN
          RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=realtime_reconnected key=elapsed_since_disconnect_seconds'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- performance_measure
    -- -----------------------------------------------------------------------
    WHEN 'performance_measure' THEN
      v_allowed_keys := ARRAY['metric_name', 'value_ms', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=performance_measure key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'metric_name') IS NULL OR (p_props->>'metric_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=performance_measure key=metric_name'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'metric_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=performance_measure key=metric_name max=100'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'value_ms') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=performance_measure key=value_ms'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'value_ms') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=performance_measure key=value_ms must be number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_value_ms := (p_props->>'value_ms')::NUMERIC;
      IF v_value_ms < 0 THEN
        RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=performance_measure key=value_ms'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_value_ms > 300000 THEN
        RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=performance_measure key=value_ms max=300000ms'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NOT NULL AND char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=performance_measure'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- Phase 3: match_started
    -- required: match_key, match_mode
    -- optional: cpu_difficulty
    -- -----------------------------------------------------------------------
    WHEN 'match_started' THEN
      v_allowed_keys := ARRAY['match_key', 'match_mode', 'cpu_difficulty'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=match_started key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      -- match_key 必須
      IF (p_props->>'match_key') IS NULL OR (p_props->>'match_key') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=match_started key=match_key'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'match_key') > 200 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=match_started key=match_key max=200'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- match_mode 必須・enum
      IF (p_props->>'match_mode') IS NULL OR (p_props->>'match_mode') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=match_started key=match_mode'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'match_mode') NOT IN ('human_vs_cpu', 'online', 'official', 'arena') THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=match_started key=match_mode value=%', (p_props->>'match_mode')
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- cpu_difficulty オプション・文字列長
      IF (p_props->>'cpu_difficulty') IS NOT NULL AND char_length(p_props->>'cpu_difficulty') > 50 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=match_started key=cpu_difficulty max=50'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- Phase 3: rpc_call_completed
    -- required: rpc_name, outcome, elapsed_ms, route
    -- -----------------------------------------------------------------------
    WHEN 'rpc_call_completed' THEN
      v_allowed_keys := ARRAY['rpc_name', 'outcome', 'elapsed_ms', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=rpc_call_completed key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      -- rpc_name 必須
      IF (p_props->>'rpc_name') IS NULL OR (p_props->>'rpc_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=rpc_name'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'rpc_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_RPC_NAME_TOO_LONG: event=rpc_call_completed'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- outcome 必須・enum
      IF (p_props->>'outcome') IS NULL OR (p_props->>'outcome') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=outcome'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'outcome') NOT IN ('success', 'error') THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=rpc_call_completed key=outcome value=%', (p_props->>'outcome')
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- elapsed_ms 必須・0〜300000
      IF (p_props->'elapsed_ms') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=elapsed_ms'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'elapsed_ms') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=rpc_call_completed key=elapsed_ms must be number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_elapsed_ms := (p_props->>'elapsed_ms')::NUMERIC;
      IF v_elapsed_ms < 0 THEN
        RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=rpc_call_completed key=elapsed_ms'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_elapsed_ms > 300000 THEN
        RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=rpc_call_completed key=elapsed_ms max=300000'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- route 必須
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=rpc_call_completed'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- 不明なeventは通過（event名検証は上位のtrack_kpi_eventが担当）
    -- -----------------------------------------------------------------------
    ELSE
      NULL;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) IS
  'Phase 3更新: 全27 KPI eventのproperties詳細検証。match_started / rpc_call_completed 追加。';

REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) TO service_role, postgres;
