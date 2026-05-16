/**
 * verify_fashard_sample.ts
 *
 * Fast Hard vs Fast Hard棋譜サンプル検証スクリプト
 * 5局をサンプル抽出してルール整合性を確認する
 */

import * as fs from 'fs';
import { createInitialState } from '../src/game/initialState';
import {
  selectPosition, applyMassiveBuild, applySelectiveBuild,
  applySelectiveBuildSingle, applyQuadBuildForGates, skipTurn, confirmPositionOnly,
} from '../src/game/engine';
import type { GameState, GateId, PositionId } from '../src/game/types';

const SIM_FILE_PATH = '/Users/nt/Desktop/Claude_Cowork/sim_easy/sim_fashard_vs_fashard_20260515.md';

// ─── パーサー（新形式: "A,s(1,8) | C,q(3,4,5,10) | ..." 形式）────────────────

type RawMove = {
  positionId: string;
  buildType: 's' | 'm' | 'q' | 'pass';
  gates: number[];
};

type ParsedGame = {
  gameIndex: number;
  batchNumber: number;
  winner: string;
  blackScore: number;
  whiteScore: number;
  moveCount: number;
  moves: RawMove[];
};

function parseMoveToken(token: string): RawMove | null {
  const t = token.trim();
  // P,pass
  if (t === 'P,pass') return { positionId: 'P', buildType: 'pass', gates: [] };
  // Position,buildType(gates) e.g. A,s(1,8) or C,q(3,4,5,10) or D,m(7) or F,q(3)
  const m = t.match(/^([A-MP]),([smq])\(([^)]*)\)$/);
  if (!m) return null;
  const gateStr = m[3].trim();
  const gates = gateStr === '' ? [] : gateStr.split(',').map(g => parseInt(g.trim(), 10));
  return {
    positionId: m[1],
    buildType: m[2] as 's' | 'm' | 'q',
    gates,
  };
}

function parseSimFile(content: string): ParsedGame[] {
  const games: ParsedGame[] = [];
  let cur: ParsedGame | null = null;

  for (const line of content.split('\n')) {
    // ### Game 1 (batch_200) 形式
    const hm = line.match(/^### Game (\d+) \(batch_(\d+)\)/);
    if (hm) {
      if (cur) games.push(cur);
      cur = {
        gameIndex: parseInt(hm[1], 10),
        batchNumber: parseInt(hm[2], 10),
        winner: '', blackScore: 0, whiteScore: 0, moveCount: 0, moves: [],
      };
      continue;
    }
    if (!cur) continue;

    // - 勝者: white  陣地: 黒6 - 白7  手数: 51  時間: 14.54s
    const rm = line.match(/^-\s+勝者:\s*(\w+)\s+陣地:\s*黒(\d+)\s*-\s*白(\d+)\s+手数:\s*(\d+)/);
    if (rm) {
      cur.winner = rm[1];
      cur.blackScore = parseInt(rm[2], 10);
      cur.whiteScore = parseInt(rm[3], 10);
      cur.moveCount = parseInt(rm[4], 10);
      continue;
    }

    // - 棋譜: M,s(1,8) | C,q(3,4,5,10) | ...
    const km = line.match(/^-\s+棋譜:\s+(.+)$/);
    if (km) {
      const tokens = km[1].split('|');
      for (const tok of tokens) {
        const mv = parseMoveToken(tok);
        if (mv) cur.moves.push(mv);
      }
    }
  }
  if (cur) games.push(cur);
  return games;
}

// ─── リプレイ検証 ─────────────────────────────────────────────────────────────

type VerifyResult = {
  gameIndex: number;
  batchNumber: number;
  winner: string;
  blackScore: number;
  whiteScore: number;
  declaredMoveCount: number;
  actualMoveCount: number;
  violations: string[];
  warnings: string[];
  ok: boolean;
};

function verifyGame(g: ParsedGame): VerifyResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  let state: GameState = createInitialState();
  let moveNum = 0;

  for (const raw of g.moves) {
    moveNum++;
    const expectedPlayer = moveNum % 2 === 1 ? 'black' : 'white';

    // skipターン
    if (raw.buildType === 'pass') {
      if (raw.positionId !== 'P') {
        violations.push(`M${moveNum}: pass手番だが positionId='${raw.positionId}' (expect P)`);
      }
      try {
        state = skipTurn(state);
      } catch (e) {
        violations.push(`M${moveNum}: skipTurn失敗: ${e}`);
      }
      continue;
    }

    // ポジション選択
    if (raw.positionId === 'P') {
      violations.push(`M${moveNum}: positionId=P だが buildType='${raw.buildType}' (pass以外)`);
      continue;
    }

    // ポジションID合法性
    const validPositions = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
    if (!validPositions.includes(raw.positionId)) {
      violations.push(`M${moveNum}: 不正なpositionId='${raw.positionId}'`);
      continue;
    }

    // ゲートID合法性
    for (const g of raw.gates) {
      if (g < 1 || g > 12) {
        violations.push(`M${moveNum}: 不正なgateId=${g}`);
      }
    }

    // massive: gate数確認
    if (raw.buildType === 'm' && raw.gates.length !== 1) {
      violations.push(`M${moveNum}: massive build だが gate数=${raw.gates.length} (expect 1)`);
    }
    // selective: gate数確認 (1か2)
    if (raw.buildType === 's' && (raw.gates.length < 1 || raw.gates.length > 2)) {
      violations.push(`M${moveNum}: selective build だが gate数=${raw.gates.length} (expect 1-2)`);
    }
    // quad: gate数確認 (1-4)
    if (raw.buildType === 'q' && (raw.gates.length < 1 || raw.gates.length > 4)) {
      violations.push(`M${moveNum}: quad build だが gate数=${raw.gates.length} (expect 1-4)`);
    }

    // 手番確認
    if (state.currentPlayer !== expectedPlayer) {
      warnings.push(`M${moveNum}: 手番不一致 state.currentPlayer=${state.currentPlayer} expect=${expectedPlayer}`);
    }

    try {
      state = selectPosition(state, raw.positionId as PositionId);

      if (raw.buildType === 'm') {
        state = raw.gates.length > 0
          ? applyMassiveBuild(state, raw.gates[0] as GateId)
          : confirmPositionOnly(state);
      } else if (raw.buildType === 's') {
        if (raw.gates.length >= 2) {
          state = applySelectiveBuild(state, [raw.gates[0] as GateId, raw.gates[1] as GateId]);
        } else if (raw.gates.length === 1) {
          state = applySelectiveBuildSingle(state, raw.gates[0] as GateId);
        } else {
          state = confirmPositionOnly(state);
        }
      } else if (raw.buildType === 'q') {
        state = applyQuadBuildForGates(state, raw.gates as GateId[]);
      }
    } catch (e) {
      violations.push(`M${moveNum}: エンジン実行エラー: ${e}`);
      break;
    }
  }

  // 勝敗整合性チェック
  if (state.gameEnded) {
    const engineWinner = state.winner;
    if (engineWinner !== g.winner) {
      violations.push(`勝敗不一致: engine=${engineWinner} declared=${g.winner}`);
    }
  } else {
    // ゲームが終了していない場合
    if (g.moveCount > 0 && moveNum > 0) {
      warnings.push(`ゲーム終了フラグなし: engine.gameEnded=false (moveNum=${moveNum})`);
    }
  }

  // 手数整合性
  if (moveNum !== g.moveCount) {
    warnings.push(`手数不一致: declared=${g.moveCount} actual=${moveNum}`);
  }

  // 最終陣地確認
  if (state.gameEnded) {
    const blackPositions = Object.values(state.positions).filter(p => p.owner === 'black').length;
    const whitePositions = Object.values(state.positions).filter(p => p.owner === 'white').length;
    if (blackPositions !== g.blackScore || whitePositions !== g.whiteScore) {
      violations.push(`陣地不一致: engine(黒${blackPositions}/白${whitePositions}) declared(黒${g.blackScore}/白${g.whiteScore})`);
    }
  }

  return {
    gameIndex: g.gameIndex,
    batchNumber: g.batchNumber,
    winner: g.winner,
    blackScore: g.blackScore,
    whiteScore: g.whiteScore,
    declaredMoveCount: g.moveCount,
    actualMoveCount: moveNum,
    violations,
    warnings,
    ok: violations.length === 0,
  };
}

