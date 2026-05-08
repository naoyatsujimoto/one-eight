-- =============================================================================
-- Migration: position_stats / symmetry_group_stats / canonical_hashes_computed
-- Phase N-1b — ONE EIGHT ポストモータム基盤
-- =============================================================================
-- 実行方法: Supabase SQL Editor にこのファイルの内容をそのまま貼り付けて実行
-- 冪等設計: IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS を使用
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. match_logs に canonical_hashes_computed カラムを追加
-- -----------------------------------------------------------------------------
-- 役割: バックフィルスクリプト実行済みフラグ
--   false (default): canonical_hash が未計算 or 付与前の古い棋譜
--   true           : 全 MoveRecord に canonical_hash が付与済み
-- バックフィルスクリプトは計算完了後にこのフラグを true に更新する

ALTER TABLE match_logs
  ADD COLUMN IF NOT EXISTS canonical_hashes_computed BOOLEAN NOT NULL DEFAULT FALSE;

-- -----------------------------------------------------------------------------
-- 2. position_stats テーブル作成
-- -----------------------------------------------------------------------------
-- 役割: canonical_hash × mode_group 別の局面勝率集計（再生成可能な派生テーブル）
-- 原本: match_logs.full_record
-- 更新: Edge Function (update-position-stats) または日次バッチのみ
--
-- mode_group の値:
--   'all'                 : 全モード合計（最大母集団・フォールバック用）
--   'pvp'                 : human_vs_human（ローカル対人）
--   'online'              : オンライン対戦
--   'cpu_${difficulty}'   : CPU対戦（difficulty は cpu_difficulty カラムの値）
--                           例: 'cpu_normal' / 'cpu_hard' / 'cpu_very_hard'
--                           ※将来 difficulty が増えても schema 変更不要
--                           ※不正な difficulty 文字列はアプリ側で正規化・拒否する
--
-- cpu_difficulty = null の棋譜: 'all' のみに計上（難易度不明は difficulty 別統計に含めない）

CREATE TABLE IF NOT EXISTS position_stats (
  canonical_hash   TEXT        NOT NULL,
  mode_group       TEXT        NOT NULL,
  wins_black       INTEGER     NOT NULL DEFAULT 0,
  wins_white       INTEGER     NOT NULL DEFAULT 0,
  draws            INTEGER     NOT NULL DEFAULT 0,
  total            INTEGER     NOT NULL DEFAULT 0,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_hash, mode_group)
);

-- canonical_hash 単体での検索インデックス（postmortem での batch 取得に使用）
CREATE INDEX IF NOT EXISTS idx_position_stats_hash
  ON position_stats (canonical_hash);

-- mode_group での絞り込みインデックス（全局面の mode_group 別集計に使用）
CREATE INDEX IF NOT EXISTS idx_position_stats_mode_group
  ON position_stats (mode_group);

-- -----------------------------------------------------------------------------
-- 3. symmetry_group_stats テーブル作成
-- -----------------------------------------------------------------------------
-- 役割: symmetry group ID (D4 orbit) 別の局面勝率集計
-- 有効化: Step F-3 で symmetry group ID の実装が完了してから集計開始
-- 現時点: テーブルのみ作成・データ投入なし
-- mode_group の値・設計は position_stats と同じ

CREATE TABLE IF NOT EXISTS symmetry_group_stats (
  symmetry_group_id  TEXT        NOT NULL,
  mode_group         TEXT        NOT NULL,
  wins_black         INTEGER     NOT NULL DEFAULT 0,
  wins_white         INTEGER     NOT NULL DEFAULT 0,
  draws              INTEGER     NOT NULL DEFAULT 0,
  total              INTEGER     NOT NULL DEFAULT 0,
  first_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symmetry_group_id, mode_group)
);

CREATE INDEX IF NOT EXISTS idx_symmetry_group_stats_id
  ON symmetry_group_stats (symmetry_group_id);

CREATE INDEX IF NOT EXISTS idx_symmetry_group_stats_mode_group
  ON symmetry_group_stats (mode_group);

-- -----------------------------------------------------------------------------
-- 4. RLS ポリシー
-- -----------------------------------------------------------------------------

