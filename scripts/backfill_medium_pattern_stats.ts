/**
 * backfill_medium_pattern_stats.ts
 *
 * 既存の match_logs.full_record から medium_pattern_id を計算し、
 * Supabase の medium_pattern_stats を更新する。
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx tsx scripts/backfill_medium_pattern_stats.ts
 *
 * 前提:
 *   - phase_medium_pattern.sql が Supabase SQL Editor で実行済みであること
 *   - .env に VITE_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が設定済みであること
 *
 * 注意:
 *   - 初回のみ実行すること（再実行すると二重集計になる）。
 *   - 対象: canonical_hashes_computed = true かつ winner が確定しているレコード。
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// .env を手動ロード（dotenv 未インストール対応）
try {
  const envPath = resolve(process.cwd(), '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env なければ process.env をそのまま使う */ }
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition,
  applyMassiveBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  applyQuadBuildForGates,
  skipTurn,
  confirmPositionOnly,
} from '../src/game/engine';
import { computeMediumPatternId } from '../src/game/mediumPattern';
import type { GameState, MoveRecord, GateId, PositionId } from '../src/game/types';

// ─── Supabase クライアント ────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── 型 ──────────────────────────────────────────────────────────────────────

interface StatAccum {
  wins_black: number;
  wins_white: number;
  draws: number;
  total: number;
}

// key: `${medium_pattern_id}||${mode_group}`
type StatsMap = Map<string, StatAccum>;

// ─── mode_group 決定ロジック ──────────────────────────────────────────────────

function resolveModeGroups(mode: string, cpuDifficulty: string | null): string[] {
  const groups: string[] = ['all'];
  if (mode === 'human_vs_human') {
    groups.push('pvp');
  } else if (mode === 'online') {
    groups.push('online');
  } else if (mode === 'human_vs_cpu' && cpuDifficulty) {
    if (/^[a-z0-9_]+$/.test(cpuDifficulty)) {
      groups.push(`cpu_${cpuDifficulty}`);
    }
  }
  return groups;
}

// ─── ゲームリプレイ ──────────────────────────────────────────────────────────

function replayGameWithStates(history: MoveRecord[]): GameState[] {
  let state: GameState = createInitialState();
  const postMoveStates: GameState[] = [];

  for (const record of history) {
    const { positioning, build } = record;

    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    let nextState: GameState;

    switch (build.type) {
      case 'massive':
        nextState = build.gate !== null
          ? applyMassiveBuild(state, build.gate as GateId)
          : confirmPositionOnly(state);
        break;
      case 'selective': {
        const gates = (build.gates as [GateId | 0, GateId | 0]).filter((g): g is GateId => g !== 0);
        if (gates.length === 2) nextState = applySelectiveBuild(state, gates as [GateId, GateId]);
        else if (gates.length === 1) nextState = applySelectiveBuildSingle(state, gates[0]!);
        else nextState = confirmPositionOnly(state);
        break;
      }
      case 'quad':
        nextState = applyQuadBuildForGates(state, build.placedGateIds as GateId[]);
        break;
      case 'skip':
        nextState = skipTurn(state);
        break;
      case 'no-build':
        nextState = confirmPositionOnly(state);
        break;
      default:
        console.warn(`  unknown build type at move ${record.moveNumber}: ${(build as { type: string }).type}`);
        nextState = state;
        break;
    }

    postMoveStates.push(nextState);
    state = nextState;
  }

  return postMoveStates;
}

// ─── 統計集計 ────────────────────────────────────────────────────────────────

function accumulate(
  statsMap: StatsMap,
  mediumPatternId: string,
  modeGroup: string,
  winner: string,
): void {
  const key = `${mediumPatternId}||${modeGroup}`;
  const prev = statsMap.get(key) ?? { wins_black: 0, wins_white: 0, draws: 0, total: 0 };
  statsMap.set(key, {
    wins_black: prev.wins_black + (winner === 'black' ? 1 : 0),
    wins_white: prev.wins_white + (winner === 'white' ? 1 : 0),
    draws:      prev.draws      + (winner === 'draw'  ? 1 : 0),
    total:      prev.total + 1,
  });
}

