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
    try {
      const result = runPostmortem(e.data.history, e.data.humanColor)
      self.postMessage({ type: 'done', result } satisfies PostmortemWorkerResponse)
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } satisfies PostmortemWorkerResponse)
    }
  }
})