-- position_stats: public read / SECURITY DEFINER 関数のみ書き込み可
ALTER TABLE position_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read position_stats" ON position_stats;
CREATE POLICY "public read position_stats"
  ON position_stats
  FOR SELECT
  TO public
  USING (true);

-- symmetry_group_stats: public read / SECURITY DEFINER 関数のみ書き込み可
ALTER TABLE symmetry_group_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read symmetry_group_stats" ON symmetry_group_stats;
CREATE POLICY "public read symmetry_group_stats"
  ON symmetry_group_stats
  FOR SELECT
  TO public
  USING (true);

-- match_logs の RLS（既存ポリシーがあれば共存。なければ追加）
-- SELECT: 自分のレコードのみ
-- INSERT: 認証済みユーザーのみ・user_id = auth.uid() 必須
-- UPDATE/DELETE: 不可（誰も変更できない）
ALTER TABLE match_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users select own match_logs" ON match_logs;
CREATE POLICY "users select own match_logs"
  ON match_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users insert own match_logs" ON match_logs;
CREATE POLICY "users insert own match_logs"
  ON match_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. バッチ UPSERT 関数: batch_upsert_position_stats
-- -----------------------------------------------------------------------------
-- 役割: Edge Function / バックフィルスクリプトから呼び出す
--       1ゲーム分の全 canonical_hash を一括 UPSERT する
--
-- 引数:
--   p_hashes      TEXT[]  — 1ゲームの全 MoveRecord の canonical_hash 配列
--   p_winner      TEXT    — 'black' | 'white' | 'draw'
--   p_mode_groups TEXT[]  — 集計対象の mode_group 配列
--                           例: ['all', 'cpu_hard'] または ['all', 'pvp']
--
-- 設計原則:
--   - 同じ canonical_hash が複数手で出現してもそれぞれ独立してカウント
--     （「この局面に何回到達したか」ではなく「この局面を通過した対局の結果」）
--   - ただし、1ゲーム内での重複 canonical_hash は1回のみカウントする
--     （同一ゲーム内での千日手的繰り返しを除外）

