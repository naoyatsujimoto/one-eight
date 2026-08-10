-- =============================================================================
-- 20260810000007_kpi_phase3_final.sql
-- KPI Phase 3 最終補正
--
-- 補正内容:
--   1. offline_pvp を分類に追加 (_kpi_allowed_event_names / _kpi_validate_properties)
--   2. admin_get_kpi_match_summary をDROP再作成 → offline_pvp_matches 列追加
--   3. admin_get_kpi_match_daily をDROP再作成 → offline_pvp_matches 列追加
--   4. Arena Funnel started定義修正 (online_game_id IS NOT NULL だけで started にしない)
--   5. completed_matches 完全実装 (CPU/Offline/Online/Official/Arena 突合)
--   6. canonical対局条件統一 (no_show/no_contest 除外を全集計に適用)
--
-- 対局5分類:
--   1. human_vs_cpu      — match_logs.mode='human_vs_cpu'
--   2. offline_pvp       — match_logs.mode='human_vs_human'
--   3. online_casual     — online_games で official/arena 連結なし
--   4. official_standalone — official_matches で arena 連結なし
--   5. arena             — arena_matches
--
-- total_matches = cpu + offline_pvp + online_casual + official_standalone + arena
--
-- match_key = kpi_events.properties->>'match_key' (DISTINCT)
-- completed突合:
--   CPU/Offline: match_logs.game_id (mode対応)
--   Online casual: online_games.id::text, status='finished', 非official/arena
--   Official standalone: official_matches.online_game_id::text, 非arena,
--                        status NOT IN ('cancelled','no_contest','no_show')
--   Arena: arena_matches.online_game_id::text, status IN ('completed','processed'),
--          end_reason NOT IN ('no_show','no_contest')
--
-- KPI_SPEC.md 明記:
--   started期間内にstartedしたがp_to後に終局した対局は、その期間のcompletedには入らない。
--
-- Arena Funnel started定義:
--   実ゲームが playing へ到達したもの (move_number > 0 OR status IN ('playing','finished'))
--   処理済み (processed) だけでは started にしない
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. _kpi_allowed_event_names に offline_pvp 対応 (match_started の validation更新のみ)
--    event catalog 自体は27件のまま維持。offline_pvp は match_mode の値として追加。
--    NOTE: match_started event の match_mode enum に 'offline_pvp' を追加する。
-- ---------------------------------------------------------------------------

