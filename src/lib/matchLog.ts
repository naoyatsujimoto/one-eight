/**
 * matchLog.ts
 * Supabase への対戦ログ保存・取得（user_id 紐づけ）
 */
import { supabase } from './supabase';
import { loadGameRecords, type GameRecord } from '../game/analytics';
import type { MoveRecord } from '../game/types';

export interface MatchLogRow {
  id?: string;
  user_id?: string;
  game_id: string;
  started_at: string;
  ended_at: string;
  mode: string;
  human_color: string | null;
  winner: string | null;
  move_count: number;
  full_record?: MoveRecord[] | null;
  created_at?: string;
  cpu_difficulty?: string | null;
}

export async function saveMatchLog(record: GameRecord, userId: string): Promise<void> {
  const row: MatchLogRow = {
    user_id: userId,
    game_id: record.game_id,
    started_at: record.started_at,
    ended_at: record.ended_at,
    mode: record.mode,
    human_color: record.human_color,
    winner: record.winner,
    move_count: record.move_count,
    full_record: record.full_record,
    cpu_difficulty: record.cpu_difficulty ?? null,
  };

  const { data: inserted, error } = await supabase
    .from('match_logs')
    .insert(row)
    .select('id')
    .single();
  if (error) {
    console.error('[matchLog] insert error:', error.message);
    return;
  }

  // N-1c: Edge Function で position_stats を非同期更新（fire-and-forget）
  // match_logs の保存結果に影響しない。失敗してもログのみ。
  if (inserted?.id) {
    triggerPositionStatsUpdate(inserted.id);
  }
}

/**
 * Edge Function: update-position-stats を fire-and-forget で呼び出す。
 * match_logs の保存フローを壊さないよう、await しない。
 * 失敗はコンソールログのみ（ユーザー通知なし）。
 */
function triggerPositionStatsUpdate(matchLogId: string): void {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (!supabaseUrl) {
    console.warn('[matchLog] VITE_SUPABASE_URL not set — skipping position stats update');
    return;
  }

  const functionsUrl = `${supabaseUrl}/functions/v1/update-position-stats`;

  // anon key でリクエスト（Edge Function 内では service role で実行）
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  fetch(functionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
    },
    body: JSON.stringify({ match_log_id: matchLogId }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`[matchLog] update-position-stats returned ${res.status}:`, text);
      }
    })
    .catch((err) => {
      // ネットワークエラー等 — ログのみ、保存には影響しない
      console.warn('[matchLog] update-position-stats fetch error:', err);
    });
}

export interface MyStats {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  recent: MatchLogRow[];
}

// ─── UserPage Stats ───────────────────────────────────────────────────────────

export interface UserPageStats {
  userId: string;
  joinedAt: string | null;
  total: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  blackWinRate: number;
  whiteWinRate: number;
  cpuWinRate: number;
  pvpWinRate: number;
  recent20: { win: boolean | null }[];
  recentGames: MatchLogRow[];
  bestWin: GameRecord | null;
  longestGame: GameRecord | null;
  upsetWin: GameRecord | null;
}

export async function fetchUserPageStats(_userId: string): Promise<UserPageStats> {
  // P-2: RPC 経由で履歴を取得（free: 直近10局 / pro: 全件）
  const { data, error } = await supabase
    .rpc('get_user_match_history');

  const rows: MatchLogRow[] = (!error && data) ? (data as MatchLogRow[]) : [];

  // 参加開始日: 最古レコードの created_at
  const joinedAt = rows.length > 0
    ? (rows[rows.length - 1]?.created_at ?? null)
    : null;

  // 勝敗集計
  let wins = 0, losses = 0, draws = 0;
  let blackWins = 0, blackTotal = 0;
  let whiteWins = 0, whiteTotal = 0;
  let cpuWins = 0, cpuTotal = 0;
  let pvpWins = 0, pvpTotal = 0;

  for (const r of rows) {
    const isCpu = r.mode === 'human_vs_cpu';
    const color = r.human_color;
    const w = r.winner;
    const isWin = w !== null && w !== 'draw' && color !== null && w === color;
    const isDraw = w === 'draw';
    const isLoss = !isWin && !isDraw && w !== null;

    if (isDraw) draws++;
    else if (isWin) wins++;
    else if (isLoss) losses++;

    if (color === 'black') {
      blackTotal++;
      if (isWin) blackWins++;
    }
    if (color === 'white') {
      whiteTotal++;
      if (isWin) whiteWins++;
    }
    if (isCpu) {
      cpuTotal++;
      if (isWin) cpuWins++;
    } else {
      pvpTotal++;
      if (isWin) pvpWins++;
    }
  }

  const total = rows.length;
  const recent20 = rows.slice(0, 20).map((r) => {
    const isWin = r.winner !== null && r.winner !== 'draw' && r.human_color !== null && r.winner === r.human_color;
    const isDraw = r.winner === 'draw';
    return { win: isDraw ? null : isWin };
  });

  // ローカルの代表棋譜
  const localRecords = loadGameRecords(100);
  const won = localRecords.filter((r) =>
    r.winner !== null && r.winner !== 'draw' &&
    ((r.human_color !== null && r.winner === r.human_color) ||
     (r.human_color === null && r.winner === 'black'))
  );
  const bestWin = won.length > 0
    ? won.reduce((a, b) => a.move_count >= b.move_count ? a : b)
    : null;
  const longestGame = localRecords.length > 0
    ? localRecords.reduce((a, b) => a.move_count >= b.move_count ? a : b)
    : null;
  const upsetWin = won.find((r) => r.human_color === 'white') ?? null;

  return {
    userId: _userId,
    joinedAt,
    total,
    wins,
    losses,
    draws,
    winRate: total > 0 ? wins / total : 0,
    blackWinRate: blackTotal > 0 ? blackWins / blackTotal : 0,
    whiteWinRate: whiteTotal > 0 ? whiteWins / whiteTotal : 0,
    cpuWinRate: cpuTotal > 0 ? cpuWins / cpuTotal : 0,
    pvpWinRate: pvpTotal > 0 ? pvpWins / pvpTotal : 0,
    recent20,
    recentGames: rows.slice(0, 20),
    bestWin,
    longestGame,
    upsetWin,
  };
}

