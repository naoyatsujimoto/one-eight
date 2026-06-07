/**
 * Ghost Mode 監査スクリプト
 * Gate D 指示: Gate12 Middle 単独表示の RPC row 実データ特定
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
} catch {}

import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  console.log('=== Ghost Mode 監査: Gate12 Middle 単独表示 実データ探索 ===\n');

  // Step 1: match_logs から human_vs_cpu / online_pvp の full_record を取得し
  //         selective build で gates=[12,0] または [X,0] を含む MoveRecord を特定する
  const { data: logs, error: logsErr } = await supabase
    .from('match_logs')
    .select('id, user_id, mode, human_color, full_record')
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null)
    .limit(200);

  if (logsErr) {
    console.error('match_logs fetch error:', logsErr.message);
    return;
  }

  console.log(`取得 match_logs 件数: ${logs?.length ?? 0}\n`);

  // Step 2: full_record 内で selective + gates[1]=0 の MoveRecord を探す
  type MoveRecord = {
    player?: string;
    positioning?: string;
    build?: {
      type?: string;
      gate?: number;
      gates?: (number | null)[];
      placedGateIds?: number[];
      placed?: number;
    };
    canonical_hash?: string;
    move_number?: number;
  };

  let found = false;
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[] | null;
    if (!fr || !Array.isArray(fr)) continue;

    for (let i = 0; i < fr.length; i++) {
      const mv = fr[i];
      if (!mv.build) continue;
      if (mv.build.type !== 'selective') continue;
      const gates = mv.build.gates;
      if (!gates) continue;

      // gate[1] = 0 のケース (applySelectiveBuildSingle の記録)
      if (gates[1] === 0 || gates[1] === null) {
        console.log('--- [発見] selective gates[1]=0 の MoveRecord ---');
        console.log(`  match_log.id: ${log.id}`);
        console.log(`  mode: ${log.mode}`);
        console.log(`  human_color: ${log.human_color}`);
        console.log(`  full_record index: ${i}`);
        console.log(`  MoveRecord.player: ${mv.player}`);
        console.log(`  MoveRecord.positioning: ${mv.positioning}`);
        console.log(`  MoveRecord.build.type: ${mv.build.type}`);
        console.log(`  MoveRecord.build.gates: ${JSON.stringify(mv.build.gates)}`);
        console.log(`  MoveRecord.build.placed: ${mv.build.placed}`);
        console.log(`  MoveRecord.canonical_hash: ${mv.canonical_hash ?? '(none)'}`);
        console.log(`  MoveRecord.move_number: ${mv.move_number ?? i}`);
        console.log();

        // RPC gate_ids_str 生成シミュレーション
        const g0 = gates[0] != null ? String(gates[0]) : '';
        const g1 = gates[1] != null ? String(gates[1]) : '';
        const gate_ids_str = `${g0},${g1}`;
        console.log(`  [RPC生成] gate_ids_str: "${gate_ids_str}"`);

        // Board.tsx での変換シミュレーション
        const ids = gate_ids_str.split(',').map(Number).filter((n) => !isNaN(n) && n > 0);
        console.log(`  [Board変換後] ids (filter n>0): [${ids.join(', ')}]`);
        console.log(`  → Gate${ids[0]} ONLY が middle 表示対象になる`);
        console.log();

        found = true;
        // 3件見つかったら十分
        if (found) break;
      }
    }
    if (found) break;
  }

  if (!found) {
    console.log('selective gates[1]=0 の MoveRecord は 200件中に見つかりませんでした。');
    console.log('→ 全棋譜が selective 2-gate 正常ケースか、mode対象外の可能性。');
    console.log();

    // Fallback: selective build の全サンプルを表示
    console.log('--- [サンプル] selective build の全MoveRecord（最初の5件） ---');
    let selectiveCount = 0;
    for (const log of (logs ?? [])) {
      if (selectiveCount >= 5) break;
      const fr = log.full_record as MoveRecord[] | null;
      if (!fr || !Array.isArray(fr)) continue;
      for (let i = 0; i < fr.length; i++) {
        if (selectiveCount >= 5) break;
        const mv = fr[i];
        if (mv.build?.type === 'selective') {
          console.log(`  match_log.id: ${log.id}, index: ${i}`);
          console.log(`  build: ${JSON.stringify(mv.build)}`);
          console.log();
          selectiveCount++;
        }
      }
    }
  }

  // Step 3: 初手 (full_record[0]) の build type 分布を確認
  console.log('=== Step 3: 初手 (full_record[0]) の build type 分布 ===\n');
  const firstMoveDist: Record<string, number> = {};
  let firstMoveGates0Count = 0;
  for (const log of (logs ?? [])) {
    const fr = log.full_record as MoveRecord[] | null;
    if (!fr || !Array.isArray(fr) || fr.length === 0) continue;
    const mv = fr[0];
    const btype = mv.build?.type ?? 'unknown';
    firstMoveDist[btype] = (firstMoveDist[btype] ?? 0) + 1;

    // 初手で gates[1]=0 があるか
    if (mv.build?.type === 'selective' && mv.build.gates && (mv.build.gates[1] === 0 || mv.build.gates[1] === null)) {
      firstMoveGates0Count++;
      console.log(`  [初手][gates[1]=0] match_log.id: ${log.id}, gates: ${JSON.stringify(mv.build.gates)}`);
    }
  }
  console.log('初手 build type 分布:', JSON.stringify(firstMoveDist, null, 2));
  console.log(`初手で gates[1]=0 の件数: ${firstMoveGates0Count}`);
  console.log();

  // Step 4: p_move_index=0 のとき RPC は全棋譜の full_record[0] を使う
  // → 初手で [12,0] があれば Gate12 single になる
  // Step 5: 任意の p_move_index>0 で canonical_hash マッチ後の次の手を確認
  // (実際の RPC クエリはここでは再現不可。ロジックのみ確認)
  console.log('=== Step 4: RPC ロジック確認（コードベース） ===\n');
  console.log('p_move_index=0 の場合:');
  console.log('  全 match_logs の full_record[0] を直接集計する');
  console.log('  → 初手で selective gates=[x,0] があれば gate_ids_str = "x,0" が生成される');
  console.log('  → Board.tsx: filter(n>0) → [x] のみ（single gate 表示）');
  console.log();
  console.log('p_move_index>0 の場合:');
  console.log('  canonical_hash マッチした hand の次の手を集計する');
  console.log('  → 2手目以降の selective single も同様に "x,0" が生成される可能性あり');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
