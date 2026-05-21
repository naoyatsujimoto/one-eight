-- Phase T-2a: オンライン対戦タイムクロック対応 — online_games カラム追加
-- 実行: Supabase SQL Editor で適用

ALTER TABLE online_games
  ADD COLUMN IF NOT EXISTS timer_config         jsonb       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS black_remaining_ms   int         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS white_remaining_ms   int         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS turn_started_at      timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS end_reason           text        DEFAULT 'normal'
                             CHECK (end_reason IN ('normal','timeout','resign','draw_agreement')),
  ADD COLUMN IF NOT EXISTS timeout_player       text        DEFAULT NULL
                             CHECK (timeout_player IN ('black','white') OR timeout_player IS NULL),
  ADD COLUMN IF NOT EXISTS server_updated_at    timestamptz DEFAULT now();

COMMENT ON COLUMN online_games.timer_config IS
  '{"mode":"none"|"total_time"|"per_move","totalSeconds":600,"perMoveSeconds":30} — NULL で既存オンライン対戦は完全保護';
COMMENT ON COLUMN online_games.black_remaining_ms IS
  'total_time: 黒の残り持ち時間(ms) / per_move: NULL / タイマーなし: NULL';
COMMENT ON COLUMN online_games.white_remaining_ms IS
  'total_time: 白の残り持ち時間(ms) / per_move: NULL / タイマーなし: NULL';
COMMENT ON COLUMN online_games.turn_started_at IS
  '現在の手番開始時刻(DBサーバー時刻) — timeout判定の基準値';
COMMENT ON COLUMN online_games.end_reason IS
  'ゲーム終了理由: normal / timeout / resign / draw_agreement';
COMMENT ON COLUMN online_games.timeout_player IS
  'タイムアウトしたプレイヤーの色 (black / white / NULL)';
COMMENT ON COLUMN online_games.server_updated_at IS
  'RPC更新時のDBサーバー時刻 — クライアント時刻補正用';
