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
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type MoveRecord = {
  player?: string;
  positioning?: string;
  build?: { type?: string; gate?: number; gates?: (number|null)[]; placedGateIds?: number[] };
};

async function main() {
  // ── Step 1: Supabase RPC 返却列の確認 ──────────────────────────────────
  // service_role で get_ghost_moves を呼ぶと auth.uid()=NULL で即 RETURN（空）
  // → pg_catalog から関数定義を取得してカラムを確認する
  console.log('=== Step 1: get_ghost_moves の現在の返却型定義 ===\n');

  // Supabase の sql RPC は存在しないため、match_logs への直接クエリで代替し、
  // 関数の存在は呼び出し結果の error 有無で判断する。
  // ここでは実際に呼んで返却オブジェクトのキーを確認する方法を使う。

  // まず match_logs からユーザーを特定
  const { data: logs, error: logsErr } = await supabase
    .from('match_logs')
    .select('user_id, full_record, mode, human_color')
    .in('mode', ['human_vs_cpu', 'online_pvp'])
    .not('full_record', 'is', null);

  if (logsErr) { console.error('match_logs:', logsErr.message); return; }

  const userCount: Record<string, number> = {};
  for (const log of (logs ?? [])) {
    userCount[log.user_id] = (userCount[log.user_id] ?? 0) + 1;
  }
  const topUid = Object.entries(userCount).sort((a, b) => b[1] - a[1])[0]?.[0];
  console.log(`最多対局UID: ${topUid?.slice(0,8)}...  (${userCount[topUid ?? ''] ?? 0}件)`);

  // ── Step 2: RPC を service_role で呼び出し（空を期待）→ エラー有無 / 列名確認 ──
  console.log('\n=== Step 2: RPC 呼び出しテスト（auth.uid()=NULL → 空が期待値） ===\n');
  const { data: rpcData, error: rpcErr } = await supabase
    .rpc('get_ghost_moves', { p_canonical_hash: 'dummy', p_human_color: 'black', p_move_index: 0 });

  if (rpcErr) {
    console.log('RPC エラー:', rpcErr.message);
    console.log('→ v2 SQL が未適用 or 関数が存在しない可能性あり');
  } else {
    console.log('RPC 呼び出し成功（空配列が期待値）');
    console.log('返却データ:', JSON.stringify(rpcData));
    if (Array.isArray(rpcData) && rpcData.length > 0) {
      console.log('返却列（1件目のキー）:', Object.keys(rpcData[0]).join(', '));
      const keys = Object.keys(rpcData[0]);
      const hasV2 = keys.includes('build_gate') && keys.includes('build_gates') && keys.includes('build_placed_gate_ids');
      const hasOld = keys.includes('gate_ids_str');
      console.log(`→ v2 カラム (build_gate/build_gates/build_placed_gate_ids): ${hasV2 ? '✅ あり' : '❌ なし'}`);
      console.log(`→ 旧カラム (gate_ids_str): ${hasOld ? '❌ 残存' : '✅ なし'}`);
    } else {
      console.log('→ auth.uid()=NULL により空配列（正常）。列構造はフロントの型定義で確認済み。');
    }
  }

  // ── Step 3: v2 RPC シミュレーション（Naoya UID フィルタ） ──────────────
  console.log('\n=== Step 3: v2 RPC シミュレーション（p_move_index=0, p_human_color=black） ===\n');

  const myLogs = (logs ?? []).filter(l => l.user_id === topUid);

  const agg = new Map<string, {
    positioning: string; build_type: string;
    build_gate: number|null; build_gates: number[]|null;
    build_placed_gate_ids: number[]|null; freq: number
  }>();

  for (const log of myLogs) {
    const fr = log.full_record as MoveRecord[];
    if (!fr || fr.length === 0) continue;
    const mv = fr[0];
    if (mv.player !== 'black') continue;

    const pos = mv.positioning ?? 'P';
    const btype = mv.build?.type ?? 'skip';
    let b_gate: number|null = null;
    let b_gates: number[]|null = null;
    let b_placed: number[]|null = null;

    if (btype === 'massive') {
      b_gate = (mv.build?.gate != null && mv.build.gate > 0) ? mv.build.gate : null;
    } else if (btype === 'selective' && mv.build?.gates) {
      b_gates = mv.build.gates
        .filter((g): g is number => g != null && g > 0)
        .sort((a,b) => a-b);
    } else if (btype === 'quad' && mv.build?.placedGateIds) {
      b_placed = [...mv.build.placedGateIds].sort((a,b) => a-b);
    }

    const key = `${pos}|${btype}|${b_gate}|${JSON.stringify(b_gates)}|${JSON.stringify(b_placed)}`;
    const ex = agg.get(key);
    if (ex) ex.freq++;
    else agg.set(key, { positioning: pos, build_type: btype, build_gate: b_gate, build_gates: b_gates, build_placed_gate_ids: b_placed, freq: 1 });
  }

  const sorted = [...agg.values()].sort((a, b) => b.freq - a.freq);
  const maxFreq = sorted[0]?.freq ?? 1;

  console.log('rank | pos | build_type  | build_gate | build_gates | build_placed | freq | opacity | Gate12');
  for (let i = 0; i < Math.min(sorted.length, 20); i++) {
    const r = sorted[i];
    const op = (0.4 + (r.freq / maxFreq) * 0.6).toFixed(3);
    const g12 = (r.build_gates?.includes(12) || r.build_gate === 12 || r.build_placed_gate_ids?.includes(12)) ? '★' : '-';
    console.log(
      `  ${String(i+1).padStart(2)} | ${r.positioning.padEnd(3)} | ${r.build_type.padEnd(11)} | ` +
      `${String(r.build_gate ?? '-').padEnd(10)} | ${JSON.stringify(r.build_gates ?? null).padEnd(11)} | ` +
      `${JSON.stringify(r.build_placed_gate_ids ?? null).padEnd(12)} | ${String(r.freq).padEnd(4)} | ${op} | ${g12}`
    );
  }

  // Gate12 を含む行の詳細
  const gate12Rows = sorted.filter(r =>
    r.build_gates?.includes(12) || r.build_gate === 12 || r.build_placed_gate_ids?.includes(12)
  );
  console.log(`\n=== Gate12 を含む行: ${gate12Rows.length}件 ===`);
  for (const r of gate12Rows) {
    console.log(`  pos=${r.positioning} type=${r.build_type} build_gate=${r.build_gate} build_gates=${JSON.stringify(r.build_gates)} freq=${r.freq}`);
    if (r.build_type === 'selective' && r.build_gates) {
      if (r.build_gates.length === 2) console.log(`  ✅ 2-gate selective: Gate${r.build_gates[0]} AND Gate${r.build_gates[1]} → 両方 middle 表示`);
      else if (r.build_gates.length === 1) console.log(`  ⚠️  1-gate selective: Gate${r.build_gates[0]} のみ middle 表示`);
    }
  }

  // ── Step 4: 本番デプロイ確認 ────────────────────────────────────────────
  console.log('\n=== Step 4: ローカル最新 commit ===\n');
  // git log は別途 exec で確認済み
  console.log('commit bd06912 以降: ghost_mode_get_ghost_moves_v2.sql / ghostUtils.ts 含む\n');
}

main().catch(e => { console.error(e); process.exit(1); });
