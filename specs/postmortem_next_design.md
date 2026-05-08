# ポストモータム改善 次段設計案

**作成日**: 2026-05-07  
**対象Step**: F-2 承認後 → 次段（F-3手前の局面DB・評価分離フェーズ）  
**Constraints**: Step F-3（探索枝刈り）未着手 / Supabase schema変更なし / 勝率算出ロジック差し替えなし

---

## 1. 次段の目的

canonical_hash（Step F-2で全MoveRecordに付与済み）と symmetry group ID（symmetry.ts）を活用し、以下を実現する。

- **局面DB構築の基盤整備**: localStorage上の既存CPU戦ログから canonical_hash 単位で局面×結果を集計し、実績勝率テーブルを生成する
- **DECISIVE MOVE 判定の高精度化**: 単純な50%跨ぎからマルチクライテリア判定へ移行する
- **評価関数の責務分離**: CPU用（速度優先・近似）とポストモータム用（精度優先・詳細）を明示的に分ける
- **戦略的勝勢局面の検出**: 1,4,7,10確保などの支配構造をスコア可視化する

**この段階では局面DBへの書き込みを行わず、localStorage上の既存ログからの読み取り集計のみ実施する。**

---

## 2. 検討事項への回答

### 2-1. canonical_hash のポストモータム活用方法

#### 現状
- MoveRecord に `canonical_hash?: string` が付与済み
- postmortem.ts は canonical_hash を参照していない
- ポストモータム分析は手番ごとに `evaluateState()` で評価値を計算するだけ

#### 設計案A: 局面重複検出（推奨）
```
canonical_hash をキーとして、同一局面への到達履歴を検出する。
過去ゲームで同じ canonical_hash から勝率×%だった局面 → 参照表示。
```

| 案 | 概要 | 実装コスト | 効果 |
|----|------|-----------|------|
| A（推奨） | 局面ごとに過去勝率を参照・表示 | 中 | ポストモータムに実績根拠を追加 |
| B | 繰り返し局面検出（千日手警告的） | 小 | 副作用なし |
| C | 局面ツリー可視化 | 大 | UI工数大 |

**推奨**: 案A。postmortem.ts の `PostmortemMoveRow` に `historicWinRate?: number` を optional 追加し、DBヒット時のみ表示する。

---

### 2-2. symmetry group ID の活用方法

#### 設計案
symmetry group ID（= canonical_hash そのもの、C4等価クラスの代表）を使い、**対称局面をまとめて勝率集計**する。

```
例: 局面Xの canonical_hash = "abc123"
    局面Xを90度回転した局面Y の canonical_hash = "abc123"（同一）
    → X・Y の勝敗結果を合算して集計することで、サンプル数が最大4倍になる
```

| 集計単位 | サンプル増加率 | 精度 | 備考 |
|---------|--------------|------|------|
| raw hash | 1× | 低 | 対称を別局面扱い |
| canonical_hash | ×1〜4 | 高 | **推奨** |
| D4（反射含む） | ×1〜8 | 理論最大 | Gate意味論崩壊のリスク |

**推奨**: canonical_hash単位の集計。D4は Gate1≠Gate7 の問題から採用しない。

---

### 2-3. localStorage既存ログから集計できるもの

#### ログ構造（確認済み）
```typescript
// storage.ts より
const STORAGE_KEY = 'one_eight_game_state';           // 現在ゲーム
const POSTMORTEM_CACHE_PREFIX = 'one_eight_pm_';      // postmortemキャッシュ
```

#### 集計可能なデータ
| 集計項目 | 取得元フィールド | 備考 |
|---------|----------------|------|
| 局面別訪問回数 | `history[n].canonical_hash` | Step F-2付与済み |
| 局面別勝率 | `canonical_hash` × `winner` | game終了後のみ |
| 手番ごとの損失分布 | `postmortem cache` の `loss` | PM実行済みゲームのみ |
| symmetry orbit サイズ | `countC4Orbit()` | symmetry.ts提供済み |
| 先手後手別勝率 | `cpuPlayer` × `winner` | 統計的偏りチェック |

#### 制限
- 保存されているのは「現在ゲーム1件」のみ（`STORAGE_KEY` が単一）
- 過去ゲームの蓄積はない → 複数ゲーム保存の仕組みが前提条件

#### 対策案（保存拡張）
```typescript
// 新規: 複数ゲームログ保存（既存キー体系と互換）
const GAME_LOG_KEY = 'one_eight_game_log';  // GameState[] の配列（最大50件）
```

ゲーム終了時に `saveState()` と並行してゲームログに追記する設計を推奨。

