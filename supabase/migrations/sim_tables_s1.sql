-- =============================================================================
-- Migration: sim_match_logs / sim_position_stats
-- Phase S-1 — ONE EIGHT sim棋譜パイプライン基盤
-- =============================================================================
-- 実行方法: Supabase SQL Editor にこのファイルの内容をそのまま貼り付けて実行
-- 冪等設計: IF NOT EXISTS / OR REPLACE / DROP ... IF EXISTS を使用
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. sim_match_logs テーブル作成
-- -----------------------------------------------------------------------------
-- 役割: シミュレーション棋譜の保存（match_logs とは完全に分離）
-- 制約: match_logs への書き込みは一切行わない

CREATE TABLE IF NOT EXISTS sim_match_logs (
  id                        UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source                    TEXT        NOT NULL DEFAULT 'sim',
  sim_policy                TEXT        NOT NULL,  -- 'easy_vs_easy' / 'hard_vs_hard' / 'very_hard_vs_very_hard'
  sim_batch_id              TEXT        NOT NULL,  -- 例: 'easy_20260507_001'
  sim_version               TEXT        NOT NULL,
  engine_version            TEXT        NOT NULL,
  rules_version             TEXT        NOT NULL,
  generated_at              TIMESTAMPTZ NOT NULL,
  game_index                INTEGER     NOT NULL,  -- batch内のゲーム番号（1-based）
  winner                    TEXT,                  -- 'black' / 'white' / 'draw' / null
  move_count                INTEGER     NOT NULL,
  full_record               JSONB,                 -- MoveRecord[] with canonical_hash
  canonical_hashes_computed BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sim_batch_id インデックス（バッチ単位の操作に使用）
CREATE INDEX IF NOT EXISTS idx_sim_match_logs_batch_id
  ON sim_match_logs (sim_batch_id);

-- sim_policy インデックス（ポリシー別集計に使用）
CREATE INDEX IF NOT EXISTS idx_sim_match_logs_policy
  ON sim_match_logs (sim_policy);

-- (sim_batch_id, game_index) UNIQUE 制約（同一バッチ内での重複防止）
ALTER TABLE sim_match_logs
  DROP CONSTRAINT IF EXISTS uq_sim_match_logs_batch_game;
ALTER TABLE sim_match_logs
  ADD CONSTRAINT uq_sim_match_logs_batch_game
  UNIQUE (sim_batch_id, game_index);

-- -----------------------------------------------------------------------------
-- 2. sim_position_stats テーブル作成
-- -----------------------------------------------------------------------------
-- 役割: canonical_hash × sim_policy 別のシミュレーション局面勝率集計
-- 原本: sim_match_logs.full_record
-- 更新: batch_upsert_sim_position_stats RPC のみ

CREATE TABLE IF NOT EXISTS sim_position_stats (
  canonical_hash   TEXT        NOT NULL,
  sim_policy       TEXT        NOT NULL,  -- 'easy_vs_easy' / 'hard_vs_hard' / 'very_hard_vs_very_hard'
  wins_black       INTEGER     NOT NULL DEFAULT 0,
  wins_white       INTEGER     NOT NULL DEFAULT 0,
  draws            INTEGER     NOT NULL DEFAULT 0,
  total            INTEGER     NOT NULL DEFAULT 0,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_hash, sim_policy)
);

-- canonical_hash 単体での検索インデックス
CREATE INDEX IF NOT EXISTS idx_sim_position_stats_hash
  ON sim_position_stats (canonical_hash);

-- sim_policy での絞り込みインデックス
CREATE INDEX IF NOT EXISTS idx_sim_position_stats_policy
  ON sim_position_stats (sim_policy);

-- -----------------------------------------------------------------------------
-- 3. RLS ポリシー
-- -----------------------------------------------------------------------------

-- sim_match_logs: SECURITY DEFINER 関数のみ書き込み可 / public read
ALTER TABLE sim_match_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read sim_match_logs" ON sim_match_logs;
CREATE POLICY "public read sim_match_logs"
  ON sim_match_logs
  FOR SELECT
  TO public
  USING (true);

-- sim_position_stats: SECURITY DEFINER 関数のみ書き込み可 / public read
ALTER TABLE sim_position_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read sim_position_stats" ON sim_position_stats;
CREATE POLICY "public read sim_position_stats"
  ON sim_position_stats
  FOR SELECT
  TO public
  USING (true);

-- -----------------------------------------------------------------------------
-- 4. RPC: batch_upsert_sim_position_stats
-- -----------------------------------------------------------------------------
-- 役割: 1ゲーム分の全 canonical_hash を sim_position_stats に一括 UPSERT
-- 引数:
--   p_hashes      TEXT[]  — 1ゲームの全 MoveRecord の canonical_hash 配列
--   p_winner      TEXT    — 'black' | 'white' | 'draw'
--   p_sim_policy  TEXT    — 'easy_vs_easy' 等
-- 設計: 1ゲーム内での重複 canonical_hash は1回のみカウント

