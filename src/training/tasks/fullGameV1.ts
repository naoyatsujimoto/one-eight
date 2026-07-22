import type { FullGameTrainingTask } from '../types';

/**
 * ONE EIGHT 一局指南 — 考えて指す Black 番
 * Full game scripted Training: 61 steps (moveNumber 0..60), Black perspective.
 */
export const FULL_GAME_V1: FullGameTrainingTask = {
  id: 'full-game-v1',
  title: 'ONE EIGHT 一局指南 — Blackとして考える',
  description: '黒番として一局を通して考えながら指す実戦形式のTraining。',
  perspective: 'black',
  steps: [
    // ── M0: intro ──────────────────────────────────────────────────────────
    {
      moveNumber: 0,
      displayLabel: 'M0',
      player: 'none',
      kind: 'intro',
      learningPoint: 'intro',
      shortPrompt: '',
      explanation: '',
    },

    // ── M1-1: select_only (D) ──────────────────────────────────────────────
    {
      moveNumber: 1,
      displayLabel: 'M1-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'D',
      learningPoint: 'position_select',
      shortPrompt: '',
      explanation: '',
    },

    // ── M1-2: select_only (G) ──────────────────────────────────────────────
    {
      moveNumber: 2,
      displayLabel: 'M1-2',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'G',
      learningPoint: 'position_select',
      shortPrompt: '',
      explanation: '',
    },

    // ── M1-3: user, G massive(4) ───────────────────────────────────────────
    {
      moveNumber: 3,
      displayLabel: 'M1-3',
      player: 'black',
      kind: 'user',
      move: { position: 'G', buildType: 'massive', gates: [4] },
      expectedMove: { position: 'G', buildType: 'massive', gates: [4] },
      learningPoint: 'massive_build',
      shortPrompt: 'GにMassive(Gate 4)を指してください。',
      explanation: '',
    },

    // ── M2: auto, J massive(7) ─────────────────────────────────────────────
    {
      moveNumber: 4,
      displayLabel: 'M2',
      player: 'white',
      kind: 'auto',
      move: { position: 'J', buildType: 'massive', gates: [7] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M3: user, K selective(4,10) ────────────────────────────────────────
    {
      moveNumber: 5,
      displayLabel: 'M3',
      player: 'black',
      kind: 'user',
      move: { position: 'K', buildType: 'selective', gates: [4, 10] },
      expectedMove: { position: 'K', buildType: 'selective', gates: [4, 10] },
      learningPoint: 'selective_build',
      shortPrompt: 'KにSelective(Gate 4, 10)を指してください。',
      explanation: '',
    },

    // ── M4: auto, E selective(6,10) ────────────────────────────────────────
    {
      moveNumber: 6,
      displayLabel: 'M4',
      player: 'white',
      kind: 'auto',
      move: { position: 'E', buildType: 'selective', gates: [6, 10] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M5: user, B quad([2,3,6,11]) ───────────────────────────────────────
    {
      moveNumber: 7,
      displayLabel: 'M5',
      player: 'black',
      kind: 'user',
      move: { position: 'B', buildType: 'quad', gates: [2, 3, 6, 11] },
      expectedMove: { position: 'B', buildType: 'quad', gates: [2, 3, 6, 11] },
      learningPoint: 'quad_build',
      shortPrompt: 'BにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M6: auto, D massive(7) ─────────────────────────────────────────────
    {
      moveNumber: 8,
      displayLabel: 'M6',
      player: 'white',
      kind: 'auto',
      move: { position: 'D', buildType: 'massive', gates: [7] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M7: user, I selective(8,12) ────────────────────────────────────────
    {
      moveNumber: 9,
      displayLabel: 'M7',
      player: 'black',
      kind: 'user',
      move: { position: 'I', buildType: 'selective', gates: [8, 12] },
      expectedMove: { position: 'I', buildType: 'selective', gates: [8, 12] },
      learningPoint: 'selective_build',
      shortPrompt: 'IにSelective(Gate 8, 12)を指してください。',
      explanation: '',
    },

    // ── M8: auto, L quad([5,8,9,12]) ──────────────────────────────────────
    {
      moveNumber: 10,
      displayLabel: 'M8',
      player: 'white',
      kind: 'auto',
      move: { position: 'L', buildType: 'quad', gates: [5, 8, 9, 12] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M9: user, C selective(3,4) ─────────────────────────────────────────
    {
      moveNumber: 11,
      displayLabel: 'M9',
      player: 'black',
      kind: 'user',
      move: { position: 'C', buildType: 'selective', gates: [3, 4] },
      expectedMove: { position: 'C', buildType: 'selective', gates: [3, 4] },
      learningPoint: 'selective_build',
      shortPrompt: 'CにSelective(Gate 3, 4)を指してください。',
      explanation: '',
    },

    // ── M10: auto, F quad([3,8,11,12]) ────────────────────────────────────
    {
      moveNumber: 12,
      displayLabel: 'M10',
      player: 'white',
      kind: 'auto',
      move: { position: 'F', buildType: 'quad', gates: [3, 8, 11, 12] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M11: user, A massive(1) ────────────────────────────────────────────
    {
      moveNumber: 13,
      displayLabel: 'M11',
      player: 'black',
      kind: 'user',
      move: { position: 'A', buildType: 'massive', gates: [1] },
      expectedMove: { position: 'A', buildType: 'massive', gates: [1] },
      learningPoint: 'massive_build',
      shortPrompt: 'AにMassive(Gate 1)を指してください。',
      explanation: '',
    },

    // ── M12: auto, H massive(5) ────────────────────────────────────────────
    {
      moveNumber: 14,
      displayLabel: 'M12',
      player: 'white',
      kind: 'auto',
      move: { position: 'H', buildType: 'massive', gates: [5] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M13: user, G massive(1) ────────────────────────────────────────────
    {
      moveNumber: 15,
      displayLabel: 'M13',
      player: 'black',
      kind: 'user',
      move: { position: 'G', buildType: 'massive', gates: [1] },
      expectedMove: { position: 'G', buildType: 'massive', gates: [1] },
      learningPoint: 'revisit_position',
      shortPrompt: 'GにMassive(Gate 1)を指してください。',
      explanation: '',
    },

    // ── M14: auto, M selective(7,8) ────────────────────────────────────────
    {
      moveNumber: 16,
      displayLabel: 'M14',
      player: 'white',
      kind: 'auto',
      move: { position: 'M', buildType: 'selective', gates: [7, 8] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M15-1: select_only (G) ─────────────────────────────────────────────
    {
      moveNumber: 17,
      displayLabel: 'M15-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'G',
      learningPoint: 'gate_check',
      shortPrompt: '',
      explanation: '',
    },

    // ── M15-3: user, A selective(1,2) ─────────────────────────────────────
    {
      moveNumber: 18,
      displayLabel: 'M15-3',
      player: 'black',
      kind: 'user',
      move: { position: 'A', buildType: 'selective', gates: [1, 2] },
      expectedMove: { position: 'A', buildType: 'selective', gates: [1, 2] },
      learningPoint: 'selective_build',
      shortPrompt: 'AにSelective(Gate 1, 2)を指してください。',
      explanation: '',
    },

    // ── M16: auto, J selective(5,7) ────────────────────────────────────────
    {
      moveNumber: 19,
      displayLabel: 'M16',
      player: 'white',
      kind: 'auto',
      move: { position: 'J', buildType: 'selective', gates: [5, 7] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M17-1: select_only (G) ─────────────────────────────────────────────
    {
      moveNumber: 20,
      displayLabel: 'M17-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'G',
      learningPoint: 'asset_value',
      shortPrompt: '',
      explanation: '',
    },

    // ── M17-3: user, A selective(1,2) ─────────────────────────────────────
    {
      moveNumber: 21,
      displayLabel: 'M17-3',
      player: 'black',
      kind: 'user',
      move: { position: 'A', buildType: 'selective', gates: [1, 2] },
      expectedMove: { position: 'A', buildType: 'selective', gates: [1, 2] },
      learningPoint: 'selective_build',
      shortPrompt: 'AにSelective(Gate 1, 2)を指してください。',
      explanation: '',
    },

    // ── M18: auto, L massive(9) ────────────────────────────────────────────
    {
      moveNumber: 22,
      displayLabel: 'M18',
      player: 'white',
      kind: 'auto',
      move: { position: 'L', buildType: 'massive', gates: [9] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M19: user, B selective(3,11) ──────────────────────────────────────
    {
      moveNumber: 23,
      displayLabel: 'M19',
      player: 'black',
      kind: 'user',
      move: { position: 'B', buildType: 'selective', gates: [3, 11] },
      expectedMove: { position: 'B', buildType: 'selective', gates: [3, 11] },
      learningPoint: 'selective_build',
      shortPrompt: 'BにSelective(Gate 3, 11)を指してください。',
      explanation: '',
    },

    // ── M20: auto, F massive(8) ────────────────────────────────────────────
    {
      moveNumber: 24,
      displayLabel: 'M20',
      player: 'white',
      kind: 'auto',
      move: { position: 'F', buildType: 'massive', gates: [8] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M21-1: select_only (E) ─────────────────────────────────────────────
    {
      moveNumber: 25,
      displayLabel: 'M21-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'E',
      learningPoint: 'capture',
      shortPrompt: '',
      explanation: '',
    },

    // ── M21-2: user, E massive(10) ────────────────────────────────────────
    {
      moveNumber: 26,
      displayLabel: 'M21-2',
      player: 'black',
      kind: 'user',
      move: { position: 'E', buildType: 'massive', gates: [10] },
      expectedMove: { position: 'E', buildType: 'massive', gates: [10] },
      learningPoint: 'capture',
      shortPrompt: 'EにMassive(Gate 10)を指してください。',
      explanation: '',
    },

    // ── M22: auto, F massive(11) ──────────────────────────────────────────
    {
      moveNumber: 27,
      displayLabel: 'M22',
      player: 'white',
      kind: 'auto',
      move: { position: 'F', buildType: 'massive', gates: [11] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M23-1: select_only (A) ─────────────────────────────────────────────
    {
      moveNumber: 28,
      displayLabel: 'M23-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'A',
      learningPoint: 'defense',
      shortPrompt: '',
      explanation: '',
    },

    // ── M23-2: select_only (B) ─────────────────────────────────────────────
    {
      moveNumber: 29,
      displayLabel: 'M23-2',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'B',
      learningPoint: 'defense',
      shortPrompt: '',
      explanation: '',
    },

    // ── M23-3: user, B massive(11) ────────────────────────────────────────
    {
      moveNumber: 30,
      displayLabel: 'M23-3',
      player: 'black',
      kind: 'user',
      move: { position: 'B', buildType: 'massive', gates: [11] },
      expectedMove: { position: 'B', buildType: 'massive', gates: [11] },
      learningPoint: 'defense',
      shortPrompt: 'BにMassive(Gate 11)を指してください。',
      explanation: '',
    },

    // ── M24: auto, L quad([5,8,9,12]) ─────────────────────────────────────
    {
      moveNumber: 31,
      displayLabel: 'M24',
      player: 'white',
      kind: 'auto',
      move: { position: 'L', buildType: 'quad', gates: [5, 8, 9, 12] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M25-1: select_only (F) ─────────────────────────────────────────────
    {
      moveNumber: 32,
      displayLabel: 'M25-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'F',
      learningPoint: 'capture',
      shortPrompt: '',
      explanation: '',
    },

    // ── M25-2: user, F selective(11,12) ───────────────────────────────────
    {
      moveNumber: 33,
      displayLabel: 'M25-2',
      player: 'black',
      kind: 'user',
      move: { position: 'F', buildType: 'selective', gates: [11, 12] },
      expectedMove: { position: 'F', buildType: 'selective', gates: [11, 12] },
      learningPoint: 'capture',
      shortPrompt: 'FにSelective(Gate 11, 12)を指してください。',
      explanation: '',
    },

    // ── M26: auto, M quad([1,6,7,8]) ──────────────────────────────────────
    {
      moveNumber: 34,
      displayLabel: 'M26',
      player: 'white',
      kind: 'auto',
      move: { position: 'M', buildType: 'quad', gates: [1, 6, 7, 8] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M27-1: select_only (I) ─────────────────────────────────────────────
    {
      moveNumber: 35,
      displayLabel: 'M27-1',
      player: 'black',
      kind: 'select_only',
      expectedPosition: 'I',
      learningPoint: 'defense',
      shortPrompt: '',
      explanation: '',
    },

    // ── M27-2: user, I massive(4) ─────────────────────────────────────────
    {
      moveNumber: 36,
      displayLabel: 'M27-2',
      player: 'black',
      kind: 'user',
      move: { position: 'I', buildType: 'massive', gates: [4] },
      expectedMove: { position: 'I', buildType: 'massive', gates: [4] },
      learningPoint: 'defense',
      shortPrompt: 'IにMassive(Gate 4)を指してください。',
      explanation: '',
    },

    // ── M28: auto, L massive(8) ────────────────────────────────────────────
    {
      moveNumber: 37,
      displayLabel: 'M28',
      player: 'white',
      kind: 'auto',
      move: { position: 'L', buildType: 'massive', gates: [8] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M29: user, D quad([1,3,7,11]) ─────────────────────────────────────
    {
      moveNumber: 38,
      displayLabel: 'M29',
      player: 'black',
      kind: 'user',
      move: { position: 'D', buildType: 'quad', gates: [1, 3, 7, 11] },
      expectedMove: { position: 'D', buildType: 'quad', gates: [1, 3, 7, 11] },
      learningPoint: 'capture_quad',
      shortPrompt: 'DをCaptureしてQuad Buildを指してください。',
      explanation: '',
    },

    // ── M30: auto, I massive(10) ──────────────────────────────────────────
    {
      moveNumber: 39,
      displayLabel: 'M30',
      player: 'white',
      kind: 'auto',
      move: { position: 'I', buildType: 'massive', gates: [10] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M31: user, A quad([1,2,7,12]) ─────────────────────────────────────
    {
      moveNumber: 40,
      displayLabel: 'M31',
      player: 'black',
      kind: 'user',
      move: { position: 'A', buildType: 'quad', gates: [1, 2, 7, 12] },
      expectedMove: { position: 'A', buildType: 'quad', gates: [1, 2, 7, 12] },
      learningPoint: 'quad_build',
      shortPrompt: 'AにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M32: auto, H selective(5,6) ───────────────────────────────────────
    {
      moveNumber: 41,
      displayLabel: 'M32',
      player: 'white',
      kind: 'auto',
      move: { position: 'H', buildType: 'selective', gates: [5, 6] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M33: user, G quad([1,4,7,10]) ─────────────────────────────────────
    {
      moveNumber: 42,
      displayLabel: 'M33',
      player: 'black',
      kind: 'user',
      move: { position: 'G', buildType: 'quad', gates: [1, 4, 7, 10] },
      expectedMove: { position: 'G', buildType: 'quad', gates: [1, 4, 7, 10] },
      learningPoint: 'quad_build',
      shortPrompt: 'GにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M34: auto, H massive(5) ────────────────────────────────────────────
    {
      moveNumber: 43,
      displayLabel: 'M34',
      player: 'white',
      kind: 'auto',
      move: { position: 'H', buildType: 'massive', gates: [5] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M35: user, K quad([4,9,10,11]) ────────────────────────────────────
    {
      moveNumber: 44,
      displayLabel: 'M35',
      player: 'black',
      kind: 'user',
      move: { position: 'K', buildType: 'quad', gates: [4, 9, 10, 11] },
      expectedMove: { position: 'K', buildType: 'quad', gates: [4, 9, 10, 11] },
      learningPoint: 'quad_build',
      shortPrompt: 'KにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M36: auto, M massive(6) ────────────────────────────────────────────
    {
      moveNumber: 45,
      displayLabel: 'M36',
      player: 'white',
      kind: 'auto',
      move: { position: 'M', buildType: 'massive', gates: [6] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M37: user, K partial quad([4,9,10]) — Gate 11 is full ──────────────
    {
      moveNumber: 46,
      displayLabel: 'M37',
      player: 'black',
      kind: 'user',
      move: { position: 'K', buildType: 'quad', gates: [4, 9, 10, 11] },
      // Gate 11 is full at this point — only Gates 4, 9, 10 are buildable.
      // expectedMove uses [4, 9, 10] so scriptedMoveToExpected generates minGates: 3.
      expectedMove: { position: 'K', buildType: 'quad', gates: [4, 9, 10] },
      learningPoint: 'partial_quad',
      shortPrompt: 'KにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M38: auto, H massive(6) ────────────────────────────────────────────
    {
      moveNumber: 47,
      displayLabel: 'M38',
      player: 'white',
      kind: 'auto',
      move: { position: 'H', buildType: 'massive', gates: [6] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M39: user, C quad([3,4,5,10]) ─────────────────────────────────────
    {
      moveNumber: 48,
      displayLabel: 'M39',
      player: 'black',
      kind: 'user',
      move: { position: 'C', buildType: 'quad', gates: [3, 4, 5, 10] },
      expectedMove: { position: 'C', buildType: 'quad', gates: [3, 4, 5, 10] },
      learningPoint: 'prepare_capture',
      shortPrompt: 'CにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M40: auto, H quad([2,5,6,9]) ──────────────────────────────────────
    {
      moveNumber: 49,
      displayLabel: 'M40',
      player: 'white',
      kind: 'auto',
      move: { position: 'H', buildType: 'quad', gates: [2, 5, 6, 9] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M41: user, I massive(12) ──────────────────────────────────────────
    {
      moveNumber: 50,
      displayLabel: 'M41',
      player: 'black',
      kind: 'user',
      move: { position: 'I', buildType: 'massive', gates: [12] },
      expectedMove: { position: 'I', buildType: 'massive', gates: [12] },
      learningPoint: 'capture_massive',
      shortPrompt: 'IをCaptureしてMassive(Gate 12)を指してください。',
      explanation: '',
    },

    // ── M42: auto, H massive(2) ────────────────────────────────────────────
    {
      moveNumber: 51,
      displayLabel: 'M42',
      player: 'white',
      kind: 'auto',
      move: { position: 'H', buildType: 'massive', gates: [2] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M43: user, F massive(12) ──────────────────────────────────────────
    {
      moveNumber: 52,
      displayLabel: 'M43',
      player: 'black',
      kind: 'user',
      move: { position: 'F', buildType: 'massive', gates: [12] },
      expectedMove: { position: 'F', buildType: 'massive', gates: [12] },
      learningPoint: 'massive_build',
      shortPrompt: 'FにMassive(Gate 12)を指してください。',
      explanation: '',
    },

    // ── M44: auto, L massive(9) ────────────────────────────────────────────
    {
      moveNumber: 53,
      displayLabel: 'M44',
      player: 'white',
      kind: 'auto',
      move: { position: 'L', buildType: 'massive', gates: [9] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M45: user, C massive(3) ────────────────────────────────────────────
    {
      moveNumber: 54,
      displayLabel: 'M45',
      player: 'black',
      kind: 'user',
      move: { position: 'C', buildType: 'massive', gates: [3] },
      expectedMove: { position: 'C', buildType: 'massive', gates: [3] },
      learningPoint: 'massive_build',
      shortPrompt: 'CにMassive(Gate 3)を指してください。',
      explanation: '',
    },

    // ── M46: auto, J selective_single(9) ──────────────────────────────────
    {
      moveNumber: 55,
      displayLabel: 'M46',
      player: 'white',
      kind: 'auto',
      move: { position: 'J', buildType: 'selective_single', gates: [9] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M47: user, E massive(2) ────────────────────────────────────────────
    {
      moveNumber: 56,
      displayLabel: 'M47',
      player: 'black',
      kind: 'user',
      move: { position: 'E', buildType: 'massive', gates: [2] },
      expectedMove: { position: 'E', buildType: 'massive', gates: [2] },
      learningPoint: 'massive_build',
      shortPrompt: 'EにMassive(Gate 2)を指してください。',
      explanation: '',
    },

    // ── M48: auto, J selective_single(9) ──────────────────────────────────
    {
      moveNumber: 57,
      displayLabel: 'M48',
      player: 'white',
      kind: 'auto',
      move: { position: 'J', buildType: 'selective_single', gates: [9] },
      learningPoint: 'auto',
      shortPrompt: '',
      explanation: '',
    },

    // ── M49: user, B quad([2,3,6,11]) ─────────────────────────────────────
    {
      moveNumber: 58,
      displayLabel: 'M49',
      player: 'black',
      kind: 'user',
      move: { position: 'B', buildType: 'quad', gates: [2, 3, 6, 11] },
      expectedMove: { position: 'B', buildType: 'quad', gates: [2, 6] },
      learningPoint: 'quad_build',
      shortPrompt: 'BにQuad Buildを指してください。',
      explanation: '',
    },

    // ── M50: pass (white auto pass) ────────────────────────────────────────
    {
      moveNumber: 59,
      displayLabel: 'M50',
      player: 'white',
      kind: 'pass',
      move: { position: '', buildType: 'pass', gates: [] },
      learningPoint: 'auto_pass',
      shortPrompt: '',
      explanation: '',
    },

    // ── M51: user, C massive(3) — 最終手 ──────────────────────────────────
    {
      moveNumber: 60,
      displayLabel: 'M51',
      player: 'black',
      kind: 'user',
      move: { position: 'C', buildType: 'massive', gates: [3] },
      expectedMove: { position: 'C', buildType: 'massive', gates: [3] },
      learningPoint: 'endgame',
      shortPrompt: 'CにMassive(Gate 3)を指してください。',
      explanation: '',
    },
  ],
};
