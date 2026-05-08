# Phase N-1 設計案 v2 — ONE EIGHT ポストモータム基盤（修正版）

作成日: 2026-05-07  
ステータス: 設計案（実装なし）  
前バージョン: `specs/postmortem_next_design.md`

---

## 0. 背景と修正の経緯

前回設計案（`postmortem_next_design.md`）では、localStorage の直近50件を母集団として canonical_hash 別勝率を集計する案を検討した。  
本文書はその案の根本的な問題を整理し、**全ユーザーの全完了棋譜を Supabase に保存することを前提とした修正設計**を提示する。

---

## 1. localStorage案が不十分だった理由

前回案（最大50件をローカル保存して集計）には以下の根本的な問題があった。

### 1-1. サンプル数の不足

- 1ユーザーのデバイス上に最大50件しか蓄積されない
- canonical_hash のユニーク数は数百〜数千に達しうる（全局面 × 手番数）
- 50件では大多数の局面でサンプル数0 になり、統計的に意味のある勝率が得られない
- 比較対象: 全ユーザーの全対局数 → N が100倍以上になることで初めて信頼できる確率推定が可能

### 1-2. canonical_hash ヒット率の問題

- 1ユーザー50件の棋譜内で同一の canonical_hash が出現する確率は非常に低い
- ゲーム序盤の canonical_hash は共通しやすいが、中盤〜終盤は局面が発散する
- 全ユーザーの棋譜が集約されて初めてヒット率が実用レベルに達する

### 1-3. デバイス間共有不可

- localStorage はブラウザ・デバイスごとに独立
- ユーザーがデバイスを変えると履歴がリセットされる
- iOS アプリ版との同期も不可能

### 1-4. ユーザーが localStorage を消すリスク

- ブラウザのストレージ消去・プライベートモード利用で全データが消滅
- PWA 更新時にキャッシュが消える可能性
- データの永続性がゼロ

### 結論

localStorage を mother population として使うアーキテクチャは根本的に誤りだった。  
**Supabase match_logs に全棋譜を集積し、それを集計基盤とする**ことが唯一の正解である。

---

## 2. 修正版 Phase N-1 の目的

1. **全ユーザーの全完了棋譜を Supabase match_logs に保存する**  
   - 認証ユーザー（既存）だけでなく、未認証ユーザーの棋譜も何らかの形で取り込む
   - online 対局棋譜が match_logs に確実に保存されていることを確認する

2. **canonical_hash 単位での勝率集計ができる専用テーブル（position_stats）を作成する**  
   - match_logs の JSONB 内部を毎回スキャンせず、事前集計済みのテーブルで高速参照を可能にする

3. **localStorage の役割を「キャッシュ・pending upload・再表示高速化」に限定する**  
   - localStorage を母集団として使わないことを明示的に設計に組み込む

---

## 3. match_logs との統合設計

### 3-1. full_record 内の canonical_hash の存在確認

| 棋譜種別 | canonical_hash の状態 | 対応方針 |
|---------|----------------------|---------|
| F-2 以降の新規棋譜 | 全手に `MoveRecord.canonical_hash` が付与済み | そのまま利用可能 |
| F-2 以前の旧棋譜 | canonical_hash なし | 後日バックフィル or スキップ |

F-2 以降の棋譜は `full_record` JSONB 内の各 MoveRecord に `canonical_hash` が含まれるため、  
Edge Function 側で `full_record` を読み込んで hash を抽出・集計することが可能。

### 3-2. スキーマ変更なしで canonical_hash を集計できるか

**結論: できない。専用集計テーブルが必要。**

理由:

- `full_record->N->canonical_hash` のように JSON パスで値を取ることはできる
- しかし JSON 配列の内部キーには B-tree index を貼れない
- 毎回 `full_record` を全スキャンする方式（案A）は以下の問題を抱える:
  - LIMIT 500 では全棋譜をカバーできない（棋譜が増えるほど漏れが増大）
  - 毎回 postmortem 開始のたびに重い集計クエリが走る
  - 複数ユーザー同時利用時に Supabase の CPU 負荷が集中する
