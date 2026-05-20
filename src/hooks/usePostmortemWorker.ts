// src/hooks/usePostmortemWorker.ts
//
// postmortemWorkerManager への React バインディング。
// useSyncExternalStore で Manager の変化を購読し、
// getStatus() / run() / dismiss() / cancelAll() を提供する。

import { useSyncExternalStore, useCallback } from 'react'
import { postmortemWorkerManager } from '../lib/postmortemWorkerManager'
import type { AnalysisJobStatus } from '../lib/postmortemWorkerManager'
import type { MoveRecord } from '../game/types'

export type { AnalysisJobStatus }

export function usePostmortemWorker() {
  // Manager の変化を購読（snapshot は runningId で代用 — 変化検出が目的）
  const runningId = useSyncExternalStore(
    (cb) => postmortemWorkerManager.subscribeNotify(cb),
    ()  => postmortemWorkerManager.runningId,
    ()  => postmortemWorkerManager.runningId,
  )

  const getStatus = useCallback(
    (gameId: string): AnalysisJobStatus =>
      postmortemWorkerManager.getStatus(gameId),
    // runningId を依存に含めることで、状態変化時に getStatus も新しい参照を返す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runningId],
  )

  const run = useCallback(
    (gameId: string, history: MoveRecord[], humanColor?: 'black' | 'white' | null) =>
      postmortemWorkerManager.run(gameId, history, humanColor),
    [],
  )

  const dismiss = useCallback(
    (gameId: string) => postmortemWorkerManager.dismiss(gameId),
    [],
  )

  const cancelJob = useCallback(
    (gameId: string) => postmortemWorkerManager.cancelJob(gameId),
    [],
  )

  const cancelAll = useCallback(
    () => postmortemWorkerManager.cancelAll(),
    [],
  )

  return { runningId, getStatus, run, dismiss, cancelJob, cancelAll }
}
