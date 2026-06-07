import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || 'https://farieecfyajbtmjxelop.supabase.co';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // Check RPC with minimal data
  const { data, error } = await supabase.rpc('process_arena_results' as any);
  console.log('RPC result:', JSON.stringify(data));
  console.log('RPC error:', error);
  
  // Check function definition via system catalog (using a workaround)
  const { data: d2, error: e2 } = await (supabase as any)
    .from('arena_points')
    .select('points')
    .limit(0);
  console.log('arena_points query test:', e2?.message ?? 'OK');
}

main().catch(console.error);
