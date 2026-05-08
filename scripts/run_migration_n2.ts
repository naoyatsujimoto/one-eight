import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const sb = createClient(url, key);

const sql = `
CREATE OR REPLACE FUNCTION get_position_win_rates(
  hashes     TEXT[],
  mode_group TEXT DEFAULT 'all'
)
RETURNS TABLE (
  canonical_hash TEXT,
  wins_black     INTEGER,
  wins_white     INTEGER,
  draws          INTEGER,
  total          INTEGER,
  win_rate_black NUMERIC,
  win_rate_white NUMERIC,
  confidence     TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ps.canonical_hash,
    ps.wins_black,
    ps.wins_white,
    ps.draws,
    ps.total,
    CASE WHEN ps.total > 0
      THEN ROUND((ps.wins_black::NUMERIC / ps.total) * 100, 2)
      ELSE NULL
    END AS win_rate_black,
    CASE WHEN ps.total > 0
      THEN ROUND((ps.wins_white::NUMERIC / ps.total) * 100, 2)
      ELSE NULL
    END AS win_rate_white,
    CASE
      WHEN ps.total < 5  THEN 'hidden'
      WHEN ps.total < 30 THEN 'reference'
      ELSE                    'main'
    END AS confidence
  FROM position_stats ps
  WHERE ps.canonical_hash = ANY(hashes)
    AND ps.mode_group = get_position_win_rates.mode_group;
$$;
`;

const { error } = await sb.rpc('query' as never, { query: sql }).throwOnError().then(() => ({ error: null })).catch((e: Error) => ({ error: e }));

// rpc経由では DDL 実行不可のため、pg REST経由で実行
const res = await fetch(`${url}/rest/v1/rpc/query`, {
  method: 'POST',
  headers: {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

if (!res.ok) {
  // Supabase REST API では DDL は直接実行できないため、postgres-meta を使う
  const metaRes = await fetch(`${url.replace('supabase.co', 'supabase.co')}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  console.log('meta status:', metaRes.status);
  console.log(await metaRes.text());
} else {
  console.log('success');
}
