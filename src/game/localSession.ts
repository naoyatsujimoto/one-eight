/**
 * localSession.ts
 *
 * 対局セッション単位の永続メタデータ。
 * GameState とは別キーで保存し、リロードをまたいで維持する。
 *
 * 管理項目:
 *   gameId           — 安定した対局識別子（UUID）
 *   matchStartedSent — match_started KPI を送信済みか
 *   gameOverSaved    — 終局レコード保存済みか
 */

const KEY = 'one_eight_local_session';

export interface LocalSessionMeta {
  gameId: string;
  matchStartedSent: boolean;
  gameOverSaved: boolean;
  /** 対局の生成元。'live'=通常対局, 'import'=棋譜インポート。未保存の旧形式は 'live' として扱う。 */
  origin?: 'live' | 'import';
}

export function loadLocalSession(): LocalSessionMeta | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as Record<string, unknown>)['gameId'] === 'string' &&
      typeof (parsed as Record<string, unknown>)['matchStartedSent'] === 'boolean' &&
      typeof (parsed as Record<string, unknown>)['gameOverSaved'] === 'boolean'
    ) {
      const meta = parsed as LocalSessionMeta;
      // 後方互換: origin 未設定の旧形式は 'live' として補完
      if (meta.origin === undefined) {
        meta.origin = 'live';
      }
      return meta;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocalSession(meta: LocalSessionMeta): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(meta));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function clearLocalSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** 新しいセッションメタを生成（ID のみ新規、フラグはリセット）*/
export function newLocalSession(gameId?: string): LocalSessionMeta {
  return {
    gameId: gameId ?? crypto.randomUUID(),
    matchStartedSent: false,
    gameOverSaved: false,
    origin: 'live',
  };
}
