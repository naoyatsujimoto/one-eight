# Phase N-1 設計案 v2.1 — ONE EIGHT ポストモータム基盤（確定版）

作成日: 2026-05-07  
前バージョン: `specs/phase_n1_design_v2.md`  
ステータス: 設計案（実装なし・Supabase schema変更なし）

---

## 0. v2 → v2.1 の修正サマリ

| 項目 | v2 | v2.1（本文書） |
|------|-----|---------------|
| 匿名ユーザー保存 | 案X/Y で検討 | **不要。削除。** プレイには認証が必須 |
| pending upload キュー | localStorage に一時保存 | **不要。削除。** |
| localStorage の役割 | キャッシュ + 一時保存 | **キャッシュ・再表示高速化のみ** |
| position_stats の位置づけ | 「集計テーブル」 | **再生成可能な派生集計テーブル**（原本は match_logs） |
| 既存棋譜の扱い | 「旧棋譜はスキップ or 後日バックフィル」 | **full_record があれば再計算・分析対象に含める** |
| symmetry group ID | N-4 以降に後回し | **v2.1 に設計として含める** |

---

## 1. 修正版 Phase N-1 v2.1 の目的

以下3点を達成するための基盤設計を確立する。

1. **全完了棋譜の Supabase 集積**  
   認証済みユーザーによる勝敗確定対局（PvP / PvC / online / offline 問わず）を `match_logs` に保存する。現在33件のうち27件に `full_record` があり、既存棋譜も分析対象に含める。

2. **canonical_hash ベースの局面統計テーブル（position_stats）構築**  
   `match_logs.full_record` から canonical_hash を抽出・集計した派生テーブルを構築する。`position_stats` は原本ではなく、`match_logs` から再生成可能な高速化用集計である。

3. **symmetry group ID による集計密度の向上を設計に組み込む**  
   canonical_hash（厳密局面）に加え、symmetry group ID（D4 対称グループ）による集計を別テーブルに用意し、サンプルが少ない局面での統計精度を補う。

---

## 2. 保存対象と除外対象

### 保存対象

| 条件 | 対象 |
|------|------|
| 認証済みユーザー（authenticated） | ✅ |
| PvC（Human vs CPU）offline | ✅ |
| PvP（Human vs Human）offline | ✅ |
| online 対局 | ✅ |
| 勝敗確定（`winner` が black / white / draw） | ✅ |

### 除外対象

| 条件 | 除外理由 |
|------|---------|
| 未完了ゲーム（`winner = null`） | 勝敗不明のため母集団に含められない |
| 匿名ユーザー | プレイ不可のため設計対象外 |
| `full_record` なし（現在6件） | 手順情報がないため canonical_hash を再計算できない |

---

## 3. 匿名ユーザー保存の削除

**削除する設計要素（v2 から除外）:**

- `one_eight_pending_uploads` localStorage キー → **設計対象外**
- anon INSERT 許可の RLS ポリシー → **設計対象外**
- `flushPendingUploads()` 関数 → **設計対象外**
- `user_id = null` 許容のスキーマ変更 → **設計対象外**

**根拠:**  
プレイには認証が必須であり、未認証ユーザーが棋譜を生成することができない。`match_logs.user_id` は現在 NOT NULL かつ全33件でセットされており、現状通りの設計を維持する。

---

## 4. match_logs / full_record と position_stats の役割分担

```
【原本】
match_logs
  ├── id, user_id, game_id, started_at, ended_at
  ├── mode, human_color, winner, move_count, cpu_difficulty
  └── full_record (JSONB)
        └── MoveRecord[]
              ├── moveNumber, player, positioning, build
              └── canonical_hash?  ← F-2以降のみ存在

      ↓ 派生（Edge Function or バッチで生成）

【派生集計テーブル】                           【再生成可能】
position_stats                               symmetry_group_stats
  ├── canonical_hash (PK + mode_group PK)      ├── symmetry_group_id (PK + mode_group PK)
  ├── wins_black / wins_white / draws / total  ├── wins_black / wins_white / draws / total
  └── last_updated_at                          └── last_updated_at
```

**重要な設計原則:**

