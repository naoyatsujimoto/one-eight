/**
 * positionStats.ts — 局面勝率 RPC クライアント
 *
 * Phase N-2: get_position_win_rates RPC のラッパー
 * Phase N-3 で postmortem.ts からインポートして使用する。
 *
 * 前提:
 *   - Supabase 上で get_position_win_rates v2 が実行済みであること
 *   - v2 migration: supabase/migrations/phase_n2_get_position_win_rates_v2.sql
 *
 * 動作モード:
 *   - v2 RPC (win_rate_black / win_rate_white / confidence 付き) を優先使用
 *   - v1 RPC フォールバック: win_rate / confidence をクライアントサイドで計算
 */

import { supabase } from '../lib/supabase';

// ─── 型定義 ──────────────────────────────────────────────────────────────────

/** RPC v2 の返却行（win_rate / confidence 込み）*/
export interface PositionWinRateRow {
  canonical_hash: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
  win_rate_black: number | null;  // wins_black / total × 100（total=0はnull）
  win_rate_white: number | null;  // wins_white / total × 100（total=0はnull）
  confidence: 'hidden' | 'reference' | 'main';
}

/**
 * confidence 判定基準:
 *   'hidden'    : total < 5   → 統計的に不十分。非表示推奨
 *   'reference' : total 5〜29 → 傾向確認用。参考値として表示可
 *   'main'      : total >= 30 → 統計的に信頼できる。メイン表示可
 */
export type PositionConfidence = 'hidden' | 'reference' | 'main';

// ─── クライアントサイド計算（v1 フォールバック用） ───────────────────────────

function calcWinRate(wins: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((wins / total) * 10000) / 100; // 小数点2桁
}

function calcConfidence(total: number): PositionConfidence {
  if (total < 5) return 'hidden';
  if (total < 30) return 'reference';
  return 'main';
}

// ─── RPC 呼び出し ─────────────────────────────────────────────────────────────

/**
 * 複数の canonical_hash の勝率統計を一括取得する。
 *
 * @param hashes      照会する canonical_hash 配列（重複は RPC 内で処理）
 * @param modeGroup   集計対象モード（default: 'all'）
 *                    'all' | 'pvp' | 'online' | 'cpu_normal' | 'cpu_hard' | 'cpu_very_hard'
 *                    将来の cpu_${difficulty} も同じシグネチャで取得可能
 * @returns           canonical_hash をキーとした Map（見つからないハッシュはキーなし）
 */
export async function fetchPositionWinRates(
  hashes: string[],
  modeGroup: string = 'all',
): Promise<Map<string, PositionWinRateRow>> {
  if (hashes.length === 0) return new Map();

  // 重複除去
  const uniqueHashes = [...new Set(hashes)];

  const { data, error } = await supabase
    .rpc('get_position_win_rates', {
      hashes: uniqueHashes,
      mode_group: modeGroup,
    });

  if (error) {
    console.warn('[positionStats] RPC error:', error.message);
    return new Map();
  }

  const result = new Map<string, PositionWinRateRow>();

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const hash = row.canonical_hash as string;
    const total = row.total as number;
    const wins_black = row.wins_black as number;
    const wins_white = row.wins_white as number;
    const draws = row.draws as number;

    // v2 フィールドが存在するか確認
    const hasV2Fields = 'win_rate_black' in row && 'confidence' in row;

    result.set(hash, {
      canonical_hash: hash,
      wins_black,
      wins_white,
      draws,
      total,
      // v2 RPC のフィールドがあればそれを使用、なければクライアント計算
      win_rate_black: hasV2Fields
        ? (row.win_rate_black as number | null)
        : calcWinRate(wins_black, total),
      win_rate_white: hasV2Fields
        ? (row.win_rate_white as number | null)
        : calcWinRate(wins_white, total),
      confidence: hasV2Fields
        ? (row.confidence as PositionConfidence)
        : calcConfidence(total),
    });
  }

  return result;
}

/**
 * 単一 canonical_hash の勝率統計を取得する（convenience wrapper）
 * 存在しない場合は null を返す。
 */
export async function fetchPositionWinRate(
  hash: string,
  modeGroup: string = 'all',
): Promise<PositionWinRateRow | null> {
  const map = await fetchPositionWinRates([hash], modeGroup);
  return map.get(hash) ?? null;
}

// ─── symmetry_group_stats RPC クライアント ────────────────────────────────────────────────

/** RPC v2 の symmetry_group 版返却行 */
export interface SymmetryGroupWinRateRow {
  symmetry_group_id: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
  win_rate_black: number | null;
  win_rate_white: number | null;
  confidence: 'hidden' | 'reference' | 'main';
}

