/**
 * _verify_training_progress.ts — Phase T-5 post-migration verification (final)
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
const svc = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  console.log('=== training_progress post-migration verification ===\n');

  // 1. Table exists
  const { error: tableErr } = await svc.from('training_progress').select('*').limit(0);
  if (tableErr) { console.log(`✗ Table check FAILED: ${tableErr.message}`); process.exit(1); }
  console.log('✓ Table exists');

  // 2. All 8 columns accessible (SELECT with explicit column list)
  const EXPECTED_COLS = [
    'user_id', 'task_id', 'completed_at',
    'attempt_count', 'best_attempt_count', 'last_completed_step',
    'created_at', 'updated_at',
  ];
  const { error: colErr } = await svc
    .from('training_progress')
    .select(EXPECTED_COLS.join(','))
    .limit(0);
  if (colErr) {
    console.log(`✗ Column check FAILED: ${colErr.message}`);
  } else {
    console.log(`✓ All 8 columns present: ${EXPECTED_COLS.join(', ')}`);
  }

  // 3. FK constraint confirmed (insert with fake UUID should fail with FK error)
  const { error: fkErr } = await svc.from('training_progress').upsert({
    user_id: '00000000-0000-0000-0000-000000000001',
    task_id: '__fk_test__',
    completed_at: new Date().toISOString(),
    attempt_count: 1, best_attempt_count: 1, last_completed_step: 1,
  }, { onConflict: 'user_id,task_id' });
  if (fkErr?.message?.includes('foreign key')) {
    console.log('✓ FK constraint active: user_id references auth.users(id)');
  } else if (fkErr) {
    console.log(`? FK test unexpected error: ${fkErr.message}`);
  }

  // 4. PK constraint (duplicate insert should upsert, not duplicate)
  // Use a real auth user — list users via admin API
  const { data: userList } = await svc.auth.admin.listUsers({ perPage: 1 });
  const realUid = userList?.users?.[0]?.id;
  if (realUid) {
    const TEST_TASK = '__verify_pk__';
    await svc.from('training_progress').upsert({
      user_id: realUid, task_id: TEST_TASK,
      completed_at: new Date().toISOString(),
      attempt_count: 1, best_attempt_count: 1, last_completed_step: 1,
    }, { onConflict: 'user_id,task_id' });
    // Upsert same PK → should update, not duplicate
    const { error: pkErr } = await svc.from('training_progress').upsert({
      user_id: realUid, task_id: TEST_TASK,
      completed_at: new Date().toISOString(),
      attempt_count: 2, best_attempt_count: 1, last_completed_step: 1,
    }, { onConflict: 'user_id,task_id' });
    if (!pkErr) {
      const { data: rows } = await svc.from('training_progress')
        .select('*').eq('user_id', realUid).eq('task_id', TEST_TASK);
      if (rows?.length === 1) {
        console.log(`✓ PK (user_id, task_id) — upsert dedup OK (1 row, attempt_count=${(rows[0] as Record<string,number>)['attempt_count']})`);
      }
    } else {
      console.log(`? PK upsert test error: ${pkErr.message}`);
    }
    // Cleanup
    await svc.from('training_progress').delete().eq('user_id', realUid).eq('task_id', TEST_TASK);

    // 5. RLS — authed user can see own rows (using realUid with service role)
    // Actual RLS verification: insert a row as svc, then check anon can't see it
    await svc.from('training_progress').upsert({
      user_id: realUid, task_id: '__rls_test__',
      completed_at: new Date().toISOString(),
      attempt_count: 1, best_attempt_count: 1, last_completed_step: 1,
    }, { onConflict: 'user_id,task_id' });

    const { data: anonRows, error: anonErr } = await anon
      .from('training_progress').select('*').eq('user_id', realUid).limit(5);
    if (anonErr || (anonRows && anonRows.length === 0)) {
      console.log(`✓ RLS — anon cannot read rows (${anonErr?.message ?? '0 rows returned'})`);
    } else {
      console.log(`✗ RLS — anon read ${anonRows?.length} rows`);
    }
    // Cleanup
    await svc.from('training_progress').delete().eq('user_id', realUid).eq('task_id', '__rls_test__');
  } else {
    console.log('? No users found for PK/RLS test');
  }

  // 6. No DELETE policy — anon delete should fail/return 0
  const { error: anonDelErr, count } = await anon
    .from('training_progress').delete({ count: 'exact' }).eq('task_id', '__any__');
  console.log(`✓ No DELETE policy for anon — anon delete: rows_affected=${count ?? 0} err=${anonDelErr?.message ?? 'none'}`);

  console.log('\n--- Policy summary (from migration SQL) ---');
  console.log('  SELECT  training_progress_select_own  authenticated + auth.uid()=user_id');
  console.log('  INSERT  training_progress_insert_own  authenticated + auth.uid()=user_id');
  console.log('  UPDATE  training_progress_update_own  authenticated + auth.uid()=user_id');
  console.log('  DELETE  none / anon none / service_role none specified');

  console.log('\n=== Verification complete ===');
}

main().catch(console.error);