- `position_stats` は **match_logs から再生成可能**。テーブルが壊れた・消えた場合、全 `match_logs` レコードを再処理して完全に再構築できる。
- `match_logs.full_record` が唯一の原本。これを保護することが最優先。
- `position_stats` への書き込みは Edge Function / バッチのみ。クライアントは書き込まない。

---

## 5. canonical_hash の役割

### 定義（Step F-1/F-2 確定済み）

- **変換グループ**: C4（4回転のみ）
- **ハッシュ対象**: Position 所有 + Gate assets + currentPlayer + moveNumber
- **正規化**: 4回転変換のうち辞書順最小を canonical とする
- **D,m(1) ≠ D,m(7)** を保持（C4 では R180 が Gate1→Gate7 になるが同時に D→J になるため区別される）

### 用途

| 用途 | 説明 |
|------|------|
| 局面の厳密な同一性判定 | 全状態（位置 + ゲート + 手番 + 手数）が一致した場合のみ同一局面とみなす |
| トランスポジションテーブル | CPU探索での重複局面スキップ（Step F-3 以降） |
| 局面別勝率集計の主キー | `position_stats` の第一キー |
| ポストモータム参照 | 「この局面、過去の対局で何勝何敗か」の問い合わせキー |

---

## 6. 既存棋譜から分析可能かどうか

### 現状（2026-05-07 確認済み）

| 状態 | 件数 |
|------|------|
| full_record あり・canonical_hash なし（F-2 以前） | 27件 |
| full_record なし | 6件 |
| 合計 | 33件 |

### 分析可否の判断

**full_record あり 27件: 分析可能**

MoveRecord には以下が含まれる:
```json
{
  "moveNumber": 1,
  "player": "black",
  "positioning": "J",
  "build": {"type": "quad", "placed": 4, "placedGateIds": [9, 7, 5, 1]}
}
```

- 初期局面は ONE EIGHT では常に同一（空盤）
- `positioning` + `build` + `player` の系列があれば、engine.ts を使って局面を完全に再現できる
- 再現した各局面から `computeCanonicalHashString()` を呼べば canonical_hash を算出できる
- **結論: full_record があれば過去棋譜も canonical_hash を算出・分析対象にできる**

**full_record なし 6件: 分析不可能**

- 手順情報が欠損しているため局面を再現できない
- `position_stats` への反映はスキップ
- 勝敗メタ情報（winner, move_count 等）は別途統計に使える可能性あり（局面別勝率には使えない）

### バックフィル方針

既存27件の canonical_hash バックフィルは **ローカル Node.js スクリプトで実施**する。

```
実行方式:
  1. Supabase から match_logs の full_record を全件取得
  2. 各 MoveRecord 系列を engine.ts で再生（applyMove ループ）
  3. 各 moveNumber 時点の GameState から computeCanonicalHashString() を計算
  4. MoveRecord に canonical_hash を追記
  5. match_logs.full_record を UPDATE（既存データの canonical_hash 補完）
  6. 補完済みレコードを position_stats に反映

スクリプト候補ファイル:
  scripts/backfill_canonical_hash.ts（新規作成・実装は後日）
```

**バックフィルは Phase N-1b 後に実施。スキーマ確定後に進める。**

---

## 7. canonical_hash 統計と symmetry group ID 統計の使い分け

### 設計原則

| 指標 | canonical_hash 統計 | symmetry group ID 統計 |
|------|---------------------|----------------------|
| 変換グループ | C4（4回転） | D4（4回転 + 4反射） |
| 対象状態 | Position + Gate + 手番 + 手数 | Position 所有のみ（手番・手数なし） |
| 粒度 | 厳密（サンプルが少なくなりやすい） | 粗い（サンプルが増えやすい） |
| 主用途 | 「この厳密な局面の勝率」 | 「この戦略的配置パターンの勝率」 |
| 信頼性の条件 | total ≥ 30 で信頼可 | total ≥ 10 程度で参考値として使える |

### ポストモータムでの使い分けフロー

