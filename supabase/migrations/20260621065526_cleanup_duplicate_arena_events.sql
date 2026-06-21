-- ============================================================
-- cleanup_duplicate_arena_events
--
-- 目的:
--   arena_events の重複生成ゴミ行（14件）を安全に削除し、
--   (arena_id, scheduled_at) UNIQUE 制約を追加する。
--
-- 削除条件（すべてを満たすもののみ対象）:
--   1. 同一 (arena_id, scheduled_at) に複数 event が存在する
--   2. そのグループ内で created_at が最古ではない（rn > 1）
--   3. matches_generated_at IS NULL
--   4. arena_entries が 0 件
--   5. arena_matches が 0 件
--   6. arena_match_history が 0 件
--   7. prize_awards が 0 件
--
-- 絶対削除禁止:
--   entries / matches / history / prize_awards が 1 件でも紐づく event
--   正規 event 4 件:
--     366e8c44-f1f7-47b8-b8b0-a6974365d1e7  (ELEPHANT 2026-06-13)
--     a8fba124-9793-4c88-945e-9f716ed7e964  (JAGUAR   2026-06-14)
--     4a8ba63c-9e62-4a3e-ae5f-eb43e921cdd0  (ELEPHANT 2026-06-20)
--     0ceab8f2-49f5-4356-b53e-438ca41deff7  (JAGUAR   2026-06-21)
--
-- 変更しないもの:
--   arena_entries / arena_matches / arena_match_history
--   arena_points / arena_master_history / prize_awards
--   admin_messages / official_matches
-- ============================================================

-- ============================================================
-- A. 重複 arena_events cleanup（関連データ 0 件のみ削除）
-- ============================================================

WITH duplicate_events AS (
  SELECT
    ae.id,
    ae.arena_id,
    ae.scheduled_at,
    ae.matches_generated_at,
    ae.created_at,
    row_number() OVER (
      PARTITION BY ae.arena_id, ae.scheduled_at
      ORDER BY ae.created_at ASC
    ) AS rn
  FROM arena_events ae
  WHERE (ae.arena_id, ae.scheduled_at) IN (
    SELECT arena_id, scheduled_at
    FROM arena_events
    GROUP BY arena_id, scheduled_at
    HAVING count(*) > 1
  )
),
safe_delete_candidates AS (
  SELECT de.id
  FROM duplicate_events de
  WHERE de.rn > 1
    AND de.matches_generated_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM arena_entries e
      WHERE e.arena_event_id = de.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM arena_matches m
      WHERE m.arena_event_id = de.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM arena_match_history h
      WHERE h.arena_event_id = de.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM prize_awards pa
      WHERE pa.source_arena_event_id = de.id
    )
)
DELETE FROM arena_events
WHERE id IN (SELECT id FROM safe_delete_candidates);

-- ============================================================
-- B. (arena_id, scheduled_at) UNIQUE INDEX 追加
--    cleanup 後に追加する（残存重複があれば CREATE 失敗で検知できる）
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS arena_events_arena_scheduled_uniq
  ON arena_events (arena_id, scheduled_at);
