import type { TrainingTask } from '../types';
import { T1_BUILD_BASICS } from './T1_build_basics';
import { T2_CAPTURE_BUILD } from './T2_capture_build';

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
];

export const TRAINING_TASKS: TrainingTask[] = [T1_BUILD_BASICS, T2_CAPTURE_BUILD];
export { T1_BUILD_BASICS, T2_CAPTURE_BUILD };
