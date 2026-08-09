-- =============================================================================
-- 過去データ補正: JAGUAR Master戦 2026-08-09 — 誤ったtransferred処理の修正
--
-- 背景:
--   process_arena_results() の RECORD IS NOT NULL バグにより、
--   Master本人（black=e68a0189-ffe2-41c1-afd0-b0e60a47dd1f）が勝者であっても
--   master_effect='transferred' として処理されていた。
--   対象は 7/5・8/2・8/9 の3件の JAGUAR Master防衛戦。
--
-- 補正内容:
--   1. arena_matches.master_effect を transferred → defended へ変更（3件）
--   2. arena_match_history.master_effect を transferred → defended へ変更（3件）
--   3. 誤った再戴冠履歴（7/5以降に作成された同一ユーザーの再戴冠history）を整理
--   4. 6/28正当取得のarena_master_historyをactive（dethroned_at=NULL）に復元
--   5. arena_definitions.current_master_since_event_id を 6/28 event へ復元
--   6. 8/9 online_game（id=61974f0f）を finished へ更新
--
-- 安全条件（RAISE EXCEPTIONで厳密に検証）:
--   - arena_id = '6c39ec76-ea5f-4cd6-b123-c4615392fc33' が存在する
--   - 対象3件のarena_matchesのwinner_user_idが全件 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'
--   - current_master_user_id が 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f'
--   - 正当取得event 'fb1d7a46-e801-4a61-8e92-ed3542c7b3a5' が存在する
--   - online_game 'id=61974f0f-715e-4d7a-958b-feee955e9aa3' の status が 'playing'
--
-- 変更しないもの:
--   - ポイント（arena_points）
--   - 勝敗数・参加数・no_show_losses
--   - prize_awards（生成・支払いは行わない）
--   - Elephant等の他 Arena の master 履歴
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_arena_id        uuid := '6c39ec76-ea5f-4cd6-b123-c4615392fc33';
  v_master_user_id  uuid := 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f';
  v_legit_event_id  uuid := 'fb1d7a46-e801-4a61-8e92-ed3542c7b3a5';
  v_online_game_id  uuid := '61974f0f-715e-4d7a-958b-feee955e9aa3';

  -- 対象3件の arena_match id
  v_match_705       uuid := 'd36cbaca-67b0-4d5e-9b35-0d58d9bc366a';
  v_match_802       uuid := '724801fb-35ff-45d1-824c-f5de08b8807c';
  v_match_809       uuid := '29eb8a00-65eb-4a91-b755-80764acd9667';

  v_check_count     int;
  v_current_master  uuid;
  v_legit_history_id uuid;
  v_online_status   text;

  -- 誤った再戴冠history (7/5以降に作成されたもの)
  r_wrong_history   RECORD;
