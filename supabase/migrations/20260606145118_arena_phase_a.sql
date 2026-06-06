-- =============================================================================
-- Official Arena Phase A — DB基盤schema追加のみ
-- Phase A: arena専用テーブル・RLS・制約・index・ELEPHANT/JAGUAR seed
-- 既存 official_matches は一切変更しない
-- Entry/Match生成/Result処理/UI連携は未実装
-- =============================================================================

-- ===================================================
-- 1. arena_definitions
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_definitions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT        NOT NULL UNIQUE,
  display_name    TEXT        NOT NULL,
  title_name      TEXT        NOT NULL,
  weekday         SMALLINT    NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time_jst  TIME        NOT NULL,
  entry_deadline_hours INTEGER NOT NULL DEFAULT 24,
  timer_config    JSONB       NOT NULL DEFAULT '{"mode":"total_time","totalSeconds":600}',
  display_order   INTEGER     NOT NULL DEFAULT 0,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE arena_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arena_definitions public read"
  ON arena_definitions FOR SELECT
  USING (TRUE);

-- ===================================================
-- 2. arena_events
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id        UUID        NOT NULL REFERENCES arena_definitions(id) ON DELETE RESTRICT,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','open','closed','completed','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_events_arena_id_idx       ON arena_events (arena_id);
CREATE INDEX IF NOT EXISTS arena_events_scheduled_at_idx   ON arena_events (scheduled_at);
CREATE INDEX IF NOT EXISTS arena_events_status_idx         ON arena_events (status);

ALTER TABLE arena_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arena_events public read"
  ON arena_events FOR SELECT
  USING (TRUE);

-- ===================================================
-- 3. arena_entries
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_event_id  UUID        NOT NULL REFERENCES arena_events(id) ON DELETE RESTRICT,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','matched','withdrawn','disqualified')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (arena_event_id, user_id)
);

CREATE INDEX IF NOT EXISTS arena_entries_event_id_idx  ON arena_entries (arena_event_id);
CREATE INDEX IF NOT EXISTS arena_entries_user_id_idx   ON arena_entries (user_id);

ALTER TABLE arena_entries ENABLE ROW LEVEL SECURITY;

-- authenticated ユーザーは自分のエントリのみ SELECT 可
CREATE POLICY "arena_entries self read"
  ON arena_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- クライアント直接 INSERT は禁止（INSERT GRANT / INSERT POLICY を付けない）

-- ===================================================
-- 4. arena_matches
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_matches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_event_id  UUID        NOT NULL REFERENCES arena_events(id) ON DELETE RESTRICT,
  black_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  white_user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  online_game_id  UUID        REFERENCES online_games(id) ON DELETE SET NULL,
  round           INTEGER     NOT NULL DEFAULT 1,
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','active','completed','cancelled')),
  result          TEXT                 CHECK (result IN ('black','white','draw','no_contest')),
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_matches_event_id_idx      ON arena_matches (arena_event_id);
CREATE INDEX IF NOT EXISTS arena_matches_black_user_idx    ON arena_matches (black_user_id);
CREATE INDEX IF NOT EXISTS arena_matches_white_user_idx    ON arena_matches (white_user_id);

ALTER TABLE arena_matches ENABLE ROW LEVEL SECURITY;

-- authenticated ユーザーは自分が参加するマッチのみ SELECT 可
CREATE POLICY "arena_matches participant read"
  ON arena_matches FOR SELECT
  TO authenticated
  USING (black_user_id = auth.uid() OR white_user_id = auth.uid());

-- ===================================================
-- 5. arena_points
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_points (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id        UUID        NOT NULL REFERENCES arena_definitions(id) ON DELETE RESTRICT,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  season          TEXT        NOT NULL DEFAULT 'default',
  points          INTEGER     NOT NULL DEFAULT 0,
  win_count       INTEGER     NOT NULL DEFAULT 0,
  loss_count      INTEGER     NOT NULL DEFAULT 0,
  draw_count      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (arena_id, user_id, season)
);

