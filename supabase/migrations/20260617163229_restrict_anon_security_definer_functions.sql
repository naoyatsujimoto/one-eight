-- =============================================================================
-- Security: Restrict anon EXECUTE on SECURITY DEFINER functions
-- Fixes Supabase Security Advisor warning:
--   anon_security_definer_function_executable
-- =============================================================================
-- Date: 2026-06-17
-- Strategy:
--   A-1: Admin-only Prize management → REVOKE PUBLIC, GRANT authenticated
--   A-2: Admin-only Official Match management → REVOKE PUBLIC, GRANT authenticated
--   A-3: DB bulk-stats rewrite → REVOKE PUBLIC, GRANT service_role only
--         (no src/ callers confirmed)
--   A-4: Trigger-only function → REVOKE PUBLIC, no direct GRANT
--   B:   Authenticated user RPCs → REVOKE PUBLIC, GRANT authenticated
--   C:   Public read RPCs → no change
--   D:   Investigated; get_cpu_stats: authenticated only (has full_record);
--        join_or_create_random_game: add auth.uid() guard + authenticated only
-- =============================================================================

-- =============================================================================
-- A-1: Admin-only Prize management
-- =============================================================================

-- admin_create_prize_award(uuid, text, int, text, uuid, uuid, uuid, text, text)
REVOKE ALL ON FUNCTION public.admin_create_prize_award(
  uuid, text, int, text, uuid, uuid, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_prize_award(
  uuid, text, int, text, uuid, uuid, uuid, text, text
) TO authenticated;

-- admin_generate_arena_prize_awards(uuid, int, text, text)
REVOKE ALL ON FUNCTION public.admin_generate_arena_prize_awards(uuid, int, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_generate_arena_prize_awards(uuid, int, text, text) TO authenticated;

-- admin_get_payout_detail(uuid)
REVOKE ALL ON FUNCTION public.admin_get_payout_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_payout_detail(uuid) TO authenticated;

-- admin_get_prize_submission_for_print(uuid)
REVOKE ALL ON FUNCTION public.admin_get_prize_submission_for_print(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_prize_submission_for_print(uuid) TO authenticated;

-- admin_list_payable_awards()
REVOKE ALL ON FUNCTION public.admin_list_payable_awards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_payable_awards() TO authenticated;

-- admin_list_prize_awards()
REVOKE ALL ON FUNCTION public.admin_list_prize_awards() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_prize_awards() TO authenticated;

-- admin_mark_prize_submission_archived(uuid, text)
REVOKE ALL ON FUNCTION public.admin_mark_prize_submission_archived(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_prize_submission_archived(uuid, text) TO authenticated;

-- admin_update_prize_award_status(uuid, text, text)
REVOKE ALL ON FUNCTION public.admin_update_prize_award_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_prize_award_status(uuid, text, text) TO authenticated;

-- =============================================================================
-- A-2: Admin-only Official Match management
-- =============================================================================

-- cancel_official_match(uuid, text)
REVOKE ALL ON FUNCTION public.cancel_official_match(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_official_match(uuid, text) TO authenticated;

-- create_official_match(uuid, uuid, timestamptz, timestamptz, jsonb, uuid, uuid)
REVOKE ALL ON FUNCTION public.create_official_match(
  uuid, uuid, timestamptz, timestamptz, jsonb, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_official_match(
  uuid, uuid, timestamptz, timestamptz, jsonb, uuid, uuid
) TO authenticated;

-- =============================================================================
-- A-3: DB bulk-stats rewrite (no src/ callers confirmed → service_role only)
-- =============================================================================

REVOKE ALL ON FUNCTION public.rebuild_position_stats_from_match_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_position_stats_from_match_logs() TO service_role;

REVOKE ALL ON FUNCTION public.rebuild_sim_position_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_sim_position_stats(text) TO service_role;

REVOKE ALL ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() TO service_role;

REVOKE ALL ON FUNCTION public.delete_sim_batch(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_sim_batch(text) TO service_role;

REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) TO service_role;

REVOKE ALL ON FUNCTION public.batch_upsert_sim_position_stats(text[], text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_upsert_sim_position_stats(text[], text, text) TO service_role;

REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) TO service_role;

-- =============================================================================
-- A-4: Trigger-only function (no direct RPC needed)
-- =============================================================================

REVOKE ALL ON FUNCTION public.sync_official_match_on_game_finish() FROM PUBLIC;
-- No GRANT: called exclusively via trigger, not via RPC

-- =============================================================================
-- B: Authenticated user RPCs
-- =============================================================================

-- apply_online_move(uuid, int, jsonb, uuid, text)
REVOKE ALL ON FUNCTION public.apply_online_move(uuid, int, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_online_move(uuid, int, jsonb, uuid, text) TO authenticated;

-- check_official_match_expiry(uuid)
REVOKE ALL ON FUNCTION public.check_official_match_expiry(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_official_match_expiry(uuid) TO authenticated;

-- claim_timeout(uuid)
REVOKE ALL ON FUNCTION public.claim_timeout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_timeout(uuid) TO authenticated;

-- enter_official_match(uuid, jsonb)
REVOKE ALL ON FUNCTION public.enter_official_match(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_official_match(uuid, jsonb) TO authenticated;

-- get_ghost_moves(text, text, integer)
REVOKE ALL ON FUNCTION public.get_ghost_moves(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ghost_moves(text, text, integer) TO authenticated;

-- get_my_arena_titles()
REVOKE ALL ON FUNCTION public.get_my_arena_titles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_arena_titles() TO authenticated;

-- get_user_match_history()
REVOKE ALL ON FUNCTION public.get_user_match_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_match_history() TO authenticated;

-- join_online_game(text)
REVOKE ALL ON FUNCTION public.join_online_game(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_online_game(text) TO authenticated;

-- list_my_official_matches — 2 signatures
REVOKE ALL ON FUNCTION public.list_my_official_matches(timestamptz, timestamptz, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_official_matches(timestamptz, timestamptz, text[], boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_official_matches(timestamptz, timestamptz, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_official_matches(timestamptz, timestamptz, text[]) TO authenticated;

-- mark_admin_message_read(uuid)
REVOKE ALL ON FUNCTION public.mark_admin_message_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_admin_message_read(uuid) TO authenticated;

-- =============================================================================
-- D: Investigated functions
-- =============================================================================

-- get_cpu_stats(text):
--   - Used in CpuProfile.tsx (authenticated UI only after login)
--   - Returns full_record (detailed game records for all users)
--   - Restrict to authenticated to prevent anonymous bulk-fetch of game records
REVOKE ALL ON FUNCTION public.get_cpu_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_cpu_stats(text) TO authenticated;

-- join_or_create_random_game(uuid, jsonb):
--   - p_user_id argument has no auth.uid() guard → spoofing risk
--   - Rewrite to enforce p_user_id = auth.uid() internally
--   - anon EXECUTE removed; authenticated GRANT maintained
CREATE OR REPLACE FUNCTION public.join_or_create_random_game(
  p_user_id      uuid,
  p_initial_state jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game         online_games;
  v_now          timestamptz := clock_timestamp();
  v_room_code    text;
  v_chars        text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i            int;
  v_timer_config jsonb := '{"mode":"per_move","totalSeconds":600,"perMoveSeconds":60}'::jsonb;
BEGIN
  -- セキュリティ: p_user_id が呼び出し元と一致することを強制（spoofing防止）
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'user_id_mismatch'
      USING DETAIL = 'p_user_id must match the authenticated user';
  END IF;

  -- waiting 中の自分以外のゲームを検索
  SELECT * INTO v_game
  FROM online_games
  WHERE status = 'waiting'
    AND black_player_id != p_user_id
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF FOUND THEN
    -- 既存ゲームに参加（白番）
    UPDATE online_games SET
      white_player_id    = p_user_id,
      current_player_id  = black_player_id,
      status             = 'playing',
      timer_config       = COALESCE(timer_config, v_timer_config),
      black_remaining_ms = CASE
        WHEN COALESCE(timer_config, v_timer_config)->>'mode' = 'total_time'
          THEN (COALESCE(timer_config, v_timer_config)->>'totalSeconds')::int * 1000
        ELSE NULL
      END,
      white_remaining_ms = CASE
        WHEN COALESCE(timer_config, v_timer_config)->>'mode' = 'total_time'
          THEN (COALESCE(timer_config, v_timer_config)->>'totalSeconds')::int * 1000
        ELSE NULL
      END,
      turn_started_at    = v_now,
      server_updated_at  = v_now,
      updated_at         = v_now
    WHERE id = v_game.id;

    RETURN jsonb_build_object(
      'game_id',   v_game.id,
      'color',     'white',
      'room_code', v_game.room_code
    );
  END IF;

  -- 既存ゲームなし → 新規作成（黒番）
  FOR v_i IN 1..5 LOOP
    v_room_code := '';
    FOR v_i IN 1..6 LOOP
      v_room_code := v_room_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO online_games (
        room_code,
        black_player_id,
        current_player_id,
        status,
        game_state,
        move_number,
        timer_config,
        server_updated_at
      ) VALUES (
        v_room_code,
        p_user_id,
        NULL,
        'waiting',
        p_initial_state,
        1,
        v_timer_config,
        v_now
      )
      RETURNING * INTO v_game;

      RETURN jsonb_build_object(
        'game_id',   v_game.id,
        'color',     'black',
        'room_code', v_room_code
      );
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'failed_to_create_game';
END;
$$;

REVOKE ALL ON FUNCTION public.join_or_create_random_game(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_or_create_random_game(uuid, jsonb) TO authenticated;