- よって、事前集計テーブル `position_stats` を別途設けることが必須

---

## 4. 新規テーブル設計案: position_stats

### DDL

```sql
-- ============================================================
-- position_stats: canonical_hash 別の対局統計集計テーブル
-- ============================================================
CREATE TABLE position_stats (
  -- 局面の正規化ハッシュ（全 D4/C4 対称変換のうち辞書順最小のもの）
  canonical_hash   TEXT        NOT NULL,

  -- 集計グループ（CPU難易度バイアスを分離するための区分）
  -- 'all'            : 全モード合計（最大母集団）
  -- 'cpu_normal'     : CPU normal 難易度のみ
  -- 'cpu_hard'       : CPU hard 難易度のみ
  -- 'cpu_very_hard'  : CPU very_hard 難易度のみ
  -- 'pvp'            : human_vs_human（ローカル対人）
  -- 'online'         : オンライン対戦
  mode_group       TEXT        NOT NULL,

  -- 黒番勝利数（この局面を通過した対局のうち最終的に黒番が勝った数）
  wins_black       INTEGER     NOT NULL DEFAULT 0,

  -- 白番勝利数
  wins_white       INTEGER     NOT NULL DEFAULT 0,

  -- 引き分け数
  draws            INTEGER     NOT NULL DEFAULT 0,

  -- 総対局数（wins_black + wins_white + draws）
  total            INTEGER     NOT NULL DEFAULT 0,

  -- このハッシュが初めて記録された日時
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 最後に集計が更新された日時（バッチ更新の追跡に使用）
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (canonical_hash, mode_group)
);

-- インデックス: 単一ハッシュの全モードグループ取得用（postmortem RPC で使用）
CREATE INDEX idx_position_stats_hash ON position_stats (canonical_hash);
```

### RLS 方針

```sql
-- position_stats は読み取り完全公開（誰でも読める）
ALTER TABLE position_stats ENABLE ROW LEVEL SECURITY;

-- SELECT: 全員読み取り可（anon / authenticated 問わず）
CREATE POLICY "public read position_stats"
  ON position_stats
  FOR SELECT
  TO public
  USING (true);

-- INSERT / UPDATE / DELETE: 直接クライアントからは不可
-- SECURITY DEFINER 関数（Edge Function が呼び出す RPC）からのみ書き込み可能
-- → クライアント側に INSERT 権限を付与しない
```

**書き込みは `SECURITY DEFINER` 関数のみに限定する理由:**

- クライアントから直接 UPSERT を許すと、任意のユーザーが position_stats を改ざんできる
- Edge Function 経由で書き込むことで、「match_logs への保存が成功した棋譜のみが集計対象」という一貫性を保てる

### mode_group 設計理由: CPU難易度バイアスの分離

CPU の強さによって対局結果に大きなバイアスがかかる:

- `cpu_normal` の棋譜では、CPU の読み筋が浅く人間側の勝率が高くなりやすい
- `cpu_very_hard` では逆に CPU 側の勝率が高くなる
- これらを `all` に混ぜると、局面の「本来の強さ」が CPU 難易度によって歪められる

mode_group を分離することで:

1. `cpu_very_hard` を「最強対局」として信頼性の高い評価基準に使える
2. `pvp` / `online` を「人間同士の評価」として別途参照できる
3. `all` は「サンプル数確保」のフォールバックとして使える

---

## 5. 局面統計の集計方式比較

