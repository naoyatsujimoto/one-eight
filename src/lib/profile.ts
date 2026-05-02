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
  return data as Profile;
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
