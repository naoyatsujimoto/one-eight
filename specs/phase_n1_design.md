# Phase N-1 設計案: ゲームログ蓄積基盤

**作成日**: 2026-05-07  
**対象フェーズ**: Phase N-1（postmortem_next_design.md §3 / Step F-2 承認後の前提基盤）  
**Constraints**: 実装なし / Supabase schema変更なし / 既存ロジック差し替えなし / Step F-3未着手維持

---

## 1. Phase N-1 の目的

`postmortem_next_design.md` §5 で確認されたとおり、現在の localStorage に保存されているのは「現在ゲーム1件」のみ（`one_eight_game_state`）。複数ゲームの蓄積がないため、N-2（局面DB集計）・N-3（PM改善）は機能しない。

Phase N-1 の目的は**過去ゲームのログを安全に蓄積し、N-2 が読み取れる形式で保存すること**。

具体的には:
- ゲーム終了時に `game_id` 単位でログを追記する
- `canonical_hash` 列を含む `moves` 配列を保存する（N-2 の集計キー）
- 既存キー（`one_eight_game_state` / `one_eight_pm_*`）には一切触れない
- localStorage 完結（Supabase 送信なし）

---

## 2. 推奨する保存対象

### 2-1. CPU戦 vs Human vs Human

| 対象 | 推奨 | 理由 |
|------|------|------|
| CPU戦（completed） | ✅ 保存 | N-2 の historicWinRate 集計の主目的。対局数が最も多い |
| Human vs Human（completed） | ✅ 保存 | `mode` フィールドで区別できる。将来の人間対人間分析にも使える |
| 未完了ゲーム | ❌ 保存しない | 勝敗不明のため集計に使えない。ログ汚染を防ぐ |

**理由**: 保存対象を `mode` フィールドで区別すれば、N-2 で CPU戦のみフィルタリングできる。後から "CPU戦のみ" に絞ることは可能だが、Human vs Human を後から追加することはできない。

---

## 3. 推奨する保存件数上限

### 3-1. 比較

| 上限 | 推奨容量 | サンプル数として | 備考 |
|------|---------|----------------|------|
| 30件 | ≈ 165KB | 少ない。局面DBのサンプルが薄い | postmortem_next_design.md §2-1 の推奨値 |
| **50件** | ≈ 275KB | **バランスが良い（推奨）** | 容量余裕あり・集計に十分 |
| 100件 | ≈ 550KB | 多い。古いデータが残りすぎる | 容量は問題ないが鮮度が落ちる |

**推奨: 50件**

根拠:
- ONE EIGHT は比較的手数が多いゲーム（想定 30〜50手）
- canonical_hash ×50件 = 最大 2,500 サンプル（C4 対称で実質 ×1〜4 倍）
- `postmortem_next_design.md §2-1` の「DBサンプル ≥ 30件」閾値を満たすには 30〜50件が現実的
- localStorage の 5MB 制限に対して 275KB は余裕がある（6% 以下）
- 古いデータの鮮度劣化を抑えられる

---

## 4. localStorage データ構造案

### 4-1. 新規キー

```
one_eight_game_log   ← 新規追加（既存キーと競合なし）
```

既存キーとの関係:
```
one_eight_game_state    既存 → 変更しない（現在ゲームの保存）
one_eight_pm_*          既存 → 変更しない（postmortem キャッシュ）
one_eight_game_log      新規 → GameLogEntry[] の JSON 配列（最大50件）
```

### 4-2. 型定義案

