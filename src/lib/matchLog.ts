/**
 * matchLog.ts
 * Supabase への対戦ログ保存・取得（user_id 紐づけ）
 */
import { supabase } from './supabase';
import { loadGameRecords, type GameRecord } from '../game/analytics';

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
  full_record?: unknown;
  created_at?: string;
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
  };

  const { error } = await supabase.from('match_logs').insert(row);
  if (error) {
    console.error('[matchLog] insert error:', error.message);
  }
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

export async function fetchUserPageStats(userId: string): Promise<UserPageStats> {
  const { data, error } = await supabase
    .from('match_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

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
    bestWin,
    longestGame,
    upsetWin,
  };
}

export async function fetchMyStats(userId: string): Promise<MyStats> {
  const { data, error } = await supabase
    .from('match_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

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