CREATE OR REPLACE FUNCTION batch_upsert_position_stats(
  p_hashes      TEXT[],
  p_winner      TEXT,
  p_mode_groups TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash      TEXT;
  v_group     TEXT;
  v_unique_hashes TEXT[];
BEGIN
  -- 1ゲーム内での重複 canonical_hash を除去（DISTINCT）
  SELECT ARRAY(SELECT DISTINCT unnest(p_hashes) WHERE unnest IS NOT NULL)
  INTO v_unique_hashes;

  -- 各 hash × 各 mode_group の組み合わせを UPSERT
  FOREACH v_hash IN ARRAY v_unique_hashes LOOP
    FOREACH v_group IN ARRAY p_mode_groups LOOP
      INSERT INTO position_stats
        (canonical_hash, mode_group, wins_black, wins_white, draws, total, last_updated_at)
      VALUES (
        v_hash,
        v_group,
        CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
        CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
        CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
        1,
        now()
      )
      ON CONFLICT (canonical_hash, mode_group) DO UPDATE SET
        wins_black      = position_stats.wins_black + CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
        wins_white      = position_stats.wins_white + CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
        draws           = position_stats.draws      + CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
        total           = position_stats.total      + 1,
        last_updated_at = now();
    END LOOP;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: get_position_win_rates
-- -----------------------------------------------------------------------------
-- 役割: postmortem が canonical_hash のリストを渡して、一括で勝率を取得する
-- 呼び出し元: src/game/postmortem.ts (Phase N-3 以降)
-- 引数:
--   hashes     TEXT[]  — 照会する canonical_hash の配列
--   mode_group TEXT    — 取得する mode_group（default: 'all'）

CREATE OR REPLACE FUNCTION get_position_win_rates(
  hashes     TEXT[],
  mode_group TEXT DEFAULT 'all'
)
RETURNS TABLE (
  canonical_hash TEXT,
  wins_black     INTEGER,
  wins_white     INTEGER,
  draws          INTEGER,
  total          INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.canonical_hash,
    ps.wins_black,
    ps.wins_white,
    ps.draws,
    ps.total
  FROM position_stats ps
  WHERE ps.canonical_hash = ANY(hashes)
    AND ps.mode_group = get_position_win_rates.mode_group;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: get_symmetry_group_win_rates
-- -----------------------------------------------------------------------------
-- 役割: symmetry group ID のリストを渡して勝率を一括取得する
-- 有効化: Step F-3 完了・symmetry_group_stats にデータが投入されてから使用
-- 現時点: 関数のみ作成・データなし

CREATE OR REPLACE FUNCTION get_symmetry_group_win_rates(
  group_ids  TEXT[],
  mode_group TEXT DEFAULT 'all'
)
RETURNS TABLE (
  symmetry_group_id TEXT,
  wins_black        INTEGER,
  wins_white        INTEGER,
  draws             INTEGER,
  total             INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sgs.symmetry_group_id,
    sgs.wins_black,
    sgs.wins_white,
    sgs.draws,
    sgs.total
  FROM symmetry_group_stats sgs
  WHERE sgs.symmetry_group_id = ANY(group_ids)
    AND sgs.mode_group = get_symmetry_group_win_rates.mode_group;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC: rebuild_position_stats_from_match_logs
-- -----------------------------------------------------------------------------
-- 役割: position_stats を match_logs から全件再構築する（障害復旧・整合性修復用）
-- 前提: match_logs.full_record の各 MoveRecord に canonical_hash が付与済みであること
--       （canonical_hashes_computed = true のレコードのみ対象）
-- 実行: 日次バッチ or 手動実行（postmortem からは呼ばない）
-- 注意: 実行前に position_stats を TRUNCATE してから呼ぶこと

CREATE OR REPLACE FUNCTION rebuild_position_stats_from_match_logs()
RETURNS TABLE (processed_count INTEGER, skipped_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row           RECORD;
  v_move          JSONB;
  v_hash          TEXT;
  v_hashes        TEXT[];
  v_mode_groups   TEXT[];
  v_processed     INTEGER := 0;
  v_skipped       INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT id, mode, cpu_difficulty, winner, full_record
    FROM match_logs
    WHERE canonical_hashes_computed = TRUE
      AND winner IS NOT NULL
      AND winner != ''
      AND full_record IS NOT NULL
      AND jsonb_array_length(full_record) > 0
  LOOP
    -- canonical_hash を full_record から抽出
    v_hashes := ARRAY[]::TEXT[];
    FOR v_move IN SELECT * FROM jsonb_array_elements(v_row.full_record)
    LOOP
      v_hash := v_move->>'canonical_hash';
      IF v_hash IS NOT NULL AND v_hash != '' THEN
        v_hashes := array_append(v_hashes, v_hash);
      END IF;
    END LOOP;

    -- hash が1件もなければスキップ
    IF array_length(v_hashes, 1) IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- mode_groups を決定
    v_mode_groups := ARRAY['all'];
    IF v_row.mode = 'human_vs_human' THEN
      v_mode_groups := array_append(v_mode_groups, 'pvp');
    ELSIF v_row.mode = 'online' THEN
      v_mode_groups := array_append(v_mode_groups, 'online');
    ELSIF v_row.mode = 'human_vs_cpu' AND v_row.cpu_difficulty IS NOT NULL THEN
      -- 'cpu_${difficulty}' 形式で追加
      -- 英小文字・数字・アンダースコアのみ許可（不正な文字列を弾く）
      IF v_row.cpu_difficulty ~ '^[a-z0-9_]+$' THEN
        v_mode_groups := array_append(v_mode_groups, 'cpu_' || v_row.cpu_difficulty);
      END IF;
      -- null の場合は 'all' のみ（cpu_unknown グループは作らない）
    END IF;

    -- UPSERT
    PERFORM batch_upsert_position_stats(v_hashes, v_row.winner, v_mode_groups);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_skipped;
END;
$$;

-- =============================================================================
-- 実行確認クエリ（実行後にこれで確認する）
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('position_stats', 'symmetry_group_stats');
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'match_logs' AND column_name = 'canonical_hashes_computed';
--
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'batch_upsert_position_stats',
--     'get_position_win_rates',
--     'get_symmetry_group_win_rates',
--     'rebuild_position_stats_from_match_logs'
--   );
