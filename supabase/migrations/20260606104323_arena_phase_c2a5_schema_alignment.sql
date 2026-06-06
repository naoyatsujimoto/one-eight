-- Phase C-2a.5: Arena schema alignment migration
-- arena_matches に不足列を追加

ALTER TABLE arena_matches
  ADD COLUMN IF NOT EXISTS official_match_id uuid REFERENCES official_matches(id),
  ADD COLUMN IF NOT EXISTS match_kind text,
  ADD COLUMN IF NOT EXISTS master_subtype text,
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS winner_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS loser_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS black_point_delta int,
  ADD COLUMN IF NOT EXISTS white_point_delta int,
  ADD COLUMN IF NOT EXISTS master_effect text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

-- arena_matches CHECK制約
ALTER TABLE arena_matches
  ADD CONSTRAINT arena_matches_match_kind_check
  CHECK (match_kind IS NULL OR match_kind IN ('master','point'));

ALTER TABLE arena_matches
  ADD CONSTRAINT arena_matches_master_subtype_check
  CHECK (master_subtype IS NULL OR master_subtype IN ('inaugural','defend','master_succession','interim_set'));

ALTER TABLE arena_matches
  ADD CONSTRAINT arena_matches_end_reason_check
  CHECK (end_reason IS NULL OR end_reason IN ('normal','timeout','no_show','draw_agreement','resign','forfeit','no_contest'));

ALTER TABLE arena_matches
  ADD CONSTRAINT arena_matches_master_effect_check
  CHECK (master_effect IS NULL OR master_effect IN (
    'none',
    'inaugural_set',
    'defended',
    'transferred',
    'interim_set',
    'interim_replaced',
    'interim_confirmed_official',
    'no_change'
  ));

-- arena_matches 一意制約 / index
CREATE UNIQUE INDEX IF NOT EXISTS arena_matches_event_round_uniq
  ON arena_matches(arena_event_id, round);

CREATE UNIQUE INDEX IF NOT EXISTS arena_matches_official_match_uniq
  ON arena_matches(official_match_id)
  WHERE official_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS arena_matches_official_match_idx
  ON arena_matches(official_match_id);

CREATE INDEX IF NOT EXISTS arena_matches_status_processed_idx
  ON arena_matches(status, processed_at);

-- arena_points に不足列を追加
ALTER TABLE arena_points
  ADD COLUMN IF NOT EXISTS no_show_losses int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS participations int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS matches_played int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_played_event_id uuid REFERENCES arena_events(id);

-- arena_points ranking index
CREATE INDEX IF NOT EXISTS arena_points_ranking_idx
  ON arena_points(arena_id, season, points DESC, win_count DESC, participations DESC, user_id);

-- arena_master_history に Interim対応列を追加
ALTER TABLE arena_master_history
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS source_arena_event_id uuid REFERENCES arena_events(id),
  ADD COLUMN IF NOT EXISTS source_arena_match_id uuid REFERENCES arena_matches(id),
  ADD COLUMN IF NOT EXISTS source_official_match_id uuid REFERENCES official_matches(id);

-- arena_master_history CHECK制約
ALTER TABLE arena_master_history
  ADD CONSTRAINT arena_master_history_status_check
  CHECK (status IN ('official','interim'));

ALTER TABLE arena_master_history
  ADD CONSTRAINT arena_master_history_reason_check
  CHECK (
    reason IS NULL OR reason IN (
      'inaugural',
      'defeated_master',
      'master_absent_interim',
      'interim_confirmed',
      'forfeit_win',
      'admin_adjusted'
    )
  );

-- arena_master_history partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS arena_master_active_official_uniq
  ON arena_master_history(arena_id, season)
  WHERE status = 'official' AND dethroned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS arena_master_active_interim_uniq
  ON arena_master_history(arena_id, season)
  WHERE status = 'interim' AND dethroned_at IS NULL;

-- arena_definitions に Master cache列を追加
ALTER TABLE arena_definitions
  ADD COLUMN IF NOT EXISTS current_master_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS current_interim_master_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS current_master_since_event_id uuid REFERENCES arena_events(id),
  ADD COLUMN IF NOT EXISTS current_interim_since_event_id uuid REFERENCES arena_events(id);
