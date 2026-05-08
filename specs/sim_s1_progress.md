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

## 次フェーズ

- **S-2**: sim_position_stats を postmortem fallback に接続
  - 参照優先順位: 実戦 canonical → 実戦 symmetry → sim very_hard → sim hard → sim easy → static fallback
  - UIに sim 由来であることを明示する必要はない
  - 内部では source / sim_policy / sim_batch_id を保持
- **S-3**: Naoyaから追加simデータ（hard / very_hard）を都度受け取り増量

## 制約遵守確認

- match_logs / position_stats への書き込み: **なし**
- UIへの接続: **なし**（S-2で実施）
- postmortem fallbackへの接続: **なし**（S-2で実施）
- Step F-3 / 探索枝刈り: **未着手**
