/**
 * Phase 0 — 本番DB read-only 確認スクリプト
 * SELECT のみ。DDL / DML / RPC は含まない。
 * P-1 〜 P-7 を実施する。
 */
import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) { console.error('env missing'); process.exit(1); }

const sb = createClient(url, key, { auth: { persistSession: false } });

function mask(id: string | null | undefined): string {
  if (!id) return '(null)';
  return id.substring(0, 8) + '...';
}

// Management API経由でSQLを実行する関数
async function execSql(sql: string): Promise<{ rows: any[], error: string | null }> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = 'farieecfyajbtmjxelop';
  if (!token) {
    return { rows: [], error: 'SUPABASE_ACCESS_TOKEN not set — falling back to SDK' };
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const txt = await res.text();
    return { rows: [], error: `HTTP ${res.status}: ${txt.substring(0, 200)}` };
  }
  const data = await res.json();
  return { rows: Array.isArray(data) ? data : (data.rows ?? []), error: null };
}

// SDK経由でinformation_schemaなどを試みる汎用クエリ
async function sdkFrom(table: string, select: string, filters?: Record<string, any>) {
  let q = (sb as any).from(table).select(select);
  if (filters) {
    for (const [k, v] of Object.entries(filters)) {
      q = q.eq(k, v);
    }
  }
  return await q;
}

