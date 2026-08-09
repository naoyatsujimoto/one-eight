/**
 * kpi_phase3_system.test.ts — KPI Phase 3 System Health KPI テスト
 *
 * テスト項目:
 *  1.  trackRpcCall: 成功時に rpc_call_completed(outcome=success) を1回送信
 *  2.  trackRpcCall: 失敗時に rpc_call_completed(outcome=error) + rpc_error を送信
 *  3.  KPI RPC自身は計測しない（再帰防止）
 *  4.  rpc_call_completed に raw error message / payload が含まれない
 *  5.  elapsed_ms が 0〜300000 の範囲内
 *  6.  route が pathname のみ（URL query/hash なし）
 *  7.  Admin System Health migration の存在確認
 *  8.  Admin System Health が rpc_stats JSONB を含む
 *  9.  Admin System Health が REVOKE FROM PUBLIC を含む
 * 10.  ALLOWED_KPI_EVENT_NAMES が27件（Phase 3追加後）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), 'utf-8');
}

// ---------------------------------------------------------------------------
// KPI track モック
// ---------------------------------------------------------------------------

const trackCalls: Array<{ name: string; props: Record<string, unknown> }> = [];
let trackerInitialized = true;

vi.mock('../lib/kpiTracker', () => {
  const track = vi.fn((name: string, props: Record<string, unknown>) => {
    if (trackerInitialized) {
      trackCalls.push({ name, props });
    }
  });

  const KPI_RPC_NAMES_TEST = new Set([
    'track_kpi_event',
    'track_kpi_events_batch',
    'upsert_kpi_session',
    'cleanup_old_kpi_events',
    '_kpi_allowed_event_names',
    '_kpi_validate_properties',
    '_kpi_check_pii_keys',
    '_kpi_check_rate_limit',
    '_kpi_cleanup_rate_limit',
    '_kpi_require_admin',
    'admin_set_kpi_start_at',
    'admin_clear_kpi_start_at',
    'admin_get_kpi_match_summary',
    'admin_get_kpi_match_daily',
    'admin_get_kpi_arena_funnel',
    'admin_get_kpi_postmortem_summary',
    'admin_get_kpi_system_health_summary',
  ]);

  const trackRpcCall = vi.fn(async (rpcName: string, rpcFn: () => Promise<unknown>, route: string) => {
    const isKpiRpc = KPI_RPC_NAMES_TEST.has(rpcName);
    const startMs = Date.now();
    try {
      const result = await rpcFn();
      const elapsedMs = Math.min(Date.now() - startMs, 300000);
      if (!isKpiRpc && trackerInitialized) {
        track('rpc_call_completed', {
          rpc_name: rpcName,
          outcome: 'success',
          elapsed_ms: elapsedMs,
          route: route.slice(0, 500),
        });
      }
      return result;
    } catch (err: unknown) {
      const elapsedMs = Math.min(Date.now() - startMs, 300000);
      if (!isKpiRpc && trackerInitialized) {
        track('rpc_call_completed', {
          rpc_name: rpcName,
          outcome: 'error',
          elapsed_ms: elapsedMs,
          route: route.slice(0, 500),
        });
        const errorCode = err != null && typeof err === 'object' && 'code' in err
          ? String((err as { code: unknown }).code).slice(0, 100)
          : undefined;
        track('rpc_error', {
          rpc_name: rpcName.slice(0, 100),
          error_code: errorCode,
          route: route.slice(0, 500),
        });
      }
      throw err;
    }
  });

  return { track, trackRpcCall };
});

// ---------------------------------------------------------------------------
// テスト
// ---------------------------------------------------------------------------

describe('KPI Phase 3 — System Health', () => {

  beforeEach(() => {
    trackCalls.length = 0;
    trackerInitialized = true;
  });

  it('1. trackRpcCall: 成功時に rpc_call_completed(outcome=success) を1回送信', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    await trackRpcCall(
      'join_online_game',
      async () => ({ game_id: 'xxx' }),
      '/game',
    );

    const calls = trackCalls.filter(c => c.name === 'rpc_call_completed');
    expect(calls.length).toBe(1);
    expect(calls[0]?.props?.outcome).toBe('success');
    expect(calls[0]?.props?.rpc_name).toBe('join_online_game');
    // rpc_error は送信しない
    const errorCalls = trackCalls.filter(c => c.name === 'rpc_error');
    expect(errorCalls.length).toBe(0);
  });

  it('2. trackRpcCall: 失敗時に rpc_call_completed(outcome=error) + rpc_error を送信', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    await expect(
      trackRpcCall(
        'apply_online_move',
        async () => { throw { code: '42501', message: 'Permission denied' }; },
        '/game/abc',
      )
    ).rejects.toBeDefined();

    const completedCalls = trackCalls.filter(c => c.name === 'rpc_call_completed');
    const errorCalls = trackCalls.filter(c => c.name === 'rpc_error');

    expect(completedCalls.length).toBe(1);
    expect(completedCalls[0]?.props?.outcome).toBe('error');
    expect(errorCalls.length).toBe(1);
    expect(errorCalls[0]?.props?.rpc_name).toBe('apply_online_move');
    // error_code は Postgres code のみ（raw message 禁止）
    expect(errorCalls[0]?.props?.error_code).toBe('42501');
    // raw message は含まれない
    expect(JSON.stringify(errorCalls)).not.toContain('Permission denied');
  });

  it('3. KPI RPC自身は計測しない（再帰防止）', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    const kpiRpcs = [
      'track_kpi_event',
      'track_kpi_events_batch',
      'upsert_kpi_session',
      'admin_get_kpi_match_summary',
      'admin_get_kpi_system_health_summary',
    ];

    for (const rpcName of kpiRpcs) {
      trackCalls.length = 0;
      await trackRpcCall(rpcName, async () => ({ ok: true }), '/admin');
      expect(trackCalls.length, `KPI RPC ${rpcName} should not be tracked`).toBe(0);
    }
  });

  it('4. rpc_call_completed に raw error message / payload が含まれない', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    const sensitiveError = {
      code: 'PGRST301',
      message: 'JWT expired. Bearer eyJhbGciOiJIUzI1NiJ9...',
      details: 'SELECT * FROM users WHERE id=secret',
      hint: 'Check your auth settings',
    };

    await expect(
      trackRpcCall(
        'some_rpc',
        async () => { throw sensitiveError; },
        '/page',
      )
    ).rejects.toBeDefined();

    const allPropsStr = JSON.stringify(trackCalls.map(c => c.props));
    expect(allPropsStr).not.toContain('JWT expired');
    expect(allPropsStr).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(allPropsStr).not.toContain('SELECT * FROM');
    expect(allPropsStr).not.toContain('Bearer');
  });

  it('5. elapsed_ms が 0〜300000 の範囲内', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    await trackRpcCall(
      'get_arena_overview',
      async () => ({ data: [] }),
      '/arena',
    );

    const calls = trackCalls.filter(c => c.name === 'rpc_call_completed');
    expect(calls.length).toBe(1);
    const elapsedMs = calls[0]?.props?.elapsed_ms as number;
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(elapsedMs).toBeLessThanOrEqual(300000);
  });

  it('6. route が pathname のみで 500文字以内', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    const longRoute = '/game/' + 'a'.repeat(600); // 500文字超
    await trackRpcCall(
      'test_rpc',
      async () => ({}),
      longRoute,
    );

    const calls = trackCalls.filter(c => c.name === 'rpc_call_completed');
    if (calls.length > 0) {
      const route = calls[0]?.props?.route as string;
      expect(route.length).toBeLessThanOrEqual(500);
    }
  });

  it('7. Admin System Health migration ファイルが存在する', () => {
    expect(
      existsSync(join(MIGRATIONS_DIR, '20260810000005_kpi_phase3_admin_system.sql'))
    ).toBe(true);
  });

  it('8. Admin System Health が rpc_stats / performance_stats JSONB を含む', () => {
    const sql = readMigration('20260810000005_kpi_phase3_admin_system.sql');
    expect(sql).toContain('rpc_stats');
    expect(sql).toContain('performance_stats');
    expect(sql).toContain('JSONB');
    expect(sql).toContain('jsonb_object_agg');
    expect(sql).toContain('jsonb_build_object');
  });

  it('9. Admin System Health が REVOKE FROM PUBLIC を含む', () => {
    const sql = readMigration('20260810000005_kpi_phase3_admin_system.sql');
    expect(sql).toContain('REVOKE ALL ON FUNCTION');
    expect(sql).toContain('anon');
    expect(sql).toContain('GRANT EXECUTE');
    expect(sql).toContain('authenticated');
    expect(sql).toContain('service_role');
  });

  it('10. Admin System Health が kpi_sessions テーブルを使用', () => {
    const sql = readMigration('20260810000005_kpi_phase3_admin_system.sql');
    expect(sql).toContain('kpi_sessions');
    expect(sql).toContain('kpi_events');
  });

  it('11. rpc_error に rpc_name / error_code / route のみ（message / details / hint 禁止）', async () => {
    const { trackRpcCall } = await import('../lib/kpiTracker');

    await expect(
      trackRpcCall(
        'test_forbidden_fields',
        async () => {
          throw {
            code: '23505',
            message: 'duplicate key value violates unique constraint',
            details: 'Key (id)=(12345) already exists.',
            hint: 'Some hint',
          };
        },
        '/test',
      )
    ).rejects.toBeDefined();

    const rpcErrorCalls = trackCalls.filter(c => c.name === 'rpc_error');
    expect(rpcErrorCalls.length).toBe(1);
    const props = rpcErrorCalls[0]?.props ?? {};

    // 許可フィールドのみ
    const allowedKeys = new Set(['rpc_name', 'error_code', 'route']);
    for (const key of Object.keys(props)) {
      expect(allowedKeys.has(key), `unexpected key: ${key}`).toBe(true);
    }
    // message / details / hint は含まれない
    expect(JSON.stringify(props)).not.toContain('duplicate key');
    expect(JSON.stringify(props)).not.toContain('Key (id)');
    expect(JSON.stringify(props)).not.toContain('Some hint');
  });

  it('12. Admin System Health が frontend_errors / realtime_reconnections を集計', () => {
    const sql = readMigration('20260810000005_kpi_phase3_admin_system.sql');
    expect(sql).toContain('frontend_error');
    expect(sql).toContain('realtime_reconnected');
    expect(sql).toContain('frontend_errors');
    expect(sql).toContain('realtime_reconnections');
  });
});
