-- =============================================================================
-- Master報酬制度改定 Phase 1
-- arena_definitions に master_reward_amount_cents / master_reward_currency を追加し、
-- ELEPHANT / JAGUAR に USD 65.00 (= 6500 cents) を設定する。
--
-- 方針:
--   - 未設定 Arena (NULL) は自動的に 65 ドル扱いしない (NULL のまま)
--   - 金額は勝敗・参加者数・会費収入で変動しない
--   - 既存の arena_points / prize_awards 行は一切変更しない
--
-- 禁止:
--   - 本番DB適用 (supabase db push / supabase migration up 等)
--   - commit / push
-- =============================================================================

-- ===================================================
-- 1. arena_definitions にフィールド追加
-- ===================================================
ALTER TABLE arena_definitions
  ADD COLUMN IF NOT EXISTS master_reward_amount_cents INTEGER   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS master_reward_currency     TEXT      DEFAULT NULL;

-- ===================================================
-- 2. DB整合性制約
-- ===================================================
-- amountとcurrencyは両方NULL、または両方設定（片方だけは禁止）
ALTER TABLE arena_definitions
  ADD CONSTRAINT master_reward_both_or_neither CHECK (
    (master_reward_amount_cents IS NULL AND master_reward_currency IS NULL)
    OR
    (master_reward_amount_cents IS NOT NULL AND master_reward_currency IS NOT NULL)
  );

-- 設定するamountは正の整数
ALTER TABLE arena_definitions
  ADD CONSTRAINT master_reward_amount_positive CHECK (
    master_reward_amount_cents IS NULL OR master_reward_amount_cents > 0
  );

-- 通貨はISO 4217形式（大文字3文字）
-- 将来のArenaで別通貨（EUR等）を使用できるよう正規表現で制約
ALTER TABLE arena_definitions
  ADD CONSTRAINT master_reward_currency_format CHECK (
    master_reward_currency IS NULL OR master_reward_currency ~ '^[A-Z]{3}$'
  );

-- ===================================================
-- 3. ELEPHANT / JAGUAR に 6500 / 'USD' を設定
-- ===================================================
UPDATE arena_definitions
   SET master_reward_amount_cents = 6500,
       master_reward_currency     = 'USD'
 WHERE code IN ('ELEPHANT', 'JAGUAR');

-- ===================================================
-- 備考:
--   - 未来の Arena は INSERT 時に明示指定しない限り NULL のまま
--   - NULL Arena に対して admin_generate_arena_prize_awards を呼ぶと
--     RPC 内で master_reward_not_configured エラーが返る（フォールバックなし）
--   - 通貨制約: IN ('USD','JPY') を廃止し、'^[A-Z]{3}$' の正規表現に変更
--     現時点の ELEPHANT/JAGUAR は USD のまま変更しない
-- ===================================================
