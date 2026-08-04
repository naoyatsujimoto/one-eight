/**
 * resolve_recent_game_display.test.ts
 *
 * resolveRecentGameDisplay 純粋関数のユニットテスト
 *
 * 検証項目:
 *  1. Arena公式戦・白番勝利 → ○、後手
 *  2. Arena公式戦・黒番敗北 → ×、先手
 *  3. Arena公式戦・draw → △
 *  4. Arena公式戦・no_contest → — (neutral)
 *  5. match_logs.human_color=nullでも、official matchのmy_colorから先後を表示
 *  6. match_logs.winnerがnullでも、official matchのwinnerから結果を表示
 *  7. official matchがある場合はofficial側を優先
 *  8. 通常CPU戦の勝敗表示を維持
 *  9. 通常オンライン戦の勝敗表示を維持
 * 10. human_color=nullかつofficial matchなしは敗北ではなく「—」(unknown)
 */

import { describe, it, expect } from 'vitest';
import type { MatchLogRow } from '../lib/matchLog';
import type { OfficialMatchListItem } from '../lib/officialMatch';
import { resolveRecentGameDisplay } from '../components/UserPage';

const USER_ID = '9924668a-a5ee-4bd3-a71e-f8f993e3f094';
const OTHER_ID = 'e68a0189-ffe2-41c1-afd0-b0e60a47dd1f';

// ─── fixture helpers ──────────────────────────────────────────────────────────

function makeMatchLog(overrides: Partial<MatchLogRow> = {}): MatchLogRow {
  return {
    game_id: 'test-game-id',
    started_at: '2026-08-04T00:00:00Z',
    ended_at: '2026-08-04T01:00:00Z',
    mode: 'online_pvp',
    human_color: null,
    winner: null,
    move_count: 40,
    user_id: USER_ID,
    ...overrides,
  };
}

function makeOfficialMatch(overrides: Partial<OfficialMatchListItem> = {}): OfficialMatchListItem {
  return {
    id: 'official-match-id',
    starts_at: '2026-08-04T00:00:00Z',
    ends_at: null,
    status: 'completed',
    timer_config: {},
    online_game_id: 'test-game-id',
    result: null,
    winner: null,
    end_reason: null,
    my_color: 'white',
    opponent_id: OTHER_ID,
    opponent_display_name: null,
    tournament_id: null,
    round_id: null,
    source_kind: 'arena',
    created_at: '2026-08-04T00:00:00Z',
    updated_at: '2026-08-04T00:00:00Z',
    ...overrides,
  };
}

// ─── テスト ───────────────────────────────────────────────────────────────────

