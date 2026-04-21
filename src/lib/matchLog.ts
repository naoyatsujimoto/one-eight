/**
 * matchLog.ts
 * Supabase への対戦ログ保存・取得（user_id 紐づけ）
 */
import { supabase } from './supabase';
import type { GameRecord } from '../game/analytics';

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
