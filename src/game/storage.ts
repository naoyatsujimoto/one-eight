import { createInitialState } from './initialState';
import type { GameState } from './types';
import type { PostmortemResult } from './postmortem';

const STORAGE_KEY = 'one_eight_game_state';

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidGameState(parsed)) return createInitialState();
    // Migrate: fill missing timestamp fields from older saves
    const state = parsed as GameState;
    return {
      ...state,
      startedAt: state.startedAt ?? new Date().toISOString(),
      endedAt: state.endedAt ?? null,
    };
  } catch {
    return createInitialState();
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function hasSavedState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

// ─── Postmortem cache ─────────────────────────────────────────────────────────

const POSTMORTEM_CACHE_PREFIX = 'one_eight_pm_';
const POSTMORTEM_CACHE_VERSION = 1;

interface PostmortemCacheEntry {
  version: number;
  result: PostmortemResult;
}

export function savePostmortemCache(gameId: string, result: PostmortemResult): void {
  try {
    const entry: PostmortemCacheEntry = { version: POSTMORTEM_CACHE_VERSION, result };
    localStorage.setItem(POSTMORTEM_CACHE_PREFIX + gameId, JSON.stringify(entry));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export function loadPostmortemCache(gameId: string): PostmortemResult | null {
  try {
    const raw = localStorage.getItem(POSTMORTEM_CACHE_PREFIX + gameId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as PostmortemCacheEntry;
    if (entry.version !== POSTMORTEM_CACHE_VERSION) return null;
    return entry.result;
  } catch {
    return null;
  }
}

export function clearPostmortemCache(gameId: string): void {
  try {
    localStorage.removeItem(POSTMORTEM_CACHE_PREFIX + gameId);
  } catch {
    // ignore
  }
}

// ─── Minimal structural validation to guard against stale / malformed data ───
function isValidGameState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    (s.currentPlayer === 'black' || s.currentPlayer === 'white') &&
    typeof s.moveNumber === 'number' &&
    typeof s.positions === 'object' && s.positions !== null &&
    typeof s.gates === 'object' && s.gates !== null &&
    Array.isArray(s.history) &&
    typeof s.gameEnded === 'boolean'
  );
}
