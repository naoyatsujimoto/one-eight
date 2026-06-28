/**
 * arena_events 重複調査 — read-only
 * SELECT のみ。DDL / DML / RPC 実行なし。
 */
import { readFileSync } from 'fs';
try {
  const lines = readFileSync('/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/.env', 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('='); if (idx < 0) continue;
    const k = t.slice(0, idx).trim();
    const v = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
} catch {}

import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

function mask(id: string | null | undefined, len = 8) {
  if (!id) return '(null)';
  return id.substring(0, len) + '...';
}
function jst(iso: string | null) {
  if (!iso) return '(null)';
  return new Date(new Date(iso).getTime() + 9*3600*1000).toISOString().replace('T',' ').substring(0,19) + ' JST';
}

async function main() {
  console.log('====================================================');
  console.log('arena_events 重複調査 — read-only');
  console.log('====================================================\n');

  // ─────────────────────────────────────────────
  // 調査1: 重複eventの全体把握
  // ─────────────────────────────────────────────
  console.log('========== 調査1: 重複event全体把握 ==========');

  const { data: allEvents, error: aeErr } = await (sb as any)
    .from('arena_events')
    .select('id, arena_id, status, scheduled_at, matches_generated_at, created_at')
    .order('created_at', { ascending: true });
  if (aeErr) { console.error('arena_events ERROR:', aeErr.message); process.exit(1); }

  const { data: arenaDefs, error: adErr } = await (sb as any)
    .from('arena_definitions')
    .select('id, code');
  if (adErr) { console.error('arena_definitions ERROR:', adErr.message); process.exit(1); }

  const codeMap: Record<string, string> = {};
  for (const d of (arenaDefs || [])) codeMap[d.id] = d.code;

  // group by (arena_id, scheduled_at)
  const grouped: Record<string, any[]> = {};
  for (const ev of (allEvents || [])) {
    const key = `${ev.arena_id}__${ev.scheduled_at}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ev);
  }
  const dupGroups = Object.entries(grouped)
    .filter(([_, rows]) => rows.length > 1)
    .sort((a, b) => {
      const ta = a[1][0].scheduled_at;
      const tb = b[1][0].scheduled_at;
      return tb.localeCompare(ta);
    });

  console.log(`重複グループ数: ${dupGroups.length}\n`);
  const dupEventIds = new Set<string>();

  for (const [key, rows] of dupGroups) {
    const [arenaId, scheduledAt] = key.split('__');
    const code = codeMap[arenaId] ?? arenaId.substring(0,8);
    console.log(`--- ${code} / ${jst(scheduledAt)} (${rows.length}件) ---`);
    for (const r of rows) {
      console.log(`  id=${mask(r.id)} status=${r.status} created=${jst(r.created_at)} matches_generated_at=${r.matches_generated_at ? jst(r.matches_generated_at) : '(null)'}`);
      dupEventIds.add(r.id);
    }
  }

  // ─────────────────────────────────────────────
  // 調査2: 重複eventごとの関連データ件数
  // ─────────────────────────────────────────────
  console.log('\n========== 調査2: 各重複eventの関連データ件数 ==========');

  const dupIds = [...dupEventIds];

  // entries
  const { data: entries, error: enErr } = await (sb as any)
    .from('arena_entries')
    .select('id, arena_event_id, status, created_at')
    .in('arena_event_id', dupIds);
  if (enErr) console.error('arena_entries ERROR:', enErr.message);

  // arena_matches
  const { data: arenaMatches, error: amErr } = await (sb as any)
    .from('arena_matches')
    .select('id, arena_event_id, status, processed_at, match_kind, master_subtype, official_match_id, created_at')
    .in('arena_event_id', dupIds);
  if (amErr) console.error('arena_matches ERROR:', amErr.message);

  // arena_match_history
  const { data: matchHistory, error: mhErr } = await (sb as any)
    .from('arena_match_history')
    .select('id, arena_event_id, created_at')
    .in('arena_event_id', dupIds);
  if (mhErr) console.error('arena_match_history ERROR:', mhErr.message);

  // prize_awards
  const { data: prizeAwards, error: paErr } = await (sb as any)
    .from('prize_awards')
    .select('id, source_arena_event_id, source_arena_match_id, status, created_at')
    .in('source_arena_event_id', dupIds);
  if (paErr) console.error('prize_awards ERROR:', paErr.message);

  // admin_messages (prize_awards経由)
  const awardIds = (prizeAwards || []).map((pa: any) => pa.id);
  let adminMsgMap: Record<string, boolean> = {};
  if (awardIds.length > 0) {
    const { data: adminMsgs, error: amsgErr } = await (sb as any)
      .from('admin_messages')
      .select('id, source_id')
      .in('source_id', awardIds.map((id: string) => id));
    if (amsgErr) console.error('admin_messages ERROR:', amsgErr.message);
    for (const m of (adminMsgs || [])) {
      adminMsgMap[m.source_id] = true;
    }
  }

  // カウント集計
  const entryCount: Record<string, number> = {};
  const entryStatuses: Record<string, string[]> = {};
  for (const en of (entries || [])) {
    entryCount[en.arena_event_id] = (entryCount[en.arena_event_id] || 0) + 1;
    if (!entryStatuses[en.arena_event_id]) entryStatuses[en.arena_event_id] = [];
    entryStatuses[en.arena_event_id].push(en.status);
  }
  const matchCount: Record<string, number> = {};
  for (const am of (arenaMatches || [])) {
    matchCount[am.arena_event_id] = (matchCount[am.arena_event_id] || 0) + 1;
  }
  const histCount: Record<string, number> = {};
  for (const h of (matchHistory || [])) {
    histCount[h.arena_event_id] = (histCount[h.arena_event_id] || 0) + 1;
  }
  const awardCount: Record<string, number> = {};
  for (const pa of (prizeAwards || [])) {
    awardCount[pa.source_arena_event_id] = (awardCount[pa.source_arena_event_id] || 0) + 1;
  }

  console.log('\n【各重複eventの関連データ件数】');
  for (const [key, rows] of dupGroups) {
    const [arenaId, scheduledAt] = key.split('__');
    const code = codeMap[arenaId] ?? arenaId.substring(0,8);
    console.log(`\n--- ${code} / ${jst(scheduledAt)} ---`);
    for (const r of rows) {
      const ec = entryCount[r.id] || 0;
      const mc = matchCount[r.id] || 0;
      const hc = histCount[r.id] || 0;
      const pc = awardCount[r.id] || 0;
      console.log(`  id=${mask(r.id)} status=${r.status}`);
      console.log(`    entries=${ec} matches=${mc} match_history=${hc} prize_awards=${pc}`);
    }
  }

  // ─────────────────────────────────────────────
  // 調査3: official_matchesとの紐づき確認
  // ─────────────────────────────────────────────
  console.log('\n========== 調査3: official_matches紐づき確認 ==========');

  const omIds = (arenaMatches || []).map((am: any) => am.official_match_id).filter(Boolean);
  let omMap: Record<string, any> = {};
  if (omIds.length > 0) {
    const { data: oms, error: omsErr } = await (sb as any)
      .from('official_matches')
      .select('id, status, source_kind, end_reason, winner_id')
      .in('id', omIds);
    if (omsErr) console.error('official_matches ERROR:', omsErr.message);
    for (const om of (oms || [])) omMap[om.id] = om;
  }

  for (const [key, rows] of dupGroups) {
    const [arenaId, scheduledAt] = key.split('__');
    const code = codeMap[arenaId] ?? arenaId.substring(0,8);
    console.log(`\n--- ${code} / ${jst(scheduledAt)} ---`);
    for (const r of rows) {
      const ams = (arenaMatches || []).filter((am: any) => am.arena_event_id === r.id);
      if (ams.length === 0) {
        console.log(`  id=${mask(r.id)}: arena_matches なし`);
      } else {
        for (const am of ams) {
          const om = am.official_match_id ? omMap[am.official_match_id] : null;
          console.log(`  id=${mask(r.id)}: arena_match=${mask(am.id)} status=${am.status} processed=${am.processed_at ? '✅' : 'null'} match_kind=${am.match_kind} master_subtype=${am.master_subtype ?? 'null'}`);
          if (om) {
            console.log(`    official_match=${mask(om.id)} status=${om.status} end_reason=${om.end_reason ?? 'null'} winner=${mask(om.winner_id)}`);
          } else {
            console.log(`    official_match: なし`);
          }
        }
      }
    }
  }

  // ─────────────────────────────────────────────
  // 調査4: prize_awards / admin_messages紐づき確認
  // ─────────────────────────────────────────────
  console.log('\n========== 調査4: prize_awards / admin_messages紐づき ==========');

  if ((prizeAwards || []).length === 0) {
    console.log('重複event群に紐づく prize_awards: 0件');
  } else {
    for (const pa of (prizeAwards || [])) {
      const evRow = (allEvents || []).find((e: any) => e.id === pa.source_arena_event_id);
      const code = evRow ? codeMap[evRow.arena_id] : '?';
      const hasMsg = adminMsgMap[pa.id] ? '✅あり' : '⚠️なし';
      console.log(`  prize_award=${mask(pa.id)} status=${pa.status} event=${mask(pa.source_arena_event_id)} match=${mask(pa.source_arena_match_id)} admin_msg=${hasMsg}`);
    }
  }

  // ─────────────────────────────────────────────
  // 調査5: entriesの所在確認
  // ─────────────────────────────────────────────
  console.log('\n========== 調査5: entriesの所在確認 ==========');

  for (const [key, rows] of dupGroups) {
    const [arenaId, scheduledAt] = key.split('__');
    const code = codeMap[arenaId] ?? arenaId.substring(0,8);
    console.log(`\n--- ${code} / ${jst(scheduledAt)} ---`);
    for (const r of rows) {
      const ec = entryCount[r.id] || 0;
      const es = entryStatuses[r.id] || [];
      console.log(`  id=${mask(r.id)} status=${r.status} entries=${ec} entry_statuses=${JSON.stringify(es)}`);
    }
  }

  // ─────────────────────────────────────────────
  // 調査6: ensure_next_arena_events コード確認
  // ─────────────────────────────────────────────
  console.log('\n========== 調査6: ensure_next_arena_events コード確認 ==========');

  const { execSync } = await import('child_process');
  const migDir = '/Users/nt/Desktop/ONE_EIGHT/one-eight-web-mvp/supabase/migrations';

  // ensure_next_arena_events が定義されているmigrationを探す
  try {
    const files = execSync(
      `grep -rl "ensure_next_arena_events\\|run_pending_arena_match_generation" ${migDir} 2>/dev/null`,
      { encoding: 'utf8' }
    ).trim().split('\n').filter(Boolean);
    console.log(`ensure_next_arena_events 関連migration: ${files.length}件`);
    for (const f of files) {
      console.log(`  ${f.replace(migDir+'/', '')}`);
    }
    // 最新のensure_next_arena_events定義を抽出
    if (files.length > 0) {
      // タイムスタンプ付きmigrationのみ対象にして最新を取得
      const tsFiles = files.filter(f => /\/\d{14}_/.test(f)).sort().reverse();
      const latestFile = tsFiles[0] || files[files.length - 1];
      console.log(`\n最新定義ファイル: ${latestFile.replace(migDir+'/', '')}`);

      // ensure_next_arena_events の関数本体を抽出
      const content = readFileSync(latestFile, 'utf8');
      const fnMatch = content.match(/CREATE OR REPLACE FUNCTION ensure_next_arena_events[\s\S]*?(?=\n\$\$;?\s*\n)/);
      if (fnMatch) {
        const fnBody = fnMatch[0].substring(0, 4000);
        console.log('\n--- ensure_next_arena_events 定義 (抜粋) ---');
        console.log(fnBody);
      } else {
        // 別の抽出方法
        const lines = content.split('\n');
        let inFn = false;
        let depth = 0;
        const fnLines: string[] = [];
        for (const line of lines) {
          if (!inFn && line.includes('ensure_next_arena_events')) inFn = true;
          if (inFn) {
            fnLines.push(line);
            if (line.includes('$$;') || line.includes('$$ LANGUAGE')) {
              if (fnLines.length > 2) break;
            }
          }
          if (inFn && fnLines.length > 150) break;
        }
        console.log('\n--- ensure_next_arena_events 関連行 (抜粋) ---');
        console.log(fnLines.slice(0, 100).join('\n'));
      }
    }
  } catch (e: any) {
    console.log('migration grep 失敗:', e.message);
  }

  // INSERT前の存在チェック部分を探す
  console.log('\n--- INSERT 前の存在確認ロジック確認 ---');
  try {
    const result = execSync(
      `grep -n "ON CONFLICT\\|UNIQUE\\|NOT EXISTS\\|WHERE.*scheduled_at\\|INSERT INTO arena_events" ${migDir}/*.sql 2>/dev/null | grep -i "arena_events" | tail -30`,
      { encoding: 'utf8' }
    );
    console.log(result || '(なし)');
  } catch {}

  // ─────────────────────────────────────────────
  // 分類サマリ
  // ─────────────────────────────────────────────
  console.log('\n========== 分類サマリ ==========');

  for (const [key, rows] of dupGroups) {
    const [arenaId, scheduledAt] = key.split('__');
    const code = codeMap[arenaId] ?? arenaId.substring(0,8);
    console.log(`\n=== ${code} / ${jst(scheduledAt)} ===`);

    for (const r of rows) {
      const ec = entryCount[r.id] || 0;
      const mc = matchCount[r.id] || 0;
      const hc = histCount[r.id] || 0;
      const pc = awardCount[r.id] || 0;
      const hasRelatedData = ec > 0 || mc > 0 || hc > 0 || pc > 0;

      // 分類
      let cls = '';
      let reason = '';
      if (pc > 0) {
        cls = 'A (残すべき)';
        reason = `prize_awards=${pc}`;
      } else if (mc > 0 || hc > 0) {
        cls = 'A (残すべき)';
        reason = `matches=${mc} history=${hc}`;
      } else if (ec > 0) {
        const ams = (arenaMatches || []).filter((am: any) => am.arena_event_id === r.id);
        if (ams.length === 0) {
          cls = 'C (判断保留)';
          reason = `entries=${ec}あり、matchesなし`;
        } else {
          cls = 'A (残すべき)';
          reason = `entries=${ec} matches=${ams.length}`;
        }
      } else if (r.status === 'completed' || r.status === 'closed') {
        // 関連データなしだがstatus=completed
        cls = 'B (cleanup候補)';
        reason = `全関連データ0件 status=${r.status} (cronが再生成した可能性)`;
      } else {
        cls = 'B (cleanup候補)';
        reason = `全関連データ0件 status=${r.status}`;
      }

      console.log(`  ${cls}: id=${mask(r.id)} status=${r.status}`);
      console.log(`    根拠: ${reason}`);
      console.log(`    entries=${ec} matches=${mc} history=${hc} prize_awards=${pc}`);
    }
  }

  console.log('\n====================================================');
  console.log('調査完了');
  console.log('実施内容: SELECT のみ');
  console.log('DB変更: なし / RPC実行: なし / migration作成: なし');
  console.log('Prize/Payout/PayPal操作: なし');
  console.log('====================================================');
}

main().catch(console.error);
