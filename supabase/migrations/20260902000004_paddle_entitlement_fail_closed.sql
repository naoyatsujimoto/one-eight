-- Keep all server-side Pro entitlement gates aligned with the app and KPI:
-- an active Paddle subscription requires a non-NULL, future paid-period end.
-- Only the entitlement predicates differ from the latest existing functions.

CREATE OR REPLACE FUNCTION public.enter_arena_event(p_arena_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid             UUID;
  v_event           arena_events%ROWTYPE;
  v_entry_deadline  TIMESTAMPTZ;
  v_is_pro          BOOLEAN;
  v_entry_id        UUID;
  v_entered_at      TIMESTAMPTZ;
  v_prev_event_id   UUID;
  v_has_unprocessed BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF public._is_internal_test_account(v_uid) THEN
    RAISE EXCEPTION 'forbidden: internal inspection accounts are read-only';
  END IF;

  SELECT ae.*
    INTO v_event
    FROM arena_events AS ae
   WHERE ae.id = p_arena_event_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  IF v_event.status <> 'scheduled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'event_not_open',
      'status', v_event.status
    );
  END IF;

  SELECT v_event.scheduled_at - ((ad.entry_deadline_hours || ' hours')::INTERVAL)
    INTO v_entry_deadline
    FROM arena_definitions AS ad
   WHERE ad.id = v_event.arena_id;

  IF now() >= v_entry_deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'entry_deadline_passed');
  END IF;

  SELECT (
    p.plan = 'pro'
    AND (
      (
        p.subscription_status = 'active'
        AND p.current_period_end IS NOT NULL
        AND p.current_period_end > now()
      )
      OR
      (
        p.subscription_status = 'canceled'
        AND p.current_period_end IS NOT NULL
        AND p.current_period_end > now()
      )
    )
  )
    INTO v_is_pro
    FROM profiles AS p
   WHERE p.id = v_uid;

  IF v_is_pro IS NULL OR v_is_pro = FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pro_required');
  END IF;

  SELECT prev_ae.id
    INTO v_prev_event_id
    FROM arena_events AS prev_ae
   WHERE prev_ae.arena_id = v_event.arena_id
     AND prev_ae.scheduled_at < v_event.scheduled_at
     AND prev_ae.status IN ('generated', 'matched', 'completed', 'closed', 'scheduled', 'open')
   ORDER BY prev_ae.scheduled_at DESC
   LIMIT 1;

  IF v_prev_event_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM arena_matches AS prev_am
       WHERE prev_am.arena_event_id = v_prev_event_id
         AND prev_am.status NOT IN ('processed', 'cancelled')
    )
      INTO v_has_unprocessed;

    IF v_has_unprocessed THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'previous_results_pending');
    END IF;
  END IF;

  BEGIN
    INSERT INTO arena_entries (arena_event_id, user_id)
    VALUES (p_arena_event_id, v_uid)
    RETURNING id, entered_at INTO v_entry_id, v_entered_at;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_entered');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_entry_id,
    'arena_event_id', p_arena_event_id,
    'entered_at', v_entered_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.enter_arena_event(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enter_arena_event(UUID) TO authenticated, service_role, postgres;


CREATE OR REPLACE FUNCTION public.get_ghost_moves(
  p_canonical_hash TEXT,
  p_human_color TEXT DEFAULT NULL,
  p_move_index INTEGER DEFAULT 0
)
RETURNS TABLE (
  positioning TEXT,
  build_type TEXT,
  build_gate INTEGER,
  build_gates INTEGER[],
  build_placed_gate_ids INTEGER[],
  frequency INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID;
  v_plan       TEXT;
  v_status     TEXT;
  v_period_end TIMESTAMPTZ;
  v_is_pro     BOOLEAN;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT p.plan, p.subscription_status, p.current_period_end
    INTO v_plan, v_status, v_period_end
    FROM profiles AS p
   WHERE p.id = v_uid;

  v_is_pro := (
    v_plan = 'pro'
    AND (
      (
        v_status = 'active'
        AND v_period_end IS NOT NULL
        AND v_period_end > now()
      )
      OR
      (
        v_status = 'canceled'
        AND v_period_end IS NOT NULL
        AND v_period_end > now()
      )
    )
  );
  IF NOT v_is_pro THEN RETURN; END IF;

  RETURN QUERY
  WITH target_logs AS (
    SELECT ml.full_record
      FROM match_logs AS ml
     WHERE ml.user_id = v_uid
       AND ml.mode IN ('human_vs_cpu', 'online_pvp')
       AND ml.full_record IS NOT NULL
       AND jsonb_typeof(ml.full_record) = 'array'
       AND ml.full_record <> '[]'::JSONB
  ), ghost_candidates AS (
    SELECT tl.full_record -> 0 AS ghost_move
      FROM target_logs AS tl
     WHERE p_move_index = 0

    UNION ALL

    SELECT tl.full_record -> (elem.ord::INTEGER) AS ghost_move
      FROM target_logs AS tl,
           jsonb_array_elements(tl.full_record) WITH ORDINALITY AS elem(move, ord)
     WHERE p_move_index > 0
       AND elem.move->>'canonical_hash' = p_canonical_hash
  ), filtered AS (
    SELECT
      COALESCE(gc.ghost_move->>'positioning', 'P') AS pos,
      COALESCE(gc.ghost_move->'build'->>'type', 'skip') AS btype,
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'massive'
             AND jsonb_typeof(gc.ghost_move->'build'->'gate') = 'number'
          THEN (gc.ghost_move->'build'->>'gate')::INTEGER
        ELSE NULL
      END AS b_gate,
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'selective'
             AND jsonb_typeof(gc.ghost_move->'build'->'gates') = 'array'
          THEN ARRAY(
            SELECT v::INTEGER
              FROM jsonb_array_elements_text(gc.ghost_move->'build'->'gates') AS v
             WHERE v::INTEGER > 0
             ORDER BY 1
          )
        ELSE NULL
      END AS b_gates,
      CASE
        WHEN gc.ghost_move->'build'->>'type' = 'quad'
             AND jsonb_typeof(gc.ghost_move->'build'->'placedGateIds') = 'array'
          THEN ARRAY(
            SELECT v::INTEGER
              FROM jsonb_array_elements_text(gc.ghost_move->'build'->'placedGateIds') AS v
             ORDER BY 1
          )
        ELSE NULL
      END AS b_placed
      FROM ghost_candidates AS gc
     WHERE gc.ghost_move IS NOT NULL
       AND (p_human_color IS NULL OR gc.ghost_move->>'player' = p_human_color)
  )
  SELECT
    f.pos::TEXT,
    f.btype::TEXT,
    f.b_gate,
    f.b_gates,
    f.b_placed,
    COUNT(*)::INTEGER
    FROM filtered AS f
   GROUP BY f.pos, f.btype, f.b_gate, f.b_gates, f.b_placed
   ORDER BY COUNT(*) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ghost_moves(TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ghost_moves(TEXT, TEXT, INTEGER) TO authenticated, service_role, postgres;


CREATE OR REPLACE FUNCTION public.get_user_match_history()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  game_id TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  mode TEXT,
  human_color TEXT,
  winner TEXT,
  move_count INTEGER,
  created_at TIMESTAMPTZ,
  full_record JSONB,
  cpu_difficulty TEXT,
  canonical_hashes_computed BOOLEAN,
  timer_config JSONB,
  end_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID;
  v_plan       TEXT;
  v_status     TEXT;
  v_period_end TIMESTAMPTZ;
  v_is_pro     BOOLEAN;
BEGIN
  v_uid := auth.uid();

  SELECT p.plan, p.subscription_status, p.current_period_end
    INTO v_plan, v_status, v_period_end
    FROM public.profiles AS p
   WHERE p.id = v_uid;

  v_is_pro := (
    v_plan = 'pro'
    AND (
      (
        v_status = 'active'
        AND v_period_end IS NOT NULL
        AND v_period_end > now()
      )
      OR
      (
        v_status = 'canceled'
        AND v_period_end IS NOT NULL
        AND v_period_end > now()
      )
    )
  );

  IF v_is_pro THEN
    RETURN QUERY
      SELECT
        m.id,
        m.user_id,
        m.game_id,
        m.started_at,
        m.ended_at,
        m.mode,
        CASE
          WHEN m.mode = 'online_pvp' AND og.id IS NOT NULL THEN
            CASE
              WHEN og.black_player_id = v_uid THEN 'black'
              WHEN og.white_player_id = v_uid THEN 'white'
              ELSE m.human_color
            END
          ELSE m.human_color
        END AS human_color,
        m.winner,
        m.move_count,
        m.created_at,
        m.full_record,
        m.cpu_difficulty,
        m.canonical_hashes_computed,
        m.timer_config,
        m.end_reason
        FROM public.match_logs AS m
        LEFT JOIN public.online_games AS og
          ON m.mode = 'online_pvp'
         AND m.game_id = og.id::TEXT
         AND (og.black_player_id = v_uid OR og.white_player_id = v_uid)
       WHERE m.user_id = v_uid
          OR (m.mode = 'online_pvp' AND og.id IS NOT NULL)
       ORDER BY m.created_at DESC;
  ELSE
    RETURN QUERY
      SELECT
        m.id,
        m.user_id,
        m.game_id,
        m.started_at,
        m.ended_at,
        m.mode,
        CASE
          WHEN m.mode = 'online_pvp' AND og.id IS NOT NULL THEN
            CASE
              WHEN og.black_player_id = v_uid THEN 'black'
              WHEN og.white_player_id = v_uid THEN 'white'
              ELSE m.human_color
            END
          ELSE m.human_color
        END AS human_color,
        m.winner,
        m.move_count,
        m.created_at,
        m.full_record,
        m.cpu_difficulty,
        m.canonical_hashes_computed,
        m.timer_config,
        m.end_reason
        FROM public.match_logs AS m
        LEFT JOIN public.online_games AS og
          ON m.mode = 'online_pvp'
         AND m.game_id = og.id::TEXT
         AND (og.black_player_id = v_uid OR og.white_player_id = v_uid)
       WHERE m.user_id = v_uid
          OR (m.mode = 'online_pvp' AND og.id IS NOT NULL)
       ORDER BY m.created_at DESC
       LIMIT 10;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_match_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_match_history() TO authenticated, service_role, postgres;
