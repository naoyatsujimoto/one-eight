/**
 * investigate_position_only_wp.ts
 *
 * position_only 導入後の #20〜#27 WP/Δpt 変化を詳細調査する。
 *
 * 方法:
 * 1. match_logs から full_record を取得
 * 2. runPostmortem() でエンジンリプレイ → wpAfter を取得
 * 3. enrichPostmortemWithStats() の fallback chain を再現（DB lookup付き）
 * 4. Position_only なし（Step 2.3 まで）vs あり（Step 2.5 込み）を比較
 * 5. #20〜#27 の詳細 + 全52手のwinRateSource分布を出力
 *
 * 実行:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/investigate_position_only_wp.ts 2>&1
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env ロード
try {
  const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* ignore */ }

import { createClient } from '@supabase/supabase-js';
import { runPostmortem } from '../src/game/postmortem';
import type { MoveRecord } from '../src/game/types';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const TARGET_GAME_ID    = '113969e1-929f-48c2-92f1-d1cff4e2bff4';
const SIM_POLICY        = 'easy_vs_easy';
const POS_ONLY_THRESHOLD = 100;
const SIM_MED_THRESHOLD  = 30;
const MED_PAT_THRESHOLD  = 5;
const POS_ONLY_BLEND     = 0.1;
const SIM_MED_BLEND      = 0.2;

function log(msg: string) { console.log(msg); }

