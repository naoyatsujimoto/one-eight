// src/hooks/usePostmortemWorker.ts
import { useRef, useState, useCallback } from 'react'
import type { PostmortemResult } from '../game/postmortem'
import type { MoveRecord } from '../game/types'
import type { PostmortemWorkerRequest, PostmortemWorkerResponse } from '../workers/postmortem.worker'

export type PostmortemWorkerState =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'done'; result: PostmortemResult }
  | { status: 'error'; message: string }

export function usePostmortemWorker() {
  const [state, setState] = useState<PostmortemWorkerState>({ status: 'idle' })
  const workerRef = useRef<Worker | null>(null)

  const run = useCallback((history: MoveRecord[]) => {
    // 既存 Worker があれば terminate
    workerRef.current?.terminate()

    // 新しい Worker を起動
    const worker = new Worker(
      new URL('../workers/postmortem.worker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker
    setState({ status: 'running' })

    worker.addEventListener('message', (e: MessageEvent<PostmortemWorkerResponse>) => {
      if (e.data.type === 'done') {
        setState({ status: 'done', result: e.data.result })
      } else {
        setState({ status: 'error', message: e.data.message })
      }
      worker.terminate()
      workerRef.current = null
    })

    worker.addEventListener('error', (err) => {
      setState({ status: 'error', message: err.message })
      worker.terminate()
      workerRef.current = null
    })

    // Worker に分析リクエストを送信
    worker.postMessage({ type: 'run', history } satisfies PostmortemWorkerRequest)
  }, [])

  const cancel = useCallback(() => {
    workerRef.current?.terminate()
    workerRef.current = null
    setState({ status: 'idle' })
  }, [])

  return { state, run, cancel }
}
