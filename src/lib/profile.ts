/**
 * profile.ts — Supabase profiles table CRUD
 * Stores per-user settings (lang, display_name, etc.)
 */
import { supabase } from './supabase';
import type { Lang } from './lang';
import { trackRpcCall } from './kpiTracker';

const _profileRoute = typeof window !== 'undefined' ? window.location.pathname : '/profile';

export type SubscriptionPlan = 'free' | 'pro'
export type SubscriptionStatus = 'inactive' | 'active' | 'trial' | 'canceled' | 'past_due'

export interface Profile {
  id: string;
  display_name: string | null;
  lang: Lang;
  stats_public: boolean;
  created_at: string;
  plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  /** UI表示補助のみ。権限判定は必ず SECURITY DEFINER RPC 内で再検証すること */
  is_admin: boolean;
  /** true: AI inspection test account. Plan override is via internal_plan_override. */
  is_internal_test_account: boolean;
  /** Internal Pro override for is_internal_test_account=true accounts only. */
  internal_plan_override: 'free' | 'pro' | null;
}

export function isProActive(profile: {
  plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  is_internal_test_account?: boolean;
  internal_plan_override?: 'free' | 'pro' | null;
}): boolean {
  // 内部テストアカウントの plan override
  if (profile.is_internal_test_account) {
    return profile.internal_plan_override === 'pro';
  }

  if (profile.plan !== 'pro') return false;

  const now = new Date();

  // active: current_period_end があればその期限内、なければ有効
  if (profile.subscription_status === 'active') {
    if (profile.current_period_end) {
      return new Date(profile.current_period_end) > now;
    }
    return true;
  }

  // canceled: 解約済みでも current_period_end までは Pro 維持
  if (profile.subscription_status === 'canceled') {
    if (profile.current_period_end) {
      return new Date(profile.current_period_end) > now;
    }
    return false; // current_period_end が null なら即無効
  }

  // past_due / inactive / trial: Pro 無効
  return false;
}

/** Fetch profile for the given user. Returns null if not found. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, lang, stats_public, created_at, plan, subscription_status, current_period_end, is_admin, is_internal_test_account, internal_plan_override')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    ...row,
    stats_public: row.stats_public ?? false,
    plan: (row.plan as SubscriptionPlan) ?? 'free',
    subscription_status: (row.subscription_status as SubscriptionStatus) ?? 'inactive',
    current_period_end: (row.current_period_end as string | null) ?? null,
    is_admin: (row.is_admin as boolean) ?? false,
    is_internal_test_account: (row.is_internal_test_account as boolean) ?? false,
    internal_plan_override: (row.internal_plan_override as 'free' | 'pro' | null) ?? null,
  } as Profile;
}

/**
 * SECURITY DEFINER RPC 経由で他ユーザーのパブリックプロフィールを取得。
 * profiles テーブルの RLS (auth.uid() = id) をバイパスする。
 * オンライン対戦の相手名表示に使用。
 */
export async function getPublicProfile(
  userId: string,
): Promise<{ display_name: string | null; stats_public: boolean } | null> {
  const route = _profileRoute;
  return trackRpcCall(
    'get_public_profile',
    async () => {
      const { data, error } = await supabase.rpc('get_public_profile', { user_id: userId });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      if (!data || (data as unknown[]).length === 0) return null;
      const row = (data as { display_name: string | null; stats_public: boolean }[])[0];
      return { display_name: row?.display_name ?? null, stats_public: row?.stats_public ?? false };
    },
    route,
  ).catch(() => null);
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

/**
 * Update lang for the authenticated user.
 * Uses UPDATE (not upsert) to avoid INSERT permission issues.
 * Throws on DB error or if no rows were updated.
 */
export async function updateProfileLang(
  userId: string,
  lang: Lang,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ lang })
    .eq('id', userId)
    .select('id');

  if (error) {
    throw new Error(`profiles lang update failed: [${error.code}] ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('profiles lang update: no rows updated (RLS or missing row?)');
  }
}

/**
 * Update stats_public for the authenticated user.
 * Uses UPDATE (not upsert) to avoid INSERT permission issues.
 * Throws on DB error or if no rows were updated.
 */
export async function updateProfileStatsPublic(
  userId: string,
  statsPublic: boolean,
): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ stats_public: statsPublic })
    .eq('id', userId)
    .select('id');

  if (error) {
    throw new Error(`profiles stats_public update failed: [${error.code}] ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('profiles stats_public update: no rows updated (RLS or missing row?)');
  }
}

/**
 * Update display_name for the authenticated user.
 * Uses UPDATE (not upsert) to avoid INSERT permission issues.
 * Throws on DB error or if no rows were updated.
 */
export async function updateDisplayName(
  userId: string,
  displayName: string,
): Promise<void> {
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error('display_name cannot be empty');
  if (trimmed.length > 30) throw new Error('display_name too long (max 30 chars)');

  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .eq('id', userId)
    .select('id');

  if (error) {
    throw new Error(`profiles update failed: [${error.code}] ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error('profiles update: no rows updated (RLS or missing row?)');
  }
}
