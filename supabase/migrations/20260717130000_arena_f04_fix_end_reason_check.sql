-- =============================================================================
-- Arena Phase F-04: arena_matches.end_reason CHECK 不整合修正
--
-- 問題:
--   arena_matches_end_reason_check が許容する値と、
--   process_arena_results() 等が実際に書き込む値が不一致。
--
--   現行 CHECK 許容値:
--     'normal','timeout','no_show','draw_agreement','resign','forfeit','no_contest'
--
--   書き込みコードが使用する値:
--     'normal','timeout','resign','draw_agreement','draw','no_show','no_contest','cancelled'
--
--   不一致:
--     - 'draw'      : 書き込みあり / CHECK 未登録
--     - 'cancelled' : 書き込みあり / CHECK 未登録
--     - 'forfeit'   : CHECK 登録あり / 書き込みコードに存在しない
--
--   正しい許容セット（arena_match_history_end_reason_check と一致させる）:
--     'normal','timeout','resign','draw','draw_agreement','no_show','no_contest','cancelled'
--
-- 変更内容:
--   - arena_matches_end_reason_check を DROP して再作成
--   - NULL 許容（IS NULL OR）を維持
--
-- 変更しないもの:
--   - arena_match_history（変更なし）
--   - 他の CHECK, FK, INDEX, TRIGGER（変更なし）
--   - UPDATE/DELETE/INSERT なし
--   - process_arena_results 関数（変更なし）
-- =============================================================================

-- 安全確認: 新 CHECK で弾かれる既存値が 0 件であることを事前保証済み
-- SELECT count(*) FROM public.arena_matches
-- WHERE end_reason IS NOT NULL
-- AND end_reason NOT IN ('normal','timeout','resign','draw','draw_agreement','no_show','no_contest','cancelled');
-- → 0件

ALTER TABLE public.arena_matches
  DROP CONSTRAINT IF EXISTS arena_matches_end_reason_check;

ALTER TABLE public.arena_matches
  ADD CONSTRAINT arena_matches_end_reason_check
  CHECK (
    end_reason IS NULL OR end_reason IN (
      'normal',
      'timeout',
      'resign',
      'draw',
      'draw_agreement',
      'no_show',
      'no_contest',
      'cancelled'
    )
  );