// ─── バッチ upsert（CHUNK_SIZE 件ずつ） ──────────────────────────────────────

const CHUNK_SIZE = 200;

async function flushStats(statsMap: StatsMap): Promise<{ ok: number; err: number }> {
  // StatsMap → rows に変換
  const rows = Array.from(statsMap.entries()).map(([key, accum]) => {
    const [medium_pattern_id, mode_group] = key.split('||') as [string, string];
    const { wins_black, wins_white, draws, total } = accum;
    return {
      medium_pattern_id,
      mode_group,
      wins_black,
      wins_white,
      draws,
      total,
      win_rate_black: total > 0 ? Math.round(wins_black / total * 10000) / 100 : null,
      win_rate_white: total > 0 ? Math.round(wins_white / total * 10000) / 100 : null,
    };
  });

  console.log(`\n== upsert 開始: ${rows.length} 行 ==`);
  let ok = 0;
  let err = 0;

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase
      .from('medium_pattern_stats')
      .upsert(chunk, { onConflict: 'medium_pattern_id,mode_group' });
    if (error) {
      console.error(`  ERROR (chunk ${Math.floor(i / CHUNK_SIZE) + 1}): ${error.message}`);
      err += chunk.length;
    } else {
      ok += chunk.length;
      process.stdout.write('.');
    }
  }
  console.log('\n');
  return { ok, err };
}

// ─── メイン処理 ───────────────────────────────────────────────────────────────

async function main() {
  console.log('=== backfill_medium_pattern_stats.ts ===');
  console.log('対象: canonical_hashes_computed = true のレコード\n');

  const { data: rows, error: fetchErr } = await supabase
    .from('match_logs')
    .select('id, mode, cpu_difficulty, winner, full_record')
    .eq('canonical_hashes_computed', true)
    .not('full_record', 'is', null)
    .not('winner', 'is', null);

  if (fetchErr) {
    console.error('ERROR: fetch failed:', fetchErr.message);
    process.exit(1);
  }

  const targets = rows ?? [];
  console.log(`取得: ${targets.length} 件\n`);

  const statsMap: StatsMap = new Map();
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of targets) {
    const fullRecord = row.full_record as MoveRecord[] | null;
    const winner = row.winner as string;

    if (!fullRecord || fullRecord.length === 0) {
      console.log(`[SKIP] id=${row.id} — full_record なし`);
      skipped++;
      continue;
    }
    if (!['black', 'white', 'draw'].includes(winner)) {
      console.log(`[SKIP] id=${row.id} — invalid winner: ${winner}`);
      skipped++;
      continue;
    }

    console.log(`[Processing] id=${row.id} mode=${row.mode} winner=${winner} moves=${fullRecord.length}`);

    try {
      const postMoveStates = replayGameWithStates(fullRecord);
      const modeGroups = resolveModeGroups(row.mode as string, row.cpu_difficulty as string | null);

      let patternCount = 0;
      for (const state of postMoveStates) {
        const patternId = computeMediumPatternId(state);
        if (!patternId) continue;
        for (const mg of modeGroups) {
          accumulate(statsMap, patternId, mg, winner);
        }
        patternCount++;
      }

      console.log(`  medium_pattern_id 計算: ${patternCount} 手 × [${modeGroups.join(', ')}]`);
      processed++;
    } catch (e) {
      console.error(`  EXCEPTION: ${e instanceof Error ? e.message : String(e)}`);
      errors++;
    }
  }

  console.log(`\n--- 集計完了 ---`);
  console.log(`processed: ${processed} / skipped: ${skipped} / errors: ${errors}`);
  console.log(`ユニーク (medium_pattern_id, mode_group) ペア数: ${statsMap.size}`);

  if (statsMap.size === 0) {
    console.log('upsert 対象なし。終了。');
    return;
  }

  const { ok, err: upsertErr } = await flushStats(statsMap);

  console.log('=== 完了 ===');
  console.log(`upsert OK: ${ok} / ERROR: ${upsertErr}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
