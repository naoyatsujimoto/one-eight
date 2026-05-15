// src/hooks/usePostmortemWorker.ts
import { useSyncExternalStore, useCallback } from 'react'
import { postmortemWorkerManager } from '../lib/postmortemWorkerManager'
import type { MoveRecord } from '../game/types'

export function usePostmortemWorker() {
  // useSyncExternalStore: React 18 海外ストア対応。
  // マウント直後からシングルトンの状態を正確に読み取り、
  // 将来の変更もリアルタイムに追従する。
  const state = useSyncExternalStore(
    (callback) => postmortemWorkerManager.subscribeNotify(callback),
    () => postmortemWorkerManager.state,
    () => postmortemWorkerManager.state,
  )

  const run = useCallback((gameId: string, history: MoveRecord[]) => {
    postmortemWorkerManager.run(gameId, history)
  }, [])

  const cancel = useCallback(() => {
    postmortemWorkerManager.cancel()
  }, [])

  return { state, run, cancel }
}