/**
 * 複数の symmetry_group_id の勝率統計を一括取得する。
 *
 * @param groupIds    照会する symmetry_group_id 配列
 * @param modeGroup   集計対象モード（default: 'all'）
 * @returns           symmetry_group_id をキーとした Map
 */
export async function fetchSymmetryGroupWinRates(
  groupIds: string[],
  modeGroup: string = 'all',
): Promise<Map<string, SymmetryGroupWinRateRow>> {
  if (groupIds.length === 0) return new Map();

  const uniqueIds = [...new Set(groupIds)];

  const { data, error } = await supabase
    .rpc('get_symmetry_group_win_rates', {
      group_ids: uniqueIds,
      mode_group: modeGroup,
    });

  if (error) {
    console.warn('[positionStats] symmetry group RPC error:', error.message);
    return new Map();
  }

  const result = new Map<string, SymmetryGroupWinRateRow>();

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const gid = row.symmetry_group_id as string;
    const total = row.total as number;
    const wins_black = row.wins_black as number;
    const wins_white = row.wins_white as number;
    const draws = row.draws as number;
    const hasV2Fields = 'win_rate_black' in row && 'confidence' in row;

    result.set(gid, {
      symmetry_group_id: gid,
      wins_black,
      wins_white,
      draws,
      total,
      win_rate_black: hasV2Fields ? (row.win_rate_black as number | null) : (total > 0 ? Math.round(wins_black / total * 10000) / 100 : null),
      win_rate_white: hasV2Fields ? (row.win_rate_white as number | null) : (total > 0 ? Math.round(wins_white / total * 10000) / 100 : null),
      confidence: hasV2Fields ? (row.confidence as PositionConfidence) : (total < 5 ? 'hidden' : total < 30 ? 'reference' : 'main'),
    });
  }

  return result;
}

// ─── sim_position_stats クライアント ────────────────────────────────────────────────

export interface SimPositionWinRateRow {
  canonical_hash: string;
  sim_policy: string;
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
  win_rate_black: number | null;
}

export async function fetchSimPositionWinRates(
  hashes: string[],
  simPolicy: string = 'easy_vs_easy',
  minTotal: number = 100,
): Promise<Map<string, SimPositionWinRateRow>> {
  if (hashes.length === 0) return new Map();
  const uniqueHashes = [...new Set(hashes)];
  const { data, error } = await supabase
    .from('sim_position_stats')
    .select('canonical_hash, sim_policy, wins_black, wins_white, draws, total')
    .in('canonical_hash', uniqueHashes)
    .eq('sim_policy', simPolicy)
    .gte('total', minTotal);
  if (error) {
    console.warn('[positionStats] sim fetch error:', error.message);
    return new Map();
  }
  const result = new Map<string, SimPositionWinRateRow>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const hash = row.canonical_hash as string;
    const total = row.total as number;
    const wins_black = row.wins_black as number;
    result.set(hash, {
      canonical_hash: hash,
      sim_policy: row.sim_policy as string,
      wins_black,
      wins_white: row.wins_white as number,
      draws: row.draws as number,
      total,
      win_rate_black: total > 0 ? Math.round((wins_black / total) * 10000) / 100 : null,
    });
  }
  return result;
}

// ─── medium_pattern_stats クライアント（Phase M-1 スタブ） ─────────────────────────────────

/**
 * fetchMediumPatternWinRate — medium_pattern_id の勝率統計を取得する（スタブ）
 *
 * Phase M-1: DB 未適用のため常に null を返す。
 * DB有効化後（Supabase SQL Editor で phase_medium_pattern.sql 実行後）に
 * 実際の RPC 呼び出しに差し替える。
 *
 * @param _patternId   照会する medium_pattern_id
 * @param _minTotal    最低サンプル数（閾値未満は null 扱い）
 * @returns            null（DB有効化後に実装）
 */
export async function fetchMediumPatternWinRate(
  _patternId: string,
  _minTotal: number
): Promise<{ winRate: number; total: number } | null> {
  // TODO: DB有効化後に実装
  // const { data, error } = await supabase.rpc('get_medium_pattern_win_rates', { ... });
  return null;
}

/**
 * 表示用: confidence ラベルの日本語変換
 */
export function confidenceLabel(confidence: PositionConfidence): string {
  switch (confidence) {
    case 'hidden':    return '統計不足';
    case 'reference': return '参考値';
    case 'main':      return '統計あり';
  }
}
