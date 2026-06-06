-- =============================================================================
-- Official Arena Phase B-0 — raw table SELECT権限整理
-- Phase B-0: Revoke raw SELECT on arena read-RPC-only tables
-- Supabaseデフォルトまたは継承GRANTによるanon/authenticated SELECTを明示的に閉じる
-- RLS policy は作らない（policyなし状態を維持）
-- RPC / 他テーブルへの変更なし
-- =============================================================================

REVOKE SELECT ON arena_points FROM anon, authenticated;
REVOKE SELECT ON arena_match_history FROM anon, authenticated;
REVOKE SELECT ON arena_master_history FROM anon, authenticated;