CREATE INDEX IF NOT EXISTS arena_points_arena_id_idx   ON arena_points (arena_id);
CREATE INDEX IF NOT EXISTS arena_points_user_id_idx    ON arena_points (user_id);
CREATE INDEX IF NOT EXISTS arena_points_season_idx     ON arena_points (season);

ALTER TABLE arena_points ENABLE ROW LEVEL SECURITY;
-- direct SELECT 不可 / read RPC 待ち（SELECT GRANT / SELECT policy を付けない）

-- ===================================================
-- 6. arena_match_history
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_match_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_match_id  UUID        NOT NULL REFERENCES arena_matches(id) ON DELETE RESTRICT,
  arena_id        UUID        NOT NULL REFERENCES arena_definitions(id) ON DELETE RESTRICT,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  result          TEXT        NOT NULL CHECK (result IN ('win','loss','draw','no_contest')),
  points_delta    INTEGER     NOT NULL DEFAULT 0,
  event_id        UUID        NOT NULL REFERENCES arena_events(id) ON DELETE RESTRICT,
  played_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_match_history_arena_id_idx  ON arena_match_history (arena_id);
CREATE INDEX IF NOT EXISTS arena_match_history_user_id_idx   ON arena_match_history (user_id);
CREATE INDEX IF NOT EXISTS arena_match_history_event_id_idx  ON arena_match_history (event_id);

ALTER TABLE arena_match_history ENABLE ROW LEVEL SECURITY;
-- direct SELECT 不可 / read RPC 待ち（SELECT GRANT / SELECT policy を付けない）

-- ===================================================
-- 7. arena_master_history
-- ===================================================
CREATE TABLE IF NOT EXISTS arena_master_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id        UUID        NOT NULL REFERENCES arena_definitions(id) ON DELETE RESTRICT,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title_name      TEXT        NOT NULL,
  season          TEXT        NOT NULL DEFAULT 'default',
  crowned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  dethroned_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_master_history_arena_id_idx ON arena_master_history (arena_id);
CREATE INDEX IF NOT EXISTS arena_master_history_user_id_idx  ON arena_master_history (user_id);

ALTER TABLE arena_master_history ENABLE ROW LEVEL SECURITY;
-- direct SELECT 不可 / read RPC 待ち（SELECT GRANT / SELECT policy を付けない）

-- ===================================================
-- GRANT 設定
-- ===================================================

-- arena_definitions: public SELECT
GRANT SELECT ON arena_definitions TO anon, authenticated;
GRANT ALL    ON arena_definitions TO service_role;

-- arena_events: public SELECT
GRANT SELECT ON arena_events TO anon, authenticated;
GRANT ALL    ON arena_events TO service_role;

-- arena_entries: authenticated SELECT のみ（INSERT GRANT は付けない）
GRANT SELECT ON arena_entries TO authenticated;
GRANT ALL    ON arena_entries TO service_role;

-- arena_matches: authenticated SELECT のみ
GRANT SELECT ON arena_matches TO authenticated;
GRANT ALL    ON arena_matches TO service_role;

-- arena_points: service_role のみ（anon/authenticated SELECT GRANT なし）
GRANT ALL    ON arena_points TO service_role;

-- arena_match_history: service_role のみ（anon/authenticated SELECT GRANT なし）
GRANT ALL    ON arena_match_history TO service_role;

-- arena_master_history: service_role のみ（anon/authenticated SELECT GRANT なし）
GRANT ALL    ON arena_master_history TO service_role;

-- ===================================================
-- seed: arena_definitions 初期2Arena
-- ===================================================
INSERT INTO arena_definitions (
  code, display_name, title_name, weekday, start_time_jst,
  entry_deadline_hours, timer_config, display_order
) VALUES
(
  'ELEPHANT',
  'ELEPHANT Arena',
  'ELEPHANT Master',
  6,                       -- weekday: 6 = Saturday
  '22:00:00',
  24,
  '{"mode":"total_time","totalSeconds":600}',
  1
),
(
  'JAGUAR',
  'JAGUAR Arena',
  'JAGUAR Master',
  0,                       -- weekday: 0 = Sunday
  '15:00:00',
  24,
  '{"mode":"total_time","totalSeconds":600}',
  2
)
ON CONFLICT (code) DO NOTHING;
