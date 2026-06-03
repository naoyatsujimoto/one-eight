import type { TrainingTask } from '../types';
import { T1_BUILD_BASICS } from './T1_build_basics';
import { T2_CAPTURE_BUILD } from './T2_capture_build';
import { T7_DIAGONAL_GATES } from './T7_diagonal_gates';

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
];

export const TRAINING_TASKS: TrainingTask[] = [
  T1_BUILD_BASICS,
  T2_CAPTURE_BUILD,
  T7_DIAGONAL_GATES,
];
export { T1_BUILD_BASICS, T2_CAPTURE_BUILD, T7_DIAGONAL_GATES };