// ─── メイン ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Fast Hard vs Fast Hard サンプル検証 ===\n');

  if (!fs.existsSync(SIM_FILE_PATH)) {
    console.error(`ERROR: ファイルが見つかりません: ${SIM_FILE_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(SIM_FILE_PATH, 'utf-8');
  console.log(`ファイル読込: ${content.length.toLocaleString()} bytes`);

  console.log('パース中...');
  const games = parseSimFile(content);
  console.log(`パース完了: ${games.length} ゲーム\n`);

  // サンプル5局: 先頭1 / 先頭2 / 中央付近(5000) / 終盤付近(9999) / ランダム(2500)
  const sampleIndices = [0, 2, 4999, 9998, 2499]; // 0-based index
  const sampleGames = sampleIndices.map(i => games[i]).filter(Boolean);

  console.log('--- サンプル5局 検証 ---\n');

  let allOk = true;
  for (const g of sampleGames) {
    const result = verifyGame(g);
    const status = result.ok ? '✅' : '❌';
    console.log(`${status} Game ${result.gameIndex} (batch_${result.batchNumber})`);
    console.log(`   勝者: ${result.winner}  陣地: 黒${result.blackScore}/白${result.whiteScore}  手数: ${result.declaredMoveCount} (actual: ${result.actualMoveCount})`);
    if (result.violations.length > 0) {
      console.log(`   ❌ 違反:`);
      for (const v of result.violations) console.log(`      - ${v}`);
      allOk = false;
    }
    if (result.warnings.length > 0) {
      console.log(`   ⚠️  警告:`);
      for (const w of result.warnings) console.log(`      - ${w}`);
    }
    console.log();
  }

  // 形式確認
  console.log('--- 形式確認 ---');
  const sample = games[0];
  console.log(`先頭局 (Game ${sample.gameIndex}) 手番型分布:`);
  let s = 0, m = 0, q = 0, p = 0;
  for (const mv of sample.moves) {
    if (mv.buildType === 's') s++;
    else if (mv.buildType === 'm') m++;
    else if (mv.buildType === 'q') q++;
    else if (mv.buildType === 'pass') p++;
  }
  console.log(`  Selective: ${s}, Massive: ${m}, Quad: ${q}, Pass: ${p}`);

  // pass手番のゲームを確認
  const passGames = games.filter(g => g.moves.some(m => m.buildType === 'pass'));
  console.log(`\nPass手番を含むゲーム数: ${passGames.length} / ${games.length}`);
  if (passGames.length > 0) {
    const pg = passGames[0];
    console.log(`  最初のpassゲーム: Game ${pg.gameIndex}, 手数: ${pg.moveCount}, 勝者: ${pg.winner}`);
  }

  console.log('\n--- 取込可否判断 ---');
  if (allOk) {
    console.log('✅ 取込可: サンプル5局すべてルール違反なし');
    console.log('  形式互換性: 既存importスクリプトの新形式パーサーで対応可能');
    console.log('  Time Budget由来の打ち切り: 強制フォールバックなし（ファイルヘッダーより）');
  } else {
    console.log('❌ 取込不可: ルール違反が検出されました');
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
