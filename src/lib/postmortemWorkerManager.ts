// src/lib/postmortemWorkerManager.ts
// PostmortemWorker のシングルトン管理。
// コンポーネントのマウント/アンマウントに関わらず Worker が継続動作する。

import type { PostmortemResult } from '../game/postmortem'
import type { MoveRecord } from '../game/types'
import { savePostmortemCache, loadPostmortemCache } from '../game/storage'
import type { PostmortemWorkerRequest, PostmortemWorkerResponse } from '../workers/postmortem.worker'

type Listener = (state: WorkerManagerState) => void

export type WorkerManagerState =
  | { status: 'idle' }
  | { status: 'running'; gameId: string }
  | { status: 'done'; gameId: string; result: PostmortemResult }
  | { status: 'error'; gameId: string; message: string }

class PostmortemWorkerManager {
  private worker: Worker | null = null
  private listeners: Set<Listener> = new Set()
  private _state: WorkerManagerState = { status: 'idle' }
  // run() 時に history を保持 → コンポーネントのマウント状態に依存しない
  private _history: MoveRecord[] | null = null

  get state(): WorkerManagerState {
    return this._state
  }

  private setState(s: WorkerManagerState) {
    this._state = s
    this.listeners.forEach(fn => fn(s))
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** useSyncExternalStore 用: 通知のみ（引数なし）のサブスクライバ */
  subscribeNotify(callback: () => void): () => void {
    const wrapped: Listener = () => callback()
    this.listeners.add(wrapped)
    return () => this.listeners.delete(wrapped)
  }

  get history(): MoveRecord[] | null {
    return this._history
  }

  run(gameId: string, history: MoveRecord[]) {
    // 同じ gameId が既に running なら何もしない
    if (this._state.status === 'running' && this._state.gameId === gameId) return
    this._history = history

    // cache hit ならすぐ done
    const cached = loadPostmortemCache(gameId)
    if (cached) {
      this.setState({ status: 'done', gameId, result: cached })
      return
    }

    // 既存 Worker を破棄してから新規起動
    this.worker?.terminate()

    const worker = new Worker(
      new URL('../workers/postmortem.worker.ts', import.meta.url),
      { type: 'module' }
    )
    this.worker = worker
    this.setState({ status: 'running', gameId })

    worker.addEventListener('message', (e: MessageEvent<PostmortemWorkerResponse>) => {
      if (e.data.type === 'done') {
        savePostmortemCache(gameId, e.data.result)
        this.setState({ status: 'done', gameId, result: e.data.result })
      } else {
        this.setState({ status: 'error', gameId, message: e.data.message })
      }
      worker.terminate()
      this.worker = null
    })

    worker.addEventListener('error', (err) => {
      this.setState({ status: 'error', gameId, message: err.message })
      worker.terminate()
      this.worker = null
    })

    worker.postMessage({ type: 'run', history } satisfies PostmortemWorkerRequest)
  }

  /** 手動キャンセル（New Game 等で不要になった場合） */
  cancel() {
    this.worker?.terminate()
    this.worker = null
    this._history = null
    this.setState({ status: 'idle' })
  }

  /** 結果確認後にモーダルを閉じるためにリセット */
  dismiss() {
    if (this._state.status === 'done' || this._state.status === 'error') {
      this._history = null
      this.setState({ status: 'idle' })
    }
  }
}

// シングルトンエクスポート
export const postmortemWorkerManager = new PostmortemWorkerManager()
