// src/hooks/usePostmortemWorker.ts
import { useState, useEffect, useCallback } from 'react'
import { postmortemWorkerManager } from '../lib/postmortemWorkerManager'
import type { WorkerManagerState } from '../lib/postmortemWorkerManager'
import type { MoveRecord } from '../game/types'

export function usePostmortemWorker() {
  const [state, setState] = useState<WorkerManagerState>(
    postmortemWorkerManager.state  // 初期値は現在のシングルトン状態
  )

  useEffect(() => {
    // シングルトンの状態変化を購読
    const unsubscribe = postmortemWorkerManager.subscribe(setState)
    // アンマウント時は購読解除のみ（Worker は停止しない）
    return unsubscribe
  }, [])

  const run = useCallback((gameId: string, history: MoveRecord[]) => {
    postmortemWorkerManager.run(gameId, history)
  }, [])

  const cancel = useCallback(() => {
    postmortemWorkerManager.cancel()
  }, [])

  return { state, run, cancel }
}