-- _kpi_validate_properties を再作成（offline_pvp を match_mode に追加）
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
  v_match_key         TEXT;
  v_cpu_difficulty    TEXT;
  v_outcome           TEXT;
  v_elapsed_ms        NUMERIC;
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

    WHEN 'page_view' THEN
      v_allowed_keys := ARRAY['route', 'referrer_route', 'title'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=page_view key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=page_view key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=page_view' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'referrer_route') IS NOT NULL AND char_length(p_props->>'referrer_route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_REF_ROUTE_TOO_LONG: event=page_view' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'title') IS NOT NULL AND char_length(p_props->>'title') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_TITLE_TOO_LONG: event=page_view' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'session_started' THEN
      v_allowed_keys := ARRAY['referrer_type', 'restored'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=session_started key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'referrer_type') IS NOT NULL THEN
        IF (p_props->>'referrer_type') NOT IN ('direct', 'internal', 'external_unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=session_started key=referrer_type value=%', (p_props->>'referrer_type') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'restored') IS NOT NULL AND jsonb_typeof(p_props->'restored') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=session_started key=restored must be boolean' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'session_heartbeat' THEN
      v_allowed_keys := ARRAY['route', 'elapsed_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=session_heartbeat key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=session_heartbeat key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=session_heartbeat' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'elapsed_seconds') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=session_heartbeat key=elapsed_seconds' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'elapsed_seconds') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=session_heartbeat key=elapsed_seconds must be number' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_elapsed := (p_props->>'elapsed_seconds')::NUMERIC;
      IF v_elapsed < 0 THEN
        RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=session_heartbeat key=elapsed_seconds' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'auth_started' THEN
      v_allowed_keys := ARRAY['method', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=auth_started key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=auth_started key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=auth_started' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'method') IS NOT NULL THEN
        IF (p_props->>'method') NOT IN ('magic_link', 'oauth', 'password', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=auth_started key=method value=%', (p_props->>'method') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'auth_succeeded' THEN
      v_allowed_keys := ARRAY['method', 'is_new_user'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=auth_succeeded key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'method') IS NOT NULL THEN
        IF (p_props->>'method') NOT IN ('magic_link', 'oauth', 'password', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=auth_succeeded key=method value=%', (p_props->>'method') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'is_new_user') IS NOT NULL AND jsonb_typeof(p_props->'is_new_user') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=auth_succeeded key=is_new_user must be boolean' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'auth_failed' THEN
      v_allowed_keys := ARRAY['method', 'error_code'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=auth_failed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'method') IS NOT NULL THEN
        IF (p_props->>'method') NOT IN ('magic_link', 'oauth', 'password', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=auth_failed key=method value=%', (p_props->>'method') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=auth_failed' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'language_changed' THEN
      v_allowed_keys := ARRAY['from_locale', 'to_locale'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=language_changed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'from_locale') IS NULL OR (p_props->>'from_locale') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=language_changed key=from_locale' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'to_locale') IS NULL OR (p_props->>'to_locale') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=language_changed key=to_locale' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'from_locale') > 20 THEN
        RAISE EXCEPTION 'KPI_PROPS_LOCALE_TOO_LONG: event=language_changed key=from_locale' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'to_locale') > 20 THEN
        RAISE EXCEPTION 'KPI_PROPS_LOCALE_TOO_LONG: event=language_changed key=to_locale' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_started' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'resumed'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_started key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'move_index') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=move_index' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'move_index') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=training_started key=move_index must be number' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_started key=move_index must be non-negative integer, got %', v_move_index USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'resumed') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_started key=resumed' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'resumed') <> 'boolean' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=training_started key=resumed must be boolean' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_step_reached' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'step', 'total_steps'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_step_reached key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_reached key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=move_index must be non-negative integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=step must be positive integer, got %', v_step USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_total_steps := (p_props->>'total_steps')::NUMERIC;
      IF v_total_steps < 1 OR v_total_steps <> floor(v_total_steps) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_reached key=total_steps must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_step > v_total_steps THEN
        RAISE EXCEPTION 'KPI_PROPS_STEP_EXCEEDS_TOTAL: event=training_step_reached step=% total_steps=%', v_step, v_total_steps USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_attempted' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'step', 'attempt_number', 'result'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_attempted key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_attempted key=step must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_attempt_number := (p_props->>'attempt_number')::NUMERIC;
      IF v_attempt_number < 1 OR v_attempt_number <> floor(v_attempt_number) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_attempted key=attempt_number must be >= 1 integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'result') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_attempted key=result' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'result') NOT IN ('correct', 'incorrect') THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=training_attempted key=result value=%', (p_props->>'result') USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_incorrect' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'step', 'attempt_number'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_incorrect key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_incorrect key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_incorrect key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_incorrect key=step must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_attempt_number := (p_props->>'attempt_number')::NUMERIC;
      IF v_attempt_number < 1 OR v_attempt_number <> floor(v_attempt_number) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_incorrect key=attempt_number must be >= 1' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_hint_shown' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'step'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_hint_shown key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_hint_shown key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_hint_shown key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_hint_shown key=step must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_step_advanced' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'from_step', 'to_step'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_step_advanced key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_advanced key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_step_advanced key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_from_step := (p_props->>'from_step')::NUMERIC;
      IF v_from_step < 1 OR v_from_step <> floor(v_from_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_advanced key=from_step must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_to_step := (p_props->>'to_step')::NUMERIC;
      IF v_to_step < 1 OR v_to_step <> floor(v_to_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_step_advanced key=to_step must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_resumed' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'step', 'last_completed_step'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_resumed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_resumed key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_resumed key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_resumed key=move_index must be non-negative integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_step := (p_props->>'step')::NUMERIC;
      IF v_step < 1 OR v_step <> floor(v_step) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_resumed key=step must be positive integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_last_completed := (p_props->>'last_completed_step')::NUMERIC;
      IF v_last_completed < 0 OR v_last_completed <> floor(v_last_completed) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_resumed key=last_completed_step must be non-negative integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'training_completed' THEN
      v_allowed_keys := ARRAY['task_id', 'move_id', 'move_index', 'total_attempts', 'elapsed_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=training_completed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'task_id') IS NULL OR (p_props->>'task_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=task_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'move_id') IS NULL OR (p_props->>'move_id') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=move_id' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'move_index') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=move_index' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_move_index := (p_props->>'move_index')::NUMERIC;
      IF v_move_index < 0 OR v_move_index <> floor(v_move_index) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_completed key=move_index must be non-negative integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'total_attempts') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=training_completed key=total_attempts' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_total_attempts := (p_props->>'total_attempts')::NUMERIC;
      IF v_total_attempts < 0 OR v_total_attempts <> floor(v_total_attempts) THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=training_completed key=total_attempts must be >= 0 integer' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'elapsed_seconds') IS NOT NULL THEN
        v_elapsed_secs := (p_props->>'elapsed_seconds')::NUMERIC;
        IF v_elapsed_secs < 0 THEN
          RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=training_completed key=elapsed_seconds' USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF v_elapsed_secs > 86400 THEN
          RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=training_completed key=elapsed_seconds max=86400' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_started' THEN
      v_allowed_keys := ARRAY['match_mode', 'move_count'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_started key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'match_mode') IS NOT NULL THEN
        IF (p_props->>'match_mode') NOT IN ('human_vs_cpu', 'offline_pvp', 'online', 'official', 'arena', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_started key=match_mode value=%', (p_props->>'match_mode') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'move_count') IS NOT NULL THEN
        v_move_count := (p_props->>'move_count')::NUMERIC;
        IF v_move_count < 0 OR v_move_count <> floor(v_move_count) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_started key=move_count must be non-negative integer' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_completed' THEN
      v_allowed_keys := ARRAY['match_mode', 'candidate_count', 'elapsed_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_completed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'match_mode') IS NOT NULL THEN
        IF (p_props->>'match_mode') NOT IN ('human_vs_cpu', 'offline_pvp', 'online', 'official', 'arena', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_completed key=match_mode value=%', (p_props->>'match_mode') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'candidate_count') IS NOT NULL THEN
        v_candidate_count := (p_props->>'candidate_count')::NUMERIC;
        IF v_candidate_count < 0 OR v_candidate_count <> floor(v_candidate_count) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_completed key=candidate_count must be >= 0 integer' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'elapsed_seconds') IS NOT NULL THEN
        v_elapsed_secs := (p_props->>'elapsed_seconds')::NUMERIC;
        IF v_elapsed_secs < 0 THEN
          RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=postmortem_completed key=elapsed_seconds' USING ERRCODE = 'invalid_parameter_value';
        END IF;
        IF v_elapsed_secs > 86400 THEN
          RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=postmortem_completed key=elapsed_seconds max=86400' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_failed' THEN
      v_allowed_keys := ARRAY['error_code', 'stage'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_failed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=postmortem_failed' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'stage') IS NOT NULL THEN
        IF (p_props->>'stage') NOT IN ('rpc', 'worker', 'parse', 'unknown') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_failed key=stage value=%', (p_props->>'stage') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_refreshed' THEN
      v_allowed_keys := ARRAY['trigger'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_refreshed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'trigger') IS NOT NULL THEN
        IF (p_props->>'trigger') NOT IN ('user', 'auto', 'refresh') THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=postmortem_refreshed key=trigger value=%', (p_props->>'trigger') USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'postmortem_candidates_opened' THEN
      v_allowed_keys := ARRAY['candidate_count', 'position_index'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=postmortem_candidates_opened key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->'candidate_count') IS NOT NULL THEN
        v_candidate_count := (p_props->>'candidate_count')::NUMERIC;
        IF v_candidate_count < 0 OR v_candidate_count <> floor(v_candidate_count) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_candidates_opened key=candidate_count must be >= 0 integer' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'position_index') IS NOT NULL THEN
        v_position_idx := (p_props->>'position_index')::NUMERIC;
        IF v_position_idx < 0 OR v_position_idx <> floor(v_position_idx) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=postmortem_candidates_opened key=position_index must be >= 0 integer' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'pro_feature_used' THEN
      v_allowed_keys := ARRAY['feature_name', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=pro_feature_used key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'feature_name') IS NULL OR (p_props->>'feature_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=pro_feature_used key=feature_name' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'feature_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=pro_feature_used key=feature_name max=100' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=pro_feature_used key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=pro_feature_used' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'frontend_error' THEN
      v_allowed_keys := ARRAY['error_code', 'error_type', 'component', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=frontend_error key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=frontend_error key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=frontend_error' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=frontend_error' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'error_type') IS NOT NULL AND char_length(p_props->>'error_type') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=frontend_error key=error_type max=100' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'component') IS NOT NULL AND char_length(p_props->>'component') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_COMPONENT_TOO_LONG: event=frontend_error' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'rpc_error' THEN
      v_allowed_keys := ARRAY['rpc_name', 'error_code', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=rpc_error key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'rpc_name') IS NULL OR (p_props->>'rpc_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_error key=rpc_name' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'rpc_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_RPC_NAME_TOO_LONG: event=rpc_error' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_error key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=rpc_error' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'error_code') IS NOT NULL AND char_length(p_props->>'error_code') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_ERROR_CODE_TOO_LONG: event=rpc_error' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    WHEN 'realtime_reconnected' THEN
      v_allowed_keys := ARRAY['channel', 'attempt_number', 'elapsed_since_disconnect_seconds'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=realtime_reconnected key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'channel') IS NOT NULL AND char_length(p_props->>'channel') > 200 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=realtime_reconnected key=channel max=200' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'attempt_number') IS NOT NULL THEN
        v_attempt_num3 := (p_props->>'attempt_number')::NUMERIC;
        IF v_attempt_num3 < 1 OR v_attempt_num3 <> floor(v_attempt_num3) THEN
          RAISE EXCEPTION 'KPI_PROPS_INVALID_VALUE: event=realtime_reconnected key=attempt_number must be >= 1 integer' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;
      IF (p_props->'elapsed_since_disconnect_seconds') IS NOT NULL THEN
        v_elapsed_disc := (p_props->>'elapsed_since_disconnect_seconds')::NUMERIC;
        IF v_elapsed_disc < 0 THEN
          RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=realtime_reconnected key=elapsed_since_disconnect_seconds' USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END IF;

    WHEN 'performance_measure' THEN
      v_allowed_keys := ARRAY['metric_name', 'value_ms', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=performance_measure key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'metric_name') IS NULL OR (p_props->>'metric_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=performance_measure key=metric_name' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'metric_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=performance_measure key=metric_name max=100' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'value_ms') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=performance_measure key=value_ms' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'value_ms') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=performance_measure key=value_ms must be number' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_value_ms := (p_props->>'value_ms')::NUMERIC;
      IF v_value_ms < 0 THEN
        RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=performance_measure key=value_ms' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_value_ms > 300000 THEN
        RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=performance_measure key=value_ms max=300000ms' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NOT NULL AND char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=performance_measure' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- match_started (Phase 3最終補正: offline_pvp を match_mode に追加)
    -- -----------------------------------------------------------------------
    WHEN 'match_started' THEN
      v_allowed_keys := ARRAY['match_key', 'match_mode', 'cpu_difficulty'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=match_started key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'match_key') IS NULL OR (p_props->>'match_key') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=match_started key=match_key' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'match_key') > 200 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=match_started key=match_key max=200' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'match_mode') IS NULL OR (p_props->>'match_mode') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=match_started key=match_mode' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      -- offline_pvp を含む5分類
      IF (p_props->>'match_mode') NOT IN ('human_vs_cpu', 'offline_pvp', 'online', 'official', 'arena') THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=match_started key=match_mode value=%', (p_props->>'match_mode')
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'cpu_difficulty') IS NOT NULL AND char_length(p_props->>'cpu_difficulty') > 50 THEN
        RAISE EXCEPTION 'KPI_PROPS_STRING_TOO_LONG: event=match_started key=cpu_difficulty max=50' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    -- -----------------------------------------------------------------------
    -- rpc_call_completed
    -- -----------------------------------------------------------------------
    WHEN 'rpc_call_completed' THEN
      v_allowed_keys := ARRAY['rpc_name', 'outcome', 'elapsed_ms', 'route'];
      FOR v_key IN SELECT jsonb_object_keys(p_props) LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
          RAISE EXCEPTION 'KPI_PROPS_UNKNOWN_KEY: event=rpc_call_completed key=%', v_key USING ERRCODE = 'invalid_parameter_value';
        END IF;
      END LOOP;
      IF (p_props->>'rpc_name') IS NULL OR (p_props->>'rpc_name') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=rpc_name' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'rpc_name') > 100 THEN
        RAISE EXCEPTION 'KPI_PROPS_RPC_NAME_TOO_LONG: event=rpc_call_completed' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'outcome') IS NULL OR (p_props->>'outcome') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=outcome' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'outcome') NOT IN ('success', 'error') THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_ENUM: event=rpc_call_completed key=outcome value=%', (p_props->>'outcome') USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->'elapsed_ms') IS NULL THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=elapsed_ms' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF jsonb_typeof(p_props->'elapsed_ms') <> 'number' THEN
        RAISE EXCEPTION 'KPI_PROPS_INVALID_TYPE: event=rpc_call_completed key=elapsed_ms must be number' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      v_elapsed_ms := (p_props->>'elapsed_ms')::NUMERIC;
      IF v_elapsed_ms < 0 THEN
        RAISE EXCEPTION 'KPI_PROPS_NEGATIVE_VALUE: event=rpc_call_completed key=elapsed_ms' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF v_elapsed_ms > 300000 THEN
        RAISE EXCEPTION 'KPI_PROPS_VALUE_TOO_LARGE: event=rpc_call_completed key=elapsed_ms max=300000' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF (p_props->>'route') IS NULL OR (p_props->>'route') = '' THEN
        RAISE EXCEPTION 'KPI_PROPS_MISSING_REQUIRED: event=rpc_call_completed key=route' USING ERRCODE = 'invalid_parameter_value';
      END IF;
      IF char_length(p_props->>'route') > 500 THEN
        RAISE EXCEPTION 'KPI_PROPS_ROUTE_TOO_LONG: event=rpc_call_completed' USING ERRCODE = 'invalid_parameter_value';
      END IF;

    ELSE
      NULL;
  END CASE;
END;
$$;

COMMENT ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) IS
  'Phase 3最終補正: offline_pvp を match_mode / postmortem match_mode に追加。全27 event対応。';

REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._kpi_validate_properties(TEXT, JSONB) TO service_role, postgres;

-- ---------------------------------------------------------------------------
-- 2. admin_get_kpi_match_summary — offline_pvp_matches 列追加
--    DROP + 再作成（戻り値型変更のため）
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_get_kpi_match_summary(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  total_matches               BIGINT,
  cpu_matches                 BIGINT,
  offline_pvp_matches         BIGINT,
  online_casual_matches       BIGINT,
  official_standalone_matches BIGINT,
  arena_matches_count         BIGINT,
  unique_players              BIGINT,
  started_matches             BIGINT,
  completed_matches           BIGINT,
  completion_rate             NUMERIC,
  normal_end_count            BIGINT,
  timeout_count               BIGINT,
  resign_count                BIGINT,
  draw_count                  BIGINT,
  forfeit_count               BIGINT,
  no_contest_count            BIGINT,
  average_move_count          NUMERIC,
  median_move_count           NUMERIC,
  p90_move_count              NUMERIC,
  average_duration_seconds    NUMERIC,
  median_duration_seconds     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpu_matches           BIGINT;
  v_offline_pvp           BIGINT;
  v_online_casual         BIGINT;
  v_official_standalone   BIGINT;
  v_arena_count           BIGINT;
  v_total                 BIGINT;
  v_unique_players        BIGINT;
  v_started               BIGINT;
  v_completed             BIGINT;
  v_completion_rate       NUMERIC;
  v_normal_end            BIGINT;
  v_timeout               BIGINT;
  v_resign                BIGINT;
  v_draw                  BIGINT;
  v_forfeit               BIGINT;
  v_no_contest            BIGINT;
  v_avg_move              NUMERIC;
  v_med_move              NUMERIC;
  v_p90_move              NUMERIC;
  v_avg_dur               NUMERIC;
  v_med_dur               NUMERIC;
BEGIN
  PERFORM public._kpi_require_admin();

  IF p_from IS NULL THEN
    RAISE EXCEPTION 'p_from must not be NULL' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_to IS NULL THEN
    RAISE EXCEPTION 'p_to must not be NULL' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'p_from must be before p_to';
  END IF;
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'period too long (max 366 days)';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid timezone: %', p_timezone;
  END;

  -- ── 1. Arena matches ─────────────────────────────────────────────────────
  SELECT COUNT(DISTINCT am.id)
  INTO v_arena_count
  FROM public.arena_matches am
  WHERE am.created_at >= p_from AND am.created_at < p_to
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (am.black_user_id, am.white_user_id)
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- ── 2. Official standalone ───────────────────────────────────────────────
  SELECT COUNT(DISTINCT om.id)
  INTO v_official_standalone
  FROM public.official_matches om
  WHERE om.starts_at >= p_from AND om.starts_at < p_to
    AND om.status NOT IN ('scheduled', 'pending', 'cancelled', 'no_show', 'no_contest')
    AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (om.black_user_id, om.white_user_id)
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- ── 3. Online casual ─────────────────────────────────────────────────────
  SELECT COUNT(DISTINCT og.id)
  INTO v_online_casual
  FROM public.online_games og
  WHERE og.created_at >= p_from AND og.created_at < p_to
    AND og.status = 'finished'
    AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
    AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id IN (og.black_player_id, og.white_player_id)
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- ── 4. CPU matches (mode='human_vs_cpu' のみ) ─────────────────────────────
  SELECT COUNT(DISTINCT ml.game_id)
  INTO v_cpu_matches
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.mode = 'human_vs_cpu'
    AND ml.game_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- ── 5. Offline PvP (mode='human_vs_human') ───────────────────────────────
  SELECT COUNT(DISTINCT ml.game_id)
  INTO v_offline_pvp
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.mode = 'human_vs_human'
    AND ml.game_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ml.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  v_total := COALESCE(v_arena_count, 0)
           + COALESCE(v_official_standalone, 0)
           + COALESCE(v_online_casual, 0)
           + COALESCE(v_cpu_matches, 0)
           + COALESCE(v_offline_pvp, 0);

  -- ── Unique players ───────────────────────────────────────────────────────
  SELECT COUNT(DISTINCT uid)
  INTO v_unique_players
  FROM (
    SELECT am.black_user_id AS uid FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (am.black_user_id, am.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT am.white_user_id FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (am.black_user_id, am.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT om.black_user_id FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled', 'no_show', 'no_contest')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (om.black_user_id, om.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT om.white_user_id FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled', 'no_show', 'no_contest')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (om.black_user_id, om.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT og.black_player_id FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (og.black_player_id, og.white_player_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT og.white_player_id FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (og.black_player_id, og.white_player_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT ml.user_id FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
      AND ml.game_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = ml.user_id AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
  ) sub
  WHERE uid IS NOT NULL;

  -- ── started / completed ──────────────────────────────────────────────────
  -- started = kpi_events.match_started DISTINCT match_key (period内, production, 内部除外)
  SELECT COUNT(DISTINCT (ke.properties->>'match_key'))
  INTO v_started
  FROM public.kpi_events ke
  WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
    AND ke.event_name = 'match_started'
    AND ke.environment = 'production'
    AND (ke.properties->>'match_key') IS NOT NULL
    AND (ke.route IS NULL OR ke.route NOT LIKE '/ai-check-login%')
    AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = ke.user_id
        AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
    ));

  -- completed = started の match_key を実対局テーブルと突合
  -- 注意: KPI_SPEC.md 明記 — p_to後に終局した対局はこの期間のcompletedには入らない
  WITH started_keys AS (
    SELECT DISTINCT (ke.properties->>'match_key') AS match_key,
                    (ke.properties->>'match_mode')  AS match_mode
    FROM public.kpi_events ke
    WHERE ke.occurred_at >= p_from AND ke.occurred_at < p_to
      AND ke.event_name = 'match_started'
      AND ke.environment = 'production'
      AND (ke.properties->>'match_key') IS NOT NULL
      AND (ke.route IS NULL OR ke.route NOT LIKE '/ai-check-login%')
      AND (p_include_internal OR ke.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id = ke.user_id
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
  ),
  completed_keys AS (
    -- CPU: match_logs.game_id, mode='human_vs_cpu'
    SELECT sk.match_key
    FROM started_keys sk
    JOIN public.match_logs ml ON ml.game_id = sk.match_key
    WHERE sk.match_mode = 'human_vs_cpu'
      AND ml.mode = 'human_vs_cpu'
      AND ml.ended_at IS NOT NULL
      AND ml.ended_at >= p_from AND ml.ended_at < p_to
    UNION
    -- Offline PvP: match_logs.game_id, mode='human_vs_human'
    SELECT sk.match_key
    FROM started_keys sk
    JOIN public.match_logs ml ON ml.game_id = sk.match_key
    WHERE sk.match_mode = 'offline_pvp'
      AND ml.mode = 'human_vs_human'
      AND ml.ended_at IS NOT NULL
      AND ml.ended_at >= p_from AND ml.ended_at < p_to
    UNION
    -- Online casual: online_games.id, finished, 非official/arena
    SELECT sk.match_key
    FROM started_keys sk
    JOIN public.online_games og ON og.id::text = sk.match_key
    WHERE sk.match_mode = 'online'
      AND og.status = 'finished'
      AND og.updated_at >= p_from AND og.updated_at < p_to
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
    UNION
    -- Official standalone: official_matches.online_game_id
    SELECT sk.match_key
    FROM started_keys sk
    JOIN public.official_matches om ON om.online_game_id::text = sk.match_key
    WHERE sk.match_mode = 'official'
      AND om.status NOT IN ('cancelled', 'no_show', 'no_contest', 'scheduled', 'pending')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
    UNION
    -- Arena: arena_matches.online_game_id
    SELECT sk.match_key
    FROM started_keys sk
    JOIN public.arena_matches am ON am.online_game_id::text = sk.match_key
    WHERE sk.match_mode = 'arena'
      AND am.status IN ('completed', 'processed')
      AND am.end_reason NOT IN ('no_show', 'no_contest', 'cancelled')
  )
  SELECT COUNT(DISTINCT match_key)
  INTO v_completed
  FROM completed_keys;

  v_completion_rate := CASE WHEN COALESCE(v_started, 0) > 0
    THEN ROUND(v_completed::NUMERIC / v_started * 100, 2)
    ELSE NULL
  END;

  -- ── end_reason 集計 ──────────────────────────────────────────────────────
  SELECT
    COUNT(*) FILTER (WHERE end_reason = 'normal'),
    COUNT(*) FILTER (WHERE end_reason = 'timeout'),
    COUNT(*) FILTER (WHERE end_reason IN ('resign', 'forfeit')),
    COUNT(*) FILTER (WHERE end_reason IN ('draw', 'draw_agreement')),
    COUNT(*) FILTER (WHERE end_reason = 'no_show'),
    COUNT(*) FILTER (WHERE end_reason = 'no_contest')
  INTO v_normal_end, v_timeout, v_resign, v_draw, v_forfeit, v_no_contest
  FROM (
    SELECT am.end_reason FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (am.black_user_id, am.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT og.end_reason FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (og.black_player_id, og.white_player_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    UNION ALL
    SELECT om.end_reason FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled', 'no_show', 'no_contest')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (om.black_user_id, om.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
  ) er;

  -- ── move_count / duration 統計 ───────────────────────────────────────────
  SELECT
    AVG(ml.move_count),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ml.move_count),
    percentile_cont(0.9) WITHIN GROUP (ORDER BY ml.move_count)
  INTO v_avg_move, v_med_move, v_p90_move
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
    AND ml.game_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = ml.user_id AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)));

  SELECT
    AVG(EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at))),
    percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at)))
  INTO v_avg_dur, v_med_dur
  FROM public.match_logs ml
  WHERE ml.started_at >= p_from AND ml.started_at < p_to
    AND ml.ended_at IS NOT NULL
    AND ml.mode IN ('human_vs_cpu', 'human_vs_human')
    AND ml.game_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
    AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = ml.user_id AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)));

  RETURN QUERY SELECT
    v_total,
    v_cpu_matches,
    v_offline_pvp,
    v_online_casual,
    v_official_standalone,
    v_arena_count,
    v_unique_players,
    v_started,
    v_completed,
    v_completion_rate,
    COALESCE(v_normal_end, 0),
    COALESCE(v_timeout, 0),
    COALESCE(v_resign, 0),
    COALESCE(v_draw, 0),
    COALESCE(v_forfeit, 0),
    COALESCE(v_no_contest, 0),
    v_avg_move,
    v_med_move,
    v_p90_move,
    v_avg_dur,
    v_med_dur;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_match_summary IS
  'KPI Phase 3最終補正: offline_pvp_matches追加・completed_matches完全実装・5分類canonical集計。Admin専用。';

