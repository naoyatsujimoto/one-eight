# sim 追加手順（2026-05-14 改訂版）

## 概要

2026-05-14 に sim_position_stats を Supabase から削除。
以降の sim 追加では **Phase B を実行しない**。

---

## 実行フロー（現行）

```
Phase A: sim_match_logs INSERT          ← 実行する
Phase B: sim_position_stats upsert      ← ❌ 廃止（テーブル削除済み）
Phase C: sim_medium_pattern_stats upsert ← 実行する
```

---

## Step 1: Phase A — sim_match_logs INSERT

### テンプレート
`scripts/import_sim_template_NEXT.ts` を参照。

### 変更箇所（次回ファイル名・定数）

| 定数 | 内容 | 例 |
|---|---|---|
| `SIM_FILE_PATH` | md原本ファイルパス | `/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_easy_vs_easy_20260601.md` |
| `SIM_BATCH_ID` | バッチID（重複不可） | `easy_20260601_016` |
| `GENERATED_AT` | 生成日時 | `2026-06-01T00:00:00Z` |
| `EXPECTED_GAME_COUNT` | 局数 | `10000` |

### 実行コマンド
```bash
cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
nohup npx vite-node scripts/import_sim_easy_sXX.ts > /tmp/sXX_import.log 2>&1 &
tail -f /tmp/sXX_import.log
```

---

## Step 2: Phase B — 廃止

**実行禁止。** sim_position_stats テーブルは Supabase 上に存在しない。

既存スクリプト（s8〜s15）の Phase B ブロックも実行してはならない。

---

## Step 3: Phase C — sim_medium_pattern_stats upsert

Phase A 完了後に実行する。

### テンプレート
`scripts/phase_c_med_s15.ts` を参照・コピーして使う。

### 変更箇所

| 定数 | 内容 |
|---|---|
| `SIM_BATCH_ID` | Phase A と同じ値 |
| 異常検知 `base` 値 | 前回の ge30/ge50/ge100/maxTotal を更新 |

### 実行コマンド
```bash
cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
npx vite-node scripts/phase_c_med_sXX.ts 2>&1 | tee /tmp/sXX_phase_c.log
```

---

## 確認チェックリスト

Phase A 完了後:
- [ ] sim_match_logs に新 batch_id が挿入されていること
- [ ] sim_match_logs 総件数が想定通りであること
- [ ] match_logs（実戦）件数が変化していないこと
- [ ] position_stats（実戦）件数が変化していないこと

Phase C 完了後:
- [ ] sim_medium_pattern_stats 件数が増加していること
- [ ] total>=30 件数が前回以上であること（減少は異常）
- [ ] 最大 total が前回以上または合理的範囲内であること
- [ ] match_logs / position_stats（実戦）が変化していないこと

---

## 禁止事項

- `batch_upsert_sim_position_stats` RPC の呼び出し禁止
- `sim_position_stats` テーブルへの INSERT / SELECT 禁止
- `match_logs` / `position_stats` / `medium_pattern_stats`（実戦）への書き込み禁止

---

## 参照ファイル

| ファイル | 用途 |
|---|---|
| `scripts/import_sim_template_NEXT.ts` | Phase A テンプレート |
| `scripts/phase_c_med_s15.ts` | Phase C 最新実装（コピー元） |
| `backup/sim_position_stats_deletion_record.md` | sim_position_stats 削除前記録 |