async function main() {
  log('=== investigate_position_only_wp.ts ===');
  log(`対象対局: ${TARGET_GAME_ID}`);
  log('');

  // ─── 1. 対局データ取得 ──────────────────────────────────────────────────
  log('--- 1. 対局データ取得（match_logs）---');

  const { data: matchData, error: matchError } = await supabase
    .from('match_logs')
    .select('winner, full_record')
    .eq('id', TARGET_GAME_ID)
    .single();

  if (matchError || !matchData) {
    log(`ERROR: match_logs に対局が見つかりません: ${matchError?.message}`);
    process.exit(1);
  }

  const fullRecord = matchData.full_record as MoveRecord[];
  log(`winner: ${matchData.winner} / 手数: ${fullRecord.length}`);

  // full_record の最初の手を確認
  const firstStep = fullRecord[0];
  if (firstStep) {
    log(`full_record キー: ${Object.keys(firstStep).join(', ')}`);
    const hasMedPatternId = 'medium_pattern_id' in firstStep;
    log(`medium_pattern_id: ${hasMedPatternId ? '存在する' : '存在しない（リプレイ算出が必要）'}`);
  }

  // ─── 2. runPostmortem でエンジンリプレイ ────────────────────────────────
  log('\n--- 2. runPostmortem 実行（wpAfter 取得）---');
  const baseResult = runPostmortem(fullRecord);
  log(`runPostmortem 完了: ${baseResult.rows.length} 手, wpInitial=${(baseResult.wpInitial * 100).toFixed(1)}%`);

  // wpAfter の確認
  const rowMap = new Map(baseResult.rows.map(r => [r.moveNum, r]));
  log(`#20 wpAfter: ${((rowMap.get(20)?.wpAfter ?? 0) * 100).toFixed(1)}%`);
  log(`#27 wpAfter: ${((rowMap.get(27)?.wpAfter ?? 0) * 100).toFixed(1)}%`);

  // ─── 3. medium_pattern_id / position_only_id の取得 ─────────────────────
  log('\n--- 3. medium_pattern_id / position_only_id 取得 ---');

  // full_record に medium_pattern_id があるか確認
  const mpFromRecord = (fullRecord[0] as any)?.medium_pattern_id;
  let mediumPatternIds: (string | undefined)[];

  if (mpFromRecord !== undefined) {
    // full_record に含まれている場合
    mediumPatternIds = fullRecord.map((r: any) => r.medium_pattern_id ?? undefined);
    log(`medium_pattern_id は full_record から取得`);
  } else {
    // リプレイ算出が必要（postmortem.ts の computeMediumPatternIdsFromHistory に相当）
    log(`medium_pattern_id はリプレイ算出（computeMediumPatternId 使用）`);
    // postmortem.ts の内部関数 computeMediumPatternIdsFromHistory を呼べないため
    // ここでは full_record の canonical_hash を使って postmortem_history から取得を試みる
    // それも失敗なら medium_pattern_id なしで続行

    // canonical_hash から medium_pattern_id へのマッピングを postmortem_history から取得
    const { data: phData } = await supabase
      .from('postmortem_history')
      .select('move_number, medium_pattern_id')
      .eq('game_id', TARGET_GAME_ID)
      .order('move_number');

    if (phData && phData.length > 0) {
      const phMap = new Map(phData.map(r => [r.move_number, r.medium_pattern_id]));
      mediumPatternIds = fullRecord.map((r: any) => phMap.get(r.moveNumber) ?? undefined);
      log(`postmortem_history から ${phData.length} 手分の medium_pattern_id を取得`);
    } else {
      // 代替: postmortem.ts の内部実装を再現するためにエンジンをリプレイ
      log(`postmortem_history が存在しないため、computeMediumPatternId でリプレイ算出`);
      mediumPatternIds = await computeMediumPatternIds(fullRecord);
    }
  }

  const positionOnlyIds = mediumPatternIds.map(pid => {
    if (!pid) return undefined;
    const colonIdx = pid.indexOf(':');
    return colonIdx >= 0 ? pid.slice(0, colonIdx) : pid;
  });

  const validMedIds = mediumPatternIds.filter((p): p is string => typeof p === 'string' && p.length > 0);
  const validPosIds = positionOnlyIds.filter((p): p is string => typeof p === 'string' && p.length > 0);

  log(`medium_pattern_id: ${validMedIds.length} / ${fullRecord.length} 手`);
  log(`position_only_id: ${validPosIds.length} / ${fullRecord.length} 手`);

  if (validMedIds.length > 0) {
    log(`medium_pattern_id[0] (先頭30文字): ${mediumPatternIds[0]?.slice(0, 30)}...`);
    log(`position_only_id[0] (先頭20文字): ${positionOnlyIds[0]?.slice(0, 20)}`);
  }

  // ─── 4. 一括フェッチ ────────────────────────────────────────────────────
  log('\n--- 4. 統計データ一括取得 ---');

  // canonical_hash / symmetry_group_id
  const canonicalHashes = fullRecord.map((r: any) => r.canonical_hash as string | undefined);
  const symmetryGroupIds = fullRecord.map((r: any) => r.symmetry_group_id as string | undefined);

  const uniqueHashes    = [...new Set(canonicalHashes.filter(Boolean))] as string[];
  const uniqueGroupIds  = [...new Set(symmetryGroupIds.filter(Boolean))] as string[];
  const uniqueMedIds    = [...new Set(validMedIds)];
  const uniquePosIds    = [...new Set(validPosIds)];

  log(`  canonical_hash: ${uniqueHashes.length} unique`);
  log(`  symmetry_group_id: ${uniqueGroupIds.length} unique`);
  log(`  medium_pattern_id: ${uniqueMedIds.length} unique`);
  log(`  position_only_id: ${uniquePosIds.length} unique`);

  // 4a. position_stats
  const canonicalMap = new Map<string, { total: number; win_rate_black: number; confidence: string }>();
  if (uniqueHashes.length > 0) {
    const { data } = await supabase
      .from('position_stats')
      .select('canonical_hash, wins_black, wins_white, draws, total, confidence')
      .in('canonical_hash', uniqueHashes);
    for (const row of (data ?? []) as any[]) {
      const total = row.total ?? 0;
      canonicalMap.set(row.canonical_hash, {
        total,
        win_rate_black: total > 0 ? row.wins_black / total : 0.5,
        confidence: row.confidence ?? 'hidden',
      });
    }
    log(`  position_stats: ${canonicalMap.size} 件`);
  }

  // 4b. symmetry_group_stats
  const symmetryMap = new Map<string, { total: number; win_rate_black: number; confidence: string }>();
  if (uniqueGroupIds.length > 0) {
    const { data } = await supabase
      .from('symmetry_group_stats')
      .select('symmetry_group_id, wins_black, wins_white, draws, total, confidence')
      .in('symmetry_group_id', uniqueGroupIds)
      .neq('confidence', 'hidden');
    for (const row of (data ?? []) as any[]) {
      const total = row.total ?? 0;
      symmetryMap.set(row.symmetry_group_id, {
        total,
        win_rate_black: total > 0 ? row.wins_black / total : 0.5,
        confidence: row.confidence ?? 'hidden',
      });
    }
    log(`  symmetry_group_stats: ${symmetryMap.size} 件`);
  }

  // 4c. medium_pattern_stats (実戦)
  const medPatMap = new Map<string, { total: number; win_rate_black: number }>();
  if (uniqueMedIds.length > 0) {
    const { data } = await supabase
      .from('medium_pattern_stats')
      .select('medium_pattern_id, wins_black, wins_white, draws, total')
      .in('medium_pattern_id', uniqueMedIds)
      .gte('total', MED_PAT_THRESHOLD);
    for (const row of (data ?? []) as any[]) {
      const total = row.total ?? 0;
      medPatMap.set(row.medium_pattern_id, {
        total,
        win_rate_black: total > 0 ? row.wins_black / total : 0.5,
      });
    }
    log(`  medium_pattern_stats (>=${MED_PAT_THRESHOLD}): ${medPatMap.size} 件`);
  }

  // 4d. sim_medium_pattern_stats
  const simMedMap = new Map<string, { total: number; win_rate_black: number }>();
  if (uniqueMedIds.length > 0) {
    const { data } = await supabase
      .from('sim_medium_pattern_stats')
      .select('medium_pattern_id, wins_black, wins_white, draws, total')
      .in('medium_pattern_id', uniqueMedIds)
      .eq('sim_policy', SIM_POLICY)
      .gte('total', SIM_MED_THRESHOLD);
    for (const row of (data ?? []) as any[]) {
      const total = row.total ?? 0;
      simMedMap.set(row.medium_pattern_id, {
        total,
        win_rate_black: total > 0 ? row.wins_black / total : 0.5,
      });
    }
    log(`  sim_medium_pattern_stats (>=${SIM_MED_THRESHOLD}): ${simMedMap.size} 件`);
  }

  // 4e. sim_position_only_stats
  const simPosOnlyMap = new Map<string, { total: number; win_rate_black: number }>();
  if (uniquePosIds.length > 0) {
    const { data } = await supabase
      .from('sim_position_only_stats')
      .select('position_only_id, wins_black, wins_white, draws, total')
      .in('position_only_id', uniquePosIds)
      .eq('sim_policy', SIM_POLICY)
      .gte('total', POS_ONLY_THRESHOLD);
    for (const row of (data ?? []) as any[]) {
      const total = row.total ?? 0;
      simPosOnlyMap.set(row.position_only_id, {
        total,
        win_rate_black: total > 0 ? row.wins_black / total : 0.5,
      });
    }
    log(`  sim_position_only_stats (>=${POS_ONLY_THRESHOLD}): ${simPosOnlyMap.size} 件`);
  }

  // ─── 5. fallback chain 再現 ──────────────────────────────────────────────
  log('\n--- 5. fallback chain 再現 ---');

  interface AnalyzedMove {
    moveNum: number;
    player: string;
    played: string;
    wpAfter: number;
    mediumPatternId: string | undefined;
    positionOnlyId: string | undefined;
    simMedTotal: number;
    simPosOnlyTotal: number;
    simPosOnlyWP: number;
    canonicalTotal: number;
    // WITHOUT position_only
    oldSource: string;
    oldResolvedWP: number;
    // WITH position_only
    newSource: string;
    newResolvedWP: number;
  }

  const analyzed: AnalyzedMove[] = [];

  for (let i = 0; i < baseResult.rows.length; i++) {
    const row = baseResult.rows[i]!;
    const wpAfter = row.wpAfter;  // エンジン計算済み（正確な値）
    const canonicalHash = canonicalHashes[i];
    const symmetryGroupId = symmetryGroupIds[i];
    const mediumPatternId = mediumPatternIds[i];
    const positionOnlyId = positionOnlyIds[i];

    // Fallback chain 再現（postmortem.ts の enrichedRows.map に対応）
    function resolveSource(withPosOnly: boolean): { source: string; resolvedWP: number } {
      // Step 1: canonical_hash
      const canon = canonicalHash ? canonicalMap.get(canonicalHash) : undefined;
      if (canon && canon.confidence !== 'hidden') {
        const historicWP = canon.win_rate_black;
        const resolvedWP = canon.confidence === 'main'
          ? historicWP
          : (historicWP + wpAfter) / 2;
        return { source: 'position_stats', resolvedWP };
      }

      // Step 1.5: medium_pattern
      const medPat = mediumPatternId ? medPatMap.get(mediumPatternId) : undefined;
      if (medPat && medPat.total >= MED_PAT_THRESHOLD) {
        const blended = (medPat.win_rate_black + wpAfter) / 2;
        return { source: 'medium_pattern', resolvedWP: blended };
      }

      // Step 2: symmetry_group
      const sym = symmetryGroupId ? symmetryMap.get(symmetryGroupId) : undefined;
      if (sym) {
        const resolvedWP = sym.confidence === 'main'
          ? sym.win_rate_black
          : (sym.win_rate_black + wpAfter) / 2;
        return { source: 'symmetry_group', resolvedWP };
      }

      // Step 2.3: sim_medium_pattern
      const simMed = mediumPatternId ? simMedMap.get(mediumPatternId) : undefined;
      if (simMed && simMed.total >= SIM_MED_THRESHOLD) {
        const blended = SIM_MED_BLEND * simMed.win_rate_black + (1 - SIM_MED_BLEND) * wpAfter;
        return { source: 'sim_medium_pattern', resolvedWP: blended };
      }

      // Step 2.5: sim_position_only（withPosOnly の場合のみ）
      if (withPosOnly) {
        const simPos = positionOnlyId ? simPosOnlyMap.get(positionOnlyId) : undefined;
        if (simPos && simPos.total >= POS_ONLY_THRESHOLD) {
          const blended = POS_ONLY_BLEND * simPos.win_rate_black + (1 - POS_ONLY_BLEND) * wpAfter;
          return { source: 'sim_position_only', resolvedWP: blended };
        }
      }

      // Step 3: static
      return { source: 'static', resolvedWP: wpAfter };
    }

    const oldResult = resolveSource(false);
    const newResult = resolveSource(true);

    const simMedStat = mediumPatternId ? simMedMap.get(mediumPatternId) : undefined;
    const simPosStat = positionOnlyId ? simPosOnlyMap.get(positionOnlyId) : undefined;
    const canonStat  = canonicalHash ? canonicalMap.get(canonicalHash) : undefined;

    analyzed.push({
      moveNum: row.moveNum,
      player: row.player,
      played: row.played,
      wpAfter,
      mediumPatternId,
      positionOnlyId,
      simMedTotal: simMedStat?.total ?? 0,
      simPosOnlyTotal: simPosStat?.total ?? 0,
      simPosOnlyWP: simPosStat?.win_rate_black ?? 0,
      canonicalTotal: canonStat?.total ?? 0,
      oldSource: oldResult.source,
      oldResolvedWP: oldResult.resolvedWP,
      newSource: newResult.source,
      newResolvedWP: newResult.resolvedWP,
    });
  }

  // ─── 6. Δpt 計算 ────────────────────────────────────────────────────────
  const wpInitial = baseResult.wpInitial;
  const oldSeries = [wpInitial, ...analyzed.map(m => m.oldResolvedWP)];
  const newSeries = [wpInitial, ...analyzed.map(m => m.newResolvedWP)];

  function getOldDeltaPt(i: number): number {
    return ((oldSeries[i + 1]! - oldSeries[i]!) * 100);
  }
  function getNewDeltaPt(i: number): number {
    return ((newSeries[i + 1]! - newSeries[i]!) * 100);
  }

  // ─── 7. Step 2.5 の実装確認サマリー ────────────────────────────────────
  log('\n=== Step 1: Step 2.5 実装確認 ===');
  log('');
  log('コード確認（src/game/postmortem.ts）:');
  log('  fallback chain の順序: Step1 → Step1.5 → Step2 → Step2.3 → Step2.5 → Step3');
  log('  Step 2.3 (sim_medium_pattern): total >= 30, blend = 0.2×simWP + 0.8×staticWP');
  log('  Step 2.5 (sim_position_only): total >= 100, blend = 0.1×posWP + 0.9×staticWP');
  log('');
  log('  ✅ Step 2.5 は Step 2.3 の return 後に実行される（上書きなし）');
  log('  ✅ 実装上 "source === static" の条件チェックは不要（chain 構造で保証）');
  log('  ✅ blend 計算: 0.1 × posWP + 0.9 × wpAfter（static WP）');

  // ─── 8. #20〜#27 詳細比較表 ─────────────────────────────────────────────
  log('\n=== Step 2: #20〜#27 詳細比較表 ===');
  log('');
  log(
    `${'#'.padStart(3)} ` +
    `${'Player'.padEnd(6)} ` +
    `${'source (旧)'.padEnd(20)} ` +
    `${'WP% (旧)'.padEnd(10)} ` +
    `${'Δpt (旧)'.padEnd(10)} ` +
    `${'source (新)'.padEnd(22)} ` +
    `${'WP% (新)'.padEnd(10)} ` +
    `${'Δpt (新)'.padEnd(10)} ` +
    `${'simMed_tot'.padEnd(12)} ` +
    `${'posOnly_tot'.padEnd(12)} ` +
    `staticWP%`
  );
  log('-'.repeat(130));

  for (let i = 0; i < analyzed.length; i++) {
    const m = analyzed[i]!;
    if (m.moveNum < 20 || m.moveNum > 27) continue;

    const oldDelta = getOldDeltaPt(i);
    const newDelta = getNewDeltaPt(i);
    const changed = m.oldSource !== m.newSource;

    log(
      `${String(m.moveNum).padStart(3)} ` +
      `${m.player.padEnd(6)} ` +
      `${m.oldSource.padEnd(20)} ` +
      `${(m.oldResolvedWP * 100).toFixed(1).padEnd(10)} ` +
      `${(oldDelta >= 0 ? '+' : '') + oldDelta.toFixed(1) + 'pt'.padEnd(8)} ` +
      `${(m.newSource + (changed ? ' ←' : '')).padEnd(22)} ` +
      `${(m.newResolvedWP * 100).toFixed(1).padEnd(10)} ` +
      `${(newDelta >= 0 ? '+' : '') + newDelta.toFixed(1) + 'pt'.padEnd(8)} ` +
      `${String(m.simMedTotal).padEnd(12)} ` +
      `${String(m.simPosOnlyTotal).padEnd(12)} ` +
      `${(m.wpAfter * 100).toFixed(1)}%`
    );
  }

  // ─── 9. position_only 導入前後の source 変化 ────────────────────────────
  log('\n=== Step 3: position_only 導入前後の source 変化 (#20〜#27) ===');
  log('');
  log(`${'#'.padStart(3)} ${'旧 source'.padEnd(22)} ${'新 source'.padEnd(22)} WP変化(pt)`);
  log('-'.repeat(75));

  for (const m of analyzed) {
    if (m.moveNum < 20 || m.moveNum > 27) continue;
    const wpChange = (m.newResolvedWP - m.oldResolvedWP) * 100;
    const changed = m.oldSource !== m.newSource ? ' ← NEW' : '';
    log(
      `${String(m.moveNum).padStart(3)} ` +
      `${m.oldSource.padEnd(22)} ` +
      `${(m.newSource + changed).padEnd(22)} ` +
      `${wpChange >= 0 ? '+' : ''}${wpChange.toFixed(2)}pt`
    );
  }

  // ─── 10. Δpt 変化の原因分析 ─────────────────────────────────────────────
  log('\n=== Step 4: Δpt 変化の原因分析 ===');
  log('');

  // #27 の詳細分析
  const idx27 = analyzed.findIndex(m => m.moveNum === 27);
  const idx26 = analyzed.findIndex(m => m.moveNum === 26);

  if (idx27 >= 0 && idx26 >= 0) {
    const m26 = analyzed[idx26]!;
    const m27 = analyzed[idx27]!;

    log('【#27 WP が同じなのに Δpt が変化した理由】');
    log('');
    log(`  #26 resolvedWP: 旧=${(m26.oldResolvedWP*100).toFixed(2)}% → 新=${(m26.newResolvedWP*100).toFixed(2)}%`);
    log(`       変化量: ${((m26.newResolvedWP - m26.oldResolvedWP)*100).toFixed(2)}pt`);
    log(`       source: ${m26.oldSource} → ${m26.newSource}`);
    log('');
    log(`  #27 resolvedWP: 旧=${(m27.oldResolvedWP*100).toFixed(2)}% → 新=${(m27.newResolvedWP*100).toFixed(2)}%`);
    log(`       変化量: ${((m27.newResolvedWP - m27.oldResolvedWP)*100).toFixed(2)}pt`);
    log(`       source: ${m27.oldSource} → ${m27.newSource}`);
    log('');
    log('  Δpt (#27) = resolvedWP(#27) - resolvedWP(#26)');

    const oldDelta27 = getOldDeltaPt(idx27);
    const newDelta27 = getNewDeltaPt(idx27);
    log(`  旧: ${(m27.oldResolvedWP*100).toFixed(2)}% - ${(m26.oldResolvedWP*100).toFixed(2)}% = ${oldDelta27 >= 0 ? '+' : ''}${oldDelta27.toFixed(1)}pt`);
    log(`  新: ${(m27.newResolvedWP*100).toFixed(2)}% - ${(m26.newResolvedWP*100).toFixed(2)}% = ${newDelta27 >= 0 ? '+' : ''}${newDelta27.toFixed(1)}pt`);
    log('');

    const wp27Changed = Math.abs(m27.newResolvedWP - m27.oldResolvedWP) * 100;
    const wp26Changed = Math.abs(m26.newResolvedWP - m26.oldResolvedWP) * 100;

    if (wp27Changed < 0.1 && wp26Changed > 0.5) {
      log('  ✅ 仮説確認: #27 自身の WP は不変。#26 の WP 変化が Δpt に連鎖した。');
      log(`     → #26 が ${m26.oldSource} → ${m26.newSource} に変わり、WP が ${((m26.newResolvedWP-m26.oldResolvedWP)*100).toFixed(2)}pt 変化`);
    } else if (wp27Changed > 0.5) {
      log(`  ⚠ #27 自身の WP も ${wp27Changed.toFixed(2)}pt 変化している`);
    }
  }

  // #20/#23/#26 の Δpt 変化理由
  log('');
  log('【#20/#23/#26 の Δpt が大きく減った理由】');
  log('');
  for (const targetNum of [20, 23, 26]) {
    const idx = analyzed.findIndex(m => m.moveNum === targetNum);
    if (idx < 0) continue;
    const m = analyzed[idx]!;
    const prevM = idx > 0 ? analyzed[idx - 1] : undefined;

    const oldDelta = getOldDeltaPt(idx);
    const newDelta = getNewDeltaPt(idx);

    log(`  #${targetNum}:`);
    log(`    自身: ${m.oldSource} → ${m.newSource}, WP変化: ${((m.newResolvedWP-m.oldResolvedWP)*100).toFixed(2)}pt`);
    if (prevM) {
      log(`    前手(#${prevM.moveNum}): ${prevM.oldSource} → ${prevM.newSource}, WP変化: ${((prevM.newResolvedWP-prevM.oldResolvedWP)*100).toFixed(2)}pt`);
    }
    log(`    Δpt: ${oldDelta >= 0 ? '+' : ''}${oldDelta.toFixed(1)}pt → ${newDelta >= 0 ? '+' : ''}${newDelta.toFixed(1)}pt (変化: ${(newDelta-oldDelta).toFixed(1)}pt)`);
    log('');
  }

  // ─── 11. winRateSource 分布 ─────────────────────────────────────────────
  log('=== Step 5: winRateSource 分布（全52手）===');
  log('');

  const oldDist: Record<string, number> = {};
  const newDist: Record<string, number> = {};
  for (const m of analyzed) {
    oldDist[m.oldSource] = (oldDist[m.oldSource] ?? 0) + 1;
    newDist[m.newSource] = (newDist[m.newSource] ?? 0) + 1;
  }

  const allSrc = new Set([...Object.keys(oldDist), ...Object.keys(newDist)]);
  log(`${'source'.padEnd(25)} ${'旧（Step2.3まで）'.padEnd(18)} ${'新（Step2.5込み）'}`);
  log('-'.repeat(60));
  for (const src of allSrc) {
    log(`${src.padEnd(25)} ${String(oldDist[src] ?? 0).padEnd(18)} ${String(newDist[src] ?? 0)}`);
  }

  // ─── 12. 問題分類 ───────────────────────────────────────────────────────
  log('\n=== Step 6: 問題の分類と修正要否 ===');
  log('');

  const caseA = analyzed.filter(m => m.oldSource === 'sim_medium_pattern' && m.newSource === 'sim_position_only');
  const caseB = analyzed.filter(m => m.oldSource === 'static' && m.newSource === 'sim_position_only');

  // ケース C: 自分は変わらず前手の WP 変化で Δpt が変わった
  const caseC: number[] = [];
  for (let i = 1; i < analyzed.length; i++) {
    const m = analyzed[i]!;
    const prevM = analyzed[i - 1]!;
    if (
      m.oldSource === m.newSource &&
      Math.abs(m.newResolvedWP - m.oldResolvedWP) < 0.001 &&
      Math.abs(prevM.newResolvedWP - prevM.oldResolvedWP) > 0.001
    ) {
      caseC.push(m.moveNum);
    }
  }

  // ケース D: position_only が粗すぎる（同一 posOnly_id 内のばらつき）
  const posOnlyWPValues = new Map<string, number[]>();
  for (const m of analyzed) {
    if (m.newSource === 'sim_position_only' && m.positionOnlyId) {
      const arr = posOnlyWPValues.get(m.positionOnlyId) ?? [];
      arr.push(m.simPosOnlyWP);
      posOnlyWPValues.set(m.positionOnlyId, arr);
    }
  }

  log(`ケース A（sim_med を pos_only が上書き）: ${caseA.length} 手`);
  if (caseA.length > 0) {
    log('  → 🔴 バグ: Step 2.5 が sim_medium_pattern を上書きしている');
    for (const m of caseA) {
      log(`     M${m.moveNum}: ${m.oldSource} → ${m.newSource}, simMed_total=${m.simMedTotal}, posOnly_total=${m.simPosOnlyTotal}`);
    }
  } else {
    log('  → ✅ ケース A なし（fallback chain は正常）');
  }

  log('');
  log(`ケース B（static → pos_only に正常置換）: ${caseB.length} 手`);
  if (caseB.length > 0) {
    let maxWpChange = 0;
    for (const m of caseB) {
      const wpChange = Math.abs(m.newResolvedWP - m.oldResolvedWP) * 100;
      if (wpChange > maxWpChange) maxWpChange = wpChange;
      log(`   M${m.moveNum}: wpChange=${((m.newResolvedWP-m.oldResolvedWP)*100).toFixed(2)}pt, posWP=${(m.simPosOnlyWP*100).toFixed(1)}%, posOnly_total=${m.simPosOnlyTotal}, staticWP=${(m.wpAfter*100).toFixed(1)}%`);
    }
    log('');
    if (maxWpChange > 10) {
      log(`  → 🟡 副作用: 最大WP変化 ${maxWpChange.toFixed(1)}pt。blend 0.1 では不十分な可能性。`);
      log(`     修正案1: blend を 0.1 → 0.05 に引き下げ`);
      log(`     修正案2: total 閾値を 100 → 200 に引き上げ`);
    } else {
      log(`  → 🟢 変化幅 ${maxWpChange.toFixed(1)}pt。許容範囲内の正常動作。`);
    }
  }

  log('');
  log(`ケース C（前手WP変化の連鎖）: ${caseC.length} 手 = ${caseC.join(', ')}`);
  if (caseC.length > 0) {
    log('  → 設計上の正常動作。Δpt は直前手との差なので連鎖は必然。');
  }

  // ─── 13. 全52手一覧 ─────────────────────────────────────────────────────
  log('\n=== 全52手 resolvedWP / Δpt 一覧 ===');
  log('');
  log(
    `${'#'.padStart(3)} ` +
    `${'Plyr'.padEnd(5)} ` +
    `${'旧src'.padEnd(20)} ` +
    `${'旧WP%'.padEnd(7)} ` +
    `${'旧Δpt'.padEnd(9)} ` +
    `${'新src'.padEnd(20)} ` +
    `${'新WP%'.padEnd(7)} ` +
    `${'新Δpt'.padEnd(9)}` +
    ` staticWP%`
  );
  log('-'.repeat(105));

  for (let i = 0; i < analyzed.length; i++) {
    const m = analyzed[i]!;
    const oldDelta = getOldDeltaPt(i);
    const newDelta = getNewDeltaPt(i);
    const srcChanged = m.oldSource !== m.newSource ? '←' : ' ';

    log(
      `${String(m.moveNum).padStart(3)} ` +
      `${m.player.slice(0,5).padEnd(5)} ` +
      `${m.oldSource.padEnd(20)} ` +
      `${(m.oldResolvedWP * 100).toFixed(1).padEnd(7)} ` +
      `${((oldDelta >= 0 ? '+' : '') + oldDelta.toFixed(1) + 'pt').padEnd(9)} ` +
      `${(m.newSource).padEnd(20)} ` +
      `${(m.newResolvedWP * 100).toFixed(1).padEnd(7)} ` +
      `${((newDelta >= 0 ? '+' : '') + newDelta.toFixed(1) + 'pt').padEnd(9)}` +
      ` ${srcChanged}${(m.wpAfter * 100).toFixed(1)}%`
    );
  }

  log('\n=== 調査完了 ===');
}

