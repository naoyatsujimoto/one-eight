import { createInitialState } from './initialState';
import {
  applyMassiveBuild,
  applyQuadBuild,
  applySelectiveBuild,
  applySelectiveBuildSingle,
  selectPosition,
  skipTurn,
} from './engine';
import { GATE_IDS, POSITION_IDS } from './constants';
import type { GameState, GateId, PositionId } from './types';

export type ImportResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

function parseGateId(s: string): GateId | null {
  const n = Number(s.trim());
  if (Number.isInteger(n) && (GATE_IDS as number[]).includes(n)) return n as GateId;
  return null;
}

function parsePositionId(s: string): PositionId | null {
  const trimmed = s.trim();
  if ((POSITION_IDS as string[]).includes(trimmed)) return trimmed as PositionId;
  return null;
}

/**
 * Parse and replay a record text into a GameState.
 *
 * Accepts the format produced by generateRecordText:
 *   1. A, m(2)
 *   2. B, s(3,4)
 *   3. C, q
 *   4. P
 *
 * - Leading move numbers (e.g. "1. ") are optional but must be "N. " or "N) " form.
 * - Blank lines are ignored.
 * - On parse or logic error, returns { ok: false, error } with a human-readable message.
 * - On success, returns { ok: true, state } with cpuPlayer set to null.
 */
export function importRecord(text: string): ImportResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { ok: false, error: 'Empty record' };
  }

  let state = createInitialState();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const lineLabel = `Line ${i + 1}`;

    // Strip optional leading "N. " or "N) "
    const stripped = raw.replace(/^\d+[.)]\s*/, '').trim();

    // ── Pass ────────────────────────────────────────────────
    if (stripped === 'P') {
      const next = skipTurn(state);
      if (next === state) {
        return {
          ok: false,
          error: `${lineLabel}: Pass is not valid at this point`,
        };
      }
      state = next;
      continue;
    }

    // ── Position, Build ──────────────────────────────────────
    const commaIdx = stripped.indexOf(',');
    if (commaIdx === -1) {
      return {
        ok: false,
        error: `${lineLabel}: Expected "Position, build" format — got "${raw}"`,
      };
    }

    const posPart = stripped.slice(0, commaIdx).trim();
    const buildPart = stripped.slice(commaIdx + 1).trim();

    const posId = parsePositionId(posPart);
    if (posId === null) {
      return {
        ok: false,
        error: `${lineLabel}: Unknown position "${posPart}"`,
      };
    }

    // Select position (claims it for current player, or captures if eligible)
    const afterSelect = selectPosition(state, posId);
    if (afterSelect.selectedPosition !== posId) {
      return {
        ok: false,
        error: `${lineLabel}: Cannot select position "${posId}" — not selectable for the current player`,
      };
    }

    // ── Massive: m(N) ────────────────────────────────────────
    if (buildPart.startsWith('m(')) {
      if (!buildPart.endsWith(')')) {
        return {
          ok: false,
          error: `${lineLabel}: Malformed massive build — expected m(N), got "${buildPart}"`,
        };
      }
      const inner = buildPart.slice(2, -1).trim();
      if (inner === '-') {
        return {
          ok: false,
          error: `${lineLabel}: m(-) indicates no piece was placed and cannot be replayed`,
        };
      }
      const gateId = parseGateId(inner);
      if (gateId === null) {
        return {
          ok: false,
          error: `${lineLabel}: Invalid gate ID "${inner}" in "${buildPart}"`,
        };
      }
      const next = applyMassiveBuild(afterSelect, gateId);
      if (next === afterSelect) {
        return {
          ok: false,
          error: `${lineLabel}: Massive build at gate ${gateId} is not valid (gate full, or not connected to "${posId}")`,
        };
      }
      state = next;
      continue;
    }

    // ── Selective: s(N,M) or s(N,0) / s(0,N) ───────────────
    if (buildPart.startsWith('s(')) {
      if (!buildPart.endsWith(')')) {
        return {
          ok: false,
          error: `${lineLabel}: Malformed selective build — expected s(N,M), got "${buildPart}"`,
        };
      }
      const inner = buildPart.slice(2, -1).trim();
      const parts = inner.split(',');
      if (parts.length !== 2) {
        return {
          ok: false,
          error: `${lineLabel}: Selective build requires exactly 2 gate IDs — got "${buildPart}"`,
        };
      }
      const rawA = parts[0]!.trim();
      const rawB = parts[1]!.trim();
      const isZeroA = rawA === '0';
      const isZeroB = rawB === '0';

      if (isZeroA && isZeroB) {
        // s(0,0) — both sides skipped; record as no-op (advance turn only)
        // This shouldn't normally occur in valid play, but handle gracefully.
        state = afterSelect;
        continue;
      }

      if (isZeroA || isZeroB) {
        // One side is 0 — single gate build
        const activeRaw = isZeroA ? rawB : rawA;
        const gateId = parseGateId(activeRaw);
        if (gateId === null) {
          return {
            ok: false,
            error: `${lineLabel}: Invalid gate ID "${activeRaw}" in "${buildPart}"`,
          };
        }
        const next = applySelectiveBuildSingle(afterSelect, gateId);
        if (next === afterSelect) {
          return {
            ok: false,
            error: `${lineLabel}: Selective build at gate ${gateId} is not valid (not connected to "${posId}" or gate full)`,
          };
        }
        state = next;
        continue;
      }

      const g1 = parseGateId(rawA);
      const g2 = parseGateId(rawB);
      if (g1 === null || g2 === null) {
        return {
          ok: false,
          error: `${lineLabel}: Invalid gate IDs in "${buildPart}"`,
        };
      }
      const next = applySelectiveBuild(afterSelect, [g1, g2]);
      if (next === afterSelect) {
        return {
          ok: false,
          error: `${lineLabel}: Selective build at gates ${g1},${g2} is not valid (not connected to "${posId}", same gate, or both full)`,
        };
      }
      state = next;
      continue;
    }

    // ── Quad: q or q(...) ────────────────────────────────────
    if (buildPart === 'q' || buildPart.startsWith('q(')) {
      const next = applyQuadBuild(afterSelect);
      if (next === afterSelect) {
        return {
          ok: false,
          error: `${lineLabel}: Quad build at position "${posId}" is not valid (all small slots full)`,
        };
      }
      state = next;
      continue;
    }

    // ── Unknown ──────────────────────────────────────────────
    return {
      ok: false,
      error: `${lineLabel}: Unknown build type in "${buildPart}"`,
    };
  }

  return { ok: true, state: { ...state, cpuPlayer: null } };
}
