-- =============================================================================
-- Master報酬制度改定 Phase 1 — Read RPC 拡張
-- get_arena_overview() と get_arena_detail() に
--   master_reward_amount_cents / master_reward_currency を追加する。
--
-- DB schema 変更なし（20260806230000 で追加済み）。
-- 既存フィールドはすべて維持。
-- commit / push / 本番 DB 適用禁止。
-- =============================================================================

-- =============================================================================
-- 1. get_arena_overview() — master_reward フィールド追加
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
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  SELECT jsonb_agg(arena_row ORDER BY (arena_row->>'display_order')::int)
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
      -- Phase 1: Master reward
      'master_reward_amount_cents', ad.master_reward_amount_cents,
      'master_reward_currency',     ad.master_reward_currency,
      -- 現在のMaster
      'current_master_user_id',            master_row.user_id,
      'current_master_display_name',       master_prof.display_name,
      'current_interim_master_user_id',    NULL::UUID,
      'current_interim_master_display_name', NULL::TEXT,
      -- 次回event
      'event_id',               next_event.id,
      'event_datetime',         next_event.scheduled_at,
      'entry_deadline',         next_event.scheduled_at - ((ad.entry_deadline_hours || ' hours')::INTERVAL),
      'event_status',           next_event.status,
      'entry_count',            COALESCE(entry_cnt.cnt, 0),
      -- 自分のentry
      'my_entry_status',        CASE
                                  WHEN v_uid IS NOT NULL AND next_event.id IS NOT NULL THEN (
                                    SELECT ent.status
                                    FROM arena_entries ent
                                    WHERE ent.arena_event_id = next_event.id
                                      AND ent.user_id = v_uid
                                    LIMIT 1
                                  )
                                  ELSE NULL
                                END,
      'my_entered_at',          CASE
                                  WHEN v_uid IS NOT NULL AND next_event.id IS NOT NULL THEN (
                                    SELECT ent2.entered_at
                                    FROM arena_entries ent2
                                    WHERE ent2.arena_event_id = next_event.id
                                      AND ent2.user_id = v_uid
                                    LIMIT 1
                                  )
                                  ELSE NULL
                                END,
      -- previous results pending
      'previous_results_pending', (
        SELECT EXISTS (
          SELECT 1
          FROM arena_events ae_prev
          JOIN arena_matches am_prev ON am_prev.arena_event_id = ae_prev.id
          WHERE ae_prev.arena_id = ad.id
            AND ae_prev.status = 'closed'
            AND am_prev.status NOT IN ('completed', 'cancelled')
        )
      )
    ) AS arena_row
    FROM arena_definitions ad
    -- 現在のMaster
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
    -- entry数
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS cnt
      FROM arena_entries ent
      WHERE ent.arena_event_id = next_event.id
        AND ent.status NOT IN ('withdrawn', 'disqualified')
    ) entry_cnt ON TRUE
    WHERE ad.is_active = TRUE
    ORDER BY ad.display_order ASC
  ) sub;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

GRANT EXECUTE ON FUNCTION get_arena_overview() TO anon, authenticated;

-- =============================================================================
-- 2. get_arena_detail(p_arena_id) — master_reward フィールド追加
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
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- Arena基本情報（Phase 1: master_reward フィールド追加）
  SELECT jsonb_build_object(
    'arena_id',                   ad.id,
    'code',                       ad.code,
    'display_name',               ad.display_name,
    'title_name',                 ad.title_name,
    'weekday',                    ad.weekday,
    'start_time_jst',             ad.start_time_jst,
    'entry_deadline_hours',       ad.entry_deadline_hours,
    'timer_config',               ad.timer_config,
    'master_reward_amount_cents', ad.master_reward_amount_cents,
    'master_reward_currency',     ad.master_reward_currency
  )
  INTO v_arena
  FROM arena_definitions ad
  WHERE ad.id = p_arena_id AND ad.is_active = TRUE;

  IF v_arena IS NULL THEN
    RETURN jsonb_build_object('error', 'arena_not_found');
  END IF;

  -- 現在のMaster / Interim Master
  SELECT jsonb_build_object(
    'current_master_user_id',               master_row.user_id,
    'current_master_display_name',          master_prof.display_name,
    'current_interim_master_user_id',       NULL::UUID,
    'current_interim_master_display_name',  NULL::TEXT
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

  -- 自分のmatch情報
  IF v_uid IS NOT NULL AND v_next_event IS NOT NULL THEN
    SELECT jsonb_build_object(
      'arena_match_id',         am.id,
      'official_match_id',      am.official_match_id,
      'match_no',               am.round,
      'round',                  am.round,
      'match_kind',             am.match_kind,
      'master_subtype',         am.master_subtype,
      'black_user_id',          am.black_user_id,
      'black_display_name',     bp.display_name,
      'white_user_id',          am.white_user_id,
      'white_display_name',     wp.display_name,
      'my_side',                CASE WHEN am.black_user_id = v_uid THEN 'black' ELSE 'white' END,
      'opponent_user_id',       CASE WHEN am.black_user_id = v_uid THEN am.white_user_id ELSE am.black_user_id END,
      'opponent_display_name',  CASE WHEN am.black_user_id = v_uid THEN wp.display_name ELSE bp.display_name END,
      'scheduled_start_at',     COALESCE(am.scheduled_start_at, ae_match.scheduled_at),
      'arena_match_status',     am.status,
      'official_match_status',  om.status,
      'online_game_id',         am.online_game_id
    )
    INTO v_my_match
    FROM arena_matches am
    JOIN arena_events ae_match ON ae_match.id = am.arena_event_id
    LEFT JOIN profiles bp ON bp.id = am.black_user_id
    LEFT JOIN profiles wp ON wp.id = am.white_user_id
    LEFT JOIN official_matches om ON om.id = am.official_match_id
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
    || jsonb_build_object('previous_results_pending',
         EXISTS (
           SELECT 1
           FROM arena_events ae_prev
           JOIN arena_matches am_prev ON am_prev.arena_event_id = ae_prev.id
           WHERE ae_prev.arena_id = p_arena_id
             AND ae_prev.status = 'closed'
             AND am_prev.status NOT IN ('completed', 'cancelled')
         )
       )
    || jsonb_build_object('top_ranking', COALESCE(v_top_ranking, '[]'::JSONB))
    || jsonb_build_object('recent_match_history', COALESCE(v_recent_matches, '[]'::JSONB))
    || jsonb_build_object('recent_master_history', COALESCE(v_recent_masters, '[]'::JSONB));

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_arena_detail(UUID) TO anon, authenticated;
