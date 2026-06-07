/**
 * check_timeout_deep.ts — timeout bug deeper investigation
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
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
} catch {}

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// 対象ゲームID (2026-05-30 テスト公式戦)
// starts_at 2026-05-30T04:15 → game 934d447f (move_count=2, real match)
const TARGET_GAME = '934d447f-b7b2-4660-808f-2b5a5233a45b';
// 他3つ(move_count=0)
const ZERO_GAMES = [
  '4a14ddf1-37dd-4a2e-9ca4-0916dd15797f',
  '6e01d082-b969-4bdc-b486-4e259c5c029d',
  '7fa8609d-41b7-4c3d-972b-cb079ea5bf3d',
];

async function main() {
  console.log('=== Deep Investigation ===\n');

  // online_games フル詳細
  const { data: games } = await supabase
    .from('online_games')
    .select('*')
    .in('id', [TARGET_GAME, ...ZERO_GAMES]);

  for (const g of (games ?? [])) {
    const obj = g as Record<string, unknown>;
    console.log(`\n--- Game ${obj['id']} ---`);
    console.log(`  move_number: ${obj['move_number']}`);
    console.log(`  current_player_id: ${obj['current_player_id']}`);
    console.log(`  black_player_id: ${obj['black_player_id']}`);
    console.log(`  white_player_id: ${obj['white_player_id']}`);
    console.log(`  status: ${obj['status']}`);
    console.log(`  winner: ${obj['winner']}`);
    console.log(`  end_reason: ${obj['end_reason']}`);
    console.log(`  timeout_player: ${obj['timeout_player']}`);
    console.log(`  black_remaining_ms: ${obj['black_remaining_ms']}`);
    console.log(`  white_remaining_ms: ${obj['white_remaining_ms']}`);
    console.log(`  turn_started_at: ${obj['turn_started_at']}`);
    console.log(`  official_starts_at: ${obj['official_starts_at']}`);
    console.log(`  created_at: ${obj['created_at']}`);
    console.log(`  updated_at: ${obj['updated_at']}`);
    console.log(`  server_updated_at: ${obj['server_updated_at']}`);
  }

  // match_logs フル詳細 (TARGET_GAME)
  const { data: logs } = await supabase
    .from('match_logs')
    .select('*')
    .eq('game_id', TARGET_GAME);

  console.log(`\n--- match_logs for ${TARGET_GAME} ---`);
  for (const l of (logs ?? [])) {
    const obj = l as Record<string, unknown>;
    console.log(JSON.stringify(obj, null, 2));
  }

  // official_match で starts_at が 2026-05-30T04:15 のもの
  const { data: om } = await supabase
    .from('official_matches')
    .select('*')
    .eq('online_game_id', TARGET_GAME);

  console.log(`\n--- official_match for game ${TARGET_GAME} ---`);
  for (const m of (om ?? [])) {
    const obj = m as Record<string, unknown>;
    console.log(JSON.stringify(obj, null, 2));
  }
}

main().catch(console.error);
