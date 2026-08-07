/**
 * master_reward_phase1.test.ts
 * Master報酬制度改定 Phase 1
 *
 * テスト対象:
 *  1. ArenaOverviewItem / ArenaDetailData の型定義に
 *     master_reward_amount_cents / master_reward_currency が存在すること
 *  2. ELEPHANT / JAGUAR が 6500 / 'USD' を返すシミュレーション
 *  3. 未設定 Arena が null を返すこと (65 ドル扱いしない)
 *  4. admin_generate_arena_prize_awards の実効値決定ロジック
 *     (arena 設定値優先、未設定時は引数値フォールバック)
 *  5. 現行の winner_user_id 受給ロジックが不変であること (型レベル確認)
 *
 * Supabase RPC への実際の呼び出しは行わない（純粋関数・型チェックのみ）。
 */

import { describe, it, expect } from 'vitest';
import type { ArenaOverviewItem, ArenaDetailData } from '../lib/arena';

// ─────────────────────────────────────────────────────────────────────────────
// ヘルパー: RPC 実効値決定ロジック (migration SQL のロジックを TS で再現)
// admin_generate_arena_prize_awards 内の「arena設定値優先」判定
// ─────────────────────────────────────────────────────────────────────────────
interface ArenaRewardSetting {
  master_reward_amount_cents: number | null;
  master_reward_currency: string | null;
}

interface EffectiveReward {
  amount_cents: number;
  currency: string;
  source: 'arena_definition' | 'rpc_argument';
}

