-- =============================================================================
-- 削除補正: JAGUAR の誤再戴冠 arena_master_history 3件を削除
--
-- 背景:
--   process_arena_results() の RECORD IS NOT NULL バグによる誤再戴冠で
--   7/5・8/2・8/9 のイベント時に誤った arena_master_history が生成された。
--   Pass 1 修正・Master 履歴補正・online_game 補正・Master 報酬 RPC は
--   本番反映済み（20260809000001〜000004）。
--   本 migration は残存する誤再戴冠 3 行を削除して DB を完全に整理する。
--
-- 削除対象 ID:
--   48a53222-6837-4f33-bd93-abdf3a3b7162  (7/5 誤再戴冠)
--   82c9fbfc-1f50-4fb0-b928-ec368a284743  (8/2 誤再戴冠)
--   e69e2865-11ad-45f0-a442-4a6e7e92a71d  (8/9 誤再戴冠)
--
-- 正当行 (6/28 現 Master):
--   64e4dd45-b587-4cb9-ac60-91f264ce5c0b  → dethroned_at=NULL のまま保持
--
-- 変更しないもの:
--   - arena_match_history
--   - arena_matches
--   - arena_points
--   - official_matches
--   - online_games
--   - prize_awards
--   - Elephant 等の他 Arena の arena_master_history
-- =============================================================================

BEGIN;

-- ============================================================
-- 事前検証1: 6/28 正当取得 history が存在し active であること
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM arena_master_history
    WHERE id = '64e4dd45-b587-4cb9-ac60-91f264ce5c0b'
      AND arena_id = '6c39ec76-ea5f-4cd6-b123-c4615392fc33'
      AND user_id = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'
      AND dethroned_at IS NULL
  ) THEN
    RAISE EXCEPTION '6/28 active Master history not found or already dethroned. Aborting.';
  END IF;
END $$;

-- ============================================================
-- 事前検証2: current_master_since_event_id が fb1d7a46... であること
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM arena_definitions
    WHERE id = '6c39ec76-ea5f-4cd6-b123-c4615392fc33'
      AND current_master_user_id = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'
      AND current_master_since_event_id = 'fb1d7a46-e801-4a61-8e92-ed3542c7b3a5'
  ) THEN
    RAISE EXCEPTION 'current_master_since_event_id is not fb1d7a46. Aborting.';
  END IF;
END $$;

-- ============================================================
-- 事前検証3: 削除対象 3 件が全条件を満たすこと
--   - arena_id / user_id 一致
--   - status = 'official'
--   - reason = 'defeated_master'
--   - source_arena_event_id が対象 3 件のいずれか
--   - dethroned_at IS NOT NULL（既に失冠済み）
-- ============================================================
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM arena_master_history
  WHERE id IN (
    '48a53222-6837-4f33-bd93-abdf3a3b7162',
    '82c9fbfc-1f50-4fb0-b928-ec368a284743',
    'e69e2865-11ad-45f0-a442-4a6e7e92a71d'
  )
    AND arena_id = '6c39ec76-ea5f-4cd6-b123-c4615392fc33'
    AND user_id  = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'
    AND status   = 'official'
    AND reason   = 'defeated_master'
    AND source_arena_event_id IN (
      '789ff25d-b35a-4f97-822f-9e97af667560',
      'b5be4bf3-8b31-48cd-9b3e-941d52d97b0b',
      '690b7ad9-d46d-4e11-9d87-724e1e39b505'
    )
    AND dethroned_at IS NOT NULL;

  IF v_count != 3 THEN
    RAISE EXCEPTION 'Expected 3 erroneous records matching all conditions, found %. Aborting.', v_count;
  END IF;
END $$;

-- ============================================================
-- 削除実行
-- ============================================================
DELETE FROM arena_master_history
WHERE id IN (
  '48a53222-6837-4f33-bd93-abdf3a3b7162',
  '82c9fbfc-1f50-4fb0-b928-ec368a284743',
  'e69e2865-11ad-45f0-a442-4a6e7e92a71d'
)
  AND arena_id = '6c39ec76-ea5f-4cd6-b123-c4615392fc33'
  AND user_id  = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'
  AND dethroned_at IS NOT NULL;

-- ============================================================
-- 後確認: 6/28 行が削除されていないこと
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM arena_master_history
    WHERE id = '64e4dd45-b587-4cb9-ac60-91f264ce5c0b'
      AND dethroned_at IS NULL
  ) THEN
    RAISE EXCEPTION '6/28 active Master history was accidentally deleted. Rolling back.';
  END IF;
END $$;

COMMIT;