| 案 | 方式 | 仕組み | 利点 | 欠点 | 現実的な初期採用可否 |
|----|------|--------|------|------|---------------------|
| A | match_logs 毎回スキャン | postmortem 時に match_logs を LIMIT で読んで都度集計 | スキーマ変更なし・実装最小 | N+1 クエリ・遅い・LIMIT上限で漏れ発生 | PoC段階のみ（N-1a 前の暫定） |
| B | position_stats 事前集計（trigger） | match_logs INSERT 時に DB trigger で position_stats を UPSERT | リアルタイム更新・外部依存なし | trigger が重い・棋譜保存失敗のリスク・デバッグ困難 | **非推奨** |
| C | position_stats 事前集計（Edge Function） | 棋譜保存後に Edge Function を非同期で呼び出す | 棋譜保存と完全分離・エラーが棋譜に影響しない | Edge Function 別途管理が必要 | **推奨（初期・主方式）** |
| D | position_stats 定期バッチ | 1日1回 match_logs → position_stats を全件再集計 | シンプル・整合性確保が容易 | リアルタイム性なし（最大24時間遅延） | **推奨（補完・整合性修復）** |

### 推奨: C + D 併用

**主方式: C（Edge Function 非同期）**

- `saveMatchLog()` の保存成功後、Edge Function `update-position-stats` を呼び出す
- Edge Function は non-blocking（await しない or fire-and-forget）
- Edge Function 内で `full_record` から canonical_hash を抽出 → position_stats に UPSERT
- Edge Function の失敗は棋譜保存に影響しない（独立性確保）

**補完方式: D（定期バッチ）**

- 1日1回 cron で match_logs 全件を position_stats に再集計
- Edge Function の取りこぼし・エラーを自動修復
- position_stats の整合性を日次で保証

---

## 6. 匿名ユーザー（未認証）の棋譜保存

現在の `matchLog.ts` は `userId` 必須 → 未認証ユーザーの棋譜は Supabase に保存されない。

### 案X: 匿名保存許容

```sql
-- match_logs.user_id を nullable に変更
ALTER TABLE match_logs ALTER COLUMN user_id DROP NOT NULL;

-- RLS: anon ユーザーでも user_id = null で INSERT 可能
CREATE POLICY "anon insert match_logs"
  ON match_logs
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);
```

| 項目 | 内容 |
|------|------|
| メリット | offline PvC 棋譜も母集団に含まれる・実装最小 |
| デメリット | スパム・水増しリスク（bot が大量に棋譜を送れる） |
| デメリット | 誰の棋譜か追跡不可能 |
| デメリット | App Store 版での匿名大量送信が容易になる |

### 案Y: 認証必須 + pending upload キュー

```typescript
// localStorage: one_eight_pending_uploads
interface PendingUpload {
  record: MatchLogRecord;
  savedAt: string;        // ISO 8601
  retryCount: number;
}

// 認証後 flush
async function flushPendingUploads(userId: string) {
  const pending = loadPendingUploads();
  for (const item of pending) {
    await saveMatchLog({ ...item.record, userId });
  }
  clearPendingUploads();
}
```

| 項目 | 内容 |
|------|------|
| メリット | スパム・水増しリスクが低い |
| メリット | 棋譜に userId が紐づくため個人統計も可能 |
| メリット | 認証推進のインセンティブになる |
| デメリット | 認証しないユーザーの棋譜は永遠に反映されない |
| デメリット | localStorage が消えた場合は棋譜が消える |
| デメリット | flush ロジックの実装が必要 |

### 推奨: **案Y（認証必須 + pending upload キュー）**

理由:

1. ONE EIGHT は競技性の高いゲームであり、データ品質が重要
2. anon INSERT を許可すると外部から位置統計を意図的に歪められるリスクがある
3. 認証ユーザーへの誘導は長期的に個人統計・ランキング機能への拡張に繋がる
4. flush ロジックは matchLog.ts の小修正で実現可能

---

## 7. localStorage の役割（修正版）

