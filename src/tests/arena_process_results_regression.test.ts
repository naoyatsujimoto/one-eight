/**
 * arena_process_results_regression.test.ts
 * ONE EIGHT — process_arena_results() 修正 回帰テスト
 *
 * 修正内容:
 *   修正1: Pass 1 forfeit 時に online_games も finished へ更新する
 *   修正2: RECORD IS NOT NULL → FOUND フラグによる安全判定
 *   修正3: defend 戦での Master本人勝利 = defended（end_reason 問わず）
 *
 * テスト方針: 実DB接続不要。migration SQLソースの静的解析のみ。
 *
 * テスト項目:
 *  1.  Pass 1 SELECT に online_game_id が含まれる
 *  2.  Pass 1 forfeit_white で online_games を status='finished', winner='black' に更新する
 *  3.  Pass 1 forfeit_black で online_games を status='finished', winner='white' に更新する
 *  4.  online_games UPDATE に WHERE status='playing' 条件が含まれる（既終了を上書きしない）
 *  5.  online_games UPDATE に timeout_player=NULL が含まれる
 *  6.  online_games UPDATE に server_updated_at=NOW() が含まれる
 *  7.  両者入室済み（CONTINUE）では online_games を更新しない
 *  8.  両者未入室（no_contest）では online_games を更新しない
 *  9.  v_found_master boolean 変数が宣言されている
 * 10.  v_found_interim boolean 変数が宣言されている
 * 11.  v_active_master SELECT 後に v_found_master := FOUND; がある
 * 12.  v_active_interim SELECT 後に v_found_interim := FOUND; がある
 * 13.  defend ブランチで v_found_master を使って defended/transferred を判定している
 *      （v_active_master IS NOT NULL ではなく v_found_master を使用）
 * 14.  master_succession ブランチで v_found_interim を使っている
 * 15.  interim_set ブランチで v_found_interim を使っている
 * 16.  defended 時に arena_master_history を INSERT しない
 *      （transferred ブランチにのみ INSERT がある）
 * 17.  SECURITY DEFINER / SET search_path = public
 * 18.  service_role / postgres のみに EXECUTE を付与（anon/authenticated には付与しない）
 * 19.  admin_generate_arena_prize_awards が no_show を除外する
 *      （end_reason NOT IN に 'no_show' が含まれる）
 * 20.  admin_generate_arena_prize_awards が no_contest / cancelled を除外する
 * 21.  過去データ補正migration: arena_matches の defended 補正が3件
 * 22.  過去データ補正migration: arena_match_history の defended 補正が3件
 * 23.  過去データ補正migration: online_game 'forfeit_white' 補正がある
 * 24.  過去データ補正migration: 6/28 legit event id が使われている
 * 25.  過去データ補正migration: online_game 補正に WHERE status='playing' が含まれる
 * 26.  過去データ補正migration: 事前条件 RAISE EXCEPTION が存在する
 * 27.  過去データ補正migration: TRANSACTION (BEGIN/COMMIT) が存在する
 * 28.  過去データ補正migration: prize_awards を変更しない
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS = path.resolve(__dirname, '../../supabase/migrations');

// 修正1+2+3: process_arena_results fix migration
const PROCESS_FIX_SQL = fs.readFileSync(
  path.join(MIGRATIONS, '20260809000001_fix_process_arena_results_online_game_and_defend.sql'),
  'utf-8'
);

// 修正3: admin_generate_arena_prize_awards（最新版）
const PRIZE_SQL = fs.readFileSync(
  path.join(MIGRATIONS, '20260806230001_master_reward_rpc_use_arena_setting.sql'),
  'utf-8'
);

// 過去データ補正migration
const DATA_FIX_SQL = fs.readFileSync(
  path.join(MIGRATIONS, '20260809000002_fix_jaguar_master_history.sql'),
  'utf-8'
);

// Pass 1 セクション（LOOP 開始から v_expired_count インクリメントまで）
const PASS1_START = PROCESS_FIX_SQL.indexOf('FOR r_exp IN');
const PASS1_END   = PROCESS_FIX_SQL.indexOf('-- ================================================================\n  -- Pass 2');
const PASS1_SQL   = PROCESS_FIX_SQL.slice(PASS1_START, PASS1_END);

// defend ブランチセクション
const DEFEND_START = PROCESS_FIX_SQL.indexOf("-- 8.4 defend");
const DEFEND_END   = PROCESS_FIX_SQL.indexOf("-- 8.5 master_succession");
const DEFEND_SQL   = PROCESS_FIX_SQL.slice(DEFEND_START, DEFEND_END);

// master_succession ブランチ
const SUCC_START = PROCESS_FIX_SQL.indexOf("-- 8.5 master_succession");
const SUCC_END   = PROCESS_FIX_SQL.indexOf("-- 8.6 interim_set");
const SUCC_SQL   = PROCESS_FIX_SQL.slice(SUCC_START, SUCC_END);

// interim_set ブランチ
const INTERIM_START = PROCESS_FIX_SQL.indexOf("-- 8.6 interim_set");
const INTERIM_END   = PROCESS_FIX_SQL.indexOf("END IF;  -- master_subtype 分岐");
const INTERIM_SQL   = PROCESS_FIX_SQL.slice(INTERIM_START, INTERIM_END);

// --------------------------------------------------------------------------
// 1-8: Pass 1 online_games 更新
// --------------------------------------------------------------------------
describe('Pass 1 — online_game_id 取得', () => {
  it('1. Pass 1 SELECT に am.online_game_id が含まれる', () => {
    expect(PASS1_SQL).toContain('am.online_game_id');
  });
});

describe('Pass 1 — forfeit_white での online_games 更新', () => {
  it("2. forfeit_white 時に online_games を winner='black' で更新する", () => {
    const block = extractBlock(PASS1_SQL, "forfeit_white'", "ELSIF v_new_om_end_reason = 'forfeit_black'");
    expect(block).toContain("winner           = 'black'");
    expect(block).toContain("status           = 'finished'");
    expect(block).toContain("end_reason       = 'forfeit_white'");
  });
});

describe('Pass 1 — forfeit_black での online_games 更新', () => {
  it("3. forfeit_black 時に online_games を winner='white' で更新する", () => {
    const block = extractBlock(PASS1_SQL, "ELSIF v_new_om_end_reason = 'forfeit_black'", "-- no_contest");
    expect(block).toContain("winner           = 'white'");
    expect(block).toContain("status           = 'finished'");
    expect(block).toContain("end_reason       = 'forfeit_black'");
  });
});

describe('Pass 1 — 安全条件', () => {
  it("4. online_games UPDATE に WHERE status='playing' がある", () => {
    expect(PASS1_SQL).toContain("AND status = 'playing'");
  });

  it('5. online_games UPDATE に timeout_player=NULL がある', () => {
    expect(PASS1_SQL).toContain('timeout_player   = NULL');
  });

  it('6. online_games UPDATE に server_updated_at=NOW() がある', () => {
    expect(PASS1_SQL).toContain('server_updated_at = NOW()');
  });

  it('7. CONTINUE（両者入室済み）の後に online_games UPDATE がない', () => {
    const continueIdx = PASS1_SQL.indexOf('-- 両者入室済み → Pass 1 では処理しない\n      CONTINUE;');
    const onlineUpdateIdx = PASS1_SQL.lastIndexOf('UPDATE online_games');
    // CONTINUE は online_games UPDATE より前にある
    expect(continueIdx).toBeLessThan(onlineUpdateIdx);
  });

  it('8. no_contest（両者未入室）ブランチには online_games を直接 UPDATE しない', () => {
    // no_contest ブランチ内（v_new_om_end_reason := 'no_contest' から forfeit_black まで）
    const noContestBlock = extractBlock(
      PASS1_SQL,
      "-- 両者未入室 → no_contest",
      "-- black未入室 / white入室済み → forfeit_black"
    );
    expect(noContestBlock).not.toContain('UPDATE online_games');
  });
});

// --------------------------------------------------------------------------
// 9-16: FOUND フラグ / defend 判定
// --------------------------------------------------------------------------
describe('FOUND フラグによる安全判定', () => {
  it('9. v_found_master BOOLEAN が宣言されている', () => {
    expect(PROCESS_FIX_SQL).toContain('v_found_master');
    // BOOLEAN 型宣言
    const declBlock = PROCESS_FIX_SQL.slice(0, PROCESS_FIX_SQL.indexOf('BEGIN\n\n  --'));
    expect(declBlock.toLowerCase()).toContain('v_found_master');
  });

  it('10. v_found_interim BOOLEAN が宣言されている', () => {
    expect(PROCESS_FIX_SQL).toContain('v_found_interim');
    const declBlock = PROCESS_FIX_SQL.slice(0, PROCESS_FIX_SQL.indexOf('BEGIN\n\n  --'));
    expect(declBlock.toLowerCase()).toContain('v_found_interim');
  });

  it('11. v_active_master SELECT 後に v_found_master := FOUND がある', () => {
    const masterSelectIdx = PROCESS_FIX_SQL.indexOf('SELECT * INTO v_active_master');
    const foundMasterIdx  = PROCESS_FIX_SQL.indexOf('v_found_master := FOUND', masterSelectIdx);
    expect(foundMasterIdx).toBeGreaterThan(masterSelectIdx);
    // 間に他のSELECTが挟まっていないこと（近くにある）
    expect(foundMasterIdx - masterSelectIdx).toBeLessThan(500);
  });

  it('12. v_active_interim SELECT 後に v_found_interim := FOUND がある', () => {
    const interimSelectIdx = PROCESS_FIX_SQL.indexOf('SELECT * INTO v_active_interim');
    const foundInterimIdx  = PROCESS_FIX_SQL.indexOf('v_found_interim := FOUND', interimSelectIdx);
    expect(foundInterimIdx).toBeGreaterThan(interimSelectIdx);
    expect(foundInterimIdx - interimSelectIdx).toBeLessThan(500);
  });

  it('13. defend ブランチで v_found_master を使っている（IS NOT NULL ではなく）', () => {
    expect(DEFEND_SQL).toContain('v_found_master');
    // v_active_master IS NOT NULL がない
    expect(DEFEND_SQL).not.toContain('v_active_master IS NOT NULL');
  });

  it('14. master_succession ブランチで v_found_interim を使っている', () => {
    expect(SUCC_SQL).toContain('v_found_interim');
    expect(SUCC_SQL).not.toContain('v_active_interim IS NOT NULL');
  });

  it('15. interim_set ブランチで v_found_interim を使っている', () => {
    expect(INTERIM_SQL).toContain('v_found_interim');
    expect(INTERIM_SQL).not.toContain('v_active_interim IS NOT NULL');
  });
});

describe('defend — Master本人勝利は defended（INSERT なし）', () => {
  it('16. defended ブランチに arena_master_history の INSERT がない', () => {
    // v_found_master が true かつ winner = active_master.user_id → defended
    // その直後のブロックにINSERTがないことを確認
    const defendedBranchStart = DEFEND_SQL.indexOf('v_master_effect := \'defended\'');
    const elseTransferredIdx  = DEFEND_SQL.indexOf('ELSE\n              -- 挑戦者が勝利');
    // defended ブランチ（defendedBranchStart から else まで）
    const defendedBlock = DEFEND_SQL.slice(
      defendedBranchStart,
      elseTransferredIdx > 0 ? elseTransferredIdx : defendedBranchStart + 200
    );
    expect(defendedBlock).not.toContain('INSERT INTO arena_master_history');
  });

  it('transferred ブランチには arena_master_history の INSERT がある', () => {
    const transferredBranchStart = DEFEND_SQL.indexOf("-- 挑戦者が勝利 → Master 交代");
    const transferredBlock = DEFEND_SQL.slice(transferredBranchStart);
    expect(transferredBlock).toContain('INSERT INTO arena_master_history');
  });
});

// --------------------------------------------------------------------------
// 17-18: セキュリティ
// --------------------------------------------------------------------------
describe('SECURITY DEFINER / search_path / GRANT', () => {
  it('17. SECURITY DEFINER が含まれる', () => {
    expect(PROCESS_FIX_SQL).toContain('SECURITY DEFINER');
  });

  it('17. SET search_path = public が含まれる', () => {
    expect(PROCESS_FIX_SQL).toContain('SET search_path = public');
  });

  it('18. service_role / postgres に EXECUTE を付与している', () => {
    expect(PROCESS_FIX_SQL).toContain('GRANT  EXECUTE ON FUNCTION process_arena_results() TO service_role, postgres');
  });

  it('18. anon/authenticated に EXECUTE を付与していない', () => {
    expect(PROCESS_FIX_SQL).toContain(
      'REVOKE EXECUTE ON FUNCTION process_arena_results() FROM PUBLIC, anon, authenticated'
    );
  });
});

// --------------------------------------------------------------------------
// 19-20: admin_generate_arena_prize_awards の no_show 除外
// --------------------------------------------------------------------------
describe('admin_generate_arena_prize_awards — end_reason 除外', () => {
  it("19. no_show を除外している（end_reason NOT IN に 'no_show' がある）", () => {
    expect(PRIZE_SQL).toContain("'no_show'");
    // FOR ループ内の WHERE 句
    const forLoopIdx = PRIZE_SQL.indexOf('FOR r_hist IN');
    const loopBlock  = PRIZE_SQL.slice(forLoopIdx, forLoopIdx + 500);
    expect(loopBlock).toContain('no_show');
  });

  it("20. no_contest / cancelled を除外している", () => {
    expect(PRIZE_SQL).toContain("'no_contest'");
    expect(PRIZE_SQL).toContain("'cancelled'");
  });
});

// --------------------------------------------------------------------------
// 21-28: 過去データ補正migration
// --------------------------------------------------------------------------
describe('過去データ補正migration — arena_matches', () => {
  it('21. arena_matches の master_effect = defended 補正に3件のIDが含まれる', () => {
    expect(DATA_FIX_SQL).toContain('d36cbaca-67b0-4d5e-9b35-0d58d9bc366a');
    expect(DATA_FIX_SQL).toContain('724801fb-35ff-45d1-824c-f5de08b8807c');
    expect(DATA_FIX_SQL).toContain('29eb8a00-65eb-4a91-b755-80764acd9667');
    expect(DATA_FIX_SQL).toContain("master_effect = 'defended'");
  });
});

describe('過去データ補正migration — arena_match_history', () => {
  it('22. arena_match_history の master_effect defended 補正がある', () => {
    expect(DATA_FIX_SQL).toContain('arena_match_history');
    const histBlock = extractBlock(DATA_FIX_SQL, 'UPDATE arena_match_history', 'DIAGNOSTICS v_check_count');
    expect(histBlock).toContain("master_effect = 'defended'");
  });
});

describe('過去データ補正migration — online_games', () => {
  it('23. online_game を forfeit_white で finished へ補正する', () => {
    expect(DATA_FIX_SQL).toContain('61974f0f-715e-4d7a-958b-feee955e9aa3');
    expect(DATA_FIX_SQL).toContain("end_reason        = 'forfeit_white'");
    expect(DATA_FIX_SQL).toContain("status            = 'finished'");
    expect(DATA_FIX_SQL).toContain("winner            = 'black'");
  });

  it('25. online_games 補正に WHERE status=playing がある', () => {
    const ogBlock = extractBlock(
      DATA_FIX_SQL,
      '-- 補正7: 8/9 online_game を finished へ更新',
      "GET DIAGNOSTICS v_check_count = ROW_COUNT;"
    );
    expect(ogBlock).toContain("AND status = 'playing'");
  });
});

describe('過去データ補正migration — arena_definitions', () => {
  it('24. 6/28 正当取得 event id が current_master_since_event_id に使われている', () => {
    expect(DATA_FIX_SQL).toContain('fb1d7a46-e801-4a61-8e92-ed3542c7b3a5');
    expect(DATA_FIX_SQL).toContain('current_master_since_event_id');
  });
});

describe('過去データ補正migration — 安全性', () => {
  it('26. 事前条件違反時の RAISE EXCEPTION が存在する', () => {
    expect(DATA_FIX_SQL).toContain('PRECONDITION_FAILED');
    // 複数の条件チェック
    const precondCount = (DATA_FIX_SQL.match(/PRECONDITION_FAILED/g) || []).length;
    expect(precondCount).toBeGreaterThanOrEqual(4);
  });

  it('27. BEGIN / COMMIT による transaction が存在する', () => {
    expect(DATA_FIX_SQL).toContain('BEGIN;');
    expect(DATA_FIX_SQL).toContain('COMMIT;');
  });

  it('28. prize_awards テーブルを変更していない', () => {
    // INSERT INTO prize_awards や UPDATE prize_awards がない
    expect(DATA_FIX_SQL).not.toContain('INSERT INTO prize_awards');
    expect(DATA_FIX_SQL).not.toContain('UPDATE prize_awards');
    expect(DATA_FIX_SQL).not.toContain('DELETE FROM prize_awards');
  });
});

// --------------------------------------------------------------------------
// Helper
// --------------------------------------------------------------------------
function extractBlock(sql: string, startMarker: string, endMarker: string): string {
  const start = sql.indexOf(startMarker);
  if (start === -1) return '';
  const end = sql.indexOf(endMarker, start);
  if (end === -1) return sql.slice(start);
  return sql.slice(start, end);
}
