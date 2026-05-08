# sim S-1 取り込み進捗ログ

## 完了日時
2026-05-08 JST

**ステータス: ✅ S-1 完了**

---

## 最終結果

| 項目 | 結果 |
|---|---|
| sim_match_logs | 1,000件 ✅ |
| sim_position_stats | 55,691件 ✅ |
| canonical_hash付与 | 1,000/1,000件 成功 ✅ |
| delete/再取り込みテスト | ✅ |
| 実戦テーブル汚染 | なし（match_logs: 34件、position_stats: 1,656件 変化なし）✅ |

---

## 修正済みファイル

| ファイル | 修正内容 |
|---|---|
| `scripts/import_sim_easy_s1.ts` | import文パス修正（`./src/game/` → `../src/game/` 3箇所） |
| `scripts/import_sim_easy_s1.ts` | game_index をグローバル連番に修正（Batchリセット問題対応） |
| `scripts/import_sim_easy_s1.ts` | INSERT_BATCH_SIZE: 50 → 10（ネットワークタイムアウト対策） |

## Supabase側の修正（Naoya実施）

| 内容 |
|---|
| `sim_tables_s1.sql` 実行（テーブル・RPC作成） |
| `batch_upsert_sim_position_stats` RPC の `unnest` 文法エラー修正 |

---

## sim_batch メタデータ

| 項目 | 値 |
|---|---|
| sim_batch_id | `easy_20260507_001` |
| sim_policy | `easy_vs_easy` |
| source file | `sim_easy_vs_easy_20260507.md` |
| 局数 | 1,000局（4 Batch × 250局） |
| 総手数 | 56,672手 |
| 平均手数 | 56.7手 |

---

## S-2 完了（2026-05-08 JST）

**ステータス: ✅ S-2 完了**

### 変更ファイル

| ファイル | 内容 |
|---|---|
| `src/game/positionStats.ts` | `SimPositionWinRateRow` 型、`fetchSimPositionWinRates()` 関数を追加 |
| `src/game/postmortem.ts` | `winRateSource` 嵌定型に `'sim_easy'` を追加 |
| `src/game/postmortem.ts` | `enrichPostmortemWithStats()` に Step 2.5 sim_easy fallback を挿入 |
| `src/tests/sim_position_stats_fallback.test.ts` | 新規テスト（6件）追加 |

### sim fallback 仕様

- **插入位置**: Step 2（symmetry）と Step 3（static）の間（Step 2.5）
- **採用条件**: `moveNum / totalMoves >= 0.6`（終盤のみ）かつ `total >= 100`
- **blend 比率**: `resolvedWP = 0.2 * simWinRateBlack + 0.8 * wpAfter`
- **winRateSource**: `'sim_easy'`
- **実戦テーブル汚染**: なし（`sim_position_stats` から読み取りのみ）
- **UI汎用化**: なし（既存の Hist. 表示を壊さない）

### テスト結果

- 追加テスト: 6件（全合格）
- 合計: 220 tests passed
- build: 成功

### 次フェーズ

- **S-3**: Naoyaから追加simデータ（hard / very_hard）を都度受け取り増量

## 制約遵守確認

- match_logs / position_stats への書き込み: **なし**
- UIへの接続: **なし**（S-2で実施）
- postmortem fallbackへの接続: **なし**（S-2で実施）
- Step F-3 / 探索枝刈り: **未着手**
