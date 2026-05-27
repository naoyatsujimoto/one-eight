const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU4MTEyOCwiZXhwIjoyMDkyMTU3MTI4fQ.Mk81v949kAAwvn_Cz0M1d8w_W9-b6f7jZZ-CoKT6Sak';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('=== Phase 1: RLS Policies + RPC Existence ===\n');

  // --- RLS policies via pg_policies RPC ---
  // service_role can query system catalogs via supabase REST if exposed
  // Try direct query using supabase PostgREST pg_catalog schema
  const r3 = await supabase
    .from('pg_policies')
    .select('policyname, cmd, tablename')
    .eq('tablename', 'official_matches');
  if (r3.error) {
    console.log('[RLS] pg_policies via PostgREST: NG —', r3.error.message);
  } else {
    console.log('[RLS] official_matches policies:', JSON.stringify(r3.data));
  }

  // --- RPC existence: try calling each with invalid args to see if "function not found" ---
  // If the function doesn't exist, we get PGRST202 or similar
  // We can also query information_schema.routines via PostgREST if exposed

  // Try rpc calls that should fail gracefully (non-admin call for create_official_match)
  console.log('\n=== Phase 2: RPC Calls via service_role ===\n');

  // [A] create_official_match: call without is_admin context (service_role bypasses RLS)
  // First, we need profiles with is_admin=false and is_admin=true
  // From phase 1, we have one user: 431a7655-0ddb-466d-b090-3c2131b75bb2 with is_admin=false

  // Get all profiles to find candidates
  const rProfiles = await supabase.from('profiles').select('id, is_admin').limit(10);
  if (rProfiles.error) {
    console.log('[profiles] error:', rProfiles.error.message);
    return;
  }
  console.log('[profiles] all (up to 10):', JSON.stringify(rProfiles.data));

  const nonAdminUser = rProfiles.data.find(p => !p.is_admin);
  const adminUser = rProfiles.data.find(p => p.is_admin);

  console.log('nonAdminUser:', nonAdminUser ? nonAdminUser.id : 'none');
  console.log('adminUser:', adminUser ? adminUser.id : 'none');

  // [B] list_my_official_matches — call as service_role (no auth context, like anon)
  const r_list = await supabase.rpc('list_my_official_matches');
  if (r_list.error) {
    console.log('[list_my_official_matches] error:', r_list.error.message, '| code:', r_list.error.code);
  } else {
    console.log('[list_my_official_matches] result:', JSON.stringify(r_list.data));
  }

  // [C] cancel_official_match — call with no match (expect error but function should exist)
  const r_cancel = await supabase.rpc('cancel_official_match', { p_match_id: '00000000-0000-0000-0000-000000000000' });
  if (r_cancel.error) {
    console.log('[cancel_official_match] error:', r_cancel.error.message, '| code:', r_cancel.error.code);
  } else {
    console.log('[cancel_official_match] result:', JSON.stringify(r_cancel.data));
  }

  // [D] enter_official_match — same
  const r_enter = await supabase.rpc('enter_official_match', { p_match_id: '00000000-0000-0000-0000-000000000000' });
  if (r_enter.error) {
    console.log('[enter_official_match] error:', r_enter.error.message, '| code:', r_enter.error.code);
  } else {
    console.log('[enter_official_match] result:', JSON.stringify(r_enter.data));
  }

  // [E] create_official_match — call as service_role (no auth.uid())
  // Need starts_at, black_user_id, white_user_id, timer_config
  // If no admin user found, skip admin test
  const startsAt = new Date(Date.now() + 3600 * 1000).toISOString(); // now + 1 hour

  if (!nonAdminUser) {
    console.log('[create_official_match non-admin] SKIP: no non-admin user found');
  } else {
    // service_role bypasses RLS, so we simulate by calling with non-admin uid
    // The RPC itself checks auth.uid() + profiles.is_admin — but service_role has no auth.uid()
    // We test by calling without setting auth context
    const r_create_na = await supabase.rpc('create_official_match', {
      p_black_user_id: nonAdminUser.id,
      p_white_user_id: nonAdminUser.id,
      p_starts_at: startsAt,
      p_timer_config: { mode: 'total_time', totalSeconds: 600 }
    });
    if (r_create_na.error) {
      console.log('[create_official_match service_role/no-auth-uid] error:', r_create_na.error.message, '| code:', r_create_na.error.code);
    } else {
      console.log('[create_official_match service_role/no-auth-uid] result:', JSON.stringify(r_create_na.data));
    }
  }
}

main().catch(console.error);