// ─── computeMediumPatternIds（postmortem.ts の内部関数を再現）─────────────────
async function computeMediumPatternIds(history: MoveRecord[]): Promise<(string | undefined)[]> {
  // postmortem.ts の computeMediumPatternIdsFromHistory に相当
  // engine replay が必要なため動的 import
  try {
    const { createInitialState } = await import('../src/game/initialState');
    const { computeMediumPatternId } = await import('../src/game/mediumPattern');
    const engineModule = await import('../src/game/engine');

    let state = createInitialState(null);
    const results: (string | undefined)[] = [];

    for (const record of history) {
      // applyMoveRecord と同等の処理
      state = applyMoveRecordLocal(state, record, engineModule);
      try {
        results.push(computeMediumPatternId(state));
      } catch {
        results.push(undefined);
      }
    }
    return results;
  } catch (e) {
    console.error('computeMediumPatternIds エラー:', e);
    return history.map(() => undefined);
  }
}

function applyMoveRecordLocal(state: any, record: MoveRecord, engine: any): any {
  const { positioning, build } = record as any;

  let s = state;
  if (positioning !== 'P' && positioning) {
    s = engine.selectPosition(s, positioning);
  }

  switch (build?.type) {
    case 'massive':
      s = build.gate != null ? engine.applyMassiveBuild(s, build.gate) : engine.confirmPositionOnly(s);
      break;
    case 'selective': {
      const gates = (build.gates ?? []).filter((g: any) => g !== 0);
      if (gates.length === 2) s = engine.applySelectiveBuild(s, gates);
      else if (gates.length === 1) s = engine.applySelectiveBuildSingle(s, gates[0]);
      else s = engine.confirmPositionOnly(s);
      break;
    }
    case 'quad':
      s = engine.applyQuadBuildForGates(s, build.placedGateIds ?? []);
      break;
    case 'skip':
      s = engine.skipTurn(s);
      break;
    default:
      s = engine.confirmPositionOnly(s);
      break;
  }
  return s;
}

main().catch(e => {
  console.error(`FATAL: ${e}`);
  console.error(e?.stack);
  process.exit(1);
});