CREATE OR REPLACE FUNCTION batch_upsert_sim_position_stats(
  p_hashes      TEXT[],
  p_winner      TEXT,
  p_sim_policy  TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash          TEXT;
  v_unique_hashes TEXT[];
BEGIN
  -- 1ゲーム内での重複 canonical_hash を除去（DISTINCT）
  SELECT ARRAY(SELECT DISTINCT unnest(p_hashes) WHERE unnest IS NOT NULL)
  INTO v_unique_hashes;

  -- 各 hash を UPSERT
  FOREACH v_hash IN ARRAY v_unique_hashes LOOP
    INSERT INTO sim_position_stats
      (canonical_hash, sim_policy, wins_black, wins_white, draws, total, last_updated_at)
    VALUES (
      v_hash,
      p_sim_policy,
      CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
      CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
      CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
      1,
      now()
    )
    ON CONFLICT (canonical_hash, sim_policy) DO UPDATE SET
      wins_black      = sim_position_stats.wins_black + CASE WHEN p_winner = 'black' THEN 1 ELSE 0 END,
      wins_white      = sim_position_stats.wins_white + CASE WHEN p_winner = 'white' THEN 1 ELSE 0 END,
      draws           = sim_position_stats.draws      + CASE WHEN p_winner = 'draw'  THEN 1 ELSE 0 END,
      total           = sim_position_stats.total      + 1,
      last_updated_at = now();
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC: rebuild_sim_position_stats(p_sim_batch_id TEXT)
-- -----------------------------------------------------------------------------
-- 役割: 指定バッチの sim_position_stats を sim_match_logs から再集計
-- 用途: バッチ単位の再計算・障害復旧
-- 前提: canonical_hashes_computed = true のレコードのみ対象

CREATE OR REPLACE FUNCTION rebuild_sim_position_stats(p_sim_batch_id TEXT)
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
  v_processed     INTEGER := 0;
  v_skipped       INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT id, sim_policy, winner, full_record
    FROM sim_match_logs
    WHERE sim_batch_id = p_sim_batch_id
      AND canonical_hashes_computed = TRUE
      AND winner IS NOT NULL
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

    -- UPSERT
    PERFORM batch_upsert_sim_position_stats(v_hashes, v_row.winner, v_row.sim_policy);
    v_processed := v_processed + 1;
  END LOOP;

  RETURN QUERY SELECT v_processed, v_skipped;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: delete_sim_batch(p_sim_batch_id TEXT)
-- -----------------------------------------------------------------------------
-- 役割: 指定バッチを sim_match_logs と sim_position_stats から完全削除
-- 用途: 再取り込み前のクリーンアップ・テスト
-- 注意: sim_position_stats は対象バッチの sim_policy に紐づく hash を削除
--       （他バッチが同じ hash を持つ場合も削除される — rebuild_sim_position_stats で復元可能）

CREATE OR REPLACE FUNCTION delete_sim_batch(p_sim_batch_id TEXT)
RETURNS TABLE (deleted_match_logs INTEGER, deleted_position_stats INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sim_policy    TEXT;
  v_hashes        TEXT[];
  v_deleted_logs  INTEGER;
  v_deleted_stats INTEGER;
BEGIN
  -- 削除対象バッチの sim_policy を取得
  SELECT DISTINCT sml.sim_policy INTO v_sim_policy
  FROM sim_match_logs sml
  WHERE sml.sim_batch_id = p_sim_batch_id
  LIMIT 1;

  IF v_sim_policy IS NULL THEN
    -- バッチが存在しない場合は 0 を返す
    RETURN QUERY SELECT 0::INTEGER, 0::INTEGER;
    RETURN;
  END IF;

  -- 対象バッチの全 canonical_hash を収集
  SELECT ARRAY(
    SELECT DISTINCT elem->>'canonical_hash'
    FROM sim_match_logs sml2,
         jsonb_array_elements(sml2.full_record) AS elem
    WHERE sml2.sim_batch_id = p_sim_batch_id
      AND sml2.full_record IS NOT NULL
      AND elem->>'canonical_hash' IS NOT NULL
  ) INTO v_hashes;

  -- sim_match_logs から削除
  DELETE FROM sim_match_logs
  WHERE sim_batch_id = p_sim_batch_id;
  GET DIAGNOSTICS v_deleted_logs = ROW_COUNT;

  -- sim_position_stats から当該ポリシーの該当 hash を削除
  IF array_length(v_hashes, 1) IS NOT NULL THEN
    DELETE FROM sim_position_stats
    WHERE canonical_hash = ANY(v_hashes)
      AND sim_policy = v_sim_policy;
    GET DIAGNOSTICS v_deleted_stats = ROW_COUNT;
  ELSE
    v_deleted_stats := 0;
  END IF;

  RETURN QUERY SELECT v_deleted_logs, v_deleted_stats;
END;
$$;

-- =============================================================================
-- 実行確認クエリ（実行後にこれで確認する）
-- =============================================================================
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('sim_match_logs', 'sim_position_stats');
--
-- SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--   AND routine_name IN (
--     'batch_upsert_sim_position_stats',
--     'rebuild_sim_position_stats',
--     'delete_sim_batch'
--   );
