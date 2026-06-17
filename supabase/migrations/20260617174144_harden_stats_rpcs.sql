-- security: harden stats RPCs to service_role only
-- 統計書き換え系7関数のEXECUTE権限を service_role のみに制限する
-- 修正前状態: authenticated=true, anon=false, service_role=true, postgres=true
-- 修正後状態: authenticated=false, anon=false, service_role=true, postgres=true

-- 1. batch_upsert_position_stats
REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batch_upsert_position_stats(text[], text, text[]) TO service_role;

-- 2. batch_upsert_sim_position_stats
REVOKE ALL ON FUNCTION public.batch_upsert_sim_position_stats(text[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_sim_position_stats(text[], text, text) FROM anon;
REVOKE ALL ON FUNCTION public.batch_upsert_sim_position_stats(text[], text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batch_upsert_sim_position_stats(text[], text, text) TO service_role;

-- 3. batch_upsert_symmetry_group_stats
REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batch_upsert_symmetry_group_stats(text[], text, text[]) TO service_role;

-- 4. delete_sim_batch (p_sim_batch_id text)
REVOKE ALL ON FUNCTION public.delete_sim_batch(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_sim_batch(text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_sim_batch(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_sim_batch(text) TO service_role;

-- 5. rebuild_position_stats_from_match_logs
REVOKE ALL ON FUNCTION public.rebuild_position_stats_from_match_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_position_stats_from_match_logs() FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_position_stats_from_match_logs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_position_stats_from_match_logs() TO service_role;

-- 6. rebuild_sim_position_stats
REVOKE ALL ON FUNCTION public.rebuild_sim_position_stats(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_sim_position_stats(text) FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_sim_position_stats(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_sim_position_stats(text) TO service_role;

-- 7. rebuild_symmetry_group_stats_from_match_logs
REVOKE ALL ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() FROM anon;
REVOKE ALL ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_symmetry_group_stats_from_match_logs() TO service_role;
