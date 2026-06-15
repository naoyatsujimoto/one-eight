-- =============================================================================
-- Official Arena Phase G-1 — Entry guard: previous event results must be processed
--
-- 目的:
--   前回Arenaの結果集計（arena_matchesのprocessed化）が完了するまで、
--   次回Arenaのエントリー受付を開始しない。
--
-- 修正対象:
--   1. get_arena_overview() — previous_results_pending フラグを追加
--   2. get_arena_detail()   — previous_results_pending フラグを追加
--   3. enter_arena_event()  — 前回Event未処理チェックをサーバー側に追加
--
-- 判定ロジック:
--   同一arena_idの直近前回Eventについて、
--   arena_matches に status NOT IN ('processed', 'cancelled') が残っていれば
--   previous_results_pending = true として next event のEntry不可。
--
--   注意:
--   - 前回Eventが存在しない（初回Arena）場合は previous_results_pending = false
--   - 前回Eventの arena_matches が0件の場合も false（Match未生成は不成立扱い）
--   - no_match / cancelled などの最終ステータスは processed or cancelled として扱う
--
-- DB schema 変更なし (ALTER TABLE なし)
-- =============================================================================


-- ============================================================
-- Helper: 前回Event未処理チェック用インラインSQLを使いまわすため、
--         各RPC内でサブクエリとして実装する。
-- ============================================================


-- ============================================================
-- 1. get_arena_overview() — previous_results_pending フラグ追加
-- ============================================================
CREATE OR REPLACE FUNCTION get_arena_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_result JSONB;
BEGIN
  -- 未ログイン時は NULL
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  SELECT jsonb_agg(arena_row ORDER BY arena_row->>'display_order')
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      -- Arena基本情報
      'arena_id',               ad.id,
      'code',                   ad.code,
      'display_name',           ad.display_name,
      'title_name',             ad.title_name,
      'weekday',                ad.weekday,
      'start_time_jst',         ad.start_time_jst,
      'entry_deadline_hours',   ad.entry_deadline_hours,
      'timer_config',           ad.timer_config,
      'display_order',          ad.display_order,
      -- 現在のMaster
      'current_master_user_id', master_row.user_id,
      'current_master_display_name', master_prof.display_name,
      -- 現在のInterim Master
      'current_interim_master_user_id', NULL::UUID,
      'current_interim_master_display_name', NULL::TEXT,
      -- 次回event (scheduled/open/closed の直近1件、scheduled_at >= now())
      'event_id',               next_event.id,
      'event_datetime',         next_event.scheduled_at,
      'entry_deadline',         (next_event.scheduled_at - (ad.entry_deadline_hours || ' hours')::INTERVAL),
      'event_status',           next_event.status,
      'entry_count',            COALESCE(next_event_entries.cnt, 0),
      -- 自分のentry (ログイン済みのみ)
      'my_entry_status',        my_entry.status,
      'my_entered_at',          my_entry.entered_at,
      -- 前回Event結果未処理フラグ
      -- next_eventが存在し、かつ同一Arenaの直近前回Eventに未processedのarena_matchがある場合true
      'previous_results_pending', CASE
        WHEN next_event.id IS NULL THEN FALSE
        ELSE COALESCE((
          SELECT TRUE
          FROM arena_events prev_ae
          WHERE prev_ae.arena_id = ad.id
            AND prev_ae.scheduled_at < next_event.scheduled_at
            AND prev_ae.status IN ('generated', 'matched', 'completed', 'closed', 'scheduled', 'open')
          ORDER BY prev_ae.scheduled_at DESC
          LIMIT 1
        ) AND EXISTS (
          SELECT 1
          FROM arena_matches prev_am
          JOIN arena_events prev_ae2 ON prev_ae2.id = prev_am.arena_event_id
          WHERE prev_ae2.arena_id = ad.id
            AND prev_ae2.scheduled_at < next_event.scheduled_at
            AND prev_ae2.id = (
              SELECT prev_ae3.id
              FROM arena_events prev_ae3
              WHERE prev_ae3.arena_id = ad.id
                AND prev_ae3.scheduled_at < next_event.scheduled_at
                AND prev_ae3.status IN ('generated', 'matched', 'completed', 'closed', 'scheduled', 'open')
              ORDER BY prev_ae3.scheduled_at DESC
              LIMIT 1
            )
            AND prev_am.status NOT IN ('processed', 'cancelled')
        ), FALSE)
      END
    ) AS arena_row
    FROM arena_definitions ad
    -- 現在のMaster: dethroned_at IS NULL, 最新crowned_at
    LEFT JOIN LATERAL (
      SELECT amh.user_id
      FROM arena_master_history amh
      WHERE amh.arena_id = ad.id
        AND amh.dethroned_at IS NULL
      ORDER BY amh.crowned_at DESC
      LIMIT 1
    ) master_row ON TRUE
    LEFT JOIN LATERAL (
      SELECT p.display_name
      FROM profiles p
      WHERE p.id = master_row.user_id
    ) master_prof ON TRUE
    -- 次回event: scheduled/open/closed で scheduled_at >= now() の直近1件
    LEFT JOIN LATERAL (
      SELECT ae.id, ae.scheduled_at, ae.status
      FROM arena_events ae
      WHERE ae.arena_id = ad.id
        AND ae.status IN ('scheduled', 'open', 'closed')
        AND ae.scheduled_at >= now()
      ORDER BY ae.scheduled_at ASC
      LIMIT 1
    ) next_event ON TRUE
    -- 次回eventのentry数
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS cnt
      FROM arena_entries ent
      WHERE ent.arena_event_id = next_event.id
        AND ent.status NOT IN ('withdrawn', 'disqualified')
    ) next_event_entries ON next_event.id IS NOT NULL
    -- 自分のentry (ログイン時のみ)
    LEFT JOIN LATERAL (
      SELECT ent2.status, ent2.entered_at
      FROM arena_entries ent2
      WHERE ent2.arena_event_id = next_event.id
        AND ent2.user_id = v_uid
        AND v_uid IS NOT NULL
      LIMIT 1
    ) my_entry ON TRUE
    WHERE ad.is_active = TRUE
  ) sub;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION get_arena_overview() TO anon, authenticated;


