-- ============================================================
-- admin_messages に source_id 列を追加
-- 目的: prize_awards 由来の通知の重複防止
--
-- source_id: prize_awards.id::text を格納する
--   NULL = 通常の運営メッセージ（影響なし）
--   非NULL = award由来通知（同一 source_id + target で重複チェック）
-- ============================================================

ALTER TABLE admin_messages
  ADD COLUMN IF NOT EXISTS source_id text DEFAULT NULL;

-- 重複防止インデックス（source_id IS NOT NULL の場合のみ）
CREATE UNIQUE INDEX IF NOT EXISTS admin_messages_source_id_target_uniq
  ON admin_messages (source_id, target)
  WHERE source_id IS NOT NULL;

-- コメント
COMMENT ON COLUMN admin_messages.source_id IS
  'award_id (uuid::text) など通知の元になったエンティティID。重複防止に使用。NULL = 通常の運営メッセージ。';