async function main() {
  console.log('======================================================');
  console.log('Phase 0 — 本番DB read-only 確認');
  console.log('======================================================\n');

  // ====================================================
  // P-1: prize_archive_logs スキーマ実態確認
  // ====================================================
  console.log('==================== P-1: prize_archive_logs ====================');

  // P-1-A: カラム一覧
  console.log('\n--- P-1-A: prize_archive_logs カラム確認 ---');
  const { data: cols, error: colsErr } = await sdkFrom(
    'information_schema.columns',
    'column_name, data_type, is_nullable, ordinal_position',
    { table_schema: 'public', table_name: 'prize_archive_logs' }
  );
  if (colsErr) {
    console.log('SDK information_schema アクセス失敗:', colsErr.message);
    // fallback: 直接 select で存在確認
    const trySelect = await (sb as any).from('prize_archive_logs').select('*').limit(0);
    if (trySelect.error) {
      console.log('prize_archive_logs テーブル自体にアクセス不可:', trySelect.error.message);
    } else {
      console.log('prize_archive_logs にアクセス可能（カラム詳細不明）');
    }
  } else {
    const sorted = (cols || []).sort((a: any, b: any) => a.ordinal_position - b.ordinal_position);
    console.log('カラム一覧:');
    for (const c of sorted) {
      console.log(`  ${c.column_name}: ${c.data_type} (nullable=${c.is_nullable})`);
    }
    // 特定カラムの存在確認
    const colNames = sorted.map((c: any) => c.column_name);
    console.log('\n  確認:');
    console.log(`  event_type 存在: ${colNames.includes('event_type')}`);
    console.log(`  actor_user_id 存在: ${colNames.includes('actor_user_id')}`);
    console.log(`  action 存在: ${colNames.includes('action')}`);
    console.log(`  performed_by_user_id 存在: ${colNames.includes('performed_by_user_id')}`);
  }

  // P-1-B: 件数・event_type distinct
  console.log('\n--- P-1-B: prize_archive_logs 件数 / event_type ---');
  const { count: archiveCount, error: archiveCountErr } = await (sb as any)
    .from('prize_archive_logs').select('*', { count: 'exact', head: true });
  console.log(`  件数: ${archiveCountErr ? 'ERROR: ' + archiveCountErr.message : archiveCount}`);

  // event_typeが存在する場合
  const { data: evTypes, error: evTypesErr } = await (sb as any)
    .from('prize_archive_logs').select('event_type').limit(1000);
  if (evTypesErr) {
    // event_type カラムがない可能性
    console.log(`  event_type SELECT: ${evTypesErr.message}`);
    // action カラムを試す
    const { data: actData, error: actErr } = await (sb as any)
      .from('prize_archive_logs').select('action').limit(1000);
    if (actErr) {
      console.log(`  action SELECT: ${actErr.message}`);
    } else {
      const actTypes = [...new Set((actData || []).map((r: any) => r.action))].sort();
      console.log(`  action distinct: ${JSON.stringify(actTypes)}`);
    }
  } else {
    const et = [...new Set((evTypes || []).map((r: any) => r.event_type))].sort();
    console.log(`  event_type distinct: ${JSON.stringify(et)}`);
  }

  // P-1-C: RPC定義確認（pg_proc）
  console.log('\n--- P-1-C: admin_* payout/archive RPC定義確認 ---');
  const rpcNames = [
    'admin_prepare_payout',
    'admin_mark_payout_paid',
    'admin_mark_payout_failed',
    'admin_cancel_payout',
    'admin_retry_payout',
    'admin_mark_prize_submission_archived'
  ];

  // SDK経由でpg_procを試みる
  const { data: pgProcData, error: pgProcErr } = await (sb as any)
    .from('pg_catalog.pg_proc')
    .select('proname, prosrc')
    .in('proname', rpcNames);

  if (pgProcErr) {
    console.log('pg_catalog.pg_proc SDK アクセス失敗:', pgProcErr.message);
    // fallback: 各RPCをrpc()で呼ぶと存在確認できるが、実行はNG
    // migrationファイルから定義を確認する代替
    console.log('migration ファイルから関数定義を確認します...');

    // 最新のmigrationでこれらの関数が定義されているか確認
    const { execSync } = await import('child_process');
    try {
      const result = execSync(
        `grep -rn "admin_prepare_payout\\|admin_mark_payout_paid\\|admin_mark_payout_failed\\|admin_cancel_payout\\|admin_retry_payout\\|admin_mark_prize_submission_archived" /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/ | grep "CREATE\\|INSERT INTO prize_archive_logs" | head -50`,
        { encoding: 'utf8' }
      );
      console.log(result.substring(0, 3000));
    } catch (e) {
      console.log('migration grep 失敗:', e);
    }
  } else {
    for (const proc of (pgProcData || [])) {
      const src: string = proc.prosrc || '';
      // INSERT INTO prize_archive_logs の抜粋
      const insertMatch = src.match(/INSERT INTO prize_archive_logs[^;]+;/);
      console.log(`\n  ${proc.proname}:`);
      if (insertMatch) {
        console.log(`    INSERT: ${insertMatch[0].substring(0, 300)}`);
      } else {
        console.log('    prize_archive_logs INSERT なし (またはパターン不一致)');
      }
    }
  }

  // ====================================================
  // P-2: arena_events 重複・UNIQUE制約確認
  // ====================================================
  console.log('\n==================== P-2: arena_events ====================');

  // P-2-A: 重複確認
  console.log('\n--- P-2-A: (arena_id, scheduled_at) 重複確認 ---');
  // group by は SDK では直接できないので、全件取得してJS側で集計
  const { data: allEvents, error: allEventsErr } = await (sb as any)
    .from('arena_events')
    .select('id, arena_id, scheduled_at, status, created_at')
    .order('created_at', { ascending: false });

  if (allEventsErr) {
    console.log('arena_events SELECT 失敗:', allEventsErr.message);
  } else {
    const grouped: Record<string, any[]> = {};
    for (const ev of (allEvents || [])) {
      const key = `${ev.arena_id}__${ev.scheduled_at}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(ev);
    }
    const dups = Object.entries(grouped).filter(([_, rows]) => rows.length > 1);
    console.log(`  重複 (arena_id, scheduled_at): ${dups.length} 件`);
    if (dups.length > 0) {
      for (const [key, rows] of dups.slice(0, 10)) {
        const [aId, sAt] = key.split('__');
        console.log(`    arena_id=${mask(aId)} scheduled_at=${sAt} count=${rows.length} statuses=${rows.map((r: any) => r.status).join(',')}`);
        console.log(`      row_ids: ${rows.map((r: any) => mask(r.id)).join(', ')}`);
      }
    }
  }

  // P-2-B: status分布
  console.log('\n--- P-2-B: arena_events status分布 ---');
  if (!allEventsErr && allEvents) {
    const statusCount: Record<string, number> = {};
    for (const ev of allEvents) {
      statusCount[ev.status] = (statusCount[ev.status] || 0) + 1;
    }
    for (const [s, c] of Object.entries(statusCount).sort()) {
      console.log(`  ${s}: ${c}`);
    }
  }

  // P-2-C: UNIQUE制約確認
  console.log('\n--- P-2-C: arena_events UNIQUE制約確認 ---');
  const { data: constData, error: constErr } = await sdkFrom(
    'information_schema.table_constraints',
    'constraint_name, constraint_type',
    { table_schema: 'public', table_name: 'arena_events' }
  );
  if (constErr) {
    console.log('information_schema.table_constraints SDK アクセス失敗:', constErr.message);
    // migrationから確認
    const { execSync } = await import('child_process');
    try {
      const result = execSync(
        `grep -n "UNIQUE\\|unique" /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/*arena_events* 2>/dev/null || grep -rn "arena_events.*UNIQUE\\|UNIQUE.*arena_events" /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/ | head -20`,
        { encoding: 'utf8' }
      );
      console.log('  migration内 UNIQUE確認:\n' + result.substring(0, 1000));
    } catch (e: any) {
      console.log('  migration grep: ' + e.message);
    }
  } else {
    const uniqueConstraints = (constData || []).filter((c: any) => c.constraint_type === 'UNIQUE');
    console.log(`  UNIQUE制約数: ${uniqueConstraints.length}`);
    for (const c of uniqueConstraints) {
      console.log(`    ${c.constraint_name}`);
    }
    // (arena_id, scheduled_at) のUNIQUE制約があるか
    const hasTargetUnique = (constData || []).some((c: any) =>
      c.constraint_name.includes('arena_id') && c.constraint_name.includes('scheduled_at')
    );
    console.log(`  (arena_id, scheduled_at) UNIQUE制約: ${hasTargetUnique ? 'あり' : 'なし（要確認）'}`);
  }

  // ====================================================
  // P-3: prize_awards 重複・admin_messages漏れ確認
  // ====================================================
  console.log('\n==================== P-3: prize_awards ====================');

  // P-3-A: status分布
  console.log('\n--- P-3-A: prize_awards status分布 ---');
  const { data: awards, error: awardsErr } = await (sb as any)
    .from('prize_awards')
    .select('id, source_kind, source_arena_event_id, source_arena_match_id, recipient_user_id, status, created_at')
    .order('created_at', { ascending: false });

  if (awardsErr) {
    console.log('prize_awards SELECT 失敗:', awardsErr.message);
  } else {
    // status分布
    const skMap: Record<string, Record<string, number>> = {};
    for (const a of (awards || [])) {
      if (!skMap[a.source_kind]) skMap[a.source_kind] = {};
      skMap[a.source_kind][a.status] = (skMap[a.source_kind][a.status] || 0) + 1;
    }
    for (const [sk, statuses] of Object.entries(skMap)) {
      for (const [st, c] of Object.entries(statuses as Record<string, number>).sort()) {
        console.log(`  source_kind=${sk} status=${st}: ${c}`);
      }
    }

    // P-3-B: 重複確認
    console.log('\n--- P-3-B: prize_awards (arena_master) 重複確認 ---');
    const arenaMasterAwards = (awards || []).filter((a: any) => a.source_kind === 'arena_master');
    const awardGrouped: Record<string, any[]> = {};
    for (const a of arenaMasterAwards) {
      const key = `${a.source_arena_event_id}__${a.source_arena_match_id}__${a.recipient_user_id}`;
      if (!awardGrouped[key]) awardGrouped[key] = [];
      awardGrouped[key].push(a);
    }
    const awardDups = Object.entries(awardGrouped).filter(([_, rows]) => rows.length > 1);
    console.log(`  arena_master award 重複: ${awardDups.length} 件`);
    if (awardDups.length > 0) {
      for (const [key, rows] of awardDups.slice(0, 5)) {
        console.log(`    count=${rows.length} statuses=${rows.map((r: any) => r.status).join(',')} award_ids=${rows.map((r: any) => mask(r.id)).join(',')}`);
      }
    }

    // P-3-C: admin_messages漏れ確認
    console.log('\n--- P-3-C: arena_master award → admin_messages 漏れ確認 ---');
    const arenaMasterAwardIds = arenaMasterAwards.map((a: any) => a.id);
    if (arenaMasterAwardIds.length === 0) {
      console.log('  arena_master award 件数: 0 (確認不要)');
    } else {
      const { data: msgs, error: msgsErr } = await (sb as any)
        .from('admin_messages')
        .select('id, source_id')
        .in('source_id', arenaMasterAwardIds.slice(0, 200).map((id: string) => id)); // 最大200件

      if (msgsErr) {
        console.log('  admin_messages SELECT 失敗:', msgsErr.message);
      } else {
        const msgSourceIds = new Set((msgs || []).map((m: any) => m.source_id));
        const missing = arenaMasterAwards.filter((a: any) => !msgSourceIds.has(a.id));
        console.log(`  arena_master award 総数: ${arenaMasterAwards.length}`);
        console.log(`  admin_messages 紐づき: ${msgSourceIds.size}`);
        console.log(`  admin_messages 漏れ: ${missing.length} 件`);
        if (missing.length > 0 && missing.length <= 10) {
          for (const m of missing) {
            console.log(`    award_id=${mask(m.id)} status=${m.status} created_at=${m.created_at}`);
          }
        }
      }
    }
  }

  // ====================================================
  // P-4: Arena結果未処理・サイレント失敗確認
  // ====================================================
  console.log('\n==================== P-4: Arena結果処理確認 ====================');

  // P-4-A: completed official_match + arena_match未処理
  console.log('\n--- P-4-A: arena_matches 未処理 (processed_at IS NULL) 確認 ---');
  const { data: arenaMatches, error: amErr } = await (sb as any)
    .from('arena_matches')
    .select('id, arena_event_id, status, processed_at, official_match_id')
    .is('processed_at', null);

  if (amErr) {
    console.log('arena_matches SELECT 失敗:', amErr.message);
  } else {
    const unprocessed = arenaMatches || [];
    console.log(`  processed_at IS NULL の arena_matches: ${unprocessed.length} 件`);

    if (unprocessed.length > 0) {
      // 対応するofficial_matchのstatus確認
      const omIds = unprocessed.map((m: any) => m.official_match_id).filter(Boolean);
      if (omIds.length > 0) {
        const { data: oms, error: omsErr } = await (sb as any)
          .from('official_matches')
          .select('id, status, source_kind, finished_at, ends_at')
          .in('id', omIds.slice(0, 100))
          .eq('source_kind', 'arena')
          .in('status', ['completed', 'no_contest', 'cancelled', 'forfeited']);

        if (omsErr) {
          console.log('official_matches SELECT 失敗:', omsErr.message);
        } else {
          console.log(`  うち arena official_match が completed/no_contest/cancelled/forfeited: ${(oms || []).length} 件`);
          if ((oms || []).length > 0) {
            for (const om of (oms || []).slice(0, 10)) {
              const am = unprocessed.find((m: any) => m.official_match_id === om.id);
              console.log(`    arena_match_id=${mask(am?.id)} om_status=${om.status} end_reason=${(om as any).end_reason ?? 'null'} finished_at=${om.finished_at ?? om.ends_at}`);
            }
          }
        }
      }
    }
  }

  // P-4-B: active official master重複確認
  console.log('\n--- P-4-B: active official master 重複確認 ---');
  const { data: masterHistory, error: mhErr } = await (sb as any)
    .from('arena_master_history')
    .select('id, arena_id, user_id, season, status, dethroned_at')
    .eq('status', 'official')
    .is('dethroned_at', null);

  if (mhErr) {
    console.log('arena_master_history SELECT 失敗:', mhErr.message);
  } else {
    const mhGrouped: Record<string, any[]> = {};
    for (const mh of (masterHistory || [])) {
      const key = `${mh.arena_id}__${mh.season}`;
      if (!mhGrouped[key]) mhGrouped[key] = [];
      mhGrouped[key].push(mh);
    }
    const mhDups = Object.entries(mhGrouped).filter(([_, rows]) => rows.length > 1);
    console.log(`  active official master 件数: ${(masterHistory || []).length}`);
    console.log(`  (arena_id, season) 重複: ${mhDups.length} 件`);
    if (mhDups.length > 0) {
      for (const [key, rows] of mhDups) {
        console.log(`    ${key} count=${rows.length}`);
      }
    }
  }

  // P-4-C: cron jobs (直接DBからはアクセスできない可能性が高い)
  console.log('\n--- P-4-C: cron job 確認 (SDK試行) ---');
  const { data: cronJobs, error: cronErr } = await (sb as any)
    .from('cron.job')
    .select('jobid, jobname, schedule, active')
    .ilike('jobname', '%arena%');
  if (cronErr) {
    console.log(`  cron.job SDK アクセス失敗 (想定内): ${cronErr.message}`);
  } else {
    console.log(`  arena cron jobs: ${(cronJobs || []).length} 件`);
    for (const j of (cronJobs || [])) {
      console.log(`    ${j.jobname}: schedule=${j.schedule} active=${j.active}`);
    }
  }

  // ====================================================
  // P-5: Paddle / Pro 状態整合確認
  // ====================================================
  console.log('\n==================== P-5: Paddle / Pro ====================');

  // P-5-A: expired pro
  console.log('\n--- P-5-A: 期限切れ Pro 確認 ---');
  const { data: expiredPros, error: epErr } = await (sb as any)
    .from('profiles')
    .select('id, plan, subscription_status, is_test_account')
    .eq('plan', 'pro')
    .not('current_period_end', 'is', null)
    .lt('current_period_end', new Date().toISOString());

  if (epErr) {
    console.log('profiles SELECT (expired pro) 失敗:', epErr.message);
  } else {
    console.log(`  期限切れ Pro: ${(expiredPros || []).length} 件`);
    if ((expiredPros || []).length > 0) {
      for (const p of (expiredPros || []).slice(0, 5)) {
        console.log(`    id=${mask(p.id)} plan=${p.plan} subscription_status=${p.subscription_status} is_test=${p.is_test_account}`);
      }
    }
  }

  // P-5-B: plan/subscription_status分布
  console.log('\n--- P-5-B: plan/subscription_status 分布 ---');
  const { data: profiles, error: profErr } = await (sb as any)
    .from('profiles')
    .select('plan, subscription_status')
    .limit(10000);

  if (profErr) {
    console.log('profiles SELECT 失敗:', profErr.message);
  } else {
    const dist: Record<string, number> = {};
    for (const p of (profiles || [])) {
      const key = `plan=${p.plan || 'null'} subscription_status=${p.subscription_status || 'null'}`;
      dist[key] = (dist[key] || 0) + 1;
    }
    for (const [k, v] of Object.entries(dist).sort()) {
      console.log(`  ${k}: ${v}`);
    }
  }

  // P-5-C: paddle_subscription_id重複
  console.log('\n--- P-5-C: paddle_subscription_id 重複確認 ---');
  const { data: subIdData, error: subErr } = await (sb as any)
    .from('profiles')
    .select('paddle_subscription_id')
    .not('paddle_subscription_id', 'is', null)
    .limit(10000);

  if (subErr) {
    console.log('profiles SELECT (paddle_subscription_id) 失敗:', subErr.message);
  } else {
    const subIdCount: Record<string, number> = {};
    for (const p of (subIdData || [])) {
      subIdCount[p.paddle_subscription_id] = (subIdCount[p.paddle_subscription_id] || 0) + 1;
    }
    const dups = Object.entries(subIdCount).filter(([_, c]) => c > 1);
    console.log(`  paddle_subscription_id 重複: ${dups.length} 件`);
    if (dups.length > 0) {
      for (const [id, c] of dups.slice(0, 5)) {
        console.log(`    ${id.substring(0, 20)}... count=${c}`);
      }
    }
  }

  // P-5-D: info@tentomushi.co.jp の Pro化確認
  console.log('\n--- P-5-D: info@tentomushi.co.jp Pro化確認 ---');
  const { data: testUser, error: tuErr } = await (sb as any)
    .from('profiles')
    .select('id, plan, subscription_status, is_test_account')
    .eq('email', 'info@tentomushi.co.jp')
    .limit(1);

  if (tuErr) {
    console.log('profiles SELECT (email) 失敗:', tuErr.message);
  } else if (!testUser || testUser.length === 0) {
    console.log('  info@tentomushi.co.jp: レコードなし');
  } else {
    const u = testUser[0];
    console.log(`  info@tentomushi.co.jp: plan=${u.plan} subscription_status=${u.subscription_status} is_test=${u.is_test_account}`);
    console.log(`  Pro化: ${u.plan === 'pro' ? '⚠️ Pro化されている' : '✅ Pro化されていない'}`);
  }

  // P-5-E: paddle_webhook_events event_id重複
  console.log('\n--- P-5-E: paddle_webhook_events event_id 重複確認 ---');
  const { data: webhookData, error: webhookErr } = await (sb as any)
    .from('paddle_webhook_events')
    .select('event_id')
    .limit(10000);

  if (webhookErr) {
    console.log('paddle_webhook_events SELECT 失敗:', webhookErr.message);
  } else {
    const eventIdCount: Record<string, number> = {};
    for (const w of (webhookData || [])) {
      eventIdCount[w.event_id] = (eventIdCount[w.event_id] || 0) + 1;
    }
    const dups = Object.entries(eventIdCount).filter(([_, c]) => c > 1);
    console.log(`  paddle_webhook_events 総数: ${(webhookData || []).length}`);
    console.log(`  event_id 重複: ${dups.length} 件`);
  }

  // ====================================================
  // P-6: Security / RLS / EXECUTE / search_path確認
  // ====================================================
  console.log('\n==================== P-6: Security ====================');

  // P-6-A: RLS無効テーブル確認
  console.log('\n--- P-6-A: RLS無効テーブル確認 ---');
  const { data: rlsData, error: rlsErr } = await sdkFrom(
    'information_schema.tables',
    'table_name',
    { table_schema: 'public', table_type: 'BASE TABLE' }
  );

  if (rlsErr) {
    console.log('information_schema.tables SDK アクセス失敗:', rlsErr.message);
    // migrationから推測
    const { execSync } = await import('child_process');
    try {
      const result = execSync(
        `grep -rn "DISABLE ROW LEVEL\\|ALTER TABLE.*DISABLE" /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/ | head -20`,
        { encoding: 'utf8' }
      );
      console.log('  RLS DISABLE migration確認:\n' + (result || '(なし)'));
    } catch {}
  } else {
    console.log(`  public テーブル総数: ${(rlsData || []).length}`);
    console.log('  ※RLS実態はpg_classアクセスが必要、SDK経由では直接確認不可');
    // 特定の機微テーブルへの直接RLS確認のため、RLSポリシー確認
    const { data: rlsPolicies, error: rlsPoliciesErr } = await sdkFrom(
      'pg_catalog.pg_policies',
      'tablename, policyname',
      {}
    );
    if (rlsPoliciesErr) {
      console.log('  pg_catalog.pg_policies アクセス失敗:', rlsPoliciesErr.message);
    } else {
      const policyTables = new Set((rlsPolicies || []).map((p: any) => p.tablename));
      console.log(`  RLSポリシーが存在するテーブル数: ${policyTables.size}`);
    }
  }

  // P-6-B: 機微テーブルgrant確認
  console.log('\n--- P-6-B: 機微テーブルgrant確認 ---');
  const sensitiveTablesArr = [
    'prize_temp_tax_submissions',
    'prize_payouts',
    'prize_archive_logs',
    'paddle_webhook_events',
    'paddle_webhook_audit_log',
    'admin_messages'
  ];

  const { data: grantData, error: grantErr } = await (sb as any)
    .from('information_schema.role_table_grants')
    .select('table_name, grantee, privilege_type')
    .in('table_name', sensitiveTablesArr)
    .eq('table_schema', 'public')
    .in('grantee', ['anon', 'authenticated']);

  if (grantErr) {
    console.log('information_schema.role_table_grants SDK アクセス失敗:', grantErr.message);
  } else {
    const dangerous = (grantData || []);
    console.log(`  anon/authenticated 直接grant件数: ${dangerous.length}`);
    if (dangerous.length > 0) {
      for (const g of dangerous) {
        console.log(`  ⚠️ ${g.table_name}: grantee=${g.grantee} privilege=${g.privilege_type}`);
      }
    } else {
      console.log('  ✅ anon/authenticated 直接grant: なし');
    }
  }

  // P-6-C: anon実行可能SECURITY DEFINER関数 (migrationから推測)
  console.log('\n--- P-6-C: anon EXECUTABLE SECURITY DEFINER確認 (migration参照) ---');
  {
    const { execSync } = await import('child_process');
    try {
      // 最新migrationでの anon EXECUTE GRANT
      const result = execSync(
        `grep -rn "GRANT.*EXECUTE.*anon\\|REVOKE.*anon" /Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations/ | tail -30`,
        { encoding: 'utf8' }
      );
      console.log('  最新 GRANT/REVOKE anon 確認:\n' + result.substring(0, 2000));
    } catch (e: any) {
      console.log('  migration grep 失敗:', e.message);
    }
  }

  // ====================================================
  // P-7: admin_messages read_by 型・実態確認
  // ====================================================
  console.log('\n==================== P-7: admin_messages ====================');

  // P-7-A: read_by 型確認
  console.log('\n--- P-7-A: read_by カラム型確認 ---');
  const { data: colReadBy, error: rbErr } = await (sb as any)
    .from('information_schema.columns')
    .select('column_name, data_type, udt_name, is_nullable')
    .eq('table_schema', 'public')
    .eq('table_name', 'admin_messages')
    .eq('column_name', 'read_by');

  if (rbErr) {
    console.log('information_schema.columns SDK アクセス失敗:', rbErr.message);
    // 直接select試み
    const { data: rbDirect, error: rbDirectErr } = await (sb as any)
      .from('admin_messages')
      .select('read_by')
      .limit(1);
    if (rbDirectErr) {
      console.log('  admin_messages.read_by SELECT 失敗:', rbDirectErr.message);
    } else {
      const sample = rbDirect?.[0]?.read_by;
      console.log(`  read_by サンプル型: ${Array.isArray(sample) ? 'array' : typeof sample} 値例: ${JSON.stringify(sample)?.substring(0, 50)}`);
    }
  } else {
    for (const c of (colReadBy || [])) {
      console.log(`  read_by: data_type=${c.data_type} udt_name=${c.udt_name} nullable=${c.is_nullable}`);
    }
  }

  // P-7-B: 直近 source_id 付き admin_messages
  console.log('\n--- P-7-B: 直近 source_id 付き admin_messages (最大20件) ---');
  const { data: recentMsgs, error: rmErr } = await (sb as any)
    .from('admin_messages')
    .select('id, source_id, target, read_by, created_at')
    .not('source_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (rmErr) {
    console.log('admin_messages SELECT 失敗:', rmErr.message);
  } else {
    console.log(`  件数: ${(recentMsgs || []).length}`);
    let anomaly = 0;
    for (const m of (recentMsgs || [])) {
      const rb = m.read_by;
      const rbOk = Array.isArray(rb) || rb === null;
      if (!rbOk) anomaly++;
      console.log(`  id=${mask(m.id)} source_id=${mask(m.source_id)} target=${m.target} read_count=${Array.isArray(rb) ? rb.length : 'N/A'} read_by_type=${Array.isArray(rb) ? 'array' : typeof rb} created=${m.created_at}`);
    }
    if (anomaly > 0) {
      console.log(`  ⚠️ read_by 型異常: ${anomaly} 件`);
    } else {
      console.log('  ✅ read_by 型: 全件 array または null（正常）');
    }
  }

  console.log('\n======================================================');
  console.log('Phase 0 確認完了');
  console.log('実施内容: SELECT のみ');
  console.log('DB変更: なし');
  console.log('RPC実行: なし');
  console.log('Prize/Payout/PayPal操作: なし');
  console.log('migration作成: なし');
  console.log('======================================================');
}

main().catch(console.error);
