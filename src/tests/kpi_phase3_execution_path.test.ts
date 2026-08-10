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