```typescript
// src/game/types.ts に追加（または game_log.ts に定義）

/** 1ゲーム分のログエントリ。ゲーム終了時に game_log に追記される。 */
export interface GameLogEntry {
  /** 識別子。startedAt の ISO 文字列をそのまま流用（または uuid）。 */
  game_id: string;

  /** ゲーム開始 ISO 8601 タイムスタンプ（GameState.startedAt と同値）。 */
  played_at: string;

  /** 終了タイムスタンプ（GameState.endedAt と同値）。 */
  ended_at: string | null;

  /** ゲームモード。"cpu" | "human" | "online" */
  mode: 'cpu' | 'human' | 'online';

  /** CPU難易度（mode === "cpu" のときのみ）。 */
  difficulty?: 'normal' | 'hard' | 'very_hard';

  /** 人間プレイヤーの色（mode === "cpu" のとき）。 */
  human_color?: 'black' | 'white';

  /** 勝者。null = 途中終了（保存しないが型として定義）。 */
  winner: 'black' | 'white' | 'draw';

  /** 総手数。 */
  move_count: number;

  /**
   * 序盤識別キー（先3手の positioning を連結）。
   * 例: "D_E_B"（序盤グループ集計用）。
   * symmetry group ID ベースの集計はここでは行わない（N-3 以降）。
   */
  opening_key: string;

  /**
   * 手順ログ（全 MoveRecord）。
   * canonical_hash は Step F-2 で全手に付与済みのため、
   * N-2 の集計キーとして直接使える。
   */
  moves: GameLogMove[];

  /** ログ形式バージョン（互換性管理用）。 */
  log_version: 1;

  /** アプリバージョン（package.json の version または git commit hash）。 */
  app_version?: string;
}

/**
 * MoveRecord の保存サブセット。
 * GameState.history の MoveRecord から必要フィールドのみ抽出。
 * positions / gates スナップショットは含めない（容量節約）。
 */
export interface GameLogMove {
  moveNumber: number;
  player: 'black' | 'white';
  positioning: string;        // PositionId | 'P'
  build: MoveRecord['build']; // 既存型をそのまま流用
  canonical_hash: string;     // 必須（Step F-2で保証済み）
}
```

### 4-3. 保存・読み取り関数のシグネチャ案

```typescript
// src/game/storage.ts に追加予定

const GAME_LOG_KEY = 'one_eight_game_log';
const GAME_LOG_MAX = 50;

/** ゲーム終了時に呼び出す。FIFOで最大50件を維持する。 */
export function appendGameLog(entry: GameLogEntry): void

/** N-2 が使う。全ログを返す（空配列は正常値）。 */
export function loadGameLog(): GameLogEntry[]

/** ログをクリアする（デバッグ・テスト用）。 */
export function clearGameLog(): void
```

### 4-4. 追記タイミング

```
engine.ts の gameEnded 検出 or App.tsx の gameEnded useEffect
  → 既存の saveState() と同じタイミングで appendGameLog() を呼ぶ
  → winner が確定している completed game のみ保存
```

---

## 5. 既存データとの互換性

| 既存キー | 影響 | 対応 |
|---------|------|------|
| `one_eight_game_state` | **なし** | 別キーのため競合しない |
| `one_eight_pm_*` | **なし** | 別キーのため競合しない |
| `one_eight_game_log` (存在しない場合) | `loadGameLog()` が `[]` を返す | 空配列は正常値として扱う |

マイグレーション不要。新規キーを追加するだけ。

**後方互換性の保証**:
- `log_version: 1` を埋め込む
- 将来フィールドを追加するときは `log_version: 2` へ切り上げ
- `loadGameLog()` は `log_version` 不一致時に無視して空配列を返す（安全劣化）

---

## 6. 容量見積もり

### 6-1. MoveRecord 1件あたりの JSON サイズ

```
canonical_hash: 16文字 (16 bytes)
moveNumber: 1-2桁
player: "black"/"white" → 5文字
positioning: "A"-"M" or "P" → 1文字
build: type="massive" → ~40文字 / type="selective" → ~45文字 / etc.
フィールド名 合計: ~50文字

1 MoveRecord ≈ 120〜140 bytes
```

### 6-2. 1ゲームあたり

```
moves (40手想定): 40 × 130 bytes = 5,200 bytes
メタデータ (game_id, played_at, winner, etc.): ~300 bytes
合計: ~5,500 bytes ≈ 5.5KB/game
```

### 6-3. 件数別合計

| 上限 | 想定容量 | localStorage 5MB に対する比率 |
|------|---------|-------------------------------|
| 30件 | ~165KB | 3.3% |
| **50件** | **~275KB** | **5.5%** |
| 100件 | ~550KB | 11% |

**いずれも localStorage 5MB 制限内に十分収まる。**

`postmortem_cache`（`one_eight_pm_*`）の1件あたりのサイズも考慮が必要だが、PM結果は MoveRecord より軽量なため問題ない。

### 6-4. ストレージフル時の対応

```typescript
// appendGameLog() 内で try-catch
try {
  localStorage.setItem(GAME_LOG_KEY, JSON.stringify(entries));
} catch {
  // QuotaExceededError: 最古の5件を削除して再試行
  const trimmed = entries.slice(5);
  try {
    localStorage.setItem(GAME_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // それでも失敗なら silently ignore（既存 saveState() と同方針）
  }
}
```

---

## 7. 削除・ローテーション方針

### 7-1. FIFO（推奨）

```
appendGameLog() 呼び出し時:
  1. 現在のログを読み込む
  2. 末尾に新しいエントリを追加
  3. 件数が MAX(50) を超えた場合、先頭から削除（最古を捨てる）
  4. 書き込む
```

