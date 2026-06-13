// src/workers/postmortem.worker.ts
import { runPostmortem } from '../game/postmortem'
import type { MoveRecord } from '../game/types'
import type { PostmortemResult } from '../game/postmortem'

// Worker へのメッセージ型
export interface PostmortemWorkerRequest {
  type: 'run'
  history: MoveRecord[]
  humanColor?: 'black' | 'white' | null
}

// Worker からの返答型
export type PostmortemWorkerResponse =
  | { type: 'done'; result: PostmortemResult }
  | { type: 'error'; message: string }

self.addEventListener('message', (e: MessageEvent<PostmortemWorkerRequest>) => {
  if (e.data.type === 'run') {
    const t0 = performance.now()
    try {
      const result = runPostmortem(e.data.history, e.data.humanColor)
      const elapsedMs = Math.round(performance.now() - t0)
      console.log('[PM/worker] runPostmortem done', {
        elapsedMs,
        historyLength: e.data.history.length,
        humanColor: e.data.humanColor,
        rows: result.rows.length,
      })
      self.postMessage({ type: 'done', result } satisfies PostmortemWorkerResponse)
    } catch (err) {
      const elapsedMs = Math.round(performance.now() - t0)
      console.error('[PM/worker] runPostmortem error', { elapsedMs, error: err })
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } satisfies PostmortemWorkerResponse)
    }
  }
})