| localStorage キー | 役割 | 変更 |
|-----------------|------|------|
| `one_eight_game_records` | 直近ゲームの表示用キャッシュ（UserPage 等） | 既存・変更なし |
| `one_eight_aggregates` | 個人集計キャッシュ | 既存・変更なし |
| `one_eight_game_state` | 現在ゲーム1件 | 既存・変更なし |
| `one_eight_pm_*` | postmortem 分析結果キャッシュ | 既存・変更なし |
| `one_eight_pending_uploads` | 未送信棋譜の一時キュー（案Y採用時） | **新規追加** |
| `one_eight_pm_cache_v2` | historicWinRate 付き PM 分析結果（N-3以降） | 将来追加 |

**重要制約:**

> **localStorage は `position_stats` の母集団として使わない。**  
> 全ての統計集計は Supabase の `match_logs` を基盤とする。  
> localStorage は「表示用キャッシュ」と「認証前一時保存」の役割のみを担う。

---

## 8. postmortem への接続設計

### PostmortemMoveRow の拡張案

```typescript
interface PostmortemMoveRow {
  // --- 既存フィールド ---
  moveNumber: number;
  player: 'black' | 'white';
  positionId: string;
  gateId: number;
  canonical_hash?: string;
  // ... その他既存フィールド ...

  // --- Phase N-3 で追加 ---
  historicWinRate?: number;      // 0.0 ~ 1.0（その手を指した側の勝率）。null = データなし
  sampleCount?: number;          // 集計サンプル数（totalフィールド）
  confidence?: 'low' | 'medium' | 'high';  // sampleCount に基づく信頼度
  winRateSource?: 'db' | 'static' | 'none'; // 評価のソース
  modeGroup?: string;            // 集計に使った mode_group
}
```

### 信頼度閾値

| sampleCount | confidence | 表示方針 |
|------------|------------|---------|
| < 5 | — | 非表示 / `winRateSource = 'none'` |
| 5 ≤ n < 30 | `'medium'` | 「参考値」として表示（注記付き） |
| n ≥ 30 | `'high'` | メイン表示（信頼度高） |

### 取得フロー

```
1. postmortem 開始時:
   - 棋譜の各手から canonical_hash のリストを抽出
   - 重複を除いた hashes[] を作成

2. Supabase RPC 呼び出し:
   await supabase.rpc('get_position_win_rates', {
     hashes: string[],
     mode_group: 'cpu_very_hard' | 'all' | ...
   })
   → Returns: { canonical_hash, wins_black, wins_white, draws, total }[]

3. PostmortemMoveRow へのマージ:
   - 各手の canonical_hash で RPC 結果を検索
   - その手を指した player が 'black' なら historicWinRate = wins_black / total
   - 'white' なら historicWinRate = wins_white / total
   - sampleCount = total
   - confidence は閾値で決定

4. キャッシュ:
   - 結果を localStorage の `one_eight_pm_*` にキャッシュ
   - 再表示時は DB 呼び出しなしでキャッシュから復元
```

### RPC: get_position_win_rates

```sql
CREATE OR REPLACE FUNCTION get_position_win_rates(
  hashes TEXT[],
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
AS $$
  SELECT
    canonical_hash,
    wins_black,
    wins_white,
    draws,
    total
  FROM position_stats
  WHERE canonical_hash = ANY(hashes)
    AND position_stats.mode_group = get_position_win_rates.mode_group;
$$;
```

---

## 9. 既存 match_logs との後方互換

### 旧棋譜（F-2 以前・canonical_hash なし）の扱い

| 方針 | 内容 |
|------|------|
| デフォルト | position_stats への反映対象外としてスキップ |
| 理由 | full_record に canonical_hash がなければ集計不可能 |
| バックフィル（後日）| `ensureAllCanonicalHashes()` を server-side で実行して補完可能 |

### `has_canonical_hashes` フラグ（optional）

```sql
-- match_logs に追加するオプションカラム（後日マイグレーション）
ALTER TABLE match_logs ADD COLUMN has_canonical_hashes BOOLEAN DEFAULT false;

-- バックフィル実行後に更新するクエリ例
UPDATE match_logs SET has_canonical_hashes = true
WHERE id IN (...);
```

