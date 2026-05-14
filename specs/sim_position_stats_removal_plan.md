# sim_position_stats 削除計画

作成日: 2026-05-14  
状態: **承認待ち（実行前）**  
実行者: Naoya承認後 Gate D 実行

---

## 1. 確認済みテーブル容量（Supabase Dashboard 実測値）

| オブジェクト | 種別 | サイズ |
|---|---|---|
| public.sim_position_stats | テーブル本体 | 約 1.18 GB |
| public.sim_position_stats_pkey | PRIMARY KEY index | 約 344 MB |
| public.x_sim_position_stats_hash | HASH index | 約 275 MB |
| **sim_position_stats 合計** | | **約 1.80 GB** |
| public.sim_match_logs | テーブル本体 | 約 289 MB |
| public.sim_medium_pattern_stats | テーブル本体 | 約 165 MB |

### 現在の行数・統計

| テーブル | 行数 |
|---|---|
| sim_position_stats | 5,359,301 行以上 |
| sim_match_logs | 100,000 件（15バッチ） |
| sim_medium_pattern_stats | 671,588 行（easy_vs_easy） |
| match_logs（実戦） | 34 件 |
| position_stats（実戦） | 1,656 行 |
| medium_pattern_stats（実戦） | 481 行 |

### sim_position_stats 統計（easy_vs_easy）

| 指標 | 値 |
|---|---|
| MAX total | 3,888 |
| total >= 50 | 72 件 |
| total >= 100 | 72 件 |
| total >= 200 | 72 件 |
| total >= 500 | 72 件 |

---

## 2. Supabase SQL Editor 向け容量確認SQL（Naoya実行用）

```sql
-- テーブル・index 別サイズ確認（public スキーマ全体）
SELECT
  n.nspname AS schema,
  c.relname AS name,
  CASE c.relkind WHEN 'r' THEN 'table' WHEN 'i' THEN 'index' END AS type,
  pg_size_pretty(pg_relation_size(c.oid)) AS size_pretty,
  pg_relation_size(c.oid) AS size_bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r','i')
ORDER BY pg_relation_size(c.oid) DESC
LIMIT 30;
```

---

## 3. sim_position_stats 削除による影響

### 3-1. postmortem fallback chain への影響

現在の fallback chain（Step 順）:

```
Step 1:   実戦 canonical_hash (position_stats)          ← 維持
Step 1.5: 実戦 medium_pattern_id (medium_pattern_stats) ← 維持
Step 2:   symmetry_group_id                              ← 維持
Step 2.3: sim medium_pattern (sim_medium_pattern_stats)  ← 維持
Step 2.5: sim canonical_hash (sim_position_stats)        ← 削除対象
Step 3:   static WP                                      ← 維持
```

**影響の評価:**

- Step 2.5（sim canonical fallback）が消える
- ただし total >= 100 の局面は **72件のみ**（全体 5,359,301 行の約 0.0013%）
- 有効に機能している局面はほぼ M1 付近に限定される
- Step 2.3（sim_medium_pattern fallback）が主要な sim fallback として機能しており、
  Step 2.5 の削除による実用上の影響は **軽微**

**削除理由は「不機能」ではなく「容量対効果が極めて低いこと」。**

- 1.80 GB の容量を消費しながら、fallback として機能するケースは全局面の 0.0013% に限られる
- sim_medium_pattern_stats（165 MB）が十分な代替 fallback として機能している
- sim canonical 集計は Mac mini 側にバックアップすることで永続保持が可能

### 3-2. 依存コード箇所

| ファイル | 種別 | 修正内容 |
|---|---|---|
| `src/game/postmortem.ts` | 本体 | import・Promise.all・Step 2.5ブロック削除 |
| `src/game/positionStats.ts` | 本体 | `fetchSimPositionWinRates` / `SimPositionWinRateRow` は残置可（削除しても可） |
| `src/tests/sim_position_stats_fallback.test.ts` | テスト | ファイル丸ごと削除 |
| `src/tests/position_stats.test.ts` | テスト | mockの1行削除 |
| `src/tests/medium_pattern_postmortem.test.ts` | テスト | mockの1行削除 |
| `scripts/import_sim_easy_*.ts` | バッチスクリプト | 将来的に Phase B を除去（今は変更不要） |