-- ============================================================
-- 2. get_arena_detail() — previous_results_pending フラグ追加
--    (E-4 の内容を継承し、previous_results_pending を追加)
-- ============================================================
CREATE OR REPLACE FUNCTION get_arena_detail(p_arena_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_result JSONB;
  v_arena  JSONB;
  v_master JSONB;
  v_next_event JSONB;
  v_next_event_id UUID;
  v_next_event_scheduled_at TIMESTAMPTZ;
  v_my_match JSONB;
  v_top_ranking JSONB;
  v_recent_matches JSONB;
  v_recent_masters JSONB;
  v_previous_results_pending BOOLEAN;
  v_prev_event_id UUID;
BEGIN
  -- 未ログイン時は NULL
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- Arena基本情報
  SELECT jsonb_build_object(
    'arena_id',             ad.id,
    'code',                 ad.code,
    'display_name',         ad.display_name,
    'title_name',           ad.title_name,
    'weekday',              ad.weekday,
    'start_time_jst',       ad.start_time_jst,
    'entry_deadline_hours', ad.entry_deadline_hours,
    'timer_config',         ad.timer_config
  )
  INTO v_arena
  FROM arena_definitions ad
  WHERE ad.id = p_arena_id AND ad.is_active = TRUE;

  IF v_arena IS NULL THEN
    RETURN jsonb_build_object('error', 'arena_not_found');
  END IF;

  -- 現在のMaster / Interim Master
  SELECT jsonb_build_object(
    'current_master_user_id',                 master_row.user_id,
    'current_master_display_name',            master_prof.display_name,
    'current_interim_master_user_id',         NULL::UUID,
    'current_interim_master_display_name',    NULL::TEXT
  )
  INTO v_master
  FROM (
    SELECT amh.user_id
    FROM arena_master_history amh
    WHERE amh.arena_id = p_arena_id
      AND amh.dethroned_at IS NULL
    ORDER BY amh.crowned_at DESC
    LIMIT 1
  ) master_row
  LEFT JOIN LATERAL (
    SELECT p.display_name
    FROM profiles p
    WHERE p.id = master_row.user_id
  ) master_prof ON TRUE;

  -- Masterが存在しない場合のデフォルト
  IF v_master IS NULL THEN
    v_master := jsonb_build_object(
      'current_master_user_id', NULL,
      'current_master_display_name', NULL,
      'current_interim_master_user_id', NULL,
      'current_interim_master_display_name', NULL
    );
  END IF;

  -- 次回event: scheduled/open/closed で scheduled_at >= now() の直近1件
  SELECT
    ae.id,
    ae.scheduled_at,
    jsonb_build_object(
      'event_id',       ae.id,
      'event_datetime', ae.scheduled_at,
      'entry_deadline', ae.scheduled_at - ((ad_inner.entry_deadline_hours || ' hours')::INTERVAL),
      'event_status',   ae.status,
      'entry_count',    COALESCE(entry_cnt.cnt, 0)
    )
  INTO v_next_event_id, v_next_event_scheduled_at, v_next_event
  FROM arena_events ae
  JOIN arena_definitions ad_inner ON ad_inner.id = ae.arena_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS cnt
    FROM arena_entries ent
    WHERE ent.arena_event_id = ae.id
      AND ent.status NOT IN ('withdrawn', 'disqualified')
  ) entry_cnt ON TRUE
  WHERE ae.arena_id = p_arena_id
    AND ae.status IN ('scheduled', 'open', 'closed')
    AND ae.scheduled_at >= now()
  ORDER BY ae.scheduled_at ASC
  LIMIT 1;

  -- -----------------------------------------------------------------------
  -- 前回Event結果未処理フラグの計算
  -- next_eventが存在する場合のみチェック。存在しない場合は false。
  -- 直近前回Eventの arena_matches に未processed が残っているか判定。
  -- -----------------------------------------------------------------------
  v_previous_results_pending := FALSE;

  IF v_next_event_id IS NOT NULL THEN
    -- 直近前回Eventを取得
    SELECT prev_ae.id
    INTO v_prev_event_id
    FROM arena_events prev_ae
    WHERE prev_ae.arena_id = p_arena_id
      AND prev_ae.scheduled_at < v_next_event_scheduled_at
      AND prev_ae.status IN ('generated', 'matched', 'completed', 'closed', 'scheduled', 'open')
    ORDER BY prev_ae.scheduled_at DESC
    LIMIT 1;

    -- 前回Eventに未processedのarena_matchが残っているか
    IF v_prev_event_id IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM arena_matches prev_am
        WHERE prev_am.arena_event_id = v_prev_event_id
          AND prev_am.status NOT IN ('processed', 'cancelled')
      )
      INTO v_previous_results_pending;
    END IF;
  END IF;

  -- -----------------------------------------------------------------------
  -- 自分のmatch情報 (ペアリング済みの場合のみ)
  -- -----------------------------------------------------------------------
  IF v_uid IS NOT NULL AND v_next_event_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      -- arena_match識別
      'arena_match_id',         am.id,
      -- official_matches.id (Enter Match に必要)
      'official_match_id',      am.official_match_id,
      -- 既存互換: match_no は round の別名として維持
      'match_no',               am.round,
      'round',                  am.round,
      -- 対局種別
      'match_kind',             am.match_kind,
      'master_subtype',         am.master_subtype,
      -- 参加者
      'black_user_id',          am.black_user_id,
      'black_display_name',     bp.display_name,
      'white_user_id',          am.white_user_id,
      'white_display_name',     wp.display_name,
      -- 自分の手番
      'my_side',                CASE WHEN am.black_user_id = v_uid THEN 'black' ELSE 'white' END,
      -- 相手
      'opponent_user_id',       CASE WHEN am.black_user_id = v_uid THEN am.white_user_id ELSE am.black_user_id END,
      'opponent_display_name',  CASE WHEN am.black_user_id = v_uid THEN wp.display_name ELSE bp.display_name END,
      -- スケジュール
      'scheduled_start_at',     COALESCE(am.scheduled_start_at, ae_match.scheduled_at),
      -- ステータス
      'arena_match_status',     am.status,
      'official_match_status',  om.status,
      -- オンラインゲームID
      'online_game_id',         am.online_game_id
    )
    INTO v_my_match
    FROM arena_matches am
    JOIN arena_events ae_match ON ae_match.id = am.arena_event_id
    LEFT JOIN profiles bp ON bp.id = am.black_user_id
    LEFT JOIN profiles wp ON wp.id = am.white_user_id
    LEFT JOIN official_matches om ON om.id = am.official_match_id
    WHERE am.arena_event_id = v_next_event_id
      AND (am.black_user_id = v_uid OR am.white_user_id = v_uid)
      AND am.status NOT IN ('cancelled')
    ORDER BY am.created_at DESC
    LIMIT 1;
  END IF;

  -- top ranking (arena_points 上位10件)
  SELECT jsonb_agg(ranking_row ORDER BY ranking_row->>'points' DESC)
  INTO v_top_ranking
  FROM (
    SELECT jsonb_build_object(
      'user_id',        ap.user_id,
      'display_name',   rp.display_name,
      'points',         ap.points,
      'wins',           ap.win_count,
      'losses',         ap.loss_count,
      'no_show_losses', 0,
      'participations', 0,
      'matches_played', ap.win_count + ap.loss_count + ap.draw_count
    ) AS ranking_row
    FROM arena_points ap
    LEFT JOIN profiles rp ON rp.id = ap.user_id
    WHERE ap.arena_id = p_arena_id
    ORDER BY ap.points DESC
    LIMIT 10
  ) ranked;

  -- recent match history (最新10件)
  SELECT jsonb_agg(hist_row ORDER BY (hist_row->>'played_at') DESC)
  INTO v_recent_matches
  FROM (
    SELECT jsonb_build_object(
      'event_datetime',       ae_hist.scheduled_at,
      'match_no',             am_hist.round,
      'match_kind',           am_hist.match_kind,
      'black_display_name',   bp_hist.display_name,
      'white_display_name',   wp_hist.display_name,
      'winner_display_name',  CASE
                                WHEN am_hist.result = 'black' THEN bp_hist.display_name
                                WHEN am_hist.result = 'white' THEN wp_hist.display_name
                                ELSE NULL
                              END,
      'end_reason',           am_hist.result,
      'black_point_delta',    COALESCE(amh_hist.black_point_delta, 0),
      'white_point_delta',    COALESCE(amh_hist.white_point_delta, 0),
      'master_effect',        NULL::TEXT,
      'played_at',            am_hist.completed_at
    ) AS hist_row
    FROM arena_matches am_hist
    JOIN arena_events ae_hist ON ae_hist.id = am_hist.arena_event_id
    LEFT JOIN profiles bp_hist ON bp_hist.id = am_hist.black_user_id
    LEFT JOIN profiles wp_hist ON wp_hist.id = am_hist.white_user_id
    LEFT JOIN arena_match_history amh_hist ON amh_hist.arena_match_id = am_hist.id
    WHERE ae_hist.arena_id = p_arena_id
      AND am_hist.status = 'completed'
    ORDER BY am_hist.completed_at DESC
    LIMIT 10
  ) hist_sub;

  -- recent master history (最新10件)
  SELECT jsonb_agg(mhist_row ORDER BY (mhist_row->>'started_at') DESC)
  INTO v_recent_masters
  FROM (
    SELECT jsonb_build_object(
      'user_id',      amh_rec.user_id,
      'display_name', mhist_prof.display_name,
      'status',       CASE WHEN amh_rec.dethroned_at IS NULL THEN 'current' ELSE 'former' END,
      'reason',       NULL::TEXT,
      'started_at',   amh_rec.crowned_at,
      'ended_at',     amh_rec.dethroned_at
    ) AS mhist_row
    FROM arena_master_history amh_rec
    LEFT JOIN profiles mhist_prof ON mhist_prof.id = amh_rec.user_id
    WHERE amh_rec.arena_id = p_arena_id
    ORDER BY amh_rec.crowned_at DESC
    LIMIT 10
  ) mhist_sub;

  -- 結果を組み立てて返す
  v_result := v_arena
    || v_master
    || jsonb_build_object('next_event', v_next_event)
    || jsonb_build_object('my_match', v_my_match)
    || jsonb_build_object('previous_results_pending', v_previous_results_pending)
    || jsonb_build_object('my_entry_status',
         CASE WHEN v_uid IS NOT NULL AND v_next_event_id IS NOT NULL THEN (
           SELECT ent_me.status
           FROM arena_entries ent_me
           WHERE ent_me.arena_event_id = v_next_event_id
             AND ent_me.user_id = v_uid
           LIMIT 1
         ) ELSE NULL END
       )
    || jsonb_build_object('my_entered_at',
         CASE WHEN v_uid IS NOT NULL AND v_next_event_id IS NOT NULL THEN (
           SELECT ent_me2.entered_at
           FROM arena_entries ent_me2
           WHERE ent_me2.arena_event_id = v_next_event_id
             AND ent_me2.user_id = v_uid
           LIMIT 1
         ) ELSE NULL END
       )
    || jsonb_build_object('top_ranking', COALESCE(v_top_ranking, '[]'::JSONB))
    || jsonb_build_object('recent_match_history', COALESCE(v_recent_matches, '[]'::JSONB))
    || jsonb_build_object('recent_master_history', COALESCE(v_recent_masters, '[]'::JSONB));

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_arena_detail(UUID) TO anon, authenticated;