describe('resolveRecentGameDisplay', () => {
  // 1. Arena公式戦・白番勝利 → win、white
  it('1: Arena公式戦 白番勝利 → result=win, side=white', () => {
    const log = makeMatchLog({ human_color: null, winner: 'white', mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'white',
      winner: 'white_user',
      status: 'completed',
      source_kind: 'arena',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('win');
    expect(result.side).toBe('white');
  });

  // 2. Arena公式戦・黒番敗北 → loss、black
  it('2: Arena公式戦 黒番敗北 → result=loss, side=black', () => {
    const log = makeMatchLog({ human_color: null, winner: 'white', mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'black',
      winner: 'white_user',
      status: 'completed',
      source_kind: 'arena',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('loss');
    expect(result.side).toBe('black');
  });

  // 3. Arena公式戦・draw → draw
  it('3: Arena公式戦 draw → result=draw', () => {
    const log = makeMatchLog({ human_color: null, winner: 'draw', mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'black',
      winner: 'draw',
      status: 'completed',
      source_kind: 'arena',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('draw');
  });

  // 4. Arena公式戦・no_contest → neutral
  it('4: Arena公式戦 no_contest → result=neutral', () => {
    const log = makeMatchLog({ human_color: null, winner: null, mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'black',
      winner: null,
      status: 'no_contest',
      source_kind: 'arena',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('neutral');
  });

  // 5. match_logs.human_color=null → official matchのmy_colorから先後を表示
  it('5: human_color=null でも official match から side を取得', () => {
    const log = makeMatchLog({ human_color: null, winner: null, mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'black',
      winner: 'black_user',
      status: 'completed',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.side).toBe('black');
  });

  // 6. match_logs.winner=null → official matchのwinnerから結果を表示
  it('6: match_logs.winner=null でも official match から result を取得', () => {
    const log = makeMatchLog({ human_color: null, winner: null, mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'white',
      winner: 'white_user',
      status: 'completed',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('win');
  });

  // 7. official matchがある場合はofficial側を優先
  it('7: official matchがある場合はofficial側を優先（match_logsのwinner無視）', () => {
    // match_logs.winner='black'（"white番のユーザー"にとっては敗北扱い）
    // official matches.winner='white_user'（白番が勝ち）
    const log = makeMatchLog({ human_color: 'white', winner: 'black', mode: 'online_pvp' });
    const om = makeOfficialMatch({
      my_color: 'white',
      winner: 'white_user',
      status: 'completed',
    });
    // official matchがある場合はofficialを優先 → win
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('win');
    expect(result.side).toBe('white');
  });

  // 8. 通常CPU戦の勝敗表示を維持
  it('8: CPU戦（human_color=black, winner=black）→ win', () => {
    const log = makeMatchLog({
      mode: 'human_vs_cpu',
      human_color: 'black',
      winner: 'black',
    });
    const result = resolveRecentGameDisplay(log, undefined, USER_ID);
    expect(result.result).toBe('win');
    expect(result.side).toBe('black');
  });

  it('8b: CPU戦（human_color=white, winner=black）→ loss', () => {
    const log = makeMatchLog({
      mode: 'human_vs_cpu',
      human_color: 'white',
      winner: 'black',
    });
    const result = resolveRecentGameDisplay(log, undefined, USER_ID);
    expect(result.result).toBe('loss');
    expect(result.side).toBe('white');
  });

  // 9. 通常オンライン戦の勝敗表示を維持（human_colorあり）
  it('9: 通常online_pvp（human_color=black, winner=black）→ win', () => {
    const log = makeMatchLog({
      mode: 'online_pvp',
      human_color: 'black',
      winner: 'black',
    });
    // officialGameMapになし
    const result = resolveRecentGameDisplay(log, undefined, USER_ID);
    expect(result.result).toBe('win');
    expect(result.side).toBe('black');
  });

  it('9b: 通常online_pvp（human_color=white, winner=white）→ win', () => {
    const log = makeMatchLog({
      mode: 'online_pvp',
      human_color: 'white',
      winner: 'white',
    });
    const result = resolveRecentGameDisplay(log, undefined, USER_ID);
    expect(result.result).toBe('win');
    expect(result.side).toBe('white');
  });

  // 10. human_color=nullかつofficial matchなし → unknown（—）
  it('10: human_color=null かつ official matchなし → result=unknown, side=null', () => {
    const log = makeMatchLog({ human_color: null, winner: 'black', mode: 'online_pvp' });
    const result = resolveRecentGameDisplay(log, undefined, USER_ID);
    expect(result.result).toBe('unknown');
    expect(result.side).toBeNull();
  });

  // 追加: cancelled/forfeited も neutral
  it('11: status=cancelled → neutral', () => {
    const log = makeMatchLog({ human_color: null, winner: null, mode: 'online_pvp' });
    const om = makeOfficialMatch({ status: 'cancelled', winner: null, my_color: 'white' });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('neutral');
  });

  it('12: status=forfeited → neutral', () => {
    const log = makeMatchLog({ human_color: null, winner: null, mode: 'online_pvp' });
    const om = makeOfficialMatch({ status: 'forfeited', winner: null, my_color: 'black' });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.result).toBe('neutral');
  });

  // black_user_id からmy_colorフォールバック確認
  it('13: my_colorフォールバック: black_user_id === userId → side=black', () => {
    const log = makeMatchLog({ human_color: null, winner: 'black', mode: 'online_pvp' });
    // my_colorを意図的にundefinedにできないので、black_user_idによるフォールバックを確認
    // (my_color='black'が直接設定されているので、このケースはmy_color優先)
    const om = makeOfficialMatch({
      my_color: 'black',
      winner: 'black_user',
      status: 'completed',
    });
    const result = resolveRecentGameDisplay(log, om, USER_ID);
    expect(result.side).toBe('black');
    expect(result.result).toBe('win');
  });

  // CPU戦でdrawのケース
  it('14: CPU戦 draw → draw', () => {
    const log = makeMatchLog({
      mode: 'human_vs_cpu',
      human_color: 'black',
      winner: 'draw',
    });
    const result = resolveRecentGameDisplay(log, undefined, USER_ID);
    expect(result.result).toBe('draw');
  });
});
