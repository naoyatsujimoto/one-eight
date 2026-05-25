-- =============================================================================
-- OM-1a: Official Match Calendar — DB / RLS / RPC 基盤実装
-- 実行方法: Naoya が Supabase SQL Editor で実行する
-- 冪等設計: IF NOT EXISTS / DROP FUNCTION IF EXISTS 使用（再実行可能）
-- =============================================================================

-- =============================================================================
-- 0. profiles に is_admin カラムを追加
-- =============================================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_admin IS
  'true の場合、公式戦の作成・キャンセルが可能（admin権限）。付与は service_role / Dashboard 直接のみ。';

-- ■ admin 付与 SQL（必要なユーザーのみ手動実行）
-- 以下は例示のみ。勝手に広く付与しないこと。
-- UPDATE profiles SET is_admin = true WHERE id = '<Naoya の auth.uid>';


-- =============================================================================
-- 1. official_matches テーブル作成
-- =============================================================================

CREATE TABLE IF NOT EXISTS official_matches (
  -- 識別
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 参加者
  black_user_id     uuid         NOT NULL REFERENCES auth.users(id),
  white_user_id     uuid         NOT NULL REFERENCES auth.users(id),

  -- スケジュール
  starts_at         timestamptz  NOT NULL,
  ends_at           timestamptz,

  -- ステータス
  -- scheduled  : 公式戦作成済み・対局開始前
  -- joinable   : 入室受付中（starts_at の 15 分前〜開始後 30 分以内）
  -- live       : 両者入室済み・対局進行中
  -- completed  : 対局終了（result 確定）
  -- cancelled  : 運営キャンセル
  -- forfeited  : 不戦敗（一方または両方が時間内に入室しなかった）
  status            text         NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','joinable','live','completed','cancelled','forfeited')),

  -- タイムクロック（T-2a TimerConfig をそのまま流用。公式戦では 'none' 禁止）
  timer_config      jsonb        NOT NULL,

  -- online_games との連携（enter_official_match 時に作成・設定）
  online_game_id    uuid         REFERENCES online_games(id),

  -- 対局結果
  result            text         CHECK (result IN ('black','white','draw') OR result IS NULL),
  winner            text         CHECK (winner IN ('black_user','white_user','draw') OR winner IS NULL),
  end_reason        text         CHECK (end_reason IN (
                      'normal','timeout','resign','draw_agreement',
                      'forfeit_black','forfeit_white','forfeit_both',
                      'cancelled'
                    ) OR end_reason IS NULL),

  -- 大会拡張（将来用）— 外部キー制約は OM-3 で追加
  tournament_id     uuid,
  round_id          uuid,

  -- 監査
  created_by        uuid         NOT NULL REFERENCES auth.users(id),
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE official_matches IS
  '公式戦（事前予定対局）。通常フレンドマッチ/ランダムマッチとは独立した経路で管理する。';
COMMENT ON COLUMN official_matches.timer_config IS
  '公式戦用タイムクロック設定。mode=none は禁止。create_official_match バリデーションで弾く。';
COMMENT ON COLUMN official_matches.online_game_id IS
  'enter_official_match が online_games レコードを作成した時点で格納される。NULL = まだ部屋未作成。';
COMMENT ON COLUMN official_matches.tournament_id IS
  '将来: tournaments(id) 外部キー。OM-3 で追加予定。';
COMMENT ON COLUMN official_matches.round_id IS
  '将来: tournament_rounds(id) 外部キー。OM-3 で追加予定。';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_official_matches_black  ON official_matches(black_user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_official_matches_white  ON official_matches(white_user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_official_matches_status ON official_matches(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_official_matches_online ON official_matches(online_game_id);


-- =============================================================================
-- 2. RLS ポリシー
-- =============================================================================

ALTER TABLE official_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_matches FORCE ROW LEVEL SECURITY;

-- SELECT: 参加者のみ
DROP POLICY IF EXISTS "official_matches_select_participants" ON official_matches;
CREATE POLICY "official_matches_select_participants"
  ON official_matches FOR SELECT
  USING (
    black_user_id = auth.uid()
    OR white_user_id = auth.uid()
  );

-- INSERT: admin のみ（RPC 経由で呼ぶ。RLS は二重ガード）
DROP POLICY IF EXISTS "official_matches_insert_admin" ON official_matches;
CREATE POLICY "official_matches_insert_admin"
  ON official_matches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
    AND created_by = auth.uid()
  );

-- UPDATE: 直接変更禁止（RPC 内 SECURITY DEFINER がバイパスするため実質 RPC 専用）
DROP POLICY IF EXISTS "official_matches_deny_direct_update" ON official_matches;
CREATE POLICY "official_matches_deny_direct_update"
  ON official_matches FOR UPDATE
  USING (false);

-- DELETE: 禁止（論理削除 = status='cancelled' のみ）
DROP POLICY IF EXISTS "official_matches_deny_direct_delete" ON official_matches;
CREATE POLICY "official_matches_deny_direct_delete"
  ON official_matches FOR DELETE
  USING (false);

-- GRANT
GRANT SELECT ON public.official_matches TO authenticated;
-- INSERT/UPDATE/DELETE はすべて SECURITY DEFINER RPC 経由で行う
GRANT ALL ON public.official_matches TO service_role;


-- =============================================================================
-- 3. RPC: create_official_match
-- 呼び出し: admin のみ
-- =============================================================================

DROP FUNCTION IF EXISTS create_official_match(uuid, uuid, timestamptz, timestamptz, jsonb, uuid, uuid);

CREATE OR REPLACE FUNCTION create_official_match(
  p_black_user_id  uuid,
  p_white_user_id  uuid,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz    DEFAULT NULL,
  p_timer_config   jsonb          DEFAULT NULL,
  p_tournament_id  uuid           DEFAULT NULL,
  p_round_id       uuid           DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_is_admin   boolean;
  v_timer_mode text;
  v_match_id   uuid;
BEGIN
  -- admin チェック
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT FOUND OR NOT v_is_admin THEN
    RAISE EXCEPTION 'permission_denied: admin required';
  END IF;

  -- 基本バリデーション
  IF p_black_user_id = p_white_user_id THEN
    RAISE EXCEPTION 'invalid_input: black_user_id and white_user_id must differ';
  END IF;

  IF p_starts_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'invalid_input: starts_at must be in the future';
  END IF;

  -- timer_config バリデーション（none 禁止）
  IF p_timer_config IS NULL THEN
    RAISE EXCEPTION 'invalid_input: timer_config is required';
  END IF;
  v_timer_mode := p_timer_config->>'mode';
  IF v_timer_mode IS NULL OR v_timer_mode = 'none' THEN
    RAISE EXCEPTION 'invalid_input: timer_config.mode must be total_time or per_move (none is not allowed for official matches)';
  END IF;

  -- INSERT
  INSERT INTO official_matches (
    black_user_id,
    white_user_id,
    starts_at,
    ends_at,
    status,
    timer_config,
    tournament_id,
    round_id,
    created_by
  ) VALUES (
    p_black_user_id,
    p_white_user_id,
    p_starts_at,
    p_ends_at,
    'scheduled',
    p_timer_config,
    p_tournament_id,
    p_round_id,
    v_uid
  )
  RETURNING id INTO v_match_id;

  RETURN json_build_object(
    'match_id', v_match_id,
    'status',   'scheduled'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_official_match(uuid, uuid, timestamptz, timestamptz, jsonb, uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION create_official_match(uuid, uuid, timestamptz, timestamptz, jsonb, uuid, uuid) FROM anon;


-- =============================================================================
-- 4. RPC: list_my_official_matches
-- 呼び出し: 認証ユーザー（自分が参加者の試合のみ返す）
-- =============================================================================

DROP FUNCTION IF EXISTS list_my_official_matches(timestamptz, timestamptz, text[]);

CREATE OR REPLACE FUNCTION list_my_official_matches(
  p_from    timestamptz DEFAULT NULL,
  p_to      timestamptz DEFAULT NULL,
  p_status  text[]      DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_from   timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to     timestamptz := COALESCE(p_to,   now() + interval '90 days');
  v_result json;
BEGIN
  SELECT json_agg(row_to_json(r)) INTO v_result
  FROM (
    SELECT
      m.id,
      m.starts_at,
      m.ends_at,
      m.status,
      m.timer_config,
      m.online_game_id,
      m.result,
      m.winner,
      m.end_reason,
      CASE WHEN m.black_user_id = v_uid THEN 'black' ELSE 'white' END AS my_color,
      CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END AS opponent_id,
      (SELECT p.display_name FROM profiles p
       WHERE p.id = CASE WHEN m.black_user_id = v_uid THEN m.white_user_id ELSE m.black_user_id END
      ) AS opponent_display_name,
      m.tournament_id,
      m.round_id,
      m.created_at,
      m.updated_at
    FROM official_matches m
    WHERE (m.black_user_id = v_uid OR m.white_user_id = v_uid)
      AND m.starts_at >= v_from
      AND m.starts_at <= v_to
      AND (p_status IS NULL OR m.status = ANY(p_status))
    ORDER BY m.starts_at ASC
  ) r;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION list_my_official_matches(timestamptz, timestamptz, text[]) FROM anon;


-- =============================================================================
-- 5. RPC: enter_official_match
-- 呼び出し: 参加者のみ（時間条件内）
-- online_games との最小連携を実施
-- p_initial_state: フロントエンドが createInitialState() で生成した初期ゲーム状態
-- =============================================================================

DROP FUNCTION IF EXISTS enter_official_match(uuid, jsonb);
DROP FUNCTION IF EXISTS enter_official_match(uuid);

CREATE OR REPLACE FUNCTION enter_official_match(
  p_match_id     uuid,
  p_initial_state jsonb
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_match          official_matches;
  v_now            timestamptz := clock_timestamp();
  v_joinable_from  timestamptz;
  v_joinable_until timestamptz;
  v_my_color       text;
  v_game_id        uuid;
  v_room_code      text;
  v_timer_mode     text;
  v_chars          text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i              int;
BEGIN
  -- 行ロック取得（同時入室レースコンディション対策）
  SELECT * INTO v_match
  FROM official_matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: official match not found';
  END IF;

  -- 参加者チェック
  IF v_match.black_user_id != v_uid AND v_match.white_user_id != v_uid THEN
    RAISE EXCEPTION 'permission_denied: not a participant of this match';
  END IF;

  -- ステータスチェック（cancelled / forfeited / completed は入室不可）
  IF v_match.status IN ('cancelled','forfeited','completed') THEN
    RAISE EXCEPTION 'invalid_state: match is %, cannot enter', v_match.status;
  END IF;

  -- 時間条件チェック（15分前〜30分後）
  v_joinable_from  := v_match.starts_at - interval '15 minutes';
  v_joinable_until := v_match.starts_at + interval '30 minutes';

  IF v_now < v_joinable_from THEN
    RAISE EXCEPTION 'not_yet_joinable: match opens at %', v_joinable_from;
  END IF;

  IF v_now > v_joinable_until THEN
    RAISE EXCEPTION 'too_late: join window closed at %', v_joinable_until;
  END IF;

  -- 色を決定
  v_my_color := CASE WHEN v_match.black_user_id = v_uid THEN 'black' ELSE 'white' END;

  -- online_game_id が既にある場合: 冪等返却
  IF v_match.online_game_id IS NOT NULL THEN
    -- status を live に更新（live でなければ）
    IF v_match.status NOT IN ('live','completed') THEN
      UPDATE official_matches
      SET status = 'live', updated_at = v_now
      WHERE id = p_match_id;
    END IF;

    RETURN json_build_object(
      'online_game_id', v_match.online_game_id,
      'color',          v_my_color
    );
  END IF;

  -- online_game_id が NULL → online_games レコードを新規作成
  -- room_code は公式戦専用プレフィックス "OM-" + ランダム6文字
  -- （通常の join_online_game は 6文字のみ検索するため衝突しない）
  v_timer_mode := v_match.timer_config->>'mode';

  FOR v_i IN 1..5 LOOP
    v_room_code := 'OM-';
    FOR v_i IN 1..6 LOOP
      v_room_code := v_room_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO online_games (
        room_code,
        black_player_id,
        white_player_id,
        current_player_id,
        status,
        game_state,
        move_number,
        timer_config,
        black_remaining_ms,
        white_remaining_ms,
        turn_started_at,
        server_updated_at
      ) VALUES (
        v_room_code,
        v_match.black_user_id,
        v_match.white_user_id,
        v_match.black_user_id,   -- 黒番が先手
        'playing',               -- waiting を経由せず直接 playing
        p_initial_state,         -- フロントが createInitialState() で生成
        1,
        v_match.timer_config,    -- official_matches から直接コピー（ユーザー変更不可）
        -- total_time の場合のみ remaining_ms を初期化
        CASE WHEN v_timer_mode = 'total_time'
          THEN (v_match.timer_config->>'totalSeconds')::int * 1000
          ELSE NULL
        END,
        CASE WHEN v_timer_mode = 'total_time'
          THEN (v_match.timer_config->>'totalSeconds')::int * 1000
          ELSE NULL
        END,
        v_now,
        v_now
      )
      RETURNING id INTO v_game_id;

      EXIT; -- 成功したらループを抜ける
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  IF v_game_id IS NULL THEN
    RAISE EXCEPTION 'internal_error: failed to create online_game';
  END IF;

  -- official_matches を更新
  UPDATE official_matches
  SET online_game_id = v_game_id,
      status         = 'live',
      updated_at     = v_now
  WHERE id = p_match_id;

  RETURN json_build_object(
    'online_game_id', v_game_id,
    'color',          v_my_color
  );
END;
$$;

GRANT EXECUTE ON FUNCTION enter_official_match(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION enter_official_match(uuid, jsonb) FROM anon;


-- =============================================================================
-- 6. RPC: cancel_official_match
-- 呼び出し: admin のみ
-- =============================================================================

DROP FUNCTION IF EXISTS cancel_official_match(uuid, text);

CREATE OR REPLACE FUNCTION cancel_official_match(
  p_match_id uuid,
  p_reason   text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_is_admin boolean;
  v_match    official_matches;
  v_now      timestamptz := clock_timestamp();
BEGIN
  -- admin チェック
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_uid;
  IF NOT FOUND OR NOT v_is_admin THEN
    RAISE EXCEPTION 'permission_denied: admin required';
  END IF;

  SELECT * INTO v_match FROM official_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: official match not found';
  END IF;

  -- live 以降はキャンセル不可
  IF v_match.status IN ('live','completed','forfeited') THEN
    RAISE EXCEPTION 'invalid_state: cannot cancel a match in status %', v_match.status;
  END IF;

  IF v_match.status = 'cancelled' THEN
    RETURN json_build_object('ok', true, 'note', 'already cancelled');
  END IF;

  UPDATE official_matches
  SET status     = 'cancelled',
      end_reason = 'cancelled',
      updated_at = v_now
  WHERE id = p_match_id;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_official_match(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION cancel_official_match(uuid, text) FROM anon;


-- =============================================================================
-- 確認クエリ（実行後に状態確認）
-- =============================================================================
-- -- テーブル確認
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'official_matches';
--
-- -- カラム確認
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'official_matches'
-- ORDER BY ordinal_position;
--
-- -- RLS ポリシー確認
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies WHERE tablename = 'official_matches';
--
-- -- RPC 確認
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'create_official_match','list_my_official_matches',
--     'enter_official_match','cancel_official_match'
--   );
--
-- -- profiles.is_admin カラム確認
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'profiles' AND column_name = 'is_admin';
