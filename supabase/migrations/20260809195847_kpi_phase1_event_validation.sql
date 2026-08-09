-- =============================================================================
-- 20260809195847_kpi_phase1_event_validation.sql
-- KPI Phase 1: 全25 event properties詳細検証
--
-- 依存: 20260809195843 (tables), 20260809195845 (base RPCs)
--
-- kpiEvents.ts の KpiEventPropsMap を正本として、DB側でも
-- 全25 eventの必須key・optional key・型・enum・数値範囲・文字列長・
-- 不要key拒否を検証する専用関数を実装する。
-- =============================================================================

-- ---------------------------------------------------------------------------
-- _kpi_validate_properties: event別properties詳細検証
--
-- TRUE = valid (問題なし)
-- FALSE は使わない — 不正時はすぐ RAISE EXCEPTION
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
  -- ヘルパー変数
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
  -- 全event許可key検証用
  v_allowed_keys      TEXT[];
  v_key               TEXT;
BEGIN
  -- propertiesがobjectであることを確認
  IF p_props IS NULL THEN
    RAISE EXCEPTION 'KPI_PROPS_NULL'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(p_props) <> 'object' THEN
    RAISE EXCEPTION 'KPI_PROPS_NOT_OBJECT: must be a JSON object, got %', jsonb_typeof(p_props)
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- event別検証
  CASE p_event_name

    -- -----------------------------------------------------------------------
    -- page_view
    -- required: route
    -- optional: referrer_route, title
    -- -----------------------------------------------------------------------
    WHEN 'page_view' THEN
      v_allowed_keys := ARRAY['route', 'referrer_route', 'title'];

      -- 不要key拒否
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=page_view key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;

      -- route必須
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=page_view key=route'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- route最大500文字
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=page_view'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- referrer_route 最大500文字
      IF (p_props->>'referrer_route') IS NOT NULL AND char_length(p_props->>'referrer_route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_REF_ROUTE_TOO_LONG: event=page_view'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- title 最大500文字
      IF (p_props->>'title') IS NOT NULL AND char_length(p_props->>'title') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_TITLE_TOO_LONG: event=page_view'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- session_started
    -- optional: referrer_type, restored
    -- -----------------------------------------------------------------------
    WHEN 'session_started' THEN
      v_allowed_keys := ARRAY['referrer_type', 'restored'];

      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=session_started key=%', v_key
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;

      -- referrer_type enum
      IF (p_props->>'referrer_type') IS NOT NULL THEN
        IF (p_props->>'referrer_type') NOT IN ('direct', 'internal', 'external_unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=session_started key=referrer_type value=%',
            (p_props->>'referrer_type')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      -- restored must be boolean
      IF (p_props->'restored') IS NOT NULL AND jsonb_typeof(p_props->'restored') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=session_started key=restored must be boolean'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- session_heartbeat
    -- required: route, elapsed_seconds
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
    -- required: route
    -- optional: method
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
    -- optional: method, is_new_user
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
    -- optional: method, error_code
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
    -- required: from_locale, to_locale
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
    -- training_started
    -- required: task_id, move_id, move_index, resumed
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
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_started key=move_index must be non-negative integer, got %',
          v_move_index
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

    -- -----------------------------------------------------------------------
    -- training_step_reached
    -- required: task_id, move_id, move_index, step, total_steps
    -- step <= total_steps, both positive integers
    -- -----------------------------------------------------------------------
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
      IF (p_props->'move_index') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=move_index'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=move_index must be non-negative integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'step') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=step'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'step') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=training_step_reached key=step must be number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=step must be positive integer, got %',
          v_step
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'total_steps') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=total_steps'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'total_steps') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=training_step_reached key=total_steps must be number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_total_steps := (p_props->>'total_steps')::NUMERIC;
      IF v_total_steps < 1 OR v_total_steps <> floor(v_total_steps) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=total_steps must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_step > v_total_steps THEN
        RAISE EXCEPTION 'KPI_PROPS_STEP_EXCEEDS_TOTAL: event=training_step_reached step=% total_steps=%',
          v_step, v_total_steps
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- training_attempted
    -- required: task_id, move_id, step, attempt_number, result
    -- attempt_number >= 1, result in (correct, incorrect)
    -- -----------------------------------------------------------------------
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
      IF (p_props->'step') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=step'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_attempted key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'attempt_number') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=attempt_number'
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
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=training_attempted key=result value=%',
          (p_props->>'result')
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- training_incorrect
    -- required: task_id, move_id, step, attempt_number
    -- -----------------------------------------------------------------------
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
      IF (p_props->'step') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_incorrect key=step'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_incorrect key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'attempt_number') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_incorrect key=attempt_number'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_attempt_number := (p_props->>'attempt_number')::NUMERIC;
      IF v_attempt_number < 1 OR v_attempt_number <> floor(v_attempt_number) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_incorrect key=attempt_number must be >= 1'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- training_hint_shown
    -- required: task_id, move_id, step
    -- -----------------------------------------------------------------------
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
      IF (p_props->'step') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_hint_shown key=step'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_hint_shown key=step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- training_step_advanced
    -- required: task_id, move_id, from_step, to_step
    -- -----------------------------------------------------------------------
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
      IF (p_props->'from_step') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_advanced key=from_step'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_from_step := (p_props->>'from_step')::NUMERIC;
      IF v_from_step < 1 OR v_from_step <> floor(v_from_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_advanced key=from_step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'to_step') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_advanced key=to_step'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_to_step := (p_props->>'to_step')::NUMERIC;
      IF v_to_step < 1 OR v_to_step <> floor(v_to_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_advanced key=to_step must be positive integer'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- training_resumed
    -- required: task_id, move_id, move_index, step, last_completed_step
    -- -----------------------------------------------------------------------
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

    -- -----------------------------------------------------------------------
    -- training_completed
    -- required: task_id, move_id, move_index, total_attempts
    -- optional: elapsed_seconds
    -- total_attempts >= 0, elapsed_seconds >= 0
    -- -----------------------------------------------------------------------
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
        -- 現実的な上限: 24時間 = 86400秒
        IF v_elapsed_secs > 86400 THEN
          RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=training_completed key=elapsed_seconds max=86400'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- postmortem_started
    -- optional: match_mode, move_count
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
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_started key=match_mode value=%',
            (p_props->>'match_mode')
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

    -- -----------------------------------------------------------------------
    -- postmortem_completed
    -- optional: match_mode, candidate_count, elapsed_seconds
    -- candidate_count >= 0, elapsed_seconds >= 0
    -- -----------------------------------------------------------------------
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
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_completed key=match_mode value=%',
            (p_props->>'match_mode')
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

    -- -----------------------------------------------------------------------
    -- postmortem_failed
    -- optional: error_code, stage
    -- -----------------------------------------------------------------------
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
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_failed key=stage value=%',
            (p_props->>'stage')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- postmortem_refreshed
    -- optional: trigger
    -- -----------------------------------------------------------------------
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
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_refreshed key=trigger value=%',
            (p_props->>'trigger')
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    -- -----------------------------------------------------------------------
    -- postmortem_candidates_opened
    -- optional: candidate_count, position_index
    -- -----------------------------------------------------------------------
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
    -- required: feature_name, route
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
    -- required: route
    -- optional: error_code, error_type, component
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
    -- required: rpc_name, route
    -- optional: error_code
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
    -- optional: channel, attempt_number, elapsed_since_disconnect_seconds
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
    -- required: metric_name, value_ms
    -- optional: route
    -- value_ms >= 0 かつ現実的上限 (300秒 = 300000ms)
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
      -- 現実的な上限: 5分 = 300000ms (postmortem等の長い処理を想定)
      IF v_value_ms > 300000 THEN
        RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=performance_measure key=value_ms max=300000ms'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NOT NULL AND char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=performance_measure'
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
  '全25 KPI eventのproperties詳細検証。event別必須key・enum・型・数値範囲・不要key拒否。';

REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- track_kpi_event を更新: _kpi_validate_properties 呼び出しを追加
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
  v_user_id         UUID;
  v_idem_key        TEXT;
  v_props_text      TEXT;
  v_props_bytes     INTEGER;
  v_bucket_key      TEXT;
  v_k               TEXT;
  v_v               JSONB;
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

    -- event別詳細検証（_kpi_validate_properties呼び出し）
    PERFORM _kpi_validate_properties(p_event_name, p_properties);
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
  'PII検証・timestamp検証・rate-limit・idempotency・event別properties詳細検証対応。';

REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.track_kpi_event(TEXT,UUID,UUID,TIMESTAMPTZ,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT,TEXT) TO anon, authenticated;
