/**
 * check_timeout_bug.ts — 2026-05-30 timeout bug investigation
 *
 * 実行方法:
 *   cd ~/Desktop/ONE_EIGHT/one-eight-web-mvp
 *   npx tsx scripts/check_timeout_bug.ts
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: VITE_SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const NAOYA_ID = '4feace4f-4fd5-4706-a8fc-eff26a27476b'; // Opus / Black
const TEST_ID  = 'c4fd80f4-9715-4e02-a508-a3067bc3f1e9'; // test / White

async function main() {
  console.log('=== Timeout Bug Investigation (2026-05-30) ===\n');

  // 1. official_matches を確認（2026-05-29 〜 2026-05-31）
  const { data: matches, error: matchErr } = await supabase
    .from('official_matches')
    .select('id, black_user_id, white_user_id, status, online_game_id, starts_at, timer_config, winner, result, end_reason, created_at, updated_at')
    .gte('starts_at', '2026-05-29T00:00:00+00:00')
    .lte('starts_at', '2026-05-31T23:59:59+00:00')
    .order('starts_at', { ascending: false });

  if (matchErr) {
    console.error('official_matches error:', matchErr.message);
  } else {
    console.log(`official_matches (2026-05-29〜31): ${matches?.length ?? 0} 件`);
    for (const m of (matches ?? [])) {
      const obj = m as Record<string, unknown>;
      console.log(JSON.stringify({
        id:            obj['id'],
        black_user_id: obj['black_user_id'],
        white_user_id: obj['white_user_id'],
        status:        obj['status'],
        winner:        obj['winner'],
        result:        obj['result'],
        end_reason:    obj['end_reason'],
        online_game_id: obj['online_game_id'],
        starts_at:     obj['starts_at'],
        timer_config:  obj['timer_config'],
      }, null, 2));
    }
  }

  // 2. online_games を確認
  const typedMatches = (matches ?? []) as Record<string, unknown>[];
  const gameIds = typedMatches.map(m => m['online_game_id'] as string | null).filter(Boolean) as string[];
  if (gameIds.length > 0) {
    const { data: games, error: gameErr } = await supabase
      .from('online_games')
      .select('id, black_player_id, white_player_id, status, winner, end_reason, timeout_player, timer_config, black_remaining_ms, white_remaining_ms, created_at, updated_at')
      .in('id', gameIds);

    if (gameErr) {
      console.error('online_games error:', gameErr.message);
    } else {
      console.log(`\nonline_games: ${(games ?? []).length} 件`);
      for (const g of (games ?? [])) {
        const obj = g as Record<string, unknown>;
        console.log(JSON.stringify({
          id:                obj['id'],
          black_player_id:   obj['black_player_id'],
          white_player_id:   obj['white_player_id'],
          status:            obj['status'],
          winner:            obj['winner'],
          end_reason:        obj['end_reason'],
          timeout_player:    obj['timeout_player'],
          timer_config:      obj['timer_config'],
          black_remaining_ms: obj['black_remaining_ms'],
          white_remaining_ms: obj['white_remaining_ms'],
        }, null, 2));
      }

      // 3. match_logs を確認
      const { data: logs, error: logErr } = await supabase
        .from('match_logs')
        .select('id, user_id, game_id, mode, human_color, winner, end_reason, move_count, timer_config, started_at, ended_at')
        .in('game_id', gameIds);

      if (logErr) {
        console.error('match_logs error:', logErr.message);
      } else {
        console.log(`\nmatch_logs: ${(logs ?? []).length} 件`);
        for (const l of (logs ?? [])) {
          const obj = l as Record<string, unknown>;
          console.log(JSON.stringify({
            id:          obj['id'],
            user_id:     obj['user_id'],
            game_id:     obj['game_id'],
            mode:        obj['mode'],
            human_color: obj['human_color'],
            winner:      obj['winner'],
            end_reason:  obj['end_reason'],
            move_count:  obj['move_count'],
          }, null, 2));
        }
      }
    }
  }

  // 4. 勝敗表示のシミュレーション
  for (const m of typedMatches) {
    const naoyaColor = m['black_user_id'] === NAOYA_ID ? 'black' : 'white';
    const testColor  = m['black_user_id'] === TEST_ID  ? 'black' : 'white';
    const winner     = m['winner'] as string | null;
    const endReason  = m['end_reason'] as string | null;
    console.log(`\n=== Match ${m['id']} ===`);
    console.log(`  Naoya (Opus) is: ${naoyaColor}`);
    console.log(`  Test is: ${testColor}`);
    console.log(`  official_matches.winner: ${winner}`);
    console.log(`  official_matches.end_reason: ${endReason}`);

    const naoyaIsWin  = (winner === 'black_user' && naoyaColor === 'black') || (winner === 'white_user' && naoyaColor === 'white');
    const naoyaIsLoss = (winner === 'black_user' && naoyaColor === 'white') || (winner === 'white_user' && naoyaColor === 'black');
    const isTimeout   = endReason === 'timeout';
    console.log(`  Naoya display: ${naoyaIsWin ? `○ Win${isTimeout ? ' by timeout' : ''}` : naoyaIsLoss ? `× Loss${isTimeout ? ' by timeout' : ''}` : '—'}`);
    console.log(`  Expected: ○ Win by timeout (Naoya was only one in game)`);
  }
}

main().catch(console.error);
