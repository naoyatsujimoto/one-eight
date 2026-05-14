-- sim_position_only_stats: Position所有のみ（C4正規化）でグループ化した sim 統計
-- fallback chain: sim_medium_pattern → sim_position_only → static
-- threshold: total >= 100, blend: 0.1 × positionOnlyWP + 0.9 × staticWP

CREATE TABLE IF NOT EXISTS sim_position_only_stats (
  position_only_id  text        NOT NULL,
  sim_policy        text        NOT NULL DEFAULT 'easy_vs_easy',
  wins_black        integer     NOT NULL DEFAULT 0,
  wins_white        integer     NOT NULL DEFAULT 0,
  draws             integer     NOT NULL DEFAULT 0,
  total             integer     NOT NULL DEFAULT 0,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (position_only_id, sim_policy)
);

CREATE INDEX IF NOT EXISTS x_sim_position_only_stats_total
  ON sim_position_only_stats (sim_policy, total DESC);

COMMENT ON TABLE sim_position_only_stats IS
  'Position所有のみ（C4正規化）グループ別の勝率統計。sim_policy=easy_vs_easy, 100k局ベース。';
