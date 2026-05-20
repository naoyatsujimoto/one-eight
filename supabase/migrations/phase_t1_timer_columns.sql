-- Phase T-1: タイムクロック対応 match_logs カラム追加
ALTER TABLE match_logs
  ADD COLUMN IF NOT EXISTS timer_config jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS end_reason text DEFAULT 'normal';

COMMENT ON COLUMN match_logs.timer_config IS 'タイムクロック設定 (mode / totalSeconds / perMoveSeconds)';
COMMENT ON COLUMN match_logs.end_reason IS '終了理由: normal | timeout';