```
ある手（canonical_hash = "abc123"）を分析する時:

Step 1: position_stats で canonical_hash = "abc123" を検索
  → total ≥ 30 なら confidence = 'high'  → canonical_hash 統計を使用
  → 5 ≤ total < 30 なら confidence = 'medium' → canonical_hash 統計（参考値）
  → total < 5 なら Step 2 へフォールバック

Step 2: symmetry_group_stats で symmetry_group_id = "xyz789" を検索
  → total ≥ 10 なら confidence = 'low'（but better than nothing）→ symmetry group 統計を使用
  → total < 10 なら source = 'none'（DBデータなし・静的評価のみ）
```

### 局面の「意味的な等価性」

symmetry group ID が同一になる例（v2 で確認済み）:

| 局面 | canonical_hash | symmetry_group_id |
|------|---------------|------------------|
| A,m(1)後のB,m(3) | 異なる可能性あり | 同一 |
| A,m(1)後のF,m(11) | 異なる可能性あり | 同一 |
| G,q後のA,m(1) | 異なる可能性あり | 同一 |
| G,q後のC,m(4) | 異なる可能性あり | 同一 |

→ canonical_hash では別局面だが、symmetry group ID では「同じ配置パターン」として集計可能。

### symmetry_group_stats テーブル設計

```sql
CREATE TABLE symmetry_group_stats (
  symmetry_group_id  TEXT        NOT NULL,  -- D4 orbit の代表ID（実装は Step F-3 以降）
  mode_group         TEXT        NOT NULL,
  wins_black         INTEGER     NOT NULL DEFAULT 0,
  wins_white         INTEGER     NOT NULL DEFAULT 0,
  draws              INTEGER     NOT NULL DEFAULT 0,
  total              INTEGER     NOT NULL DEFAULT 0,
  last_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symmetry_group_id, mode_group)
);
```

**実装タイミング注記:**  
symmetry group ID の計算ロジックは `symmetry.ts` に予約済みだが、`symmetryGroupIdFromHash()` の完全実装は Step F-3 以降。`symmetry_group_stats` の**テーブル定義はスキーマに含めるが、集計は symmetry group ID 実装後に行う**。

---

## 8. 必要な Supabase テーブル案

### 8-1. match_logs（既存・変更最小）

```sql
-- 既存カラム（変更なし）
-- id, user_id, game_id, started_at, ended_at, mode, human_color,
-- winner, move_count, full_record, created_at, cpu_difficulty

-- 追加候補（optional・後日判断）
ALTER TABLE match_logs
  ADD COLUMN IF NOT EXISTS canonical_hashes_computed BOOLEAN NOT NULL DEFAULT FALSE;
-- canonical_hash バックフィル済みフラグ
-- バックフィルスクリプト実行後に TRUE に更新し、再処理をスキップするために使用
```

### 8-2. position_stats（新規）

```sql
CREATE TABLE IF NOT EXISTS position_stats (
  canonical_hash   TEXT        NOT NULL,
  -- 集計グループ
  -- 'all'           : 全モード合計（最大母集団）
  -- 'cpu_normal'    : CPU normal のみ
  -- 'cpu_hard'      : CPU hard のみ
  -- 'cpu_very_hard' : CPU very_hard のみ
  -- 'pvp'           : human_vs_human（ローカル）
  -- 'online'        : オンライン対戦
  mode_group       TEXT        NOT NULL,
  wins_black       INTEGER     NOT NULL DEFAULT 0,
  wins_white       INTEGER     NOT NULL DEFAULT 0,
  draws            INTEGER     NOT NULL DEFAULT 0,
  total            INTEGER     NOT NULL DEFAULT 0,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (canonical_hash, mode_group)
);

CREATE INDEX IF NOT EXISTS idx_position_stats_hash
  ON position_stats (canonical_hash);
```

### 8-3. symmetry_group_stats（新規・スキーマのみ定義・集計は後日）

```sql
CREATE TABLE IF NOT EXISTS symmetry_group_stats (
  symmetry_group_id  TEXT        NOT NULL,
  mode_group         TEXT        NOT NULL,
  wins_black         INTEGER     NOT NULL DEFAULT 0,
  wins_white         INTEGER     NOT NULL DEFAULT 0,
  draws              INTEGER     NOT NULL DEFAULT 0,
  total              INTEGER     NOT NULL DEFAULT 0,
  last_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symmetry_group_id, mode_group)
);

CREATE INDEX IF NOT EXISTS idx_symmetry_group_stats_id
  ON symmetry_group_stats (symmetry_group_id);
```

