-- =============================================================================
-- Official Arena Phase D-1.5 — Result processing前 schema alignment
-- 1. arena_match_history を 1 match 1 row 形式で再作成
-- 2. arena_matches.status CHECK を D-2 用に拡張（processed 追加）
-- 3. arena_points に UPSERT 用 UNIQUE INDEX 追加
-- =============================================================================

-- =============================================================================
-- 1. arena_match_history を 1 match 1 row 形式で再作成
-- （現在 0 件のため安全に DROP & CREATE）
-- =============================================================================

DROP TABLE IF EXISTS arena_match_history CASCADE;

CREATE TABLE arena_match_history (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  arena_id          uuid        NOT NULL REFERENCES arena_definitions(id),
  arena_event_id    uuid        NOT NULL REFERENCES arena_events(id),
  arena_match_id    uuid        NOT NULL UNIQUE REFERENCES arena_matches(id),
  official_match_id uuid        REFERENCES official_matches(id),
  round             int         NOT NULL,
  match_kind        text        NOT NULL CHECK (match_kind IN ('master','point')),
  master_subtype    text        CHECK (master_subtype IN ('inaugural','defend','master_succession','interim_set')),
  event_datetime    timestamptz NOT NULL,
  black_user_id     uuid        NOT NULL REFERENCES auth.users(id),
  white_user_id     uuid        NOT NULL REFERENCES auth.users(id),
  winner_user_id    uuid        REFERENCES auth.users(id),
  loser_user_id     uuid        REFERENCES auth.users(id),
  end_reason        text        NOT NULL CHECK (
    end_reason IN (
      'normal',
      'timeout',
      'resign',
      'draw',
      'draw_agreement',
      'no_show',
      'no_contest',
      'cancelled'
    )
  ),
  black_point_delta int         NOT NULL,
  white_point_delta int         NOT NULL,
  master_effect     text        NOT NULL DEFAULT 'none' CHECK (
    master_effect IN (
      'none',
      'inaugural_set',
      'defended',
      'transferred',
      'interim_set',
      'interim_replaced',
      'interim_confirmed_official',
      'no_change'
    )
  ),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_arena_match_history_arena_event
  ON arena_match_history(arena_id, event_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_arena_match_history_event_round
  ON arena_match_history(arena_event_id, round);

CREATE INDEX IF NOT EXISTS idx_arena_match_history_winner
  ON arena_match_history(winner_user_id);

CREATE INDEX IF NOT EXISTS idx_arena_match_history_black
  ON arena_match_history(black_user_id);

CREATE INDEX IF NOT EXISTS idx_arena_match_history_white
  ON arena_match_history(white_user_id);

-- RLS / 権限
ALTER TABLE arena_match_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON arena_match_history FROM anon, authenticated;
GRANT ALL ON arena_match_history TO service_role;
-- policy は作らない（read RPC 経由方針を維持）

-- =============================================================================
-- 2. arena_matches.status CHECK を D-2 用に拡張（processed 追加）
-- 既存 CHECK 制約を DROP して再作成
-- 許可値: pending / active / completed / processed / cancelled
-- =============================================================================

-- 既存制約名の確認用（arena_phase_a.sql では inline CHECK として作成）
-- pg_constraint から制約名を取得して DROP する
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'public.arena_matches'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%pending%active%';
  
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE arena_matches DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE arena_matches
  ADD CONSTRAINT arena_matches_status_check
  CHECK (status IN ('pending','active','completed','processed','cancelled'));

-- =============================================================================
-- 3. arena_points に UPSERT 用 UNIQUE INDEX 追加
-- （id 単独 PK のため ON CONFLICT (arena_id, user_id, season) で UPSERT するためのUNIQUE）
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS arena_points_arena_user_season_uniq
  ON arena_points(arena_id, user_id, season);