-- ============================================================
-- 3. enter_arena_event() — 前回Event未処理チェックを追加
--    既存のチェック順序を維持し、pro_required チェックの直後に追加する。
-- ============================================================
CREATE OR REPLACE FUNCTION enter_arena_event(p_arena_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid            UUID;
  v_event          arena_events%ROWTYPE;
  v_entry_deadline TIMESTAMPTZ;
  v_is_pro         BOOLEAN;
  v_entry_id       UUID;
  v_entered_at     TIMESTAMPTZ;
  v_prev_event_id  UUID;
  v_has_unprocessed BOOLEAN;
BEGIN
  -- 1. 認証チェック
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  -- 2. event存在確認 (FOR UPDATE: 同時実行対策)
  SELECT ae.*
  INTO v_event
  FROM arena_events ae
  WHERE ae.id = p_arena_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  -- 3. event status チェック
  IF v_event.status != 'scheduled' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'event_not_open',
      'status', v_event.status
    );
  END IF;

  -- 4. entry deadline チェック
  SELECT v_event.scheduled_at - ((ad.entry_deadline_hours || ' hours')::INTERVAL)
  INTO v_entry_deadline
  FROM arena_definitions ad
  WHERE ad.id = v_event.arena_id;

  IF now() >= v_entry_deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'entry_deadline_passed');
  END IF;

  -- 5. Pro チェック
  SELECT (
    p.plan = 'pro'
    AND (
      (p.subscription_status = 'active' AND (p.current_period_end IS NULL OR p.current_period_end > now()))
      OR
      (p.subscription_status = 'canceled' AND p.current_period_end IS NOT NULL AND p.current_period_end > now())
    )
  )
  INTO v_is_pro
  FROM profiles p
  WHERE p.id = v_uid;

  IF v_is_pro IS NULL OR v_is_pro = FALSE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pro_required');
  END IF;

  -- 6. 前回Event結果未処理チェック
  --    同一Arenaの直近前回Eventに未processed の arena_match が残っていれば Entry拒否
  SELECT prev_ae.id
  INTO v_prev_event_id
  FROM arena_events prev_ae
  WHERE prev_ae.arena_id = v_event.arena_id
    AND prev_ae.scheduled_at < v_event.scheduled_at
    AND prev_ae.status IN ('generated', 'matched', 'completed', 'closed', 'scheduled', 'open')
  ORDER BY prev_ae.scheduled_at DESC
  LIMIT 1;

  IF v_prev_event_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM arena_matches prev_am
      WHERE prev_am.arena_event_id = v_prev_event_id
        AND prev_am.status NOT IN ('processed', 'cancelled')
    )
    INTO v_has_unprocessed;

    IF v_has_unprocessed THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'previous_results_pending');
    END IF;
  END IF;

  -- 7. duplicate entry チェック + INSERT (UNIQUE violation でも安全に返す)
  BEGIN
    INSERT INTO arena_entries (arena_event_id, user_id)
    VALUES (p_arena_event_id, v_uid)
    RETURNING id, entered_at
    INTO v_entry_id, v_entered_at;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_entered');
  END;

  -- 8. 成功レスポンス
  RETURN jsonb_build_object(
    'ok',             true,
    'entry_id',       v_entry_id,
    'arena_event_id', p_arena_event_id,
    'entered_at',     v_entered_at
  );
END;
$$;

-- GRANTは維持 (authenticated のみ)
REVOKE EXECUTE ON FUNCTION enter_arena_event(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION enter_arena_event(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION enter_arena_event(UUID) TO authenticated;
