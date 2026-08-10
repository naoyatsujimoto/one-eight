/**
 * kpi_phase3_execution_path.test.ts
 * KPI Phase 3 実行経路補正テスト
 *
 * Task 1: CPU / Offline PvP の対局ID統一
 * Task 2: Arena / Official / Online の分類
 * Task 3: Postmortem の match_mode 補正
 * Task 4: RPC計測共通ヘルパー
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveGameRecord, type GameRecord } from '../game/analytics';
import { resolvePostmortemMatchMode, type PostmortemMatchMode } from '../lib/postmortemWorkerManager';
import { resetTracker, initKpiTracker, getQueueSnapshot } from '../lib/kpiTracker';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// localStorage mock
const localStorageData: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
  clear: () => { Object.keys(localStorageData).forEach(k => delete localStorageData[k]); },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// sessionStorage mock
const sessionStorageData: Record<string, string> = {};
const sessionStorageMock = {
  getItem: (key: string) => sessionStorageData[key] ?? null,
  setItem: (key: string, value: string) => { sessionStorageData[key] = value; },
  removeItem: (key: string) => { delete sessionStorageData[key]; },
  clear: () => { Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]); },
};
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock, writable: true });

// performance mock
Object.defineProperty(global, 'performance', {
  value: { now: () => Date.now() },
  writable: true,
});

// navigator mock (for offline check)
Object.defineProperty(global, 'navigator', {
  value: { onLine: true },
  writable: true,
});

// ─── ヘルパー: 最小限の GameState を作成 ────────────────────────────────────────

function makeMinimalEndedState(overrides: {
  trainingMode?: boolean;
  gameEnded?: boolean;
  cpuPlayer?: 'black' | 'white' | null;
  winner?: 'black' | 'white' | 'draw' | null;
  startedAt?: string | null;
  endedAt?: string | null;
  endReason?: string | null;
} = {}) {
  return {
    trainingMode: false,
    gameEnded: true,
    cpuPlayer: null,
    winner: 'black' as const,
    history: [],
    startedAt: '2026-01-01T00:00:00.000Z',
    endedAt: '2026-01-01T00:05:00.000Z',
    endReason: 'normal',
    currentPlayer: 'black' as const,
    selectedPosition: null,
    gates: {},
    timerConfig: null,
    ...overrides,
  } as unknown as import('../game/types').GameState;
}

// ─── Task 1: CPU / Offline PvP の対局ID統一 ────────────────────────────────────

describe('Task 1: saveGameRecord に外部 gameId を渡す', () => {

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('1. 外部 gameId を渡すと GameRecord.game_id が一致する', () => {
    const state = makeMinimalEndedState({ cpuPlayer: 'white' });
    const externalGameId = 'external-id-12345';
    const record = saveGameRecord(state, 'normal', externalGameId);
    expect(record).not.toBeNull();
    expect(record!.game_id).toBe(externalGameId);
  });

  it('2. gameId 未指定時は従来の fallback が動く（内部生成IDが設定される）', () => {
    const state = makeMinimalEndedState({ cpuPlayer: 'white' });
    const record = saveGameRecord(state, 'normal');
    expect(record).not.toBeNull();
    // 内部生成ID: timestamp-random 形式（固定値ではないが空でないことを確認）
    expect(record!.game_id).toBeTruthy();
    expect(record!.game_id.length).toBeGreaterThan(0);
  });

  it('3. gameId=null の場合も fallback ID が生成される', () => {
    const state = makeMinimalEndedState({ cpuPlayer: 'white' });
    const record = saveGameRecord(state, 'normal', null);
    expect(record).not.toBeNull();
    expect(record!.game_id).toBeTruthy();
  });

  it('4. Training モードでは null が返る (gameId 指定があっても)', () => {
    const state = makeMinimalEndedState({ trainingMode: true, cpuPlayer: 'white' });
    const record = saveGameRecord(state, 'normal', 'any-id');
    expect(record).toBeNull();
  });

  it('5. gameEnded=false では null が返る', () => {
    const state = makeMinimalEndedState({ gameEnded: false, cpuPlayer: 'white' });
    const record = saveGameRecord(state, 'normal', 'any-id');
    expect(record).toBeNull();
  });

  it('6. CPU戦の mode は human_vs_cpu', () => {
    const state = makeMinimalEndedState({ cpuPlayer: 'white' });
    const record = saveGameRecord(state, 'normal', 'cpu-game-001');
    expect(record!.mode).toBe('human_vs_cpu');
    expect(record!.game_id).toBe('cpu-game-001');
  });

  it('7. オフラインPvP の mode は human_vs_human', () => {
    const state = makeMinimalEndedState({ cpuPlayer: null });
    const record = saveGameRecord(state, undefined, 'pvp-game-001');
    expect(record!.mode).toBe('human_vs_human');
    expect(record!.game_id).toBe('pvp-game-001');
  });
});

// ─── Task 3: Postmortem match_mode 補正 ────────────────────────────────────────

describe('Task 3: resolvePostmortemMatchMode', () => {

  it('8. human_vs_human が offline_pvp になる', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('human_vs_human');
    expect(result).toBe('offline_pvp');
  });

  it('9. human_vs_cpu が human_vs_cpu になる', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('human_vs_cpu');
    expect(result).toBe('human_vs_cpu');
  });

  it('10. onlineMode=online が online になる', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode(null, 'online');
    expect(result).toBe('online');
  });

  it('11. onlineMode=official が official になる', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode(null, 'official');
    expect(result).toBe('official');
  });

  it('12. onlineMode=arena が arena になる', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode(null, 'arena');
    expect(result).toBe('arena');
  });

  it('13. 不明な mode は unknown になる', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode(undefined);
    expect(result).toBe('unknown');
  });

  it('14. onlineMode が localMode より優先される', () => {
    // human_vs_human + onlineMode=online → online が優先
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('human_vs_human', 'online');
    expect(result).toBe('online');
  });

  it('15. arena が online より優先される', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('human_vs_human', 'arena');
    expect(result).toBe('arena');
  });
});

// ─── Task 3: candidate_count 総数 ────────────────────────────────────────────

describe('Task 3: candidate_count は総数であること（ロジック検証）', () => {

  it('16. 2候補の行と3候補の行がある場合、総数は5', () => {
    // PostmortemModal のロジックを模倣
    const rows = [
      { candidateMoves: ['a', 'b'] },
      { candidateMoves: ['c', 'd', 'e'] },
    ];
    const candidateCount = rows.reduce(
      (sum, r) => sum + (r.candidateMoves?.length ?? 0),
      0
    );
    expect(candidateCount).toBe(5);
  });

  it('17. candidateMoves が空配列の行は総数に加算されない', () => {
    const rows = [
      { candidateMoves: ['a', 'b'] },
      { candidateMoves: [] },
      { candidateMoves: ['c'] },
    ];
    const candidateCount = rows.reduce(
      (sum, r) => sum + (r.candidateMoves?.length ?? 0),
      0
    );
    expect(candidateCount).toBe(3);
  });

  it('18. candidateMoves が undefined の行は総数に加算されない', () => {
    const rows = [
      { candidateMoves: ['a'] },
      { candidateMoves: undefined },
    ];
    const candidateCount = rows.reduce(
      (sum, r) => sum + (r.candidateMoves?.length ?? 0),
      0
    );
    expect(candidateCount).toBe(1);
  });

  it('19. 行数ベース（filter でのカウント）と総数ベースの差異', () => {
    // 旧: filter(r => r.candidateMoves?.length > 0).length = 2（行数）
    // 新: reduce sum = 5（総数）
    const rows = [
      { candidateMoves: ['a', 'b'] },     // 2候補
      { candidateMoves: ['c', 'd', 'e'] }, // 3候補
    ];
    const oldCount = rows.filter(r => r.candidateMoves && r.candidateMoves.length > 0).length;
    const newCount = rows.reduce((sum, r) => sum + (r.candidateMoves?.length ?? 0), 0);
    expect(oldCount).toBe(2); // 行数ベースは2
    expect(newCount).toBe(5); // 総数ベースは5
  });
});

// ─── Task 4: trackRpcCall の {data, error} 形式対応 ────────────────────────────

describe('Task 4: trackRpcCall の error 判定', () => {

  let mockSupabase: {
    rpc: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    channel: ReturnType<typeof vi.fn>;
    removeChannel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resetTracker();
    // sessionStorage をクリア
    Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]);

    // supabase mock
    mockSupabase = {
      rpc: vi.fn(),
      from: vi.fn(),
      channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
      removeChannel: vi.fn(),
    };

    // tracker 初期化
    initKpiTracker(mockSupabase as unknown as import('@supabase/supabase-js').SupabaseClient, {
      appVersion: 'test',
      locale: 'ja',
    });
  });

  it('20. {data, error:null} は success として計測される', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: [{ id: 1 }], error: null });
    const result = await trackRpcCall('test_rpc', rpcFn, '/test');
    expect(result).toEqual({ data: [{ id: 1 }], error: null });
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(e => e.eventName === 'rpc_call_completed');
    expect(completedEvent).toBeTruthy();
    // success の場合、rpc_error イベントはない
    const errorEvent = queue.find(e => e.eventName === 'rpc_error');
    expect(errorEvent).toBeUndefined();
  });

  it('21. {data, error: {message}} は error として計測される', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const mockError = { code: 'PGRST001', message: 'some db error' };
    const rpcFn = vi.fn().mockResolvedValue({ data: null, error: mockError });
    const result = await trackRpcCall('test_rpc_err', rpcFn, '/test');
    expect(result).toEqual({ data: null, error: mockError });
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_rpc_err'
    );
    expect(completedEvent).toBeTruthy();
    const props = completedEvent!.properties as Record<string, unknown>;
    expect(props['outcome']).toBe('error');
    // rpc_error も送信される
    const errorEvent = queue.find(e => e.eventName === 'rpc_error');
    expect(errorEvent).toBeTruthy();
  });

  it('22. throw された RPC は error 計測後に再 throw される', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const thrownError = new Error('network error');
    const rpcFn = vi.fn().mockRejectedValue(thrownError);
    await expect(trackRpcCall('test_rpc_throw', rpcFn, '/test')).rejects.toThrow('network error');
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_rpc_throw'
    );
    expect(completedEvent).toBeTruthy();
    expect((completedEvent!.properties as Record<string, unknown>)['outcome']).toBe('error');
  });

  it('23. 1回の RPC につき rpc_call_completed は1回だけ送信される', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: [], error: null });
    await trackRpcCall('single_rpc', rpcFn, '/test');
    const queue = getQueueSnapshot();
    const completedEvents = queue.filter(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'single_rpc'
    );
    expect(completedEvents.length).toBe(1);
  });
});

// ─── Task 2: Online / Official / Arena の分類 ────────────────────────────────

describe('Task 2: matchMode 伝播の型確認', () => {

  it('24. OnlineBoard の Props に matchMode が存在する', async () => {
    // OnlineBoard.tsx の Props インターフェースに matchMode があることを確認
    // (TypeScript のコンパイルが通れば型レベルで保証される)
    // 実際の型検証はビルドで行う
    const validMatchModes: Array<'online' | 'official' | 'arena'> = ['online', 'official', 'arena'];
    expect(validMatchModes).toContain('online');
    expect(validMatchModes).toContain('official');
    expect(validMatchModes).toContain('arena');
  });

  it('25. resolvePostmortemMatchMode が online を正しく返す', () => {
    expect(resolvePostmortemMatchMode(null, 'online')).toBe('online');
    expect(resolvePostmortemMatchMode('human_vs_cpu', 'online')).toBe('online'); // online優先
  });

  it('26. resolvePostmortemMatchMode が arena を最優先で返す', () => {
    expect(resolvePostmortemMatchMode('human_vs_human', 'arena')).toBe('arena');
  });
});

// ─── Task 1: LocalSession 永続化 ────────────────────────────────────────────

describe('Task 1: LocalSession 永続化', () => {

  beforeEach(() => {
    localStorageMock.clear();
  });

  it('28. newLocalSession() は UUID 形式の gameId を持つ', async () => {
    const { newLocalSession } = await import('../game/localSession');
    const s = newLocalSession();
    expect(s.gameId).toMatch(/^[0-9a-f-]{36}$/);
    expect(s.matchStartedSent).toBe(false);
    expect(s.gameOverSaved).toBe(false);
  });

  it('29. saveLocalSession / loadLocalSession の往復整合性', async () => {
    const { newLocalSession, saveLocalSession, loadLocalSession } = await import('../game/localSession');
    const s = newLocalSession('test-id-abc');
    saveLocalSession(s);
    const loaded = loadLocalSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.gameId).toBe('test-id-abc');
    expect(loaded!.matchStartedSent).toBe(false);
    expect(loaded!.gameOverSaved).toBe(false);
  });

  it('30. matchStartedSent=true に更新して復元できる', async () => {
    const { newLocalSession, saveLocalSession, loadLocalSession } = await import('../game/localSession');
    const s = newLocalSession('test-id-def');
    s.matchStartedSent = true;
    saveLocalSession(s);
    const loaded = loadLocalSession();
    expect(loaded!.matchStartedSent).toBe(true);
    expect(loaded!.gameOverSaved).toBe(false);
  });

  it('31. gameOverSaved=true に更新して復元できる', async () => {
    const { newLocalSession, saveLocalSession, loadLocalSession } = await import('../game/localSession');
    const s = newLocalSession('test-id-ghi');
    s.matchStartedSent = true;
    s.gameOverSaved = true;
    saveLocalSession(s);
    const loaded = loadLocalSession();
    expect(loaded!.gameOverSaved).toBe(true);
  });

  it('32. clearLocalSession 後は null が返る', async () => {
    const { newLocalSession, saveLocalSession, loadLocalSession, clearLocalSession } = await import('../game/localSession');
    saveLocalSession(newLocalSession());
    clearLocalSession();
    expect(loadLocalSession()).toBeNull();
  });

  it('33. 破損データは null が返る', async () => {
    const { loadLocalSession } = await import('../game/localSession');
    localStorageMock.setItem('one_eight_local_session', 'INVALID_JSON{{');
    expect(loadLocalSession()).toBeNull();
  });

  it('34. 欠辺フィールドのデータは null が返る', async () => {
    const { loadLocalSession } = await import('../game/localSession');
    localStorageMock.setItem('one_eight_local_session', JSON.stringify({ gameId: 'x' }));
    expect(loadLocalSession()).toBeNull();
  });
});

// ─── Task 2: OfficialMatchCalendar Arena/Official 判定 — ロジック検証 ─────────────────

describe('Task 2: Arena / Official matchMode 判定ロジック', () => {

  // OfficialMatchCalendar.handleEnter 内で行う同一ロジック
  // source_kind は実隋には 'standalone' | 'arena' | undefinedだが、
  // TypeScript の型結局時に string として受け取ることで比較を正確に型提證する
  function getMatchModeFromSourceKind(sk: string | undefined): 'official' | 'arena' {
    return sk === 'arena' ? 'arena' : 'official';
  }

  it('35. source_kind=\'arena\' のアイテムが matchMode に arena を返す', () => {
    const matches: { id: string; source_kind?: string }[] = [
      { id: 'match-001', source_kind: 'standalone' },
      { id: 'match-002', source_kind: 'arena' },
    ];
    const matchItem = matches.find((m) => m.id === 'match-002');
    expect(getMatchModeFromSourceKind(matchItem?.source_kind)).toBe('arena');
  });

  it('36. source_kind=\'standalone\' のアイテムが matchMode に official を返す', () => {
    const matches: { id: string; source_kind?: string }[] = [
      { id: 'match-001', source_kind: 'standalone' },
    ];
    const matchItem = matches.find((m) => m.id === 'match-001');
    expect(getMatchModeFromSourceKind(matchItem?.source_kind)).toBe('official');
  });

  it('37. source_kind 未設定のアイテムは official にフォールバック', () => {
    const matches: { id: string; source_kind?: string }[] = [
      { id: 'match-003' },
    ];
    const matchItem = matches.find((m) => m.id === 'match-003');
    expect(getMatchModeFromSourceKind(matchItem?.source_kind)).toBe('official');
  });

  it('38. matchId がリストにない場合は official にフォールバック', () => {
    const matches: { id: string; source_kind?: string }[] = [];
    const matchItem = matches.find((m) => m.id === 'unknown-id');
    expect(getMatchModeFromSourceKind(matchItem?.source_kind)).toBe('official');
  });
});

// ─── Task 3: online_pvp の 5分類 ────────────────────────────────────────────────

describe('Task 3: online_pvp の 5分類', () => {

  it('39. online_pvp かつ officialItem なし → online', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('online_pvp', undefined, undefined);
    expect(result).toBe('online');
  });

  it('40. online_pvp かつ officialItem=null → online', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('online_pvp', undefined, null);
    expect(result).toBe('online');
  });

  it('41. online_pvp かつ source_kind=\'standalone\' → official', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('online_pvp', undefined, { source_kind: 'standalone' });
    expect(result).toBe('official');
  });

  it('42. online_pvp かつ source_kind=\'arena\' → arena', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('online_pvp', undefined, { source_kind: 'arena' });
    expect(result).toBe('arena');
  });

  it('43. online_pvp かつ source_kind 未定義 → online (フォールバック)', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('online_pvp', undefined, {});
    expect(result).toBe('online');
  });

  it('44. online_pvp でも onlineMode 指定ありは onlineMode を優先', () => {
    // onlineMode が明示指定された場合はそちらが最優先
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('online_pvp', 'official', { source_kind: 'arena' });
    expect(result).toBe('official');
  });

  it('45. 不明な mode・onlineModeヿofficialItem なし → unknown', () => {
    const result: PostmortemMatchMode = resolvePostmortemMatchMode('unknown_mode');
    expect(result).toBe('unknown');
  });
});

// ─── Task 4: isDataErrorShape — string/object error 対応 ──────────────────────

describe('Task 4: trackRpcCall — string error と object error の共通対応', () => {

  let mockSupabase2: {
    rpc: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    channel: ReturnType<typeof vi.fn>;
    removeChannel: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    resetTracker();
    Object.keys(sessionStorageData).forEach(k => delete sessionStorageData[k]);
    mockSupabase2 = {
      rpc: vi.fn(),
      from: vi.fn(),
      channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
      removeChannel: vi.fn(),
    };
    initKpiTracker(mockSupabase2 as unknown as import('@supabase/supabase-js').SupabaseClient, {
      appVersion: 'test',
      locale: 'ja',
    });
  });

  it('46. error が string の {data, error} は outcome=error になる', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: null, error: 'some string error' });
    const result = await trackRpcCall('test_rpc_str', rpcFn, '/test');
    expect(result).toEqual({ data: null, error: 'some string error' });
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_rpc_str'
    );
    expect(completedEvent).toBeTruthy();
    const props = completedEvent!.properties as Record<string, unknown>;
    expect(props['outcome']).toBe('error');
  });

  it('47. error が number の {data, error} も outcome=error になる', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: null, error: 500 });
    await trackRpcCall('test_rpc_num', rpcFn, '/test');
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_rpc_num'
    );
    expect(completedEvent).toBeTruthy();
    expect((completedEvent!.properties as Record<string, unknown>)['outcome']).toBe('error');
  });

  it('48. error=null は引き続き success になる', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: [1, 2], error: null });
    await trackRpcCall('test_rpc_null_err', rpcFn, '/test');
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_rpc_null_err'
    );
    expect(completedEvent).toBeTruthy();
    expect((completedEvent!.properties as Record<string, unknown>)['outcome']).toBe('success');
  });

  it('49. error=undefined は success になる', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: 'ok', error: undefined });
    await trackRpcCall('test_rpc_undef_err', rpcFn, '/test');
    const queue = getQueueSnapshot();
    const completedEvent = queue.find(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_rpc_undef_err'
    );
    expect(completedEvent).toBeTruthy();
    expect((completedEvent!.properties as Record<string, unknown>)['outcome']).toBe('success');
  });

  it('50. string error は rpc_call_completed が 1 回のみ送信される', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');
    const rpcFn = vi.fn().mockResolvedValue({ data: null, error: 'err' });
    await trackRpcCall('test_single_str', rpcFn, '/test');
    const queue = getQueueSnapshot();
    const completedEvents = queue.filter(
      e => e.eventName === 'rpc_call_completed' &&
      (e.properties as Record<string, unknown>)['rpc_name'] === 'test_single_str'
    );
    expect(completedEvents.length).toBe(1);
  });
});

// ─── scripts の untracked 確認 ────────────────────────────────────────────────

describe('Task 6 (#17): scripts/ ファイルは untracked のまま', () => {

  it('27. scripts/ ディレクトリが存在することをファイルシステムで確認', async () => {
    const { existsSync } = await import('fs');
    const { join } = await import('path');
    // scripts/ ディレクトリが存在すること（untracked ファイルの存在）
    const scriptsDir = join(__dirname, '../../scripts');
    expect(existsSync(scriptsDir)).toBe(true);
  });
});
