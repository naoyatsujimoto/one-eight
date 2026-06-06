-- =============================================================
-- Phase C-1.5: arena_entries.status 整理
-- withdrawn を削除し、no_match を追加する
--
-- 変更前許可値: pending, matched, withdrawn, disqualified
-- 変更後許可値: pending, matched, no_match, disqualified
--
-- 注意:
-- - 既存行に withdrawn が存在する場合は no_match に置換してからCHECKを変更する
-- - 現在の arena_entries は本番運用前のため通常は0件だが、安全のため確認・置換ステップを含む
-- =============================================================

BEGIN;

-- Step 1: withdrawn 行が存在する場合は no_match に置換
UPDATE arena_entries
SET    status     = 'no_match',
       updated_at = now()
WHERE  status = 'withdrawn';

-- Step 2: 既存の CHECK 制約を DROP
-- インライン定義の場合、PostgreSQL は自動命名する
-- 規則: {table}_{column}_check → arena_entries_status_check
ALTER TABLE arena_entries
  DROP CONSTRAINT IF EXISTS arena_entries_status_check;

-- Step 3: 新 CHECK 制約を追加（no_match を含む / withdrawn を除外）
ALTER TABLE arena_entries
  ADD CONSTRAINT arena_entries_status_check
    CHECK (status IN ('pending', 'matched', 'no_match', 'disqualified'));

COMMIT;
