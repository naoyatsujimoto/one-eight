/**
 * analytics.ts
 * CPU戦の自動ログ保存・集計モジュール
 * - 既存ゲームロジック（engine/capture/endgame/winner/history）は一切変更しない
 * - localStorage キー: "one_eight_game_records" / "one_eight_aggregates"
 */

import type { GameState, GateId, MoveRecord, Player } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlyRecord {
  ply: number;
  player: Player;
  position: string;
  build_type: string;
  gates: GateId[];
}

export interface GameRecord {
  game_id: string;
  played_at: string;
  mode: 'human_vs_cpu';
  human_color: Player;
  winner: Player | 'draw' | null;
  move_count: number;
  first_3_plies: PlyRecord[];
  full_record: MoveRecord[];
}

export interface AggregateEntry {
  tries: number;
  wins: number;
}

export interface Aggregates {
  byPosition: Record<string, AggregateEntry>;
  byBuildType: Record<string, AggregateEntry>;
  byPositionBuildType: Record<string, AggregateEntry>;
  byFirst3Sequence: Record<string, AggregateEntry>;
}

// ─── Storage keys ──────────────────────────────────────────────────────────────

const RECORDS_KEY = 'one_eight_game_records';
const AGGREGATES_KEY = 'one_eight_aggregates';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gatesFromMove(move: MoveRecord): GateId[] {
  if (move.build.type === 'skip') return [];
  if (move.build.type === 'massive') {
    return move.build.gate !== null ? [move.build.gate] : [];
  }
  if (move.build.type === 'selective') {
    return [...move.build.gates];
  }
  if (move.build.type === 'quad') {
    return [...move.build.placedGateIds];
  }
  return [];
}

function extractFirst3Plies(history: MoveRecord[]): PlyRecord[] {
  return history.slice(0, 3).map((m) => ({
    ply: m.moveNumber,
    player: m.player,
    position: m.positioning,
    build_type: m.build.type,
    gates: gatesFromMove(m),
  }));
}

function generateGameId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyEntry(): AggregateEntry {
  return { tries: 0, wins: 0 };
}

function isWin(record: GameRecord, key: 'human' | 'cpu'): boolean {
  if (record.winner === null || record.winner === 'draw') return false;
  if (key === 'human') return record.winner === record.human_color;
  return record.winner !== record.human_color;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** CPU戦終了時に呼び出す。Human vs CPU のみ保存する。 */
export function saveGameRecord(state: GameState): GameRecord | null {
  if (!state.gameEnded) return null;
  if (state.cpuPlayer === null) return null; // Human vs Human は対象外

  const human_color: Player = state.cpuPlayer === 'white' ? 'black' : 'white';

  const record: GameRecord = {
    game_id: generateGameId(),
    played_at: new Date().toISOString(),
    mode: 'human_vs_cpu',
    human_color,
    winner: state.winner,
    move_count: state.history.length,
    first_3_plies: extractFirst3Plies(state.history),
    full_record: state.history,
  };

  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const records: GameRecord[] = raw ? (JSON.parse(raw) as GameRecord[]) : [];
    records.push(record);
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // localStorage 満杯などは無視
  }

  return record;
}

/** saveGameRecord() の後に呼び出す。集計データを更新する。 */
export function updateAggregates(record: GameRecord): void {
  let agg: Aggregates;
  try {
    const raw = localStorage.getItem(AGGREGATES_KEY);
    agg = raw
      ? (JSON.parse(raw) as Aggregates)
      : { byPosition: {}, byBuildType: {}, byPositionBuildType: {}, byFirst3Sequence: {} };
  } catch {
    agg = { byPosition: {}, byBuildType: {}, byPositionBuildType: {}, byFirst3Sequence: {} };
  }

  const firstPly = record.first_3_plies[0];
  const win = isWin(record, 'human');

  if (firstPly) {
    const pos = firstPly.position;
    const bt = firstPly.build_type;
    const posBt = `${pos}:${bt}`;

    // byPosition
    if (!agg.byPosition[pos]) agg.byPosition[pos] = emptyEntry();
    agg.byPosition[pos].tries++;
    if (win) agg.byPosition[pos].wins++;

    // byBuildType
    if (!agg.byBuildType[bt]) agg.byBuildType[bt] = emptyEntry();
    agg.byBuildType[bt].tries++;
    if (win) agg.byBuildType[bt].wins++;

    // byPositionBuildType
    if (!agg.byPositionBuildType[posBt]) agg.byPositionBuildType[posBt] = emptyEntry();
    agg.byPositionBuildType[posBt].tries++;
    if (win) agg.byPositionBuildType[posBt].wins++;
  }

  // byFirst3Sequence (最初の3手系列)
  const seq = record.first_3_plies
    .map((p) => `${p.position}:${p.build_type}`)
    .join('|');
  if (seq) {
    if (!agg.byFirst3Sequence[seq]) agg.byFirst3Sequence[seq] = emptyEntry();
    agg.byFirst3Sequence[seq].tries++;
    if (win) agg.byFirst3Sequence[seq].wins++;
  }

  try {
    localStorage.setItem(AGGREGATES_KEY, JSON.stringify(agg));
  } catch {
    // ignore
  }
}

/** 集計データ全体を JSON 文字列として返す（デバッグ・エクスポート用）。 */
export function exportAnalytics(): string {
  try {
    const records = localStorage.getItem(RECORDS_KEY);
    const aggregates = localStorage.getItem(AGGREGATES_KEY);
    return JSON.stringify(
      {
        records: records ? JSON.parse(records) : [],
        aggregates: aggregates ? JSON.parse(aggregates) : {},
      },
      null,
      2
    );
  } catch {
    return '{}';
  }
}

/** コンソールに集計サマリーを出力する（デバッグ用）。 */
export function logAnalyticsSummary(): void {
  try {
    const raw = localStorage.getItem(AGGREGATES_KEY);
    if (!raw) {
      console.log('[Analytics] No data yet.');
      return;
    }
    const agg = JSON.parse(raw) as Aggregates;
    console.group('[Analytics] Summary');
    console.table(
      Object.fromEntries(
        Object.entries(agg.byPosition).map(([k, v]) => [
          k,
          { tries: v.tries, wins: v.wins, winRate: v.tries ? `${((v.wins / v.tries) * 100).toFixed(1)}%` : '-' },
        ])
      )
    );
    console.groupEnd();
  } catch {
    // ignore
  }
}