---

## 4. postmortem.ts 修正案（最終版）

### 変更箇所1: import（L14）

**変更前:**
```typescript
import { fetchPositionWinRates, fetchSymmetryGroupWinRates, fetchSimPositionWinRates, fetchMediumPatternWinRates, fetchSimMediumPatternWinRates } from './positionStats';
```

**変更後:**
```typescript
import { fetchPositionWinRates, fetchSymmetryGroupWinRates, fetchMediumPatternWinRates, fetchSimMediumPatternWinRates } from './positionStats';
```

### 変更箇所2: import type（L16）

**変更前:**
```typescript
import type { SimPositionWinRateRow, MediumPatternWinRateRow, SimMediumPatternWinRateRow } from './positionStats';
```

**変更後:**
```typescript
import type { MediumPatternWinRateRow, SimMediumPatternWinRateRow } from './positionStats';
```

### 変更箇所3: winRateSource 型（L194）

**変更前:**
```typescript
winRateSource?: 'position_stats' | 'symmetry_group' | 'sim_easy' | 'medium_pattern' | 'sim_medium_pattern';
```

**変更後:**
```typescript
winRateSource?: 'position_stats' | 'symmetry_group' | 'medium_pattern' | 'sim_medium_pattern';
```

### 変更箇所4: Promise.all destructuring（L483）

**変更前:**
```typescript
const [canonicalMap, symmetryMap, simEasyMap, mediumPatternMap, simMediumPatternMap] =
    await Promise.all([
```

**変更後:**
```typescript
const [canonicalMap, symmetryMap, mediumPatternMap, simMediumPatternMap] =
    await Promise.all([
```

### 変更箇所5: Promise.all 内 sim_easy エントリ削除（L495-499）

**削除するブロック:**
```typescript
      // sim_easy 統計（Step 2.5 fallback）
      hashes.length > 0
        ? fetchSimPositionWinRates(hashes, 'easy_vs_easy', 100).catch(() => new Map())
        : Promise.resolve(new Map<string, SimPositionWinRateRow>()),
```

### 変更箇所6: Step 2.5 ブロック削除（L598-622）

**削除するブロック:**
```typescript
    // ──────────────────────────────────────────────────────────────────────────
    // Step 2.5: sim_easy canonical_hash fallback
    //   採用条件: totalMoves の 60% 以上の手番 かつ sim total >= 100
    //   resolvedWP: 0.2 × simWP + 0.8 × staticWP
    // ──────────────────────────────────────────────────────────────────────────
    const totalMoves = history.length;
    const simStat = hash ? simEasyMap.get(hash) : undefined;
    if (simStat && simStat.win_rate_black !== null && simStat.total >= 100) {
      const gameProgress = row.moveNum / totalMoves;
      if (gameProgress >= 0.6) {
        const simWP = simStat.win_rate_black / 100;
        const blendedWP = 0.2 * simWP + 0.8 * row.wpAfter;
        const rowWithSim = {
          ...row,
          historicWinRate: simStat.win_rate_black,
          sampleCount: simStat.total,
          confidence: 'reference' as const,
          winRateSource: 'sim_easy' as const,
          resolvedWP: blendedWP,
          resolvedWpSource: 'blend' as const,
        };
        return rowWithSim;
      }
    }
```

---

## 5. テストファイル修正案（最終版）

### sim_position_stats_fallback.test.ts（248行）
→ **ファイル丸ごと削除**（Step 2.5 専用テスト）

### position_stats.test.ts（L14）
```typescript
// 削除する行:
  fetchSimPositionWinRates: vi.fn().mockResolvedValue(new Map()),
```