このフラグを追加することで:
- バックフィル済み棋譜を区別できる
- Edge Function 側で `has_canonical_hashes = false` の棋譜をスキップする判定が容易になる

ただし Phase N-1 での追加は **optional**（後日対応でも可）。

### バックフィル計画（後日）

1. `ensureAllCanonicalHashes()` を server-side スクリプトとして実行
2. 旧棋譜の `full_record` に canonical_hash を補完
3. 補完後に position_stats へ一括集計（D方式バッチで実行）

---

## 10. 容量・コスト・RLS 上の注意点

### 容量見積もり

| テーブル | 1レコードサイズ | 10万ゲーム時 |
|---------|--------------|------------|
| match_logs | full_record 込み ~8KB | ~800MB |
| position_stats | ~100 bytes × 2,500局面 × 6 mode_group | ~1.5MB |

**position_stats はほぼ固定サイズ:**

- ユニーク canonical_hash 数 × mode_group 数 のレコード数
- ONE EIGHT の局面数は有限（ゲームの複雑度から数千〜数万オーダーと推測）
- 棋譜数が増えても position_stats のレコード数は「新しい局面パターン」が出た時のみ増える
- 10万ゲームが蓄積されても position_stats は数MB 以下に収まる見込み

### RLS 方針まとめ

```sql
-- match_logs
-- SELECT: 自分のレコードのみ（user_id = auth.uid()）
-- INSERT: auth.uid() = user_id（認証必須）
--         ※ 案X採用時は anon + user_id = null も許可
-- UPDATE/DELETE: 不可（誰も変更できない）

-- position_stats
-- SELECT: public（anon 含む全員読み取り可）
-- INSERT/UPDATE: 不可（SECURITY DEFINER 関数のみ）
-- DELETE: 不可
```

### App Store / iOS 整合性

- Supabase SDK は iOS ネイティブで使用可能（`supabase-swift`）
- `match_logs` / `position_stats` の設計は iOS 版でもそのまま使える
- anon key の扱いは iOS App Store ガイドライン上も問題なし
- 案Y（認証必須）は iOS での Sign in with Apple / Email 認証と組み合わせ可能
- **現設計で iOS 版に継続して使用可能**

---

## 11. 段階的な実装順序

### Phase N-1a: 全棋譜保存基盤（match_logs 拡張）

**目的:** 全ての完了棋譜が確実に Supabase に保存されるようにする

```
変更ファイル:
  src/lib/matchLog.ts          — userId nullable 対応 or pending upload 追加
  src/game/analytics.ts        — saveMatchLog 呼び出しタイミングの見直し

作業内容:
  1. 匿名ユーザーの棋譜保存方針を決定（案X or 案Y）
  2. 案Y 採用なら:
     - localStorage に `one_eight_pending_uploads` キーを追加
     - 認証後に pending を flush する flushPendingUploads() を実装
  3. online 対局が match_logs に保存されているか動作確認
  4. human_vs_human（ローカル）対局も saveMatchLog を呼んでいるか確認
```

### Phase N-1b: position_stats テーブル作成（Supabase schema）

**目的:** 集計テーブルと RPC を Supabase に作成する

```
変更ファイル:
  supabase/migrations/YYYYMMDD_create_position_stats.sql  — 新規追加

作業内容:
  1. DDL の Supabase SQL Editor or migration での実行
  2. RLS ポリシー設定（SELECT: public / INSERT: 不可）
  3. get_position_win_rates RPC の作成
  4. (optional) has_canonical_hashes カラムの match_logs への追加
```

### Phase N-1c: Edge Function: update-position-stats

**目的:** 棋譜保存後に非同期で position_stats を更新する

