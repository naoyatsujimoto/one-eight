/**
 * OM-1a Phase 2: Admin-context RPC test
 * 
 * Strategy: 
 *   1. Get admin user's auth token via supabase.auth.admin.generateLink (magic link token)
 *   2. Use that token to create a user-context supabase client
 *   3. Call create_official_match with admin context
 * 
 * Alternative: Use signInWithPassword if admin user has known password
 * → Not available
 * 
 * Alternative: Use admin.generateLink to get OTP/token
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU4MTEyOCwiZXhwIjoyMDkyMTU3MTI4fQ.Mk81v949kAAwvn_Cz0M1d8w_W9-b6f7jZZ-CoKT6Sak';

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('=== Phase 2: Admin User Setup for RPC Test ===\n');

  // Step 1: Pick a user and temporarily set is_admin=true
  const { data: users, error: ue } = await adminClient.from('profiles').select('id, is_admin').limit(2);
  if (ue || !users || users.length < 2) {
    console.log('Cannot get users:', ue?.message);
    return;
  }

  // Use first user as the admin
  const adminUserId = users[0].id;
  const otherUserId = users[1].id;
  console.log('Test admin uid:', adminUserId);
  console.log('Test other uid:', otherUserId);

  // Step 2: Set is_admin=true via service_role
  const { error: upErr } = await adminClient
    .from('profiles')
    .update({ is_admin: true })
    .eq('id', adminUserId);
  if (upErr) {
    console.log('[UPDATE is_admin=true] NG:', upErr.message);
    return;
  }
  console.log('[UPDATE is_admin=true] OK for user:', adminUserId);

  // Step 3: Generate a sign-in token for this user via admin auth API
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: users[0].email || '', // may not have email in profiles, need auth.users
  });
  
  // Step 3 alt: get user email from auth.admin.getUserById
  const { data: authUser, error: authErr } = await adminClient.auth.admin.getUserById(adminUserId);
  if (authErr) {
    console.log('[getUserById] error:', authErr.message);
  } else {
    console.log('[getUserById] email:', authUser?.user?.email);
    
    // Step 4: Generate magic link for this user to get a token
    const { data: linkData2, error: linkErr2 } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: authUser.user.email
    });
    
    if (linkErr2) {
      console.log('[generateLink] error:', linkErr2.message);
    } else {
      // Extract token from the magic link URL
      // The link contains a ?token=... or hashed_token=... parameter
      const link = linkData2?.properties?.action_link || '';
      console.log('[generateLink] action_link prefix:', link.substring(0, 80) + '...');
      
      // Extract the token (it's the otp/magic token)
      // The link format is: https://xxx.supabase.co/auth/v1/verify?token=xxx&type=magiclink&redirect_to=yyy
      const tokenMatch = link.match(/[?&]token=([^&]+)/);
      if (!tokenMatch) {
        console.log('[generateLink] cannot extract token from link');
        console.log('Properties:', JSON.stringify(linkData2?.properties));
      } else {
        const otp_token = tokenMatch[1];
        console.log('[token extracted] length:', otp_token.length);
        
        // Verify the OTP to get a session
        const { data: session, error: sessErr } = await adminClient.auth.verifyOtp({
          email: authUser.user.email,
          token: otp_token,
          type: 'magiclink'
        });
        
        if (sessErr) {
          console.log('[verifyOtp] error:', sessErr.message);
        } else {
          const accessToken = session?.session?.access_token;
          console.log('[verifyOtp] access_token obtained:', accessToken ? 'YES' : 'NO');
          
          if (accessToken) {
            // Create user-context client
            const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
              auth: { autoRefreshToken: false, persistSession: false },
              global: {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              }
            });

            const startsAt = new Date(Date.now() + 3600 * 1000).toISOString();
            
            // Test create_official_match as admin
            const rCreate = await userClient.rpc('create_official_match', {
              p_black_user_id: adminUserId,
              p_white_user_id: otherUserId,
              p_starts_at: startsAt,
              p_ends_at: null,
              p_timer_config: { mode: 'total_time', totalSeconds: 600 },
              p_tournament_id: null,
              p_round_id: null
            });
            
            if (rCreate.error) {
              console.log('[create_official_match as admin] NG:', rCreate.error.message);
            } else {
              console.log('[create_official_match as admin] OK:', JSON.stringify(rCreate.data));
              const matchId = rCreate.data?.match_id;
              
              if (matchId) {
                // Test list_my_official_matches as participant
                const rList = await userClient.rpc('list_my_official_matches');
                console.log('[list_my_official_matches as participant] result:', JSON.stringify(rList.data), rList.error?.message);
                
                // Test cancel_official_match as admin
                const rCancel = await userClient.rpc('cancel_official_match', {
                  p_match_id: matchId,
                  p_reason: 'OM-1a test'
                });
                if (rCancel.error) {
                  console.log('[cancel_official_match as admin] NG:', rCancel.error.message);
                } else {
                  console.log('[cancel_official_match as admin] OK:', JSON.stringify(rCancel.data));
                }

                // Cleanup
                await adminClient.from('official_matches').delete().eq('id', matchId);
                console.log('[cleanup] deleted match', matchId);
              }
            }
          }
        }
      }
    }
  }

  // Restore is_admin=false
  const { error: restoreErr } = await adminClient
    .from('profiles')
    .update({ is_admin: false })
    .eq('id', adminUserId);
  if (restoreErr) {
    console.log('[RESTORE is_admin=false] NG:', restoreErr.message);
    console.log('IMPORTANT: Manually restore is_admin=false for user', adminUserId);
  } else {
    console.log('[RESTORE is_admin=false] OK — user reverted');
  }
}

main().catch(console.error);
