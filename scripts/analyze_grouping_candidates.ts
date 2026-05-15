/**
 * analyze_grouping_candidates.ts
 *
 * Postmortem 改善分析: medium_pattern の fallback chain 候補グループ比較
 *
 * 処理概要:
 *   - sim_match_logs から全局取得（100,000局）
 *   - 各ゲームをリプレイ → 全手の局面情報を展開
 *   - 候補グループID（A〜H）を各手で計算
 *   - 各候補について集計（ユニーク数・total分布・帯別coverage）
 *
 * 制約:
 *   - DBへの書き込み一切なし（分析のみ）
 *   - ローカル実行のみ
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx vite-node scripts/analyze_grouping_candidates.ts 2>&1
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env 手動ロード
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
} catch { /* ignore */ }

import { createClient } from '@supabase/supabase-js';
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── 定数 ─────────────────────────────────────────────────────────────────────

const SIM_POLICY = 'easy_vs_easy';
const SCAN_PAGE  = 500;
const POSITION_IDS: PositionId[] = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
const CORNER_GATES: GateId[] = [1, 4, 7, 10];
const GATE_IDS: GateId[] = [1,2,3,4,5,6,7,8,9,10,11,12];

// ─── 帯定義 ──────────────────────────────────────────────────────────────────

type Band = 'M1' | 'M2-3' | 'M4-8' | 'M9-22' | 'M23+';
const BANDS: Band[] = ['M1', 'M2-3', 'M4-8', 'M9-22', 'M23+'];

function getBand(moveNumber: number): Band {
  if (moveNumber === 1) return 'M1';
  if (moveNumber <= 3) return 'M2-3';
  if (moveNumber <= 8) return 'M4-8';
  if (moveNumber <= 22) return 'M9-22';
  return 'M23+';
}

// ─── 候補グループID 計算関数 ─────────────────────────────────────────────────

// C4 回転マップ（R90 1回転分）
const POSITION_R90: Record<PositionId, PositionId> = {
  A: 'C', B: 'H', C: 'M', D: 'E', E: 'J',
  F: 'B', G: 'G', H: 'L', I: 'D', J: 'I',
  K: 'A', L: 'F', M: 'K',
};

const GATE_R90: Record<GateId, GateId> = {
  1: 4, 2: 5, 3: 6,
  4: 7, 5: 8, 6: 9,
  7: 10, 8: 11, 9: 12,
  10: 1, 11: 2, 12: 3,
};

function buildPositionMap(steps: number): Record<PositionId, PositionId> {
  const map = Object.fromEntries(POSITION_IDS.map(id => [id, id])) as Record<PositionId, PositionId>;
  for (let i = 0; i < steps; i++) {
    for (const id of POSITION_IDS) {
      map[id] = POSITION_R90[map[id]];
    }
  }
  return map;
}

function buildGateMap(steps: number): Record<GateId, GateId> {
  const map = Object.fromEntries(GATE_IDS.map(id => [id, id])) as Record<GateId, GateId>;
  for (let i = 0; i < steps; i++) {
    for (const id of GATE_IDS) {
      map[id] = GATE_R90[map[id]];
    }
  }
  return map;
}

// Pre-compute C4 maps
const C4_POSITION_MAPS: Record<PositionId, PositionId>[] = [0, 1, 2, 3].map(buildPositionMap);
const C4_GATE_MAPS: Record<GateId, GateId>[] = [0, 1, 2, 3].map(buildGateMap);

// position owner文字列（rot=0基準）
function getRawPositionString(state: GameState): string {
  return POSITION_IDS.map(id => {
    const owner = state.positions[id]?.owner;
    if (owner === 'black') return 'b';
    if (owner === 'white') return 'w';
    return 'n';
  }).join('');
}

// rot適用済み position owner文字列
function getPositionStringForRot(state: GameState, rot: number): string {
  const posMap = C4_POSITION_MAPS[rot];
  return POSITION_IDS.map(newId => {
    const origId = POSITION_IDS.find(id => posMap[id] === newId) ?? newId;
    const owner = state.positions[origId]?.owner;
    if (owner === 'black') return 'b';
    if (owner === 'white') return 'w';
    return 'n';
  }).join('');
}

