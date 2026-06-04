import type { TrainingTask } from '../types';
import { T1_BUILD_BASICS } from './T1_build_basics';
import { T2_CAPTURE_BUILD } from './T2_capture_build';
import { T7_DIAGONAL_GATES } from './T7_diagonal_gates';
import { T4_PARTIAL_BUILD } from './T4_partial_build';
import { T6_ASSET_VALUES } from './T6_asset_values';
import { T5_CAPTURE_TIE } from './T5_capture_tie';
import { T8_PREPARE_CAPTURE } from './T8_prepare_capture';
import { T9_NO_BUILD_ENDGAME } from './T9_no_build_endgame';

export interface TrainingTaskMeta {
  task: TrainingTask;
  order: number;
  /** titleKey used in lang.tsx */
  titleKey: string;
  /** descriptionKey used in lang.tsx (optional) */
  descriptionKey?: string;
  /** taskId of prerequisite task, or null if none */
  prerequisite: string | null;
}

export const TRAINING_TASK_META: TrainingTaskMeta[] = [
  {
    task: T1_BUILD_BASICS,
    order: 1,
    titleKey: 'trainingT1Title',
    prerequisite: null,
  },
  {
    task: T2_CAPTURE_BUILD,
    order: 2,
    titleKey: 'trainingT2Title',
    prerequisite: 'T1_build_basics',
  },
  {
    task: T7_DIAGONAL_GATES,
    order: 3,
    titleKey: 'trainingT7Title',
    prerequisite: 'T2_capture_build',
  },
  {
    task: T4_PARTIAL_BUILD,
    order: 4,
    titleKey: 'trainingT4Title',
    prerequisite: 'T7_diagonal_gates',
  },
  {
    task: T6_ASSET_VALUES,
    order: 5,
    titleKey: 'trainingT6Title',
    prerequisite: 'T4_partial_build',
  },
  {
    task: T5_CAPTURE_TIE,
    order: 6,
    titleKey: 'trainingT5Title',
    prerequisite: 'T6_asset_values',
  },
  {
    task: T8_PREPARE_CAPTURE,
    order: 7,
    titleKey: 'trainingT8Title',
    prerequisite: 'T5_capture_tie',
  },
  {
    task: T9_NO_BUILD_ENDGAME,
    order: 8,
    titleKey: 'trainingT9Title',
    prerequisite: 'T8_prepare_capture',
  },
];

export const TRAINING_TASKS: TrainingTask[] = [
  T1_BUILD_BASICS,
  T2_CAPTURE_BUILD,
  T7_DIAGONAL_GATES,
  T4_PARTIAL_BUILD,
  T6_ASSET_VALUES,
  T5_CAPTURE_TIE,
  T8_PREPARE_CAPTURE,
  T9_NO_BUILD_ENDGAME,
];
export { T1_BUILD_BASICS, T2_CAPTURE_BUILD, T7_DIAGONAL_GATES, T4_PARTIAL_BUILD, T6_ASSET_VALUES, T5_CAPTURE_TIE, T8_PREPARE_CAPTURE, T9_NO_BUILD_ENDGAME };
