import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

const EVENT_ID = '0a408636-8703-4dee-ab53-46dd4ec20975';

async function main() {
  // arena_matchesを先に確認・削除
  const { data: amRows } = await sb.from('arena_matches').select('id').eq('arena_event_id', EVENT_ID);
  console.log('関連arena_matches:', amRows);

  for (const am of amRows || []) {
    await sb.from('arena_match_history').delete().eq('arena_match_id', am.id);
    await sb.from('arena_matches').delete().eq('id', am.id);
  }

  const { error } = await sb.from('arena_events').delete().eq('id', EVENT_ID);
  console.log('arena_events削除:', error ? '失敗: ' + error.message : '✅ 成功');
}

main().catch(console.error);