// Gate dominance character: '0'=neutral, '1'=black, '2'=white
function gatedomChar(state: GameState, gateId: GateId): string {
  const gate = state.gates[gateId];
  if (!gate) return '0';
  let b = 0, w = 0;
  for (const slot of gate.largeSlots)  { if (slot?.owner === 'black') b++; else if (slot?.owner === 'white') w++; }
  for (const slot of gate.middleSlots) { if (slot?.owner === 'black') b++; else if (slot?.owner === 'white') w++; }
  for (const slot of gate.smallSlots)  { if (slot?.owner === 'black') b++; else if (slot?.owner === 'white') w++; }
  if (b > w) return '1';
  if (w > b) return '2';
  return '0';
}

// Gate asset count（total pieces per player）
function gateAssets(state: GameState, gateId: GateId): { b: number; w: number } {
  const gate = state.gates[gateId];
  if (!gate) return { b: 0, w: 0 };
  let b = 0, w = 0;
  for (const slot of gate.largeSlots)  { if (slot?.owner === 'black') b++; else if (slot?.owner === 'white') w++; }
  for (const slot of gate.middleSlots) { if (slot?.owner === 'black') b++; else if (slot?.owner === 'white') w++; }
  for (const slot of gate.smallSlots)  { if (slot?.owner === 'black') b++; else if (slot?.owner === 'white') w++; }
  return { b, w };
}

// C4正規化: position所有文字列の最小回転を返す（rot0基準の文字列から）
function canonicalizePos(rawPosStr: string): string {
  let min = rawPosStr;
  for (let rot = 1; rot < 4; rot++) {
    const rotated = getRotatedPosStr(rawPosStr, rot);
    if (rotated < min) min = rotated;
  }
  return min;
}

// rawPosStr (rot=0) に rot を追加適用した文字列
// これはC4マップを使って再計算するより、文字列の並べ替えで近似
// (正確にはstate.positionsから再計算が必要)
// → stateから直接計算する方式を採用
function getRotatedPosStr(rawPosStr: string, rot: number): string {
  // POSITION_IDS = ['A','B','C','D','E','F','G','H','I','J','K','L','M']
  // rot適用: new[i] = raw[inverse(posMap[POSITION_IDS[i]])]
  const posMap = C4_POSITION_MAPS[rot];
  return POSITION_IDS.map(newId => {
    // posMap[origId] = newId → find origId s.t. posMap[origId] = newId
    const origIdx = POSITION_IDS.findIndex(id => posMap[id] === newId);
    if (origIdx < 0) return 'n';
    return rawPosStr[origIdx];
  }).join('');
}

// コーナーゲートbitsをrot適用（gate_mapの逆から）
function getCornerBitsForRot(state: GameState, rot: number): string {
  const gateMap = C4_GATE_MAPS[rot];
  // invGateMap: gateMap[origId] = newId → invGateMap[newId] = origId
  const invGateMap: Record<GateId, GateId> = {} as Record<GateId, GateId>;
  for (const gid of GATE_IDS) {
    invGateMap[gateMap[gid]] = gid;
  }
  return CORNER_GATES.map(newGateId => {
    const origGateId = invGateMap[newGateId] ?? newGateId;
    return gatedomChar(state, origGateId);
  }).join('');
}

// ─── 候補A: Position所有のみ（C4正規化済み） ────────────────────────────────

function computeGroupA(state: GameState): string {
  // C4正規化: 4回転を全計算し辞書順最小を採用
  let min = '';
  for (let rot = 0; rot < 4; rot++) {
    const s = getPositionStringForRot(state, rot);
    if (rot === 0 || s < min) min = s;
  }
  return min;
}

// ─── 候補B: Position所有 + movePhase ────────────────────────────────────────

function computeGroupB(state: GameState, moveNumber: number): string {
  const a = computeGroupA(state);
  let phase: string;
  if (moveNumber <= 8) phase = 'early';
  else if (moveNumber <= 22) phase = 'mid';
  else phase = 'late';
  return `${a}:${phase}`;
}

// ─── 候補C: Position所有 + 所有数差 ─────────────────────────────────────────

function computeGroupC(state: GameState): string {
  const a = computeGroupA(state);
  let b = 0, w = 0;
  for (const id of POSITION_IDS) {
    const owner = state.positions[id]?.owner;
    if (owner === 'black') b++;
    else if (owner === 'white') w++;
  }
  const diff = b - w;
  let bucket: string;
  if (diff <= -6) bucket = '-6m';
  else if (diff <= -3) bucket = '-3to-5';
  else if (diff <= -1) bucket = '-1to-2';
  else if (diff === 0) bucket = '0';
  else if (diff <= 2) bucket = '+1to2';
  else if (diff <= 5) bucket = '+3to5';
  else bucket = '+6p';
  return `${a}:${bucket}`;
}

