-- =============================================================================
-- fix_arena_rpc_regression.sql
-- ONE EIGHT — Arena RPC 退行修正
--
-- 問題:
--   20260806230002_master_reward_read_rpcs.sql が
--   get_arena_overview / get_arena_detail を古い定義で上書きし、以下が失われた:
--     1. top_ranking: arena_match_history 直近90日集計 → arena_points に後退
--     2. top_ranking: 現在の active Master を除外 → 除外なし に後退
--     3. next_event: status IN ('scheduled','open','closed') → 'closed'欠落 に後退
--     4. previous_results_pending: 直近前回Event基準判定 → 単純closed判定 に後退
--     5. v_next_event_id / v_next_event_scheduled_at 変数消失
--     6. v_current_master_uid 変数消失
--
-- 修正方針:
--   20260624020000_arena_ranking_exclude_current_master.sql を正とし、
--   master_reward_amount_cents / master_reward_currency の2フィールドのみ統合する。
--   get_arena_overview は 20260615103435_arena_phase_g1_entry_guard.sql を正とし、
--   同2フィールドを追加する。
--   既存migrationは変更・rollbackしない。
--
-- DB schema 変更なし（ALTER TABLE なし）。
-- =============================================================================

-- =============================================================================
-- 1. get_arena_overview() — 正しい仕様へ復元 + master_reward フィールド追加
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
      -- Phase 1: Master reward（20260806230002 で追加されたフィールドを維持）
      'master_reward_amount_cents', ad.master_reward_amount_cents,
      'master_reward_currency',     ad.master_reward_currency,
      -- 現在のMaster
      'current_master_user_id', master_row.user_id,
      'current_master_display_name', master_prof.display_name,
      -- 現在のInterim Master（将来拡張用）
      'current_interim_master_user_id', NULL::UUID,
      'current_interim_master_display_name', NULL::TEXT,
      -- 次回event（scheduled/open/closed の直近1件、scheduled_at >= now()）
      'event_id',               next_event.id,
      'event_datetime',         next_event.scheduled_at,
      'entry_deadline',         (next_event.scheduled_at - (ad.entry_deadline_hours || ' hours')::INTERVAL),
      'event_status',           next_event.status,
      'entry_count',            COALESCE(next_event_entries.cnt, 0),
      -- 自分のentry（ログイン済みのみ）
      'my_entry_status',        my_entry.status,
      'my_entered_at',          my_entry.entered_at,
      -- 前回Event結果未処理フラグ（直近前回Event基準）
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
    -- 次回event: scheduled/open/closed で scheduled_at >= now()
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
    -- 自分のentry
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
-- 2. get_arena_detail(p_arena_id) — 正しい仕様へ復元 + master_reward フィールド追加
-- =============================================================================
CREATE OR REPLACE FUNCTION get_arena_detail(p_arena_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid                    UUID;
  v_result                 JSONB;
  v_arena                  JSONB;
  v_master                 JSONB;
  v_next_event             JSONB;
  v_next_event_id          UUID;
  v_next_event_scheduled_at TIMESTAMPTZ;
  v_my_match               JSONB;
  v_top_ranking            JSONB;
  v_recent_matches         JSONB;
  v_recent_masters         JSONB;
  v_previous_results_pending BOOLEAN;
  v_prev_event_id          UUID;
  v_current_master_uid     UUID;
BEGIN
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

  -- Arena基本情報（master_reward フィールド追加）
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

  -- 現在のMaster user_id を取得（ランキング除外に使用）
  SELECT amh.user_id
  INTO v_current_master_uid
  FROM arena_master_history amh
  WHERE amh.arena_id = p_arena_id
    AND amh.dethroned_at IS NULL
  ORDER BY amh.crowned_at DESC
  LIMIT 1;

  -- 現在のMaster 表示情報
  SELECT jsonb_build_object(
    'current_master_user_id',              master_row.user_id,
    'current_master_display_name',         master_prof.display_name,
    'current_interim_master_user_id',      NULL::UUID,
    'current_interim_master_display_name', NULL::TEXT
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

  -- 次回event（scheduled/open/closed を対象、scheduled_at >= now()）
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

  -- previous_results_pending: 直近前回Event基準
  v_previous_results_pending := FALSE;

  IF v_next_event_id IS NOT NULL THEN
    SELECT prev_ae.id
    INTO v_prev_event_id
    FROM arena_events prev_ae
    WHERE prev_ae.arena_id = p_arena_id
      AND prev_ae.scheduled_at < v_next_event_scheduled_at
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
      INTO v_previous_results_pending;
    END IF;
  END IF;

  -- 自分のmatch情報
  IF v_uid IS NOT NULL AND v_next_event_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'arena_match_id',        am.id,
      'official_match_id',     am.official_match_id,
      'match_no',              am.round,
      'round',                 am.round,
      'match_kind',            am.match_kind,
      'master_subtype',        am.master_subtype,
      'black_user_id',         am.black_user_id,
      'black_display_name',    bp.display_name,
      'white_user_id',         am.white_user_id,
      'white_display_name',    wp.display_name,
      'my_side',               CASE WHEN am.black_user_id = v_uid THEN 'black' ELSE 'white' END,
      'opponent_user_id',      CASE WHEN am.black_user_id = v_uid THEN am.white_user_id ELSE am.black_user_id END,
      'opponent_display_name', CASE WHEN am.black_user_id = v_uid THEN wp.display_name ELSE bp.display_name END,
      'scheduled_start_at',    COALESCE(am.scheduled_start_at, ae_match.scheduled_at),
      'arena_match_status',    am.status,
      'official_match_status', om.status,
      'online_game_id',        am.online_game_id
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

  -- top_ranking: arena_match_history 直近90日を正本として集計
  -- 現在のMasterを除外。test season混入防止のため累積ポイントテーブルは使用しない。
  SELECT jsonb_agg(ranking_row ORDER BY (ranking_row->>'points')::numeric DESC)
  INTO v_top_ranking
  FROM (
    SELECT jsonb_build_object(
      'user_id',        r.user_id,
      'display_name',   rp.display_name,
      'points',         r.total_points,
      'wins',           0,
      'losses',         0,
      'no_show_losses', 0,
      'participations', 0,
      'matches_played', 0
    ) AS ranking_row
    FROM (
      SELECT
        sub.user_id,
        SUM(sub.point_delta) AS total_points
      FROM (
        SELECT amh.black_user_id AS user_id, amh.black_point_delta AS point_delta
        FROM arena_match_history amh
        WHERE amh.arena_id = p_arena_id
          AND amh.event_datetime >= now() - interval '90 days'
          AND amh.black_user_id IS NOT NULL
          AND (v_current_master_uid IS NULL OR amh.black_user_id != v_current_master_uid)
        UNION ALL
        SELECT amh.white_user_id AS user_id, amh.white_point_delta AS point_delta
        FROM arena_match_history amh
        WHERE amh.arena_id = p_arena_id
          AND amh.event_datetime >= now() - interval '90 days'
          AND amh.white_user_id IS NOT NULL
          AND (v_current_master_uid IS NULL OR amh.white_user_id != v_current_master_uid)
      ) sub
      GROUP BY sub.user_id
      ORDER BY SUM(sub.point_delta) DESC
      LIMIT 10
    ) r
    LEFT JOIN profiles rp ON rp.id = r.user_id
  ) ranked;

  -- recent_match_history（最新10件）
  SELECT jsonb_agg(hist_row ORDER BY (hist_row->>'played_at') DESC)
  INTO v_recent_matches
  FROM (
    SELECT jsonb_build_object(
      'event_datetime',      ae_hist.scheduled_at,
      'match_no',            am_hist.round,
      'match_kind',          am_hist.match_kind,
      'black_display_name',  bp_hist.display_name,
      'white_display_name',  wp_hist.display_name,
      'winner_display_name', CASE
                               WHEN am_hist.result = 'black' THEN bp_hist.display_name
                               WHEN am_hist.result = 'white' THEN wp_hist.display_name
                               ELSE NULL
                             END,
      'end_reason',          am_hist.result,
      'black_point_delta',   COALESCE(amh_hist.black_point_delta, 0),
      'white_point_delta',   COALESCE(amh_hist.white_point_delta, 0),
      'master_effect',       NULL::TEXT,
      'played_at',           am_hist.completed_at
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

  -- recent_master_history（最新10件）
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
    || jsonb_build_object('top_ranking',          COALESCE(v_top_ranking, '[]'::JSONB))
    || jsonb_build_object('recent_match_history', COALESCE(v_recent_matches, '[]'::JSONB))
    || jsonb_build_object('recent_master_history', COALESCE(v_recent_masters, '[]'::JSONB));

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_arena_detail(UUID) TO anon, authenticated;