BEGIN

  -- ==========================================================================
  -- 事前条件チェック
  -- ==========================================================================

  -- 1. arena が存在する
  PERFORM 1 FROM arena_definitions WHERE id = v_arena_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: arena_id % が見つかりません', v_arena_id;
  END IF;

  -- 2. 対象3件のwinner_user_idが全件 v_master_user_id
  SELECT count(*) INTO v_check_count
  FROM arena_matches
  WHERE id IN (v_match_705, v_match_802, v_match_809)
    AND winner_user_id = v_master_user_id;
  IF v_check_count <> 3 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 対象3件のwinner_user_idが期待値と不一致 (found=%, expected=3)', v_check_count;
  END IF;

  -- 3. 現在のcurrent_master_user_idが v_master_user_id
  SELECT current_master_user_id INTO v_current_master
  FROM arena_definitions WHERE id = v_arena_id;
  IF v_current_master IS DISTINCT FROM v_master_user_id THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: current_master_user_id が期待値と不一致 (actual=%, expected=%)',
      v_current_master, v_master_user_id;
  END IF;

  -- 4. 正当取得event が存在する
  PERFORM 1 FROM arena_events WHERE id = v_legit_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 正当取得event % が見つかりません', v_legit_event_id;
  END IF;

  -- 5. online_game の status が 'playing'
  SELECT status INTO v_online_status FROM online_games WHERE id = v_online_game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: online_game % が見つかりません', v_online_game_id;
  END IF;
  IF v_online_status <> 'playing' THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: online_game % の status が playing ではありません (actual=%)',
      v_online_game_id, v_online_status;
  END IF;

  -- ==========================================================================
  -- 補正1: arena_matches.master_effect を defended へ変更
  -- ==========================================================================
  UPDATE arena_matches
  SET
    master_effect = 'defended',
    updated_at    = NOW()
  WHERE id IN (v_match_705, v_match_802, v_match_809)
    AND master_effect = 'transferred';

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  IF v_check_count <> 3 THEN
    RAISE EXCEPTION 'arena_matches 補正: 期待3件のところ %件 更新されました', v_check_count;
  END IF;

  -- ==========================================================================
  -- 補正2: arena_match_history.master_effect を defended へ変更
  -- ==========================================================================
  UPDATE arena_match_history
  SET master_effect = 'defended'
  WHERE arena_match_id IN (v_match_705, v_match_802, v_match_809)
    AND master_effect = 'transferred';

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  IF v_check_count <> 3 THEN
    RAISE EXCEPTION 'arena_match_history 補正: 期待3件のところ %件 更新されました', v_check_count;
  END IF;

  -- ==========================================================================
  -- 補正3: 6/28 正当取得 history を特定
  -- ==========================================================================
  SELECT id INTO v_legit_history_id
  FROM arena_master_history
  WHERE arena_id = v_arena_id
    AND user_id  = v_master_user_id
    AND status   = 'official'
    AND source_arena_event_id = v_legit_event_id
  ORDER BY crowned_at ASC
  LIMIT 1;

  IF v_legit_history_id IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: 6/28 正当取得の arena_master_history が見つかりません (arena_id=%, user_id=%, source_event_id=%)',
      v_arena_id, v_master_user_id, v_legit_event_id;
  END IF;

  -- ==========================================================================
  -- 補正4: 7/5以降に誤って作成された再戴冠historyを失冠させる
  --        対象: 正当history(v_legit_history_id)以外の同一ユーザー・同一arena の official history
  -- ==========================================================================
  -- 誤った再戴冠historyをログ出力してから処理
  FOR r_wrong_history IN
    SELECT id, crowned_at, source_arena_event_id
    FROM arena_master_history
    WHERE arena_id = v_arena_id
      AND user_id  = v_master_user_id
      AND status   = 'official'
      AND id       <> v_legit_history_id
    ORDER BY crowned_at ASC
  LOOP
    RAISE NOTICE '誤った再戴冠history を整理: id=%, crowned_at=%, source_event=%',
      r_wrong_history.id, r_wrong_history.crowned_at, r_wrong_history.source_arena_event_id;

    -- 既に失冠していなければ失冠させる（dethroned_atをNULLからNOW()へ）
    -- 既に失冠済みの場合も crowned_at=NOW()相当のダミー値に更新せず、そのままにする
    UPDATE arena_master_history
    SET dethroned_at = COALESCE(dethroned_at, NOW())
    WHERE id = r_wrong_history.id;
  END LOOP;

  -- ==========================================================================
  -- 補正5: 6/28 正当取得 history を active（dethroned_at=NULL）に復元
  --
  -- unique partial index（arena_master_active_official_uniq）が
  -- (arena_id, season) WHERE status='official' AND dethroned_at IS NULL
  -- のため、復元前に他のofficialがNULLになっていないことを確認
  -- ==========================================================================
  -- 補正4で誤った再戴冠を全件整理済みなので、正当historyのみdethroned_at=NULLにする
  UPDATE arena_master_history
  SET dethroned_at = NULL
  WHERE id = v_legit_history_id;

  -- ==========================================================================
  -- 補正6: arena_definitions.current_master_since_event_id を 6/28 event へ復元
  -- ==========================================================================
  UPDATE arena_definitions
  SET
    current_master_since_event_id  = v_legit_event_id,
    current_master_user_id         = v_master_user_id,  -- 変更不要だが明示的に維持
    current_interim_master_user_id = NULL,
    current_interim_since_event_id = NULL,
    updated_at = NOW()
  WHERE id = v_arena_id;

  -- ==========================================================================
  -- 補正7: 8/9 online_game を finished へ更新
  -- ==========================================================================
  UPDATE online_games
  SET
    status            = 'finished',
    winner            = 'black',
    end_reason        = 'forfeit_white',
    timeout_player    = NULL,
    turn_started_at   = NULL,
    server_updated_at = NOW(),
    updated_at        = NOW()
  WHERE id = v_online_game_id
    AND status = 'playing';

  GET DIAGNOSTICS v_check_count = ROW_COUNT;
  IF v_check_count <> 1 THEN
    RAISE EXCEPTION 'online_game 補正: 期待1件のところ %件 更新されました', v_check_count;
  END IF;

  -- ==========================================================================
  -- 最終確認ログ
  -- ==========================================================================
  RAISE NOTICE '補正完了:';
  RAISE NOTICE '  arena_id              = %', v_arena_id;
  RAISE NOTICE '  master_user_id        = %', v_master_user_id;
  RAISE NOTICE '  legit_event_id        = %', v_legit_event_id;
  RAISE NOTICE '  legit_history_id      = %', v_legit_history_id;
  RAISE NOTICE '  online_game_id        = %', v_online_game_id;

END;
$$;

COMMIT;