// ─── 候補D: Position所有 + center control ────────────────────────────────────
// center position = G（中央ポジション）

function computeGroupD(state: GameState): string {
  const a = computeGroupA(state);
  const centerOwner = state.positions['G']?.owner;
  let center: string;
  if (centerOwner === 'black') center = 'cb';
  else if (centerOwner === 'white') center = 'cw';
  else center = 'cn';
  return `${a}:${center}`;
}

// ─── 候補E: Position所有 + corner position control ───────────────────────────
// corner positions = A, C, K, M（四隅に近いポジション）
// C4正規化後は必ず "A, C, K, M" の順になっている（posMapの逆）
// → A,C,K,M はそれぞれposMap[orig]で変換されるため、正規化後の文字位置で判定

function computeGroupE(state: GameState): string {
  const a = computeGroupA(state);
  // corner positions（元のgame state上）
  const corners: PositionId[] = ['A', 'C', 'K', 'M'];
  let bCorners = 0, wCorners = 0;
  for (const id of corners) {
    const owner = state.positions[id]?.owner;
    if (owner === 'black') bCorners++;
    else if (owner === 'white') wCorners++;
  }
  return `${a}:c${bCorners}b${wCorners}w`;
}

// ─── 候補F: Position所有 + gate dominance count ──────────────────────────────
// medium_pattern と同等だが part2 のみ単純化（独立正規化）
// Gate 1,4,7,10 で優勢なゲート数（黒/白別）

function computeGroupF(state: GameState): string {
  const a = computeGroupA(state);
  let bGates = 0, wGates = 0;
  for (const gid of CORNER_GATES) {
    const ch = gatedomChar(state, gid);
    if (ch === '1') bGates++;
    else if (ch === '2') wGates++;
  }
  return `${a}:gd${bGates}b${wGates}w`;
}

// ─── 候補G: Position所有 + gate asset value bucket ───────────────────────────
// 全ゲートのasset合計値をbucket化（low/mid/high × black/white）
// lo: <=4, mi: 5-12, hi: 13+

function computeGroupG(state: GameState): string {
  const a = computeGroupA(state);
  let totalB = 0, totalW = 0;
  for (const gid of GATE_IDS) {
    const { b, w } = gateAssets(state, gid);
    totalB += b;
    totalW += w;
  }
  const bBucket = totalB <= 4 ? 'lo' : totalB <= 12 ? 'mi' : 'hi';
  const wBucket = totalW <= 4 ? 'lo' : totalW <= 12 ? 'mi' : 'hi';
  return `${a}:gv_b:${bBucket}_w:${wBucket}`;
}

// ─── 候補H: Position所有 + moveNumber bucket（細かめ）────────────────────────
// M1 / M2-3 / M4-8 / M9-22 / M23-40 / M41+

function computeGroupH(state: GameState, moveNumber: number): string {
  const a = computeGroupA(state);
  let mb: string;
  if (moveNumber === 1) mb = 'm1';
  else if (moveNumber <= 3) mb = 'm2-3';
  else if (moveNumber <= 8) mb = 'm4-8';
  else if (moveNumber <= 22) mb = 'm9-22';
  else if (moveNumber <= 40) mb = 'm23-40';
  else mb = 'm41p';
  return `${a}:${mb}`;
}

// ─── ゲームリプレイ ──────────────────────────────────────────────────────────

function replayGame(history: MoveRecord[]): { state: GameState; moveNumber: number }[] {
  let state: GameState = createInitialState();
  const results: { state: GameState; moveNumber: number }[] = [];

  for (const record of history) {
    const { positioning, build, moveNumber } = record;

    if (positioning !== 'P') {
      state = selectPosition(state, positioning as PositionId);
    }

    let nextState: GameState;
    switch (build.type) {
      case 'massive':
        nextState = (build.gate !== null && build.gate !== undefined)
          ? applyMassiveBuild(state, build.gate as GateId)
          : confirmPositionOnly(state);
        break;
      case 'selective': {
        const gates = ((build as { gates: (GateId | 0)[] }).gates).filter((g): g is GateId => g !== 0);
        if (gates.length === 2) nextState = applySelectiveBuild(state, gates as [GateId, GateId]);
        else if (gates.length === 1) nextState = applySelectiveBuildSingle(state, gates[0]!);
        else nextState = confirmPositionOnly(state);
        break;
      }
      case 'quad':
        nextState = applyQuadBuildForGates(state, (build as { placedGateIds: GateId[] }).placedGateIds);
        break;
      case 'skip':
        nextState = skipTurn(state);
        break;
      case 'no-build':
      default:
        nextState = confirmPositionOnly(state);
        break;
    }

    results.push({ state: nextState, moveNumber });
    state = nextState;
  }

  return results;
}