-- ---------------------------------------------------------------------------
-- 3. admin_get_kpi_match_daily — offline_pvp_matches 列追加
--    DROP + 再作成（戻り値型変更のため）
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_get_kpi_match_daily(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  day                         DATE,
  total_matches               BIGINT,
  cpu_matches                 BIGINT,
  offline_pvp_matches         BIGINT,
  online_casual_matches       BIGINT,
  official_standalone_matches BIGINT,
  arena_matches_count         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._kpi_require_admin();

  IF p_from IS NULL THEN
    RAISE EXCEPTION 'p_from must not be NULL' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_to IS NULL THEN
    RAISE EXCEPTION 'p_to must not be NULL' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'p_from must be before p_to';
  END IF;
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'period too long (max 366 days)';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid timezone: %', p_timezone;
  END;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_from AT TIME ZONE p_timezone),
      date_trunc('day', (p_to - INTERVAL '1 second') AT TIME ZONE p_timezone),
      INTERVAL '1 day'
    )::DATE AS d
  ),
  arena_by_day AS (
    SELECT (am.created_at AT TIME ZONE p_timezone)::DATE AS d, COUNT(DISTINCT am.id) AS cnt
    FROM public.arena_matches am
    WHERE am.created_at >= p_from AND am.created_at < p_to
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (am.black_user_id, am.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    GROUP BY 1
  ),
  official_by_day AS (
    SELECT (om.starts_at AT TIME ZONE p_timezone)::DATE AS d, COUNT(DISTINCT om.id) AS cnt
    FROM public.official_matches om
    WHERE om.starts_at >= p_from AND om.starts_at < p_to
      AND om.status NOT IN ('scheduled', 'pending', 'cancelled', 'no_show', 'no_contest')
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am2 WHERE am2.official_match_id = om.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (om.black_user_id, om.white_user_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    GROUP BY 1
  ),
  online_by_day AS (
    SELECT (og.created_at AT TIME ZONE p_timezone)::DATE AS d, COUNT(DISTINCT og.id) AS cnt
    FROM public.online_games og
    WHERE og.created_at >= p_from AND og.created_at < p_to
      AND og.status = 'finished'
      AND NOT EXISTS (SELECT 1 FROM public.official_matches om2 WHERE om2.online_game_id = og.id)
      AND NOT EXISTS (SELECT 1 FROM public.arena_matches am3 WHERE am3.online_game_id = og.id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id IN (og.black_player_id, og.white_player_id) AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    GROUP BY 1
  ),
  cpu_by_day AS (
    SELECT (ml.started_at AT TIME ZONE p_timezone)::DATE AS d, COUNT(DISTINCT ml.game_id) AS cnt
    FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND ml.mode = 'human_vs_cpu'
      AND ml.game_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = ml.user_id AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    GROUP BY 1
  ),
  offline_pvp_by_day AS (
    SELECT (ml.started_at AT TIME ZONE p_timezone)::DATE AS d, COUNT(DISTINCT ml.game_id) AS cnt
    FROM public.match_logs ml
    WHERE ml.started_at >= p_from AND ml.started_at < p_to
      AND ml.mode = 'human_vs_human'
      AND ml.game_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.online_games og2 WHERE og2.id::text = ml.game_id)
      AND (p_include_internal OR NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = ml.user_id AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)))
    GROUP BY 1
  )
  SELECT
    days.d,
    COALESCE(abd.cnt, 0) + COALESCE(ofd.cnt, 0) + COALESCE(old.cnt, 0) + COALESCE(cpd.cnt, 0) + COALESCE(pvp.cnt, 0) AS total_matches,
    COALESCE(cpd.cnt, 0) AS cpu_matches,
    COALESCE(pvp.cnt, 0) AS offline_pvp_matches,
    COALESCE(old.cnt, 0) AS online_casual_matches,
    COALESCE(ofd.cnt, 0) AS official_standalone_matches,
    COALESCE(abd.cnt, 0) AS arena_matches_count
  FROM days
  LEFT JOIN arena_by_day abd ON abd.d = days.d
  LEFT JOIN official_by_day ofd ON ofd.d = days.d
  LEFT JOIN online_by_day old ON old.d = days.d
  LEFT JOIN cpu_by_day cpd ON cpd.d = days.d
  LEFT JOIN offline_pvp_by_day pvp ON pvp.d = days.d
  ORDER BY days.d;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_match_daily(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_match_daily IS
  'KPI Phase 3最終補正: offline_pvp_matches追加・5分類daily集計。Admin専用。';

-- ---------------------------------------------------------------------------
-- 4. admin_get_kpi_arena_funnel — started定義修正
--    (online_game_id IS NOT NULL だけで started にしない; move_number > 0 で判定)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_kpi_arena_funnel(
  p_from              TIMESTAMPTZ,
  p_to                TIMESTAMPTZ,
  p_timezone          TEXT    DEFAULT 'UTC',
  p_include_internal  BOOLEAN DEFAULT false
)
RETURNS TABLE (
  arena_code              TEXT,
  arena_event_id          UUID,
  scheduled_at            TIMESTAMPTZ,
  entries                 BIGINT,
  unique_entrants         BIGINT,
  matched_users           BIGINT,
  assigned_matches        BIGINT,
  started_matches         BIGINT,
  completed_matches       BIGINT,
  no_show_matches         BIGINT,
  no_contest_matches      BIGINT,
  entry_to_match_rate     NUMERIC,
  match_completion_rate   NUMERIC,
  no_show_rate            NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public._kpi_require_admin();

  IF p_from IS NULL THEN
    RAISE EXCEPTION 'p_from must not be NULL' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_to IS NULL THEN
    RAISE EXCEPTION 'p_to must not be NULL' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from >= p_to THEN
    RAISE EXCEPTION 'p_from must be before p_to';
  END IF;
  IF p_to - p_from > INTERVAL '366 days' THEN
    RAISE EXCEPTION 'period too long (max 366 days)';
  END IF;
  BEGIN
    PERFORM now() AT TIME ZONE p_timezone;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid timezone: %', p_timezone;
  END;

  RETURN QUERY
  WITH events AS (
    SELECT ae.id AS event_id, ae.scheduled_at, ad.code AS arena_code
    FROM public.arena_events ae
    JOIN public.arena_definitions ad ON ad.id = ae.arena_id
    WHERE ae.scheduled_at >= p_from AND ae.scheduled_at < p_to
  ),
  entry_stats AS (
    SELECT
      e.event_id,
      COUNT(ent.id) FILTER (
        WHERE p_include_internal OR NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id = ent.user_id
            AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
        )
      ) AS entries,
      COUNT(DISTINCT ent.user_id) FILTER (
        WHERE p_include_internal OR NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id = ent.user_id
            AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
        )
      ) AS unique_entrants
    FROM events e
    LEFT JOIN public.arena_entries ent ON ent.arena_event_id = e.event_id
    GROUP BY e.event_id
  ),
  match_stats AS (
    SELECT
      am.arena_event_id AS event_id,
      COUNT(DISTINCT am.id) AS assigned_matches,
      -- started: 実際の着手が確認できるもの (move_number > 0 OR status=playing/finished)
      -- online_game_id IS NOT NULL だけでは started にしない
      COUNT(DISTINCT am.id) FILTER (
        WHERE am.online_game_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.online_games og
            WHERE og.id = am.online_game_id
              AND (og.move_number > 0 OR og.status IN ('playing', 'finished'))
          )
      ) AS started_matches,
      -- completed: 実ゲームが終局 (no_show/no_contest/cancelled除く)
      COUNT(DISTINCT am.id) FILTER (
        WHERE am.status IN ('completed', 'processed')
          AND am.end_reason NOT IN ('no_show', 'no_contest', 'cancelled')
      ) AS completed_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.end_reason = 'no_show') AS no_show_matches,
      COUNT(DISTINCT am.id) FILTER (WHERE am.end_reason = 'no_contest') AS no_contest_matches
    FROM public.arena_matches am
    WHERE am.arena_event_id IN (SELECT event_id FROM events)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY am.arena_event_id
  ),
  matched_user_counts AS (
    SELECT am.arena_event_id AS event_id, COUNT(DISTINCT uid) AS matched_users
    FROM public.arena_matches am
    CROSS JOIN LATERAL (VALUES (am.black_user_id), (am.white_user_id)) AS u(uid)
    WHERE am.arena_event_id IN (SELECT event_id FROM events)
      AND (p_include_internal OR NOT EXISTS (
        SELECT 1 FROM public.profiles p2
        WHERE p2.id IN (am.black_user_id, am.white_user_id)
          AND (COALESCE(p2.is_admin,FALSE) OR COALESCE(p2.is_internal_test_account,FALSE) OR p2.internal_plan_override IS NOT NULL)
      ))
    GROUP BY am.arena_event_id
  )
  SELECT
    ev.arena_code,
    ev.event_id AS arena_event_id,
    ev.scheduled_at,
    COALESCE(es.entries, 0) AS entries,
    COALESCE(es.unique_entrants, 0) AS unique_entrants,
    COALESCE(muc.matched_users, 0) AS matched_users,
    COALESCE(ms.assigned_matches, 0) AS assigned_matches,
    COALESCE(ms.started_matches, 0) AS started_matches,
    COALESCE(ms.completed_matches, 0) AS completed_matches,
    COALESCE(ms.no_show_matches, 0) AS no_show_matches,
    COALESCE(ms.no_contest_matches, 0) AS no_contest_matches,
    CASE WHEN COALESCE(es.unique_entrants, 0) > 0
      THEN ROUND(COALESCE(muc.matched_users, 0)::NUMERIC / es.unique_entrants * 100, 2)
      ELSE NULL
    END AS entry_to_match_rate,
    CASE WHEN COALESCE(ms.assigned_matches, 0) > 0
      THEN ROUND(COALESCE(ms.completed_matches, 0)::NUMERIC / ms.assigned_matches * 100, 2)
      ELSE NULL
    END AS match_completion_rate,
    CASE WHEN COALESCE(ms.assigned_matches, 0) > 0
      THEN ROUND(COALESCE(ms.no_show_matches, 0)::NUMERIC / ms.assigned_matches * 100, 2)
      ELSE NULL
    END AS no_show_rate
  FROM events ev
  LEFT JOIN entry_stats es ON es.event_id = ev.event_id
  LEFT JOIN match_stats ms ON ms.event_id = ev.event_id
  LEFT JOIN matched_user_counts muc ON muc.event_id = ev.event_id
  ORDER BY ev.scheduled_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_kpi_arena_funnel(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, BOOLEAN) TO service_role, postgres;

COMMENT ON FUNCTION public.admin_get_kpi_arena_funnel IS
  'KPI Phase 3最終補正: Arena Funnel started定義修正 (move_number>0判定)。no-show/no-contest回帰テスト対応。Admin専用。';
