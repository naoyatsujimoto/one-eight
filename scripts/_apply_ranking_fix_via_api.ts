/**
 * Supabase Management API を使って get_arena_detail の top_ranking 集計を修正する
 */
import { readFileSync } from 'fs';

// .env load
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

const PROJECT_REF = 'farieecfyajbtmjxelop';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// The corrected top_ranking SQL only — just the changed part as CREATE OR REPLACE
const sqlToApply = `
-- Fix get_arena_detail: top_ranking を直近90日の arena_match_history から集計
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
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_uid := NULL;
  END;

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

  IF v_master IS NULL THEN
    v_master := jsonb_build_object(
      'current_master_user_id', NULL,
      'current_master_display_name', NULL,
      'current_interim_master_user_id', NULL,
      'current_interim_master_display_name', NULL
    );
  END IF;

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

  IF v_uid IS NOT NULL AND v_next_event_id IS NOT NULL THEN
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
    WHERE am.arena_event_id = v_next_event_id
      AND (am.black_user_id = v_uid OR am.white_user_id = v_uid)
      AND am.status NOT IN ('cancelled')
    ORDER BY am.created_at DESC
    LIMIT 1;
  END IF;

  -- top ranking: 直近90日の arena_match_history から集計（Master表示なし）
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
        UNION ALL
        SELECT amh.white_user_id AS user_id, amh.white_point_delta AS point_delta
        FROM arena_match_history amh
        WHERE amh.arena_id = p_arena_id
          AND amh.event_datetime >= now() - interval '90 days'
          AND amh.white_user_id IS NOT NULL
      ) sub
      GROUP BY sub.user_id
      ORDER BY SUM(sub.point_delta) DESC
      LIMIT 10
    ) r
    LEFT JOIN profiles rp ON rp.id = r.user_id
  ) ranked;

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
    || jsonb_build_object('top_ranking', COALESCE(v_top_ranking, '[]'::JSONB))
    || jsonb_build_object('recent_match_history', COALESCE(v_recent_matches, '[]'::JSONB))
    || jsonb_build_object('recent_master_history', COALESCE(v_recent_masters, '[]'::JSONB));

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_arena_detail(UUID) TO anon, authenticated;
`;

async function main() {
  // Supabase management API で SQL を実行
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sqlToApply }),
    }
  );
  
  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Response:', text.slice(0, 500));
  
  if (!response.ok) {
    console.error('Management API failed, trying pg REST API approach...');
    
    // pg REST API direct approach via Supabase Data API
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.VITE_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      { auth: { persistSession: false } }
    );
    
    // Check current state
    const { data: defs } = await (sb as any).from('arena_definitions').select('id, code').limit(2);
    for (const def of defs || []) {
      const { data, error } = await sb.rpc('get_arena_detail', { p_arena_id: (def as any).id });
      if (error) {
        console.log(`[${(def as any).code}] still broken:`, error.message);
      } else {
        const d = data as any;
        console.log(`[${(def as any).code}] top_ranking:`, JSON.stringify(d?.top_ranking?.slice(0, 2), null, 2));
      }
    }
  }
}

main().catch(console.error);
