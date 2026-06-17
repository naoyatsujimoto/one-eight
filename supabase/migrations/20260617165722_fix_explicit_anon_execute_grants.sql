-- =============================================================================
-- Fix: Explicitly REVOKE anon EXECUTE on SECURITY DEFINER functions
-- Background:
--   Previous migration (20260617163229) used REVOKE FROM PUBLIC, but anon
--   role retains explicit EXECUTE grants that survived. This migration
--   explicitly removes them via REVOKE FROM anon.
-- =============================================================================
-- Date: 2026-06-17
-- Affected: 20 functions (A-1, A-3, A-4, B-subset)
-- Not affected: C-class 6 public read-only functions (intentionally left)
-- =============================================================================

-- =============================================================================
-- A-1: Admin Prize管理系 (anon REVOKE, authenticated GRANT維持)
-- =============================================================================

REVOKE ALL ON FUNCTION public.admin_create_prize_award(
  p_recipient_user_id uuid,
  p_source_kind text,
  p_amount_cents integer,
  p_currency text,
  p_source_arena_id uuid,
  p_source_arena_event_id uuid,
  p_source_arena_match_id uuid,
  p_prize_kind text,
  p_notes text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_prize_award(
  p_recipient_user_id uuid,
  p_source_kind text,
  p_amount_cents integer,
  p_currency text,
  p_source_arena_id uuid,
  p_source_arena_event_id uuid,
  p_source_arena_match_id uuid,
  p_prize_kind text,
  p_notes text
) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_generate_arena_prize_awards(
  p_arena_event_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_prize_kind text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_generate_arena_prize_awards(
  p_arena_event_id uuid,
  p_amount_cents integer,
  p_currency text,
  p_prize_kind text
) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_payout_detail(
  p_award_id uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_payout_detail(
  p_award_id uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_get_prize_submission_for_print(
  p_submission_id uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_prize_submission_for_print(
  p_submission_id uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_payable_awards() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payable_awards() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_prize_awards() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_prize_awards() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_mark_prize_submission_archived(
  p_submission_id uuid,
  p_note text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_prize_submission_archived(
  p_submission_id uuid,
  p_note text
) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_prize_award_status(
  p_award_id uuid,
  p_status text,
  p_reason text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_prize_award_status(
  p_award_id uuid,
  p_status text,
  p_reason text
) TO authenticated;

-- =============================================================================
-- A-3: 統計一括書き換え系 (anon REVOKE, service_role GRANT維持)
-- =============================================================================

REVOKE ALL ON FUNCTION public.rebuild_position_stats_from_match_logs() FROM anon;
GRANT EXECUTE ON FUNCTION public.rebuild_position_stats_from_match_logs() TO service_role;

REVOKE ALL ON FUNCTION public.rebuild_sim_position_stats(
  p_sim_batch_id text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.rebuild_sim_position_stats(
  p_sim_batch_id text
) TO service_role;

REVOKE ALL ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() FROM anon;
GRANT EXECUTE ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() TO service_role;

REVOKE ALL ON FUNCTION public.delete_sim_batch(
  p_sim_batch_id text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_sim_batch(
  p_sim_batch_id text
) TO service_role;

REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(
  p_hashes text[],
  p_winner text,
  p_mode_groups text[]
) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_upsert_position_stats(
  p_hashes text[],
  p_winner text,
  p_mode_groups text[]
) TO service_role;

REVOKE ALL ON FUNCTION public.batch_upsert_sim_position_stats(
  p_hashes text[],
  p_winner text,
  p_sim_policy text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_upsert_sim_position_stats(
  p_hashes text[],
  p_winner text,
  p_sim_policy text
) TO service_role;

REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(
  p_group_ids text[],
  p_winner text,
  p_mode_groups text[]
) FROM anon;
GRANT EXECUTE ON FUNCTION public.batch_upsert_symmetry_group_stats(
  p_group_ids text[],
  p_winner text,
  p_mode_groups text[]
) TO service_role;

-- =============================================================================
-- A-4: Trigger専用 (anon REVOKE のみ)
-- =============================================================================

REVOKE ALL ON FUNCTION public.sync_official_match_on_game_finish() FROM anon;

-- =============================================================================
-- B: Authenticated user RPCs (anon REVOKE, authenticated GRANT維持)
-- =============================================================================

REVOKE ALL ON FUNCTION public.get_cpu_stats(
  p_difficulty text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_cpu_stats(
  p_difficulty text
) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_arena_titles() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_arena_titles() TO authenticated;

REVOKE ALL ON FUNCTION public.mark_admin_message_read(
  p_message_id uuid
) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_admin_message_read(
  p_message_id uuid
) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_prize_tax_submission(
  p_award_id uuid,
  p_legal_name text,
  p_display_name text,
  p_residence_country text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country text,
  p_tax_residence_country text,
  p_domestic_or_foreign text,
  p_paypal_email text,
  p_preferred_currency text,
  p_user_confirmed_legal_responsibility boolean,
  p_user_confirmed_paypal_name_match boolean
) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_prize_tax_submission(
  p_award_id uuid,
  p_legal_name text,
  p_display_name text,
  p_residence_country text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country text,
  p_tax_residence_country text,
  p_domestic_or_foreign text,
  p_paypal_email text,
  p_preferred_currency text,
  p_user_confirmed_legal_responsibility boolean,
  p_user_confirmed_paypal_name_match boolean
) TO authenticated;

-- =============================================================================
-- C分類: 公開read-only RPCs (変更なし)
-- get_arena_overview, get_arena_detail, get_position_win_rates,
-- get_public_match_logs, get_public_profile, get_symmetry_group_win_rates
-- これらは意図的にanon EXECUTEを維持 (公開read-only設計)
-- =============================================================================