**古いゲームを自動的に捨てる** → 直近50件のみ保持 → 鮮度が保たれる。

### 7-2. 手動クリア

- `clearGameLog()` を提供（設定画面 or デバッグ console から呼べるように）
- Naoya が手動でリセットできる手段を残す

### 7-3. ゲームID 重複保護

```typescript
// 同じ game_id が既に存在する場合は追記しない
if (entries.some(e => e.game_id === newEntry.game_id)) return;
```

App のリロードや重複呼び出しで同ゲームが二重追記されることを防ぐ。

---

## 8. `postmortem_next_design.md` との接続

| postmortem_next_design.md の記述 | Phase N-1 の対応 |
|----------------------------------|-----------------|
| §2-3「複数ゲーム保存の仕組みが前提条件」 | `GAME_LOG_KEY` でこれを実現 |
| §2-3「`GAME_LOG_KEY = 'one_eight_game_log'`（最大50件）」 | 同設計を採用（50件）|
| §3 「Phase N-1: storage.ts に GAME_LOG_KEY 追加」 | 変更ファイルとして `storage.ts` を確認 |
| §7「ゲームログ蓄積件数の上限（30/50）の Naoya 判断」 | 本設計案で 50 件を推奨（Naoya 最終決定）|

N-1 完了後、N-2 は以下のフローで動作する:

```
loadGameLog()
  → entries[].moves[].canonical_hash × entries[].winner
  → Map<string, { wins: number; total: number }>
  → historicWinRate = wins / total (N-2 で実装)
```

---

## 9. Supabase 送信について

**現時点: localStorage 完結を推奨。**

| 観点 | 理由 |
|------|------|
| プライバシー | プレイログに個人の対局パターンが含まれる。送信前にNaoya判断が必要 |
| 段階実装 | N-1〜N-3 はローカルで完結できる。Supabase 統合は N-4 以降で検討 |
| コスト | Supabase write が増えるとコスト・RLS設計が必要 |
| 逆互換 | localStorage ログが溜まった状態で後から Supabase 送信を追加できる |

将来的に複数デバイス間での局面DB共有が必要になれば、`GameLogEntry[]` をそのまま Supabase に送信する設計が可能（スキーマは今から整合させておく）。

---

## 10. 実装対象ファイル候補

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/game/types.ts` | 型追加 | `GameLogEntry` / `GameLogMove` インターフェース追加 |
| `src/game/storage.ts` | 機能追加 | `GAME_LOG_KEY` / `appendGameLog()` / `loadGameLog()` / `clearGameLog()` |
| `src/game/engine.ts` or `src/App.tsx` | 呼び出し追加 | ゲーム終了時に `appendGameLog()` を呼ぶ（1行追加）|
| `src/tests/game_log.test.ts` | 新規作成 | appendGameLog / FIFO / 重複防止 / 容量テスト |

**変更しないファイル**:
- `src/game/ai.ts` / `src/game/postmortem.ts` / `src/game/symmetry.ts` / `src/game/zobrist.ts`
- Supabase schema

---

## 11. 実装に進む前に Naoya が判断すべき点

| # | 判断事項 | 選択肢 | 推奨 |
|---|---------|-------|------|
| 1 | **保存件数上限** | 30件 / **50件** / 100件 | **50件** |
| 2 | **Human vs Human を含めるか** | CPU戦のみ / **両方（modeで区別）** | **両方** |
| 3 | **opening_key の定義** | 先3手の positioning 文字列 / canonical_hash で代替 | 先3手 positioning（実装シンプル）|
| 4 | **app_version の埋め込み方** | `import.meta.env.VITE_APP_VERSION` / git hash / 省略 | 省略でもよい（後から追加可能）|
| 5 | **game_id の生成方法** | `GameState.startedAt`（既存・追加コストなし）/ `crypto.randomUUID()`（確実） | `startedAt` 流用でよい（ミリ秒精度で実用上十分）|

---

## 12. 次段への接続まとめ

```
Phase N-1（本提案）
  storage.ts: appendGameLog() → one_eight_game_log（最大50件）
  ↓
Phase N-2（局面DB集計）
  position_db.ts: loadGameLog() → canonical_hash × winner → Map<hash, {wins, total}>
  ↓
Phase N-3（PM改善・評価分離）
  postmortem.ts: historicWinRate 参照・DECISIVE MOVE改善
  postmortem_eval.ts: PM専用評価関数
```

N-1 は **全体の土台**。N-2・N-3 は N-1 がなければ機能しない。

