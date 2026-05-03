/**
 * profile.ts — Supabase profiles table CRUD
 * Stores per-user settings (lang, display_name, etc.)
 */
import { supabase } from './supabase';
import type { Lang } from './lang';

export interface Profile {
  id: string;
  display_name: string | null;
  lang: Lang;
  stats_public: boolean;
  created_at: string;
}

/** Fetch profile for the given user. Returns null if not found. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return { ...data, stats_public: (data as Record<string, unknown>).stats_public ?? false } as Profile;
}

/**
 * SECURITY DEFINER RPC 経由で他ユーザーのパブリックプロフィールを取得。
 * profiles テーブルの RLS (auth.uid() = id) をバイパスする。
 * オンライン対戦の相手名表示に使用。
 */
export async function getPublicProfile(
  userId: string,
): Promise<{ display_name: string | null; stats_public: boolean } | null> {
  const { data, error } = await supabase
    .rpc('get_public_profile', { user_id: userId });
  if (error || !data || (data as unknown[]).length === 0) return null;
  const row = (data as { display_name: string | null; stats_public: boolean }[])[0];
  return { display_name: row?.display_name ?? null, stats_public: row?.stats_public ?? false };
}

/** Upsert profile fields for the given user. */
export async function upsertProfile(
  userId: string,
  fields: Partial<Omit<Profile, 'id' | 'created_at'>>,
): Promise<void> {
  await supabase
    .from('profiles')
    .upsert({ id: userId, ...fields }, { onConflict: 'id' });
}
