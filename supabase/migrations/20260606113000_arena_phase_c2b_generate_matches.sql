-- ============================================================
-- Arena Phase C-2b: generate_arena_matches RPC
-- 1. official_matches.source_kind 追加
-- 2. generate_arena_matches(p_arena_event_id uuid) RPC 追加
-- ============================================================

-- ============================================================
-- 1. official_matches.source_kind 追加
-- ============================================================

ALTER TABLE official_matches
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'standalone'
  CHECK (source_kind IN ('standalone','arena'));

CREATE INDEX IF NOT EXISTS idx_official_matches_source_kind
  ON official_matches(source_kind, starts_at);

-- ============================================================
-- 1b. arena_entries.arena_match_id 追加
-- ============================================================

ALTER TABLE arena_entries
  ADD COLUMN IF NOT EXISTS arena_match_id uuid REFERENCES arena_matches(id);

CREATE INDEX IF NOT EXISTS arena_entries_arena_match_id_idx
  ON arena_entries(arena_match_id)
  WHERE arena_match_id IS NOT NULL;

-- ============================================================
-- 2. generate_arena_matches RPC
-- ============================================================

CREATE OR REPLACE FUNCTION generate_arena_matches(p_arena_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event          arena_events%ROWTYPE;
  v_def            arena_definitions%ROWTYPE;
  v_entries        RECORD;
  v_entry_count    integer;
  v_admin_id       uuid;

  -- Master / Interim Master
  v_official_master_user_id  uuid;
  v_interim_master_user_id   uuid;
  v_official_master_in_entry boolean := false;
  v_interim_master_in_entry  boolean := false;

  -- Match building
  v_remaining_entries        uuid[];   -- user_id list in pairing order
  v_match_round              integer := 1;
  v_matches_created          integer := 0;

  v_black_id   uuid;
  v_white_id   uuid;
  v_match_kind text;
  v_master_subtype text;

  v_official_match_id  uuid;
  v_arena_match_id     uuid;

  v_i   integer;
  v_uid uuid;
BEGIN

  -- ----------------------------------------------------------
  -- 5.1 event 存在チェック
  -- ----------------------------------------------------------
  SELECT * INTO v_event
  FROM arena_events
  WHERE id = p_arena_event_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'event_not_found');
  END IF;

  -- ----------------------------------------------------------
  -- 5.2 event lock (FOR UPDATE: 二重実行防止)
  -- ----------------------------------------------------------
  SELECT * INTO v_event
  FROM arena_events
  WHERE id = p_arena_event_id
  FOR UPDATE;

  -- ----------------------------------------------------------
  -- 5.3 冪等ガード
  -- ----------------------------------------------------------
  IF v_event.status IN ('closed', 'completed', 'cancelled') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reason', 'already_handled',
      'status', v_event.status
    );
  END IF;

  -- ----------------------------------------------------------
  -- 5.4 entry deadline チェック
  -- ----------------------------------------------------------
  IF now() < v_event.entry_deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'before_deadline');
  END IF;

  -- ----------------------------------------------------------
  -- arena_definitions 取得
  -- ----------------------------------------------------------
  SELECT * INTO v_def
  FROM arena_definitions
  WHERE id = v_event.arena_id;

  -- ----------------------------------------------------------
  -- 5.5 対象 Entry 取得（pending のみ）
  -- ----------------------------------------------------------
  SELECT COUNT(*) INTO v_entry_count
  FROM arena_entries
  WHERE arena_event_id = p_arena_event_id
    AND status = 'pending';

  -- ----------------------------------------------------------
  -- Entry 0 人
  -- ----------------------------------------------------------
  IF v_entry_count = 0 THEN
    UPDATE arena_events
    SET status = 'completed', updated_at = now()
    WHERE id = p_arena_event_id;

    RETURN jsonb_build_object('ok', true, 'matches_created', 0, 'reason', 'no_entries');
  END IF;

  -- ----------------------------------------------------------
  -- Entry 1 人
  -- ----------------------------------------------------------
  IF v_entry_count = 1 THEN
    UPDATE arena_entries
    SET status = 'no_match', updated_at = now()
    WHERE arena_event_id = p_arena_event_id
      AND status = 'pending';

    UPDATE arena_events
    SET status = 'completed', updated_at = now()
    WHERE id = p_arena_event_id;

    RETURN jsonb_build_object('ok', true, 'matches_created', 0, 'reason', 'single_entry');
  END IF;

  -- ----------------------------------------------------------
  -- Entry 2 人以上
  -- ----------------------------------------------------------

  -- admin user 取得 (official_matches.created_by 用)
  SELECT p.id INTO v_admin_id
  FROM profiles p
  WHERE p.is_admin = true
  ORDER BY p.created_at
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_admin_user_for_created_by');
  END IF;

  -- ----------------------------------------------------------
  -- Pairing order: points DESC, win_count DESC, participations DESC, entered_at ASC
  -- ----------------------------------------------------------
  -- 対象 Entry を順序付きで取得し、user_id 配列に格納
  v_remaining_entries := ARRAY(
    SELECT e.user_id
    FROM arena_entries e
    LEFT JOIN arena_points ap
      ON ap.arena_id = v_event.arena_id
     AND ap.user_id  = e.user_id
     AND ap.season   = 'default'
    WHERE e.arena_event_id = p_arena_event_id
      AND e.status = 'pending'
    ORDER BY
      COALESCE(ap.points, 0)         DESC,
      COALESCE(ap.win_count, 0)      DESC,
      COALESCE(ap.participations, 0) DESC,
      e.entered_at                   ASC
  );

  -- ----------------------------------------------------------
  -- Master / Interim Master 判定
  -- ----------------------------------------------------------

  -- Official Master: arena_definitions.current_master_user_id 優先
  --   NULL なら arena_master_history の active official から取得
  v_official_master_user_id := v_def.current_master_user_id;

  IF v_official_master_user_id IS NULL THEN
    SELECT user_id INTO v_official_master_user_id
    FROM arena_master_history
    WHERE arena_id      = v_event.arena_id
      AND season        = 'default'
      AND status        = 'official'
      AND dethroned_at  IS NULL
    LIMIT 1;
  END IF;

  -- Interim Master: arena_definitions.current_interim_master_user_id 優先
  --   NULL なら arena_master_history の active interim から取得
  v_interim_master_user_id := v_def.current_interim_master_user_id;

  IF v_interim_master_user_id IS NULL THEN
    SELECT user_id INTO v_interim_master_user_id
    FROM arena_master_history
    WHERE arena_id      = v_event.arena_id
      AND season        = 'default'
      AND status        = 'interim'
      AND dethroned_at  IS NULL
    LIMIT 1;
  END IF;

  -- Entry 内に存在するか確認
  IF v_official_master_user_id IS NOT NULL THEN
    SELECT true INTO v_official_master_in_entry
    FROM arena_entries
    WHERE arena_event_id = p_arena_event_id
      AND status = 'pending'
      AND user_id = v_official_master_user_id
    LIMIT 1;

    IF NOT FOUND THEN
      v_official_master_in_entry := false;
    END IF;
  END IF;

  IF v_interim_master_user_id IS NOT NULL THEN
    SELECT true INTO v_interim_master_in_entry
    FROM arena_entries
    WHERE arena_event_id = p_arena_event_id
      AND status = 'pending'
      AND user_id = v_interim_master_user_id
    LIMIT 1;

    IF NOT FOUND THEN
      v_interim_master_in_entry := false;
    END IF;
  END IF;

  -- ----------------------------------------------------------
  -- Match 1 決定
  -- ----------------------------------------------------------

  IF v_official_master_user_id IS NOT NULL AND v_official_master_in_entry THEN
    -- 8.1 official Master 参加
    v_match_kind     := 'master';
    v_master_subtype := 'defend';
    v_black_id       := v_official_master_user_id;
    -- White = Master 以外の Point 順最上位
    SELECT uid INTO v_white_id
    FROM unnest(v_remaining_entries) WITH ORDINALITY AS t(uid, ord)
    WHERE uid <> v_official_master_user_id
    ORDER BY t.ord
    LIMIT 1;

  ELSIF v_official_master_user_id IS NULL
     AND NOT EXISTS (
           SELECT 1 FROM arena_master_history
           WHERE arena_id = v_event.arena_id
             AND season   = 'default'
         ) THEN
    -- 8.2 Master 履歴なし = inaugural
    v_match_kind     := 'master';
    v_master_subtype := 'inaugural';
    v_black_id       := v_remaining_entries[1];
    v_white_id       := v_remaining_entries[2];

  ELSIF v_interim_master_user_id IS NOT NULL AND v_interim_master_in_entry THEN
    -- 8.3 official Master 不参加 / Interim Master 参加
    v_match_kind     := 'master';
    v_master_subtype := 'master_succession';
    v_black_id       := v_interim_master_user_id;
    -- White = Interim Master 以外の Point 順最上位
    SELECT uid INTO v_white_id
    FROM unnest(v_remaining_entries) WITH ORDINALITY AS t(uid, ord)
    WHERE uid <> v_interim_master_user_id
    ORDER BY t.ord
    LIMIT 1;

  ELSE
    -- 8.4 official Master 不参加 / Interim Master も不在または不参加
    v_match_kind     := 'master';
    v_master_subtype := 'interim_set';
    v_black_id       := v_remaining_entries[1];
    v_white_id       := v_remaining_entries[2];
  END IF;

  -- Match 1 INSERT: official_matches
  INSERT INTO official_matches (
    black_user_id,
    white_user_id,
    starts_at,
    timer_config,
    created_by,
    status,
    source_kind
  ) VALUES (
    v_black_id,
    v_white_id,
    v_event.event_datetime,
    v_def.timer_config,
    v_admin_id,
    'scheduled',
    'arena'
  )
  RETURNING id INTO v_official_match_id;

  -- Match 1 INSERT: arena_matches
  INSERT INTO arena_matches (
    arena_event_id,
    black_user_id,
    white_user_id,
    round,
    status,
    official_match_id,
    match_kind,
    master_subtype,
    scheduled_start_at,
    online_game_id,
    result,
    completed_at,
    winner_user_id,
    loser_user_id,
    end_reason,
    black_point_delta,
    white_point_delta,
    master_effect,
    processed_at
  ) VALUES (
    p_arena_event_id,
    v_black_id,
    v_white_id,
    1,
    'pending',
    v_official_match_id,
    v_match_kind,
    v_master_subtype,
    v_event.event_datetime,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  )
  RETURNING id INTO v_arena_match_id;

  -- arena_entries 更新 (Match 1 participants)
  UPDATE arena_entries
  SET status        = 'matched',
      arena_match_id = v_arena_match_id,
      updated_at    = now()
  WHERE arena_event_id = p_arena_event_id
    AND status = 'pending'
    AND user_id IN (v_black_id, v_white_id);

  -- remaining_entries から Match 1 の 2 人を除外
  v_remaining_entries := ARRAY(
    SELECT uid
    FROM unnest(v_remaining_entries) AS t(uid)
    WHERE uid NOT IN (v_black_id, v_white_id)
  );

  v_matches_created := 1;
  v_match_round     := 2;

  -- ----------------------------------------------------------
  -- Match 2 以降: 2 人ずつペアリング
  -- ----------------------------------------------------------
  v_i := 1;
  WHILE v_i + 1 <= array_length(v_remaining_entries, 1) LOOP
    -- Pair 内 Point 上位 (ソート順上位) が Black
    v_black_id := v_remaining_entries[v_i];
    v_white_id := v_remaining_entries[v_i + 1];

    -- official_matches INSERT
    INSERT INTO official_matches (
      black_user_id,
      white_user_id,
      starts_at,
      timer_config,
      created_by,
      status,
      source_kind
    ) VALUES (
      v_black_id,
      v_white_id,
      v_event.event_datetime,
      v_def.timer_config,
      v_admin_id,
      'scheduled',
      'arena'
    )
    RETURNING id INTO v_official_match_id;

    -- arena_matches INSERT
    INSERT INTO arena_matches (
      arena_event_id,
      black_user_id,
      white_user_id,
      round,
      status,
      official_match_id,
      match_kind,
      master_subtype,
      scheduled_start_at,
      online_game_id,
      result,
      completed_at,
      winner_user_id,
      loser_user_id,
      end_reason,
      black_point_delta,
      white_point_delta,
      master_effect,
      processed_at
    ) VALUES (
      p_arena_event_id,
      v_black_id,
      v_white_id,
      v_match_round,
      'pending',
      v_official_match_id,
      'point',
      NULL,
      v_event.event_datetime,
      NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    )
    RETURNING id INTO v_arena_match_id;

    -- arena_entries 更新
    UPDATE arena_entries
    SET status        = 'matched',
        arena_match_id = v_arena_match_id,
        updated_at    = now()
    WHERE arena_event_id = p_arena_event_id
      AND status = 'pending'
      AND user_id IN (v_black_id, v_white_id);

    v_matches_created := v_matches_created + 1;
    v_match_round     := v_match_round + 1;
    v_i               := v_i + 2;
  END LOOP;

  -- 奇数余り: no_match
  IF array_length(v_remaining_entries, 1) % 2 = 1 THEN
    v_uid := v_remaining_entries[array_length(v_remaining_entries, 1)];
    UPDATE arena_entries
    SET status     = 'no_match',
        updated_at = now()
    WHERE arena_event_id = p_arena_event_id
      AND status = 'pending'
      AND user_id = v_uid;
  END IF;

  -- arena_events 更新: closed
  UPDATE arena_events
  SET status              = 'closed',
      matches_generated_at = now(),
      updated_at          = now()
  WHERE id = p_arena_event_id;

  RETURN jsonb_build_object('ok', true, 'matches_created', v_matches_created);

END;
$$;

-- ============================================================
-- 3. GRANT: service_role / postgres のみ
-- ============================================================

REVOKE EXECUTE ON FUNCTION generate_arena_matches(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION generate_arena_matches(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION generate_arena_matches(uuid) FROM authenticated;
