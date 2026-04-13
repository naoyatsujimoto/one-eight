import { createInitialState } from './initialState';
import type { GameState } from './types';

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
    return parsed;
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

// Minimal structural validation to guard against stale / malformed data
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
