-- =============================================================================
-- official_matches_result_sync: online_games 終局を official_matches に反映する Trigger
--
-- 問題: claim_timeout / apply_online_move が online_games.status='finished' にしても
--       official_matches.status が 'live' のまま残り、User Page で LIVE / Re-enter Match と表示される
--
-- 修正方針: 方針B（PostgreSQL trigger）を採用
--   online_games.status が 'finished' になった瞬間に
--   online_game_id で紐付く official_matches を completed に更新する
--
-- 採用理由:
--   - claim_timeout / apply_online_move の両パスを一括カバーできる
--   - 将来 resign 等の終局パスが追加されても自動で対応できる
--   - RPC 2箇所を個別に編集するリスクがない
--
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- 冪等設計: DROP IF EXISTS / CREATE OR REPLACE 使用（再実行可能）
-- =============================================================================


-- =============================================================================
-- 1. Trigger 関数: sync_official_match_on_game_finish
--    online_games の status が 'finished' に変化した時に呼ばれる
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_official_match_on_game_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match_winner    text;
  v_match_result    text;
  v_match_end_reason text;
BEGIN
  -- status が 'finished' に変化した時だけ処理
  IF NEW.status = 'finished' AND (OLD.status IS DISTINCT FROM 'finished') THEN

    -- online_games.winner ('black'/'white'/'draw') を
    -- official_matches.winner ('black_user'/'white_user'/'draw') 形式に変換
    v_match_winner := CASE NEW.winner
      WHEN 'black' THEN 'black_user'
      WHEN 'white' THEN 'white_user'
      WHEN 'draw'  THEN 'draw'
      ELSE NULL
    END;

    -- official_matches.result ('black'/'white'/'draw')
    v_match_result := CASE NEW.winner
      WHEN 'black' THEN 'black'
      WHEN 'white' THEN 'white'
      WHEN 'draw'  THEN 'draw'
      ELSE NULL
    END;

    -- end_reason: online_games.end_reason をそのまま使用
    -- ('normal' / 'timeout' / 'resign' 等)
    v_match_end_reason := NEW.end_reason;

    -- online_game_id で紐付く official_matches を completed に更新
    UPDATE official_matches
    SET
      status     = 'completed',
      winner     = v_match_winner,
      result     = v_match_result,
      end_reason = v_match_end_reason,
      updated_at = clock_timestamp()
    WHERE online_game_id = NEW.id
      AND status NOT IN ('completed', 'cancelled', 'forfeited');

  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- 2. Trigger: after_online_game_finish
--    AFTER UPDATE on online_games — status が変化した行のみ対象
-- =============================================================================

DROP TRIGGER IF EXISTS after_online_game_finish ON online_games;

CREATE TRIGGER after_online_game_finish
  AFTER UPDATE OF status ON online_games
  FOR EACH ROW
  EXECUTE FUNCTION sync_official_match_on_game_finish();


-- =============================================================================
-- 確認クエリ（実行後に状態確認）
-- =============================================================================
-- -- Trigger 確認
-- SELECT trigger_name, event_manipulation, event_object_table, action_timing
-- FROM information_schema.triggers
-- WHERE trigger_name = 'after_online_game_finish';
--
-- -- Trigger 関数確認
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name = 'sync_official_match_on_game_finish';
--
-- -- 既存の LIVE のまま残っている公式戦を手動で completed に更新する場合:
-- -- (Naoya が現在ある不整合レコードを修正するために実行する)
-- UPDATE official_matches om
-- SET
--   status     = 'completed',
--   winner     = CASE og.winner
--                  WHEN 'black' THEN 'black_user'
--                  WHEN 'white' THEN 'white_user'
--                  WHEN 'draw'  THEN 'draw'
--                  ELSE NULL
--                END,
--   result     = CASE og.winner
--                  WHEN 'black' THEN 'black'
--                  WHEN 'white' THEN 'white'
--                  WHEN 'draw'  THEN 'draw'
--                  ELSE NULL
--                END,
--   end_reason = og.end_reason,
--   updated_at = now()
-- FROM online_games og
-- WHERE om.online_game_id = og.id
--   AND og.status = 'finished'
--   AND om.status NOT IN ('completed', 'cancelled', 'forfeited');