/**
 * SECURITY DEFINER RPC 経由で公開設定ユーザーの stats を取得。
 * match_logs の RLS をバイパスし、stats_public = true の場合のみデータを返す。
 * viewOnly モードで対戦相手の STATS を表示する際に使用。
 */
export async function fetchPublicUserPageStats(userId: string): Promise<UserPageStats> {
  const { data, error } = await supabase
    .rpc('get_public_match_logs', { target_user_id: userId });

  const rows: MatchLogRow[] = (!error && data) ? (data as MatchLogRow[]) : [];

  const joinedAt = rows.length > 0
    ? (rows[rows.length - 1]?.created_at ?? null)
    : null;

  let wins = 0, losses = 0, draws = 0;
  let blackWins = 0, blackTotal = 0;
  let whiteWins = 0, whiteTotal = 0;
  let cpuWins = 0, cpuTotal = 0;
  let pvpWins = 0, pvpTotal = 0;

  for (const r of rows) {
    const isCpu = r.mode === 'human_vs_cpu';
    const color = r.human_color;
    const w = r.winner;
    const isWin = w !== null && w !== 'draw' && color !== null && w === color;
    const isDraw = w === 'draw';
    const isLoss = !isWin && !isDraw && w !== null;
    if (isDraw) draws++;
    else if (isWin) wins++;
    else if (isLoss) losses++;
    if (color === 'black') { blackTotal++; if (isWin) blackWins++; }
    if (color === 'white') { whiteTotal++; if (isWin) whiteWins++; }
    if (isCpu) { cpuTotal++; if (isWin) cpuWins++; }
    else { pvpTotal++; if (isWin) pvpWins++; }
  }

  const total = rows.length;
  const recent20 = rows.slice(0, 20).map((r) => {
    const isWin = r.winner !== null && r.winner !== 'draw' && r.human_color !== null && r.winner === r.human_color;
    const isDraw = r.winner === 'draw';
    return { win: isDraw ? null : isWin };
  });

  // 他ユーザーのローカルデータは参照できないため Featured Games は省略
  return {
    userId,
    joinedAt,
    total,
    wins,
    losses,
    draws,
    winRate: total > 0 ? wins / total : 0,
    blackWinRate: blackTotal > 0 ? blackWins / blackTotal : 0,
    whiteWinRate: whiteTotal > 0 ? whiteWins / whiteTotal : 0,
    cpuWinRate: cpuTotal > 0 ? cpuWins / cpuTotal : 0,
    pvpWinRate: pvpTotal > 0 ? pvpWins / pvpTotal : 0,
    recent20,
    recentGames: rows.slice(0, 20),
    bestWin: null,
    longestGame: null,
    upsetWin: null,
  };
}

// ─── Ghost Mode ─────────────────────────────────────────────────────────────

export interface GhostMove {
  positioning: string;    // PositionId ('A'〜'M') | 'P'
  build_type: string;     // 'massive' | 'selective' | 'quad' | 'skip'
  gate_ids_str: string | null; // massive:単一gate / selective:カンマ区切り2gate / quad:複数gate
  frequency: number;
}

/**
 * 現在局面（canonical_hash）において、自分の過去の対局でどのポジション・ビルドを
 * 選択したかを取得する（Ghost Mode 用）。
 *
 * - Pro ユーザーのみ結果を返す（RPC 側で判定、非 Pro は空配列）
 * - 対象モード: human_vs_cpu / online_pvp のみ（human_vs_human は対象外）
 * - anon ユーザーは RPC 実行権限なし → エラー時は空配列を返す
 *
 * @param canonicalHash  現在局面の canonical_hash
 * @param humanColor     自分の手番色 ('black' | 'white' | null)
 * @returns GhostMove 配列（frequency 降順）
 */
export async function fetchGhostMoves(
  canonicalHash: string,
  humanColor: 'black' | 'white' | null,
  moveIndex: number = 0,
): Promise<GhostMove[]> {
  const { data, error } = await supabase.rpc('get_ghost_moves', {
    p_canonical_hash: canonicalHash,
    p_human_color: humanColor,
    p_move_index: moveIndex,
  });
  if (error || !data) return [];
  return data as GhostMove[];
}

export async function fetchMyStats(_userId: string): Promise<MyStats> {
  // P-2: RPC 経由で履歴を取得（free: 直近10局 / pro: 全件）
  const { data, error } = await supabase
    .rpc('get_user_match_history');

  if (error || !data) {
    return { total: 0, wins: 0, losses: 0, draws: 0, recent: [] };
  }

  const rows = data as MatchLogRow[];
  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const r of rows) {
    if (r.winner === null) {
      // game not ended (shouldn't happen)
    } else if (r.winner === 'draw') {
      draws++;
    } else if (r.human_color !== null && r.winner === r.human_color) {
      wins++;
    } else if (r.human_color === null) {
      // human vs human: count black win as win
      if (r.winner === 'black') wins++;
      else losses++;
    } else {
      losses++;
    }
  }

  return {
    total: rows.length,
    wins,
    losses,
    draws,
    recent: rows.slice(0, 10),
  };
}