---

### 2-4. 実績勝率不足時の評価コンビネーション

#### 設計案: 信頼度スコアによるブレンド

```typescript
type PositionEvalSource = 'db' | 'static' | 'rule';

interface PositionEval {
  winRate: number;           // 0.0 ~ 1.0
  source: PositionEvalSource;
  confidence: number;        // 0.0 ~ 1.0
}
```

| 条件 | 使用する評価 | 信頼度 |
|------|------------|--------|
| DBサンプル ≥ 30件 | 実績勝率のみ | 高 |
| DBサンプル 5〜29件 | 実績勝率 × 0.6 + 静的評価 × 0.4 | 中 |
| DBサンプル 1〜4件 | 実績勝率 × 0.2 + 静的評価 × 0.8 | 低 |
| DBサンプル 0件 | 静的評価 → ルールベース評価 | 参考 |

**ルールベース評価の補完項目**（静的評価でカバーできない戦略的優位）:
- 1,4,7,10確保（Quad Gate制覇）の検出
- 敵ポジション包囲度（連接ポジション掌握率）
- 未占有ポジションへの先行優位

---

### 2-5. DECISIVE MOVE の改善案

#### 現状の問題
```typescript
// postmortem.ts 現行
if ((fromWP >= 0.5 && toWP < 0.5) || (fromWP < 0.5 && toWP >= 0.5)) {
  crossings.push(...)
}
// → 最後の 50%跨ぎを decisiveCrossing とするだけ
// → 揺り戻しが多いゲームでは「本当の転換点」を見誤る
```

#### 改善案A: wpSwing 最大点（推奨）
```
DECISIVE MOVE = 最終勝者の利益方向に最も大きく動いた wpSwing の手
```
- `wpSwing` は PostmortemMoveRow にすでに計算済み
- 最終勝者が Black なら `rows.filter(r => r.player==='black').max(r.wpSwing)`
- Black 損失なら White の wpSwing が最大の手

#### 改善案B: ゾーン維持型 crossing（追加案）
```
- 50%跨ぎ後に、そのまま5手以上同一ゾーンに留まった最初の跨ぎを DECISIVE とする
- 揺り戻しで戻った crossing は除外
```

#### 改善案C: 重み付きスコアによるランキング
```
decisivenessScore = wpSwing × (1 − moveNum/totalMoves) × (1 + 0.5 × isBlack)
```
序盤の決定打ほど高スコア（逆転が難しいため）

| 案 | 精度 | 実装コスト | 後方互換 |
|----|------|-----------|---------|
| A（推奨） | 高 | 小（既存フィールド活用） | ◎ |
| B | 中 | 中 | ○ |
| C | 中〜高 | 小 | ○ |

**推奨**: 案Aを主、案Bで「揺り戻し除外フィルタ」として補完する。

---

### 2-6. CPU用評価関数とポストモータム用評価関数の分離

#### 現状の問題
```typescript
// postmortem.ts が ai.ts の evaluateState() をそのまま流用している
import { evaluateState, enumerateLegalMoves, scoreMoveForOrdering } from './ai';
```

| 評価関数 | 速度要件 | 精度要件 | 現状 |
|---------|---------|---------|------|
| CPU用（ai.ts） | 最優先（1500ms内に完了） | 近似可 | GateCache差分評価で高速化済み |
| PM用（postmortem.ts） | 非リアルタイム | 高精度必要 | CPU用を流用 → 改善余地あり |

#### 分離設計案

**新規ファイル案**: `src/game/postmortem_eval.ts`

```typescript
// postmortem専用評価関数（速度より精度優先）
export function evaluateStateForPostmortem(
  state: GameState,
  player: Player,
  historicWinRate?: number,   // DBヒット時のみ渡す
  confidence?: number,
): number {
  const staticScore = evaluateState(state, player, true); // very_hard相当
  const staticWP = winProb(staticScore);

  if (historicWinRate !== undefined && confidence !== undefined) {
    // DBと静的評価をブレンド
    return historicWinRate * confidence + staticWP * (1 - confidence);
  }
  return staticWP;
}
```

**分離の利点**:
- CPU用は引き続きGateCacheで高速動作
- PM用は歴史的勝率・ルールベース補正を自由に追加可能
- ai.ts への副作用ゼロ

---

### 2-7. 戦略的勝勢局面の検出（1,4,7,10確保など）

#### 設計案: 戦略パターン検出モジュール

**新規関数群**（postmortem.ts または新規 `strategy_patterns.ts` に追加）:

```typescript
// Gate Ring 制覇検出: 1,4,7,10 を1プレイヤーが支配
function detectGateRingControl(state: GameState, player: Player): boolean {
  const ringGates: GateId[] = [1, 4, 7, 10];
  return ringGates.every(gId => {
    const gate = state.gates[gId];
    return gatePlayerValue(gate, player) > gatePlayerValue(gate, opponent);
  });
}

// 包囲パターン: 自分のポジションが相手ポジションを3方向以上囲む
function detectEncirclementScore(state: GameState, player: Player): number { ... }

// 中央制圧: ポジション G（中心）の支配
function detectCenterControl(state: GameState, player: Player): boolean { ... }
```

**PostmortemMoveRow への追加フィールド案（optional）**:
```typescript
strategicFlags?: {
  gateRingControl?: Player;   // 1,4,7,10支配プレイヤー
  centerControl?: Player;     // Gポジション保有プレイヤー
  encirclementScore?: number; // 包囲スコア差
};
```

---

## 3. 推奨実装案（段階別）

### Phase N-1: ゲームログ蓄積基盤（前提条件）
- `storage.ts` に `GAME_LOG_KEY` 追加（最大50件、FIFO）
- ゲーム終了時にログ追記
- **変更ファイル**: `src/game/storage.ts`

### Phase N-2: 局面DB集計（読み取り専用）
- localStorage のゲームログから `canonical_hash` × `winner` を集計
- `Map<canonical_hash, {wins: number, total: number}>` を生成
- **新規ファイル**: `src/game/position_db.ts`

### Phase N-3: ポストモータム改善
- DECISIVE MOVE: 案A（wpSwing最大）+ 案B（揺り戻し除外）を実装
- 評価関数分離: `postmortem_eval.ts` 新規作成
- 戦略パターン検出: `strategy_patterns.ts` 新規作成（または postmortem.ts 内に追加）
- **変更ファイル**: `src/game/postmortem.ts`

---

## 4. 変更対象ファイル候補

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/game/storage.ts` | 機能追加 | GAME_LOG_KEY でゲームログ蓄積 |
| `src/game/postmortem.ts` | 機能追加 | DECISIVE MOVE 改善・strategicFlags 追加 |
| `src/game/postmortem_eval.ts` | 新規作成 | PM専用評価関数 |
| `src/game/position_db.ts` | 新規作成 | 局面DB集計ロジック |
| `src/game/strategy_patterns.ts` | 新規作成（optional） | 戦略パターン検出 |
| `src/game/types.ts` | 型追加 | `PostmortemMoveRow` に optional フィールド |

**変更しないファイル**（Constraints厳守）:
- `src/game/ai.ts` — CPU評価関数には触れない
- `src/game/symmetry.ts` — Step F-2成果物を維持
- `src/game/zobrist.ts` — canonical_hash算出ロジック変更なし
- Supabase schema — 変更なし

---

## 5. 既存ログから使えるデータ（現時点）

| データ | 利用可否 | 理由 |
|-------|---------|------|
| 現在ゲームの canonical_hash列 | ◎ | Step F-2で全MoveRecordに付与済み |
| postmortem cache（PM実行済みゲーム） | ◎ | `one_eight_pm_*` に保存済み |
| 過去ゲームの勝敗記録 | ✗ | 過去ゲームは保存されていない |
| 複数ゲームの canonical_hash 分布 | ✗ | 単一ゲームのみ |

→ **Phase N-1（ログ蓄積基盤）を先に実装しないと局面DB集計は機能しない**

---

## 6. データ不足時の暫定処理

```
局面DB: 空（ゲームログなし）の状態では、
  → 実績勝率フィールドを表示しない（UI非表示）
  → 静的評価（evaluateState）のみで従来通り動作
  → "データ収集中" の表示で期待値を設定する

DECISIVE MOVE: 案Aのみ先行実装（wpSwing最大）
  → 案Bの揺り戻しフィルタはログが溜まってから検証
```

---

## 7. Naoya判断が必要な点

| 判断事項 | 選択肢 | 推奨 |
|---------|-------|------|
| ゲームログ蓄積件数の上限 | 10件 / 30件 / 50件 | 30件（容量と精度のバランス） |
| DECISIVE MOVE 改善の採用案 | A / A+B / A+B+C | A+B |
| PM評価関数の分離タイミング | Phase N-3で同時 / 別フェーズで独立 | 同時（N-3） |
| 戦略パターン検出の優先度 | N-3に含める / 後回し | 後回し（N-4以降） |
| D4（反射）の将来採用可否 | 検討する / しない | 現時点では不要 |