### 8-4. 必要な RPC

```sql
-- 局面勝率バルク取得（postmortem 用）
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
  SELECT canonical_hash, wins_black, wins_white, draws, total
  FROM position_stats
  WHERE canonical_hash = ANY(hashes)
    AND position_stats.mode_group = get_position_win_rates.mode_group;
$$;

-- symmetry group 統計取得（フォールバック用）
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
  SELECT symmetry_group_id, wins_black, wins_white, draws, total
  FROM symmetry_group_stats
  WHERE symmetry_group_id = ANY(group_ids)
    AND symmetry_group_stats.mode_group = get_symmetry_group_win_rates.mode_group;
$$;
```

---

## 9. RLS 方針

```sql
-- match_logs（既存方針を維持）
-- SELECT: 自分のレコードのみ（user_id = auth.uid()）
-- INSERT: user_id = auth.uid() （認証必須・anon 不可）
-- UPDATE/DELETE: 不可

-- position_stats
ALTER TABLE position_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read position_stats"
  ON position_stats FOR SELECT TO public USING (true);
-- INSERT/UPDATE/DELETE: SECURITY DEFINER 関数からのみ（クライアント不可）

-- symmetry_group_stats（同様）
ALTER TABLE symmetry_group_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read symmetry_group_stats"
  ON symmetry_group_stats FOR SELECT TO public USING (true);
-- INSERT/UPDATE/DELETE: SECURITY DEFINER 関数からのみ
```

**公開読み取りの理由:**  
局面勝率は全ユーザーが参照するポストモータムデータであり、秘密にする理由がない。個人情報（user_id / full_record）は含まない。

---

## 10. localStorage の限定的な役割

| キー | 役割 | 変更 |
|------|------|------|
| `one_eight_game_records` | 直近ゲームの表示キャッシュ（UserPage）| 既存・変更なし |
| `one_eight_aggregates` | 個人集計キャッシュ | 既存・変更なし |
| `one_eight_game_state` | 現在ゲーム | 既存・変更なし |
| `one_eight_pm_*` | postmortem 分析結果キャッシュ | 既存・変更なし |
| `one_eight_pm_cache_v2` | historicWinRate 付き PM 分析結果 | **将来追加（N-3以降）** |

**削除した設計要素（v2 比）:**

- ~~`one_eight_pending_uploads`~~ → 不要（認証必須のため）
- ~~匿名棋譜の一時保存~~ → 不要

> **localStorage は `position_stats` / `symmetry_group_stats` の母集団として一切使わない。**  
> 全統計集計は Supabase の `match_logs` を原本とする。

---

## 11. 段階的な実装順序

### Phase N-1a: match_logs 保存の網羅性確認

**目的:** 全完了対局が確実に match_logs に保存されているかを確認・修正する

```
調査内容:
  1. online 対局終了時の match_logs 保存フローを確認（useOnlineGame.ts）
  2. PvP offline 対局が saveMatchLog() を呼んでいるか確認（analytics.ts との二重管理点）
  3. cpu_difficulty が null の30件の原因確認（既存データ）

変更候補ファイル:
  src/lib/matchLog.ts       — 必要なら保存漏れを修正
  src/game/analytics.ts     — saveMatchLog 呼び出しの確認
```

### Phase N-1b: Supabase スキーマ作成

**目的:** position_stats / symmetry_group_stats テーブルと RPC を作成する

```
実行内容:
  1. position_stats DDL の実行（SQL Editor or migration）
  2. symmetry_group_stats DDL の実行（スキーマのみ・集計は後日）
  3. RLS ポリシーの設定
  4. get_position_win_rates RPC の作成
  5. get_symmetry_group_win_rates RPC の作成
  6. （optional）match_logs に canonical_hashes_computed カラム追加

追加ファイル:
  supabase/migrations/YYYYMMDD_create_position_stats.sql
```

### Phase N-1c: Edge Function — update-position-stats

**目的:** 棋譜保存後に非同期で position_stats を更新する