```
変更ファイル:
  supabase/functions/update-position-stats/index.ts  — 新規作成
  src/lib/matchLog.ts                                — Edge Function 呼び出し追加

Edge Function の処理内容:
  1. match_log_id を受け取る
  2. match_logs から full_record を取得
  3. full_record の各 MoveRecord から canonical_hash を抽出
  4. mode に応じて mode_group を決定（human_vs_cpu + cpu_difficulty → 各グループ）
  5. position_stats に UPSERT（wins_black / wins_white / draws / total をインクリメント）
  6. 'all' グループも同時に UPSERT
  7. last_updated_at を now() に更新
```

### Phase N-2: 局面統計集計 RPC

```
作業内容:
  1. get_position_win_rates RPC の動作確認・チューニング
  2. sampleCount / confidence の計算ロジック整備
  3. (optional) 定期バッチ（Supabase cron or GitHub Actions）の設定
```

### Phase N-3: ポストモータム表示接続

```
変更ファイル:
  src/game/postmortem.ts        — RPC 呼び出し追加
  src/types/postmortem.ts       — PostmortemMoveRow 型拡張
  src/components/Postmortem.tsx — historicWinRate 表示 UI 追加

作業内容:
  1. PostmortemMoveRow に historicWinRate / sampleCount / confidence を追加
  2. postmortem.ts で get_position_win_rates RPC 呼び出し
  3. 表示ロジック追加（confidence による条件分岐）
  4. localStorage キャッシュ更新（one_eight_pm_cache_v2 キー使用）
```

### Phase N-4: 類似局面検索 / 戦略パターン（後回し）

```
内容:
  - symmetry group ID を使った局面グルーピング（D4 orbit での集計拡張）
  - 戦略パターン検出（1,4,7,10確保等）

理由:
  - N-1〜N-3 の基盤が完成してから取り組む
  - symmetry group ID は別途 Step F-3 以降で設計予定
```

---

## 12. 実装に入る前に Naoya が判断すべき点

| # | 判断事項 | 選択肢 | 推奨 |
|---|---------|-------|------|
| 1 | 匿名ユーザーの棋譜保存方針 | 案X（anon INSERT許可） / 案Y（pending + 認証後flush） | **案Y**（データ品質・スパム対策の観点から） |
| 2 | position_stats の集計タイミング | Edge Function（非同期） / trigger / 定期バッチのみ | **Edge Function（C）＋定期バッチ（D）の併用** |
| 3 | 旧棋譜のバックフィル | 行う / 行わない / 後回し | **後回し**（新棋譜が蓄積されてから判断で十分） |
| 4 | mode_group の粒度 | difficulty別分離（6グループ） / CPU/PvP/Online のみ（3グループ） | **6グループ**（CPU難易度バイアス分離のため。容量コストは微小） |
| 5 | sampleCount の表示非表示閾値 | 5件 / 10件 / 30件 | **5件以下非表示・30件以上でメイン表示**（ゲーム初期は母集団が少ないため保守的に） |
| 6 | App Store 版での設計継続性 | 現設計で継続可 / 追加検討が必要 | **現設計で継続可**（supabase-swift との整合性あり） |

---

## Appendix: ファイル変更影響まとめ

| フェーズ | ファイル | 変更種別 |
|---------|---------|---------|
| N-1a | `src/lib/matchLog.ts` | 修正（pending upload 対応） |
| N-1a | `src/game/analytics.ts` | 修正（saveMatchLog 呼び出し確認） |
| N-1b | `supabase/migrations/` | 新規 SQL（position_stats DDL・RLS・RPC） |
| N-1c | `supabase/functions/update-position-stats/index.ts` | 新規作成 |
| N-1c | `src/lib/matchLog.ts` | 修正（Edge Function 呼び出し追加） |
| N-3 | `src/types/postmortem.ts` | 修正（型拡張） |
| N-3 | `src/game/postmortem.ts` | 修正（RPC 呼び出し） |
| N-3 | `src/components/Postmortem.tsx` | 修正（表示ロジック） |

---

*以上。実装作業は Naoya の判断（12章 6点）を受けてから開始すること。*