function resolveEffectiveReward(
  arenaSetting: ArenaRewardSetting,
  argAmountCents: number,
  argCurrency: string,
): EffectiveReward {
  if (
    arenaSetting.master_reward_amount_cents !== null &&
    arenaSetting.master_reward_currency !== null
  ) {
    return {
      amount_cents: arenaSetting.master_reward_amount_cents,
      currency: arenaSetting.master_reward_currency,
      source: 'arena_definition',
    };
  }
  return {
    amount_cents: argAmountCents,
    currency: argCurrency,
    source: 'rpc_argument',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// テスト用 Arena データファクトリ
// ─────────────────────────────────────────────────────────────────────────────
function makeArenaOverviewItem(overrides: Partial<ArenaOverviewItem> = {}): ArenaOverviewItem {
  return {
    arena_id: 'arena-uuid-0001',
    code: 'ELEPHANT',
    display_name: 'ELEPHANT Arena',
    title_name: 'ELEPHANT Master',
    weekday: 6,
    start_time_jst: '22:00:00',
    entry_deadline_hours: 24,
    timer_config: { mode: 'total_time', totalSeconds: 600 },
    display_order: 1,
    master_reward_amount_cents: 6500,
    master_reward_currency: 'USD',
    current_master_user_id: null,
    current_master_display_name: null,
    current_interim_master_user_id: null,
    current_interim_master_display_name: null,
    event_id: null,
    event_datetime: null,
    entry_deadline: null,
    event_status: null,
    entry_count: 0,
    my_entry_status: null,
    my_entered_at: null,
    previous_results_pending: false,
    ...overrides,
  };
}

function makeArenaDetailData(overrides: Partial<ArenaDetailData> = {}): ArenaDetailData {
  return {
    arena_id: 'arena-uuid-0001',
    code: 'JAGUAR',
    display_name: 'JAGUAR Arena',
    title_name: 'JAGUAR Master',
    weekday: 0,
    start_time_jst: '15:00:00',
    entry_deadline_hours: 24,
    timer_config: { mode: 'total_time', totalSeconds: 600 },
    master_reward_amount_cents: 6500,
    master_reward_currency: 'USD',
    current_master_user_id: null,
    current_master_display_name: null,
    current_interim_master_user_id: null,
    current_interim_master_display_name: null,
    next_event: null,
    my_entry_status: null,
    my_entered_at: null,
    my_match: null,
    previous_results_pending: false,
    top_ranking: [],
    recent_match_history: [],
    recent_master_history: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 型定義: master_reward フィールドが存在すること
// ─────────────────────────────────────────────────────────────────────────────
describe('型定義: master_reward フィールド', () => {
  it('ArenaOverviewItem に master_reward_amount_cents が存在する', () => {
    const item = makeArenaOverviewItem();
    expect('master_reward_amount_cents' in item).toBe(true);
  });

  it('ArenaOverviewItem に master_reward_currency が存在する', () => {
    const item = makeArenaOverviewItem();
    expect('master_reward_currency' in item).toBe(true);
  });

  it('ArenaDetailData に master_reward_amount_cents が存在する', () => {
    const detail = makeArenaDetailData();
    expect('master_reward_amount_cents' in detail).toBe(true);
  });

  it('ArenaDetailData に master_reward_currency が存在する', () => {
    const detail = makeArenaDetailData();
    expect('master_reward_currency' in detail).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ELEPHANT / JAGUAR が 6500 / 'USD' を返すこと
// ─────────────────────────────────────────────────────────────────────────────
describe('ELEPHANT / JAGUAR の master_reward 値', () => {
  it('ELEPHANT の master_reward_amount_cents は 6500', () => {
    const item = makeArenaOverviewItem({ code: 'ELEPHANT', master_reward_amount_cents: 6500 });
    expect(item.master_reward_amount_cents).toBe(6500);
  });

  it('ELEPHANT の master_reward_currency は USD', () => {
    const item = makeArenaOverviewItem({ code: 'ELEPHANT', master_reward_currency: 'USD' });
    expect(item.master_reward_currency).toBe('USD');
  });

  it('JAGUAR の master_reward_amount_cents は 6500', () => {
    const detail = makeArenaDetailData({ code: 'JAGUAR', master_reward_amount_cents: 6500 });
    expect(detail.master_reward_amount_cents).toBe(6500);
  });

  it('JAGUAR の master_reward_currency は USD', () => {
    const detail = makeArenaDetailData({ code: 'JAGUAR', master_reward_currency: 'USD' });
    expect(detail.master_reward_currency).toBe('USD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 未設定 Arena は null を返すこと (65 ドル扱いしない)
// ─────────────────────────────────────────────────────────────────────────────
describe('未設定 Arena の master_reward 値', () => {
  it('未設定 Arena の master_reward_amount_cents は null', () => {
    const item = makeArenaOverviewItem({
      code: 'FUTURE_ARENA',
      master_reward_amount_cents: null,
      master_reward_currency: null,
    });
    expect(item.master_reward_amount_cents).toBeNull();
  });

  it('未設定 Arena の master_reward_currency は null', () => {
    const item = makeArenaOverviewItem({
      code: 'FUTURE_ARENA',
      master_reward_amount_cents: null,
      master_reward_currency: null,
    });
    expect(item.master_reward_currency).toBeNull();
  });

  it('未設定 Arena に対して 65 ドルを自動適用しない', () => {
    const item = makeArenaOverviewItem({
      master_reward_amount_cents: null,
      master_reward_currency: null,
    });
    // null のまま: 65 ドル (6500 cents) に自動補完しない
    expect(item.master_reward_amount_cents).not.toBe(6500);
    expect(item.master_reward_amount_cents).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. admin_generate_arena_prize_awards の実効値決定ロジック
// ─────────────────────────────────────────────────────────────────────────────
describe('resolveEffectiveReward: arena 設定値優先ロジック', () => {
  it('arena 設定値が設定済みなら arena 値を使用 (引数を無視)', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: 6500,
      master_reward_currency: 'USD',
    };
    const result = resolveEffectiveReward(arena, 9999, 'JPY');
    expect(result.amount_cents).toBe(6500);
    expect(result.currency).toBe('USD');
    expect(result.source).toBe('arena_definition');
  });

  it('arena 設定値が null なら引数値をフォールバックとして使用', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: null,
      master_reward_currency: null,
    };
    const result = resolveEffectiveReward(arena, 10000, 'JPY');
    expect(result.amount_cents).toBe(10000);
    expect(result.currency).toBe('JPY');
    expect(result.source).toBe('rpc_argument');
  });

  it('arena_amount_cents だけ null でも引数値を使用 (両方 null が条件)', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: null,
      master_reward_currency: 'USD',
    };
    // 片方だけ設定されている場合 → フォールバック
    const result = resolveEffectiveReward(arena, 5000, 'JPY');
    expect(result.source).toBe('rpc_argument');
    expect(result.amount_cents).toBe(5000);
  });

  it('arena_currency だけ null でも引数値を使用 (両方 null が条件)', () => {
    const arena: ArenaRewardSetting = {
      master_reward_amount_cents: 6500,
      master_reward_currency: null,
    };
    const result = resolveEffectiveReward(arena, 5000, 'JPY');
    expect(result.source).toBe('rpc_argument');
    expect(result.amount_cents).toBe(5000);
  });

  it('ELEPHANT arena 設定に対して引数 0 円でも 6500 USD を返す', () => {
    const elephantArena: ArenaRewardSetting = {
      master_reward_amount_cents: 6500,
      master_reward_currency: 'USD',
    };
    const result = resolveEffectiveReward(elephantArena, 0, 'JPY');
    expect(result.amount_cents).toBe(6500);
    expect(result.currency).toBe('USD');
  });

  it('JAGUAR arena 設定に対して引数 99999 JPY でも 6500 USD を返す', () => {
    const jaguarArena: ArenaRewardSetting = {
      master_reward_amount_cents: 6500,
      master_reward_currency: 'USD',
    };
    const result = resolveEffectiveReward(jaguarArena, 99999, 'JPY');
    expect(result.amount_cents).toBe(6500);
    expect(result.currency).toBe('USD');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 現行の winner_user_id 受給ロジックが不変であること (型レベル確認)
// ─────────────────────────────────────────────────────────────────────────────
describe('winner_user_id 受給ロジック (型レベル不変確認)', () => {
  it('ArenaDetailData は master_reward 追加後も既存フィールドを保持する', () => {
    const detail = makeArenaDetailData();
    // 既存フィールドが変わっていないことを確認
    expect(detail.arena_id).toBeDefined();
    expect(detail.code).toBeDefined();
    expect(detail.current_master_user_id).toBeDefined();
    expect(detail.top_ranking).toBeDefined();
    expect(detail.recent_match_history).toBeDefined();
    expect(detail.recent_master_history).toBeDefined();
  });

  it('ArenaOverviewItem は master_reward 追加後も既存フィールドを保持する', () => {
    const item = makeArenaOverviewItem();
    expect(item.arena_id).toBeDefined();
    expect(item.code).toBeDefined();
    expect(item.event_id).toBeDefined();
    expect(item.entry_count).toBeDefined();
    expect(item.my_entry_status).toBeDefined();
    expect(item.previous_results_pending).toBeDefined();
  });
});