```
Edge Function の処理:
  1. match_log_id を受け取る
  2. full_record から canonical_hash を抽出
  3. mode に応じて mode_group を決定
     human_vs_cpu + cpu_difficulty → 'cpu_{difficulty}' かつ 'all'
     human_vs_human → 'pvp' かつ 'all'
     online → 'online' かつ 'all'
  4. position_stats に UPSERT（wins_black / wins_white / draws / total をインクリメント）
  5. canonical_hash が null の移動はスキップ（バックフィル前の古いレコード）

追加ファイル:
  supabase/functions/update-position-stats/index.ts（新規）
  src/lib/matchLog.ts（saveMatchLog 後に Edge Function 呼び出し追加）
```

### Phase N-1d: バックフィルスクリプト（既存27件）

**目的:** full_record はあるが canonical_hash がない既存棋譜を補完する

```
実行方式:
  scripts/backfill_canonical_hash.ts（tsx で実行・ローカル）
    1. Supabase から full_record のある全件を取得
    2. 初期局面から engine.ts を使って各手を再生
    3. 各 GameState から computeCanonicalHashString() を計算
    4. full_record の各 MoveRecord に canonical_hash を追記
    5. match_logs.full_record を UPDATE
    6. canonical_hashes_computed = true に更新
  → 完了後、Phase N-1c の Edge Function を既存件数分バッチ実行して position_stats 反映

追加ファイル:
  scripts/backfill_canonical_hash.ts（新規・実装は Phase N-1b 完了後）
```

### Phase N-2: 局面統計 RPC 動作確認 + 定期バッチ

```
内容:
  - get_position_win_rates の動作確認・チューニング
  - sampleCount / confidence 計算の検証
  - 日次バッチ設定（position_stats の整合性修復用）
```

### Phase N-3: ポストモータム表示接続

```
変更ファイル:
  src/game/postmortem.ts      — RPC 呼び出し追加
  src/game/types.ts           — PostmortemMoveRow 型拡張
  src/components/Postmortem.tsx — historicWinRate 表示 UI

PostmortemMoveRow 追加フィールド:
  historicWinRate?: number        // 0.0〜1.0
  sampleCount?: number
  confidence?: 'low'|'medium'|'high'
  winRateSource?: 'canonical'|'symmetry_group'|'static'|'none'
  modeGroup?: string

フォールバック順:
  canonical_hash 統計（total≥30）→ symmetry_group 統計（total≥10）→ 静的評価のみ
```

### Phase N-4: 類似局面 / 戦略パターン

```
内容:
  - symmetry_group_stats の集計を有効化（Step F-3 symmetry group ID 実装後）
  - 戦略パターン検出（1,4,7,10確保等）
  - 後回し
```

---

## 12. 実装前に Naoya が判断すべき点

| # | 判断事項 | 選択肢 | 推奨 |
|---|---------|-------|------|
| 1 | **position_stats の集計タイミング** | Edge Function（非同期）/ trigger / 定期バッチのみ | **Edge Function（主）+ 日次バッチ（整合性修復）** |
| 2 | **バックフィルの優先度** | N-1b 完了後すぐ実施 / N-3 まで後回し | **N-1b 後すぐ実施**（27件は少なく、将来データに混ぜる前に補完すべき） |
| 3 | **cpu_difficulty = null の30件の扱い** | mode_group='all' のみに計上 / 'cpu_unknown' グループに分離 | **'all' のみに計上**（難易度不明は分離しても意味が薄い） |
| 4 | **symmetry_group_stats の有効化タイミング** | Step F-3 と同時 / N-3 postmortem 接続と同時 | **Step F-3 実装後（symmetry group ID が確定してから）** |
| 5 | **confidence 閾値** | canonical_hash: 5件以下非表示・30件以上 high / symmetry_group: 10件以上 low | **推奨通りで進める** |
| 6 | **match_logs に canonical_hashes_computed カラムを追加するか** | 追加する / 不要（全件に canonical_hash があるか都度判定） | **追加する**（バックフィル管理が明示的になる） |

---

*以上。実装は Naoya 判断（12章 6点）を受けてから開始すること。*
