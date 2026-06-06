-- =============================================================================
-- Official Arena Phase B-1 — read RPC基盤 (3本)
-- get_arena_overview()        : Arena一覧画面用 (anon/authenticated)
-- get_arena_detail(p_arena_id): Arena詳細画面用 (anon/authenticated)
-- get_my_arena_titles()       : Profile/Stats用 自分の現在保持称号 (authenticated only)
-- =============================================================================
-- 方針:
--   - すべて SECURITY DEFINER / SET search_path = public
--   - DB更新なし (read only)
--   - profiles schema 変更なし
--   - RLS policy 追加なし
--   - arena_points / arena_match_history / arena_master_history に直接SELECT GRANTを戻さない
--   - arena_entries INSERT 許可なし
--   - official_matches 変更なし
-- =============================================================================

-- =============================================================================
-- 1. get_arena_overview()
--    全Arena一覧 + 現在Master/Interim Master + 次回event + 自分のentry
-- =============================================================================
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
      -- 現在のMaster (dethroned_at IS NULL, crowned last)
      'current_master_user_id', master_row.user_id,
      'current_master_display_name', master_prof.display_name,
      -- 現在のInterim Master (将来拡張用: 現フェーズではNULL)
      'current_interim_master_user_id', NULL::UUID,
      'current_interim_master_display_name', NULL::TEXT,
      -- 次回event (scheduled/open の直近1件)
      'event_id',               next_event.id,
      'event_datetime',         next_event.scheduled_at,
      'entry_deadline',         (next_event.scheduled_at - (ad.entry_deadline_hours || ' hours')::INTERVAL),
      'event_status',           next_event.status,
      'entry_count',            COALESCE(next_event_entries.cnt, 0),
      -- 自分のentry (ログイン済みのみ)
      'my_entry_status',        my_entry.status,
      'my_entered_at',          my_entry.entered_at
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
    -- 次回event
    LEFT JOIN LATERAL (
      SELECT ae.id, ae.scheduled_at, ae.status
      FROM arena_events ae
      WHERE ae.arena_id = ad.id
        AND ae.status IN ('scheduled', 'open')
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

-- =============================================================================
-- 2. get_arena_detail(p_arena_id uuid)
--    Arena詳細: 基本情報 + Master + 次回event + 自分のmatch + top ranking + 対戦履歴 + master履歴
-- =============================================================================
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
  v_my_match JSONB;
  v_top_ranking JSONB;
  v_recent_matches JSONB;
  v_recent_masters JSONB;
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

  -- 次回event
  SELECT jsonb_build_object(
    'event_id',       ae.id,
    'event_datetime', ae.scheduled_at,
    'entry_deadline', ae.scheduled_at - ((ad_inner.entry_deadline_hours || ' hours')::INTERVAL),
    'event_status',   ae.status,
    'entry_count',    COALESCE(entry_cnt.cnt, 0)
  )
  INTO v_next_event
  FROM arena_events ae
  JOIN arena_definitions ad_inner ON ad_inner.id = ae.arena_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS cnt
    FROM arena_entries ent
    WHERE ent.arena_event_id = ae.id
      AND ent.status NOT IN ('withdrawn', 'disqualified')
  ) entry_cnt ON TRUE
  WHERE ae.arena_id = p_arena_id
    AND ae.status IN ('scheduled', 'open')
    AND ae.scheduled_at >= now()
  ORDER BY ae.scheduled_at ASC
  LIMIT 1;

  -- 自分のmatch情報 (ペアリング済みの場合のみ)
  IF v_uid IS NOT NULL AND v_next_event IS NOT NULL THEN
    SELECT jsonb_build_object(
      'match_no',             am.round,
      'match_kind',           NULL::TEXT,
      'master_subtype',       NULL::TEXT,
      'black_user_id',        am.black_user_id,
      'black_display_name',   bp.display_name,
      'white_user_id',        am.white_user_id,
      'white_display_name',   wp.display_name,
      'my_side',              CASE WHEN am.black_user_id = v_uid THEN 'black' ELSE 'white' END,
      'scheduled_start_at',   ae_match.scheduled_at,
      'official_match_id',    am.online_game_id,
      'arena_match_status',   am.status
    )
    INTO v_my_match
    FROM arena_matches am
    JOIN arena_events ae_match ON ae_match.id = am.arena_event_id
    LEFT JOIN profiles bp ON bp.id = am.black_user_id
    LEFT JOIN profiles wp ON wp.id = am.white_user_id
    WHERE am.arena_event_id = (v_next_event->>'event_id')::UUID
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
      'match_kind',           NULL::TEXT,
      'black_display_name',   bp_hist.display_name,
      'white_display_name',   wp_hist.display_name,
      'winner_display_name',  CASE
                                WHEN am_hist.result = 'black' THEN bp_hist.display_name
                                WHEN am_hist.result = 'white' THEN wp_hist.display_name
                                ELSE NULL
                              END,
      'end_reason',           am_hist.result,
      'black_point_delta',    COALESCE(black_delta.points_delta, 0),
      'white_point_delta',    COALESCE(white_delta.points_delta, 0),
      'master_effect',        NULL::TEXT,
      'played_at',            am_hist.completed_at
    ) AS hist_row
    FROM arena_matches am_hist
    JOIN arena_events ae_hist ON ae_hist.id = am_hist.arena_event_id
    LEFT JOIN profiles bp_hist ON bp_hist.id = am_hist.black_user_id
    LEFT JOIN profiles wp_hist ON wp_hist.id = am_hist.white_user_id
    -- black側のpoints_delta
    LEFT JOIN LATERAL (
      SELECT amh_b.points_delta
      FROM arena_match_history amh_b
      WHERE amh_b.arena_match_id = am_hist.id
        AND amh_b.user_id = am_hist.black_user_id
      LIMIT 1
    ) black_delta ON TRUE
    -- white側のpoints_delta
    LEFT JOIN LATERAL (
      SELECT amh_w.points_delta
      FROM arena_match_history amh_w
      WHERE amh_w.arena_match_id = am_hist.id
        AND amh_w.user_id = am_hist.white_user_id
      LIMIT 1
    ) white_delta ON TRUE
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
    || jsonb_build_object('my_entry_status',
         CASE WHEN v_uid IS NOT NULL AND v_next_event IS NOT NULL THEN (
           SELECT ent_me.status
           FROM arena_entries ent_me
           WHERE ent_me.arena_event_id = (v_next_event->>'event_id')::UUID
             AND ent_me.user_id = v_uid
           LIMIT 1
         ) ELSE NULL END
       )
    || jsonb_build_object('my_entered_at',
         CASE WHEN v_uid IS NOT NULL AND v_next_event IS NOT NULL THEN (
           SELECT ent_me2.entered_at
           FROM arena_entries ent_me2
           WHERE ent_me2.arena_event_id = (v_next_event->>'event_id')::UUID
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

-- =============================================================================
-- 3. get_my_arena_titles()
--    自分が現在保持しているArena称号一覧 (authenticated専用)
-- =============================================================================
CREATE OR REPLACE FUNCTION get_my_arena_titles()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_result JSONB;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  SELECT jsonb_agg(title_row ORDER BY (title_row->>'started_at') DESC)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'arena_id',     amh.arena_id,
      'arena_code',   ad.code,
      'title_name',   amh.title_name,
      'status',       'official',
      'started_at',   amh.crowned_at
    ) AS title_row
    FROM arena_master_history amh
    JOIN arena_definitions ad ON ad.id = amh.arena_id
    WHERE amh.user_id = v_uid
      AND amh.dethroned_at IS NULL
    ORDER BY amh.crowned_at DESC
  ) titles_sub;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

-- authenticated のみ EXECUTE 許可 (anon には付与しない)
GRANT EXECUTE ON FUNCTION get_my_arena_titles() TO authenticated;