### medium_pattern_postmortem.test.ts（L24）
```typescript
// 削除する行:
  fetchSimPositionWinRates: vi.fn().mockResolvedValue(new Map()),
```

---

## 6. バックアップ手順（最終版）

### Step 1: エクスポートスクリプト実行

```bash
cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
npx vite-node scripts/export_sim_position_stats.ts
```

出力先:
- `~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD.jsonl.gz`（データ本体）
- `~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD_meta.json`（行数・日時等）

所要時間目安: 5,359,301 行 ÷ 1,000行/ページ ≒ 5,360 リクエスト → 約15〜30分

### Step 2: バックアップ確認

```bash
# ファイル存在・サイズ確認
ls -lh ~/Desktop/ONE_EIGHT/backup/

# メタデータ確認
cat ~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD_meta.json

# 先頭3行確認
zcat ~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD.jsonl.gz | head -3
```

### Step 3: Naoya承認 → DROP実行

---

## 7. 削除SQL案（最終版・Naoya承認後に実行）

```sql
-- ① HASH index 削除
DROP INDEX IF EXISTS public.x_sim_position_stats_hash;

-- ② テーブル削除（PRIMARY KEY index も連動削除）
DROP TABLE IF EXISTS public.sim_position_stats;
```

**削除しないもの（明示）:**
- `public.sim_match_logs` → 維持
- `public.sim_medium_pattern_stats` → 維持
- `public.match_logs` → 維持（実戦）
- `public.position_stats` → 維持（実戦）
- `public.medium_pattern_stats` → 維持（実戦）

---

## 8. 削除後の残存テーブル

| テーブル | 状態 | 用途 |
|---|---|---|
| match_logs | 維持 | 実戦ログ原本 |
| position_stats | 維持 | 実戦 canonical 統計 |
| medium_pattern_stats | 維持 | 実戦 medium 統計 |
| sim_medium_pattern_stats | 維持 | sim medium fallback（主要） |
| sim_match_logs | 当面維持 | 10万局処理続行・medium 集計ソース |
| ~~sim_position_stats~~ | **削除** | sim canonical（Step 2.5・容量対効果が極めて低い） |

---

## 9. 削除後のDB容量見込み

| 項目 | 容量 |
|---|---|
| sim_position_stats 本体 | -1.18 GB |
| sim_position_stats_pkey | -344 MB |
| x_sim_position_stats_hash | -275 MB |
| **合計削減** | **約 -1.80 GB** |

削除後の残存容量目安:
- sim_match_logs: 289 MB
- sim_medium_pattern_stats: 165 MB
- 実戦テーブル群: ≪ 1 MB
- **合計 ≈ 455 MB 前後**

---

## 10. Mac mini バックアップ対象まとめ

| 対象 | 形式 | 場所 |
|---|---|---|
| sim canonical 集計 | jsonl.gz | `~/Desktop/ONE_EIGHT/backup/sim_position_stats_YYYYMMDD.jsonl.gz` |
| バッチメタデータ | meta.json | `~/Desktop/ONE_EIGHT/backup/*_meta.json` |
| sim medium 集計 | Supabase 維持（将来必要ならエクスポート） | — |
| sim 原本 .md | Mac mini 正規ソース | `~/Desktop/ONE_EIGHT/sim_data/` 以下 |

---

## 11. sim_match_logs 削除判断保留

- 100,000 局処理（s15 等）の続きが完了するまで維持
- 完了後に medium 集計が正常であれば削除候補
- 削除する場合の容量削減: 約 -289 MB

---

## 12. 承認フロー

1. [ ] Naoya: この計画書を確認・承認
2. [ ] Gate D: `export_sim_position_stats.ts` 実行・バックアップ確認（所要 15〜30分）
3. [ ] Naoya: Supabase SQL Editor で DROP INDEX → DROP TABLE 実行
4. [ ] Gate D: postmortem.ts・テスト修正・build/test 確認
5. [ ] Gate D: push → production 反映確認
