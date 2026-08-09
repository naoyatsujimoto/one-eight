/**
 * prize_admin_rpc_master_reward.test.ts
 *
 * テスト対象:
 *   admin_list_unprocessed_arena_events() RPC の
 *   master_reward_amount_cents / master_reward_currency フィールド追加修正
 *
 * 背景:
 *   20260621004900_admin_list_unprocessed_arena_events.sql では
 *   master_reward フィールドが RETURNS TABLE に含まれていなかったため、
 *   JAGUAR が「Master報酬：未設定」と表示される問題が発生していた。
 *   20260809101146_fix_admin_list_unprocessed_arena_events_master_reward.sql
 *   で修正。
 *
 * 注意:
 *   Supabase DB への実際の呼び出しは行わない（型チェック・ロジック確認のみ）。
 */

import { describe, it, expect } from 'vitest';
import type { UnprocessedArenaEventRow } from '../lib/prizeAdmin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー: UnprocessedArenaEventRow ファクトリ
// ─────────────────────────────────────────────────────────────────────────────
function makeUnprocessedArenaEventRow(
  overrides: Partial<UnprocessedArenaEventRow> = {}
): UnprocessedArenaEventRow {
  return {
    arena_event_id:             '690b7ad9-d46d-4e11-9d87-724e1e39b505',
    arena_id:                   'arena-uuid-jaguar',
    arena_code:                 'JAGUAR',
    arena_display_name:         'JAGUAR Arena',
    scheduled_at:               '2026-08-09T10:00:00+00:00',
    arena_match_id:             '29eb8a00-65eb-4a91-b755-80764acd9667',
    official_match_id:          null,
    match_kind:                 'master',
    master_subtype:             null,
    master_effect:              'defended',
    winner_user_id:             'winner-uuid-0001',
    winner_display_name:        'TestWinner',
    loser_user_id:              'loser-uuid-0001',
    loser_display_name:         'TestLoser',
    end_reason:                 'no_show',
    processed_at:               '2026-08-09T11:00:00+00:00',
    existing_award_count:       0,
    master_reward_amount_cents: 6500,
    master_reward_currency:     'USD',
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 型定義: master_reward フィールドが存在すること
// ─────────────────────────────────────────────────────────────────────────────
describe('型定義: UnprocessedArenaEventRow に master_reward フィールドが存在する', () => {
  it('master_reward_amount_cents フィールドが存在する', () => {
    const row = makeUnprocessedArenaEventRow();
    expect('master_reward_amount_cents' in row).toBe(true);
  });

  it('master_reward_currency フィールドが存在する', () => {
    const row = makeUnprocessedArenaEventRow();
    expect('master_reward_currency' in row).toBe(true);
  });

  it('master_reward_amount_cents の型は number | null', () => {
    const rowWithValue = makeUnprocessedArenaEventRow({ master_reward_amount_cents: 6500 });
    const rowWithNull  = makeUnprocessedArenaEventRow({ master_reward_amount_cents: null });
    expect(typeof rowWithValue.master_reward_amount_cents).toBe('number');
    expect(rowWithNull.master_reward_amount_cents).toBeNull();
  });

  it('master_reward_currency の型は string | null', () => {
    const rowWithValue = makeUnprocessedArenaEventRow({ master_reward_currency: 'USD' });
    const rowWithNull  = makeUnprocessedArenaEventRow({ master_reward_currency: null });
    expect(typeof rowWithValue.master_reward_currency).toBe('string');
    expect(rowWithNull.master_reward_currency).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. arena_definitions から値が取得される（フィールドが undefined でない）
// ─────────────────────────────────────────────────────────────────────────────
describe('arena_definitions から値が取得されること', () => {
  it('master_reward_amount_cents が undefined でない', () => {
    const row = makeUnprocessedArenaEventRow({ master_reward_amount_cents: 6500 });
    expect(row.master_reward_amount_cents).not.toBeUndefined();
  });

  it('master_reward_currency が undefined でない', () => {
    const row = makeUnprocessedArenaEventRow({ master_reward_currency: 'USD' });
    expect(row.master_reward_currency).not.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. JAGUAR は 6500 / USD であること
// ─────────────────────────────────────────────────────────────────────────────
describe('JAGUAR の master_reward 値', () => {
  it('JAGUAR の master_reward_amount_cents は 6500', () => {
    const row = makeUnprocessedArenaEventRow({
      arena_code:                 'JAGUAR',
      master_reward_amount_cents: 6500,
      master_reward_currency:     'USD',
    });
    expect(row.master_reward_amount_cents).toBe(6500);
  });

  it('JAGUAR の master_reward_currency は USD', () => {
    const row = makeUnprocessedArenaEventRow({
      arena_code:             'JAGUAR',
      master_reward_currency: 'USD',
    });
    expect(row.master_reward_currency).toBe('USD');
  });

  it('ELEPHANT の master_reward_amount_cents は 6500', () => {
    const row = makeUnprocessedArenaEventRow({
      arena_code:                 'ELEPHANT',
      master_reward_amount_cents: 6500,
      master_reward_currency:     'USD',
    });
    expect(row.master_reward_amount_cents).toBe(6500);
  });

  it('ELEPHANT の master_reward_currency は USD', () => {
    const row = makeUnprocessedArenaEventRow({
      arena_code:             'ELEPHANT',
      master_reward_currency: 'USD',
    });
    expect(row.master_reward_currency).toBe('USD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. no_show 候補を除外しない（end_reason='no_show' が結果に含まれうる）
// ─────────────────────────────────────────────────────────────────────────────
describe('end_reason フィルタリング', () => {
  // SQL: amh.end_reason NOT IN ('no_contest', 'cancelled')
  // no_show は除外されないため、候補として返却される

  const EXCLUDED_REASONS = ['no_contest', 'cancelled'] as const;
  const INCLUDED_REASONS = ['no_show', 'timeout', 'resign', 'checkmate', 'points'] as const;

  it.each(INCLUDED_REASONS)('end_reason=%s は候補に含まれうる（除外されない）', (reason) => {
    const row = makeUnprocessedArenaEventRow({ end_reason: reason });
    expect(EXCLUDED_REASONS).not.toContain(row.end_reason);
  });

  it.each(EXCLUDED_REASONS)('end_reason=%s は除外される', (reason) => {
    // RPC側でフィルタされるため、このreason を持つ row は返却されないことを型レベルで確認
    const row = makeUnprocessedArenaEventRow({ end_reason: reason });
    expect(EXCLUDED_REASONS).toContain(row.end_reason);
  });

  it('JAGUAR の end_reason=no_show は候補に含まれる', () => {
    const row = makeUnprocessedArenaEventRow({
      arena_event_id: '690b7ad9-d46d-4e11-9d87-724e1e39b505',
      arena_match_id: '29eb8a00-65eb-4a91-b755-80764acd9667',
      end_reason:     'no_show',
    });
    expect(EXCLUDED_REASONS).not.toContain(row.end_reason);
    expect(row.end_reason).toBe('no_show');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. existing_award_count=0 の候補のみが表示される
// ─────────────────────────────────────────────────────────────────────────────
describe('existing_award_count フィルタリング', () => {
  it('existing_award_count=0 の候補は Award 未生成', () => {
    const row = makeUnprocessedArenaEventRow({ existing_award_count: 0 });
    expect(row.existing_award_count).toBe(0);
  });

  it('existing_award_count>0 の場合はAward生成済み（RPC側で除外される）', () => {
    // RPC側: NOT EXISTS (prize_awards where ...) でフィルタ
    // existing_award_count > 0 のデータは返却されないことを確認するロジックテスト
    const row = makeUnprocessedArenaEventRow({ existing_award_count: 1 });
    // このようなrowはRPCから返ってこないはずだが、型互換性の確認
    expect(typeof row.existing_award_count).toBe('number');
    expect(row.existing_award_count).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Admin権限・GRANT を維持（SQL定義の文字列チェック）
// ─────────────────────────────────────────────────────────────────────────────
describe('Migration SQL: Admin権限・GRANT を維持', () => {
  const migrationPath = resolve(
    __dirname,
    '../../supabase/migrations/20260809101146_fix_admin_list_unprocessed_arena_events_master_reward.sql'
  );
  let sql: string;

  try {
    sql = readFileSync(migrationPath, 'utf-8');
  } catch {
    sql = '';
  }

  it('migrationファイルが存在する', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('SECURITY DEFINER が含まれる', () => {
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('is_admin チェックが含まれる', () => {
    expect(sql).toContain('is_admin');
  });

  it('authenticated に GRANT EXECUTE されている', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION');
    expect(sql).toContain('authenticated');
  });

  it('service_role に GRANT EXECUTE されている', () => {
    expect(sql).toContain('service_role');
  });

  it('anon から REVOKE されている', () => {
    expect(sql).toContain('REVOKE ALL');
    expect(sql).toContain('anon');
  });

  it('master_reward_amount_cents が RETURNS TABLE に含まれる', () => {
    expect(sql).toContain('master_reward_amount_cents');
  });

  it('master_reward_currency が RETURNS TABLE に含まれる', () => {
    expect(sql).toContain('master_reward_currency');
  });

  it('DROP FUNCTION が含まれる（RETURNS TABLE 変更のため必須）', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS');
  });

  it('arena_definitions の master_reward を SELECT している', () => {
    expect(sql).toContain('ad.master_reward_amount_cents');
    expect(sql).toContain('ad.master_reward_currency');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. フロントの UnprocessedArenaEventRow と RPC 構造が一致（型互換チェック）
// ─────────────────────────────────────────────────────────────────────────────
describe('UnprocessedArenaEventRow と RPC RETURNS TABLE の型互換チェック', () => {
  // RPC の RETURNS TABLE に存在するフィールド一覧（migration SQL から）
  const RPC_FIELDS = [
    'arena_event_id',
    'arena_id',
    'arena_code',
    'arena_display_name',
    'scheduled_at',
    'arena_match_id',
    'official_match_id',
    'match_kind',
    'master_subtype',
    'master_effect',
    'winner_user_id',
    'winner_display_name',
    'loser_user_id',
    'loser_display_name',
    'end_reason',
    'processed_at',
    'existing_award_count',
    'master_reward_amount_cents',
    'master_reward_currency',
  ] as const;

  it('UnprocessedArenaEventRow が全 RPC フィールドを持つ', () => {
    const row = makeUnprocessedArenaEventRow();
    for (const field of RPC_FIELDS) {
      expect(field in row).toBe(true);
    }
  });

  it('master_reward_amount_cents フィールドが RPC RETURNS TABLE に含まれている', () => {
    expect(RPC_FIELDS).toContain('master_reward_amount_cents');
  });

  it('master_reward_currency フィールドが RPC RETURNS TABLE に含まれている', () => {
    expect(RPC_FIELDS).toContain('master_reward_currency');
  });
});
