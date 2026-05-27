/**
 * OM-1a: pg-meta 経由での確認
 * Supabase の pg-meta は /rest/v1/rpc ではなく
 * https://{ref}.supabase.co の meta エンドポイントで使える場合がある
 */

const https = require('https');

const SUPABASE_URL = 'https://farieecfyajbtmjxelop.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhcmllZWNmeWFqYnRtanhlbG9wIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjU4MTEyOCwiZXhwIjoyMDkyMTU3MTI4fQ.Mk81v949kAAwvn_Cz0M1d8w_W9-b6f7jZZ-CoKT6Sak';

function fetchJson(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: method || 'GET',
      headers: headers || {}
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

const headers = {
  'apikey': SERVICE_ROLE_KEY,
  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json'
};

async function main() {
  console.log('=== OM-1a: Checking via pg-meta / PostgREST ===\n');

  // Try pg-meta tables endpoint
  const r1 = await fetchJson(
    `${SUPABASE_URL}/rest/v1/rpc/list_my_official_matches`,
    'POST', headers, '{}'
  );
  console.log('[list_my_official_matches] status:', r1.status, 'body:', JSON.stringify(r1.body));

  // Try to query official_matches with count
  const r2 = await fetchJson(
    `${SUPABASE_URL}/rest/v1/official_matches?select=count`,
    'GET',
    { ...headers, 'Prefer': 'count=exact' }
  );
  console.log('[official_matches count] status:', r2.status, 'body:', JSON.stringify(r2.body));

  // Try to get official_matches columns via OPTIONS
  const r3 = await fetchJson(
    `${SUPABASE_URL}/rest/v1/official_matches`,
    'GET',
    { ...headers, 'Accept': 'application/openapi+json' }
  );
  console.log('[official_matches GET] status:', r3.status);
  if (typeof r3.body === 'object' && Array.isArray(r3.body) && r3.body.length > 0) {
    console.log('columns:', Object.keys(r3.body[0]).join(', '));
  } else if (typeof r3.body === 'object' && !Array.isArray(r3.body)) {
    console.log('response:', JSON.stringify(r3.body).substring(0, 200));
  }

  // Try enter_official_match with p_match_id + p_initial_state
  const r4 = await fetchJson(
    `${SUPABASE_URL}/rest/v1/rpc/enter_official_match`,
    'POST', headers,
    JSON.stringify({ p_match_id: '00000000-0000-0000-0000-000000000000', p_initial_state: {} })
  );
  console.log('[enter_official_match(uuid,jsonb)] status:', r4.status, 'body:', JSON.stringify(r4.body));

  // cancel_official_match with p_match_id + p_reason
  const r5 = await fetchJson(
    `${SUPABASE_URL}/rest/v1/rpc/cancel_official_match`,
    'POST', headers,
    JSON.stringify({ p_match_id: '00000000-0000-0000-0000-000000000000', p_reason: 'test' })
  );
  console.log('[cancel_official_match(uuid,text)] status:', r5.status, 'body:', JSON.stringify(r5.body));

  // create_official_match
  const r6 = await fetchJson(
    `${SUPABASE_URL}/rest/v1/rpc/create_official_match`,
    'POST', headers,
    JSON.stringify({
      p_black_user_id: '00000000-0000-0000-0000-000000000001',
      p_white_user_id: '00000000-0000-0000-0000-000000000002',
      p_starts_at: new Date(Date.now() + 3600000).toISOString(),
      p_timer_config: { mode: 'total_time', totalSeconds: 600 }
    })
  );
  console.log('[create_official_match] status:', r6.status, 'body:', JSON.stringify(r6.body));
}

main().catch(console.error);
