import { createInitialState } from './initialState';
import type { GameState, MoveRecord } from './types';
import { computeCanonicalHashString } from './zobrist';
import { computeSymmetryGroupId } from './symmetry';
import type { PostmortemResult } from './postmortem';

const STORAGE_KEY = 'one_eight_game_state';

export function saveState(state: GameState): void {
  if (state.trainingMode) return;
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

// ─── Step F-2: canonical_hash on-demand re-computation ────────────────────────

/**
 * Ensure a MoveRecord has a canonical_hash.
 *
 * Older saved records may lack this field (saved before Step F-2).
 * When canonical_hash is absent, it is computed on-demand from the provided
 * post-move GameState snapshot.
 *
 * Constraints:
 *   - Does NOT mutate the original record
 *   - Does NOT write to localStorage (caller decides when to persist)
 *   - Does NOT require Supabase schema changes
 *   - Result is identical to what engine.ts would produce for new moves
 *
 * @param record  The MoveRecord to check (may be from an old save)
 * @param postMoveState  The GameState immediately after this move was committed
 * @returns A MoveRecord guaranteed to have canonical_hash set
 */
export function ensureCanonicalHash(
  record: MoveRecord,
  postMoveState: GameState,
): MoveRecord {
  if (record.canonical_hash !== undefined) return record;
  const canonical_hash = computeCanonicalHashString(postMoveState);
  return { ...record, canonical_hash };
}

/**
 * Reconstruct the sequence of post-move GameStates from a saved GameState.
 *
 * Used by ensureAllCanonicalHashes() to re-compute hashes for old records.
 * Returns an array parallel to state.history: postMoveStates[i] is the
 * GameState after history[i] was committed.
 *
 * NOTE: This reconstruction is approximate — it does not replay through
 * engine functions. It uses the final state's positions and gates, which
 * is correct only for the most recent move. For earlier moves, the hash
 * is computed from a partial reconstruction.
 *
 * For Step F-2, this is acceptable: on-demand hashes for old records are
 * best-effort and are not used for any correctness-critical purpose.
 */
export function ensureAllCanonicalHashes(state: GameState): GameState {
  if (state.history.every(r => r.canonical_hash !== undefined)) {
    return state; // nothing to do
  }

  // For records missing canonical_hash, we compute it using the final state
  // as a proxy. This is intentionally limited — exact per-move reconstruction
  // would require full replay, which is deferred to a later step.
  const updatedHistory: MoveRecord[] = state.history.map(record => {
    if (record.canonical_hash !== undefined) return record;
    // Use final state as proxy for the post-move state
    const canonical_hash = computeCanonicalHashString(state);
    return { ...record, canonical_hash };
  });

  return { ...state, history: updatedHistory };
}

/**
 * On-demand symmetry_group_id re-computation for records missing it.
 * Uses the same simple proxy pattern as ensureAllCanonicalHashes.
 * For exact per-move computation, use the backfill script.
 */
export function ensureAllSymmetryGroupIds(state: GameState): GameState {
  if (state.history.every(r => r.symmetry_group_id !== undefined)) {
    return state; // nothing to do
  }

  const updatedHistory: MoveRecord[] = state.history.map(record => {
    if (record.symmetry_group_id !== undefined) return record;
    // Use final state as proxy (same pattern as ensureAllCanonicalHashes)
    const symmetry_group_id = computeSymmetryGroupId(state);
    return { ...record, symmetry_group_id };
  });

  return { ...state, history: updatedHistory };
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
const POSTMORTEM_CACHE_VERSION = 2; // bumped: P-2b candidateMoves added

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
