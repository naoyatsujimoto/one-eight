import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('=== process_arena_results RPC テスト ===');
  
  // RPC呼び出し
  const r = await supabase.rpc('process_arena_results');
  console.log('RPC result:', JSON.stringify(r, null, 2));
  
  // results_processed_at 列確認（REST API経由では難しいのでRPC経由で）
}

main().catch(console.error);