// ─── 集計構造 ────────────────────────────────────────────────────────────────

type CandidateKey = 'medium' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
const CANDIDATES: CandidateKey[] = ['medium', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

type BandStat = { ge30: number; ge100: number; total: number };
type GroupStat = {
  totalCount: number;        // ユニークグループ数
  maxTotal: number;          // MAX total
  ge30: number; ge50: number; ge100: number; ge200: number;
  bands: Record<Band, BandStat>;
};

function initGroupStat(): GroupStat {
  const bands = Object.fromEntries(BANDS.map(b => [b, { ge30: 0, ge100: 0, total: 0 }])) as Record<Band, BandStat>;
  return { totalCount: 0, maxTotal: 0, ge30: 0, ge50: 0, ge100: 0, ge200: 0, bands };
}

// groupId → { total, wins_black, wins_white, draws, firstBand }
type GroupEntry = { total: number; wins_black: number; wins_white: number; draws: number; firstBand: Band };

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== analyze_grouping_candidates.ts 開始 ===');
  console.log(`対象: sim_match_logs (sim_policy=${SIM_POLICY}) 全局`);
  console.log('');

  // 各候補のMapを初期化
  const maps: Record<CandidateKey, Map<string, GroupEntry>> = {} as Record<CandidateKey, Map<string, GroupEntry>>;
  for (const c of CANDIDATES) maps[c] = new Map();

  let scanOffset = 0;
  let totalGames = 0;
  let skipGames = 0;
  let totalMoves = 0;
  let replayErrors = 0;

  while (true) {
    const { data, error } = await supabase
      .from('sim_match_logs')
      .select('winner, full_record')
      .eq('sim_policy', SIM_POLICY)
      .order('sim_batch_id', { ascending: true })
      .order('game_index',   { ascending: true })
      .range(scanOffset, scanOffset + SCAN_PAGE - 1);

    if (error) {
      console.error(`scan error at offset ${scanOffset}: ${error.message}`);
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    if (!data || data.length === 0) break;

    for (const row of data as { winner: string | null; full_record: unknown }[]) {
      const winner = row.winner;
      if (!winner || (winner !== 'black' && winner !== 'white' && winner !== 'draw')) {
        skipGames++; continue;
      }

      // full_record → MoveRecord[] に変換
      const fr = row.full_record;
      let history: MoveRecord[] = [];
      if (Array.isArray(fr)) {
        history = fr as MoveRecord[];
      } else if (fr && typeof fr === 'object') {
        // 数値キーのオブジェクトの場合
        const keys = Object.keys(fr as object).sort((a, b) => Number(a) - Number(b));
        history = keys.map(k => (fr as Record<string, MoveRecord>)[k]);
      }

      if (history.length === 0) { skipGames++; continue; }

      // ゲームリプレイ
      let postMoveStates: { state: GameState; moveNumber: number }[];
      try {
        postMoveStates = replayGame(history);
      } catch (e) {
        replayErrors++;
        continue;
      }

      if (postMoveStates.length === 0) { skipGames++; continue; }

      // 同一ゲーム内の各候補重複除去用Set
      const seenPerCandidate: Record<CandidateKey, Set<string>> = {} as Record<CandidateKey, Set<string>>;
      for (const c of CANDIDATES) seenPerCandidate[c] = new Set();

      for (const { state, moveNumber } of postMoveStates) {
        const band = getBand(moveNumber);

        // 各候補のグループID計算
        const ids: Record<CandidateKey, string> = {
          medium: computeMediumPatternId(state),
          A: computeGroupA(state),
          B: computeGroupB(state, moveNumber),
          C: computeGroupC(state),
          D: computeGroupD(state),
          E: computeGroupE(state),
          F: computeGroupF(state),
          G: computeGroupG(state),
          H: computeGroupH(state, moveNumber),
        };

        for (const c of CANDIDATES) {
          const gid = ids[c];
          if (seenPerCandidate[c].has(gid)) continue;
          seenPerCandidate[c].add(gid);

          const cur = maps[c].get(gid);
          if (cur) {
            cur.total += 1;
            cur.wins_black += winner === 'black' ? 1 : 0;
            cur.wins_white += winner === 'white' ? 1 : 0;
            cur.draws      += winner === 'draw'  ? 1 : 0;
          } else {
            maps[c].set(gid, {
              total: 1,
              wins_black: winner === 'black' ? 1 : 0,
              wins_white: winner === 'white' ? 1 : 0,
              draws:      winner === 'draw'  ? 1 : 0,
              firstBand: band,
            });
          }
        }

        totalMoves++;
      }

      totalGames++;
    }

    scanOffset += SCAN_PAGE;
    if (scanOffset % 5000 === 0) {
      const elapsed = Math.round(process.uptime());
      console.log(`[${elapsed}s] スキャン進捗: ${scanOffset}局 | games=${totalGames} | medium_patterns=${maps['medium'].size}`);
    }
    if (data.length < SCAN_PAGE) break;
  }

  console.log(`\nスキャン完了: ${totalGames} ゲーム | skip=${skipGames} | replayErrors=${replayErrors} | 総手数=${totalMoves}`);

  // ─── 集計 ──────────────────────────────────────────────────────────────────

  // 各 move の band 分布を取得するため、Map を帯別に集計
  // → Map<groupId, GroupEntry> を走査して GroupStat を構築
  // ただし GroupEntry.firstBand だけでは不十分（同一ゲーム内のbandは重複除去で最初のbandを使用）
  // より正確な帯別集計のためには move × band を保持する必要があるが
  // メモリ効率上、GroupEntry.firstBand を帯別 total として代理利用する近似を用いる
  //
  // より正確な集計: 別途 band別 map を持つ
  // 追加メモリコストを許容し、band別集計用のデータ構造を設ける

  // 正確な帯別集計のため再スキャンを省く代わりに
  // 集計時に band を別途記録する方式を採用
  // → 上記のループ内で band 別 Map も集計

  console.log('\n集計処理中...');

  // 帯別集計用の別Map: candidate → band → groupId → { total }
  // （上記のメインループで既に取れていないため、以下は totalMap の firstBand で近似）
  // 注意: firstBand は「最初に観測した手の帯」であり、全手の帯分布ではない

  // 出力: 各候補の GroupStat
  function buildGroupStat(map: Map<string, GroupEntry>): GroupStat {
    const stat = initGroupStat();
    stat.totalCount = map.size;
    for (const [, entry] of map) {
      if (entry.total > stat.maxTotal) stat.maxTotal = entry.total;
      if (entry.total >= 30)  stat.ge30++;
      if (entry.total >= 50)  stat.ge50++;
      if (entry.total >= 100) stat.ge100++;
      if (entry.total >= 200) stat.ge200++;
    }
    return stat;
  }

  const stats: Record<CandidateKey, GroupStat> = {} as Record<CandidateKey, GroupStat>;
  for (const c of CANDIDATES) stats[c] = buildGroupStat(maps[c]);

  // ─── 帯別集計（band ごとの group count） ────────────────────────────────────
  // より正確な帯別計算のため、2回目スキャンは省略し
  // firstBand ベースの近似帯別集計を実施
  // （100k局のリプレイは重いため）

  for (const c of CANDIDATES) {
    for (const [, entry] of maps[c]) {
      const band = entry.firstBand;
      stats[c].bands[band].total++;
      if (entry.total >= 30)  stats[c].bands[band].ge30++;
      if (entry.total >= 100) stats[c].bands[band].ge100++;
    }
  }

  // ─── 結果出力 ─────────────────────────────────────────────────────────────

  console.log('\n\n=== Coverage 比較表 ===');
  console.log('（firstBand ベースの帯別集計 ≈ 近似値）\n');

  const header = '候補     | ユニーク数 | MAX total | >=30    | >=50    | >=100   | >=200   | M4-8 >=30 | M4-8 >=100 | M9-22 >=30 | M9-22 >=100';
  const sep    = '---------+------------+-----------+---------+---------+---------+---------+-----------+------------+------------+-------------';
  console.log(header);
  console.log(sep);

  for (const c of CANDIDATES) {
    const s = stats[c];
    const name = c.padEnd(8);
    const unique = String(s.totalCount).padStart(10);
    const maxT   = String(s.maxTotal).padStart(9);
    const g30    = String(s.ge30).padStart(7);
    const g50    = String(s.ge50).padStart(7);
    const g100   = String(s.ge100).padStart(7);
    const g200   = String(s.ge200).padStart(7);
    const m48_30 = String(s.bands['M4-8'].ge30).padStart(9);
    const m48_100 = String(s.bands['M4-8'].ge100).padStart(10);
    const m922_30 = String(s.bands['M9-22'].ge30).padStart(10);
    const m922_100 = String(s.bands['M9-22'].ge100).padStart(11);
    console.log(`${name} | ${unique} | ${maxT} | ${g30} | ${g50} | ${g100} | ${g200} | ${m48_30} | ${m48_100} | ${m922_30} | ${m922_100}`);
  }

  // ─── 詳細帯別表 ─────────────────────────────────────────────────────────────

  console.log('\n\n=== 帯別 ユニークグループ数（firstBand基準） ===\n');
  const bandHeader = '候補     |       M1 |     M2-3 |     M4-8 |    M9-22 |     M23+';
  console.log(bandHeader);
  console.log('---------+----------+----------+----------+----------+----------');
  for (const c of CANDIDATES) {
    const s = stats[c];
    const name = c.padEnd(8);
    const vals = BANDS.map(b => String(s.bands[b].total).padStart(8)).join(' | ');
    console.log(`${name} | ${vals}`);
  }

  console.log('\n\n=== 帯別 >=30 coverage（firstBand基準） ===\n');
  const bandHeader2 = '候補     |     M1 ge30 | M2-3 ge30 | M4-8 ge30 | M9-22 ge30 | M23+ ge30';
  console.log(bandHeader2);
  console.log('---------+-------------+-----------+-----------+------------+-----------');
  for (const c of CANDIDATES) {
    const s = stats[c];
    const name = c.padEnd(8);
    const vals = BANDS.map(b => String(s.bands[b].ge30).padStart(9)).join(' | ');
    console.log(`${name} | ${vals}`);
  }

  console.log('\n\n=== 帯別 >=100 coverage（firstBand基準） ===\n');
  const bandHeader3 = '候補     |    M1 ge100 | M2-3 ge100 | M4-8 ge100 | M9-22 ge100 | M23+ ge100';
  console.log(bandHeader3);
  console.log('---------+-------------+------------+------------+-------------+------------');
  for (const c of CANDIDATES) {
    const s = stats[c];
    const name = c.padEnd(8);
    const vals = BANDS.map(b => String(s.bands[b].ge100).padStart(9)).join(' | ');
    console.log(`${name} | ${vals}`);
  }

  // ─── 追加: medium vs 候補 比較（M4-8, M9-22 改善度） ────────────────────────

  console.log('\n\n=== medium_pattern 比較（M4-8 / M9-22 改善度） ===\n');
  const medStat = stats['medium'];
  for (const c of CANDIDATES) {
    if (c === 'medium') continue;
    const s = stats[c];
    const m48_30_diff = s.bands['M4-8'].ge30 - medStat.bands['M4-8'].ge30;
    const m922_30_diff = s.bands['M9-22'].ge30 - medStat.bands['M9-22'].ge30;
    const m48_100_diff = s.bands['M4-8'].ge100 - medStat.bands['M4-8'].ge100;
    const m922_100_diff = s.bands['M9-22'].ge100 - medStat.bands['M9-22'].ge100;
    const uniqDiff = s.totalCount - medStat.totalCount;
    const sign = (n: number) => n >= 0 ? `+${n}` : `${n}`;
    console.log(`候補${c}: ユニーク${sign(uniqDiff)} | M4-8 >=30: ${sign(m48_30_diff)} | M4-8 >=100: ${sign(m48_100_diff)} | M9-22 >=30: ${sign(m922_30_diff)} | M9-22 >=100: ${sign(m922_100_diff)}`);
  }

  // ─── サンプル出力: 各候補のtop group ────────────────────────────────────────

  console.log('\n\n=== 各候補 TOP-5 グループ（total降順） ===\n');
  for (const c of CANDIDATES) {
    const sorted = [...maps[c].entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    console.log(`--- 候補${c} ---`);
    for (const [gid, entry] of sorted) {
      const wr = entry.total > 0 ? (entry.wins_black / entry.total * 100).toFixed(1) : 'N/A';
      console.log(`  ${gid.slice(0, 40).padEnd(40)} | total=${entry.total} | wr_black=${wr}% | firstBand=${entry.firstBand}`);
    }
  }

  console.log('\n\n処理完了');
  console.log(`総ゲーム数: ${totalGames} | 総手数: ${totalMoves} | replayErrors: ${replayErrors}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
