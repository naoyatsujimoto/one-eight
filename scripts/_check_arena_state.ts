import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // arena_definitions
  const { data: defs } = await (supabase as any).from('arena_definitions').select('*');
  console.log('arena_definitions:', JSON.stringify(defs, null, 2));
  
  // arena_events
  const { data: evs } = await (supabase as any).from('arena_events').select('*').order('created_at', { ascending: false }).limit(5);
  console.log('arena_events (latest 5):', JSON.stringify(evs, null, 2));
  
  // arena_matches count
  const { count: amCount } = await (supabase as any).from('arena_matches').select('*', { count: 'exact', head: true });
  console.log('arena_matches count:', amCount);
  
  // arena_points count
  const { count: apCount } = await (supabase as any).from('arena_points').select('*', { count: 'exact', head: true });
  console.log('arena_points count:', apCount);
  
  // arena_master_history count
  const { count: mhCount } = await (supabase as any).from('arena_master_history').select('*', { count: 'exact', head: true });
  console.log('arena_master_history count:', mhCount);
}

main().catch(console.error);
