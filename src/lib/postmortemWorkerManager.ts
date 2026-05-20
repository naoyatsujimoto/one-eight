// src/lib/postmortemWorkerManager.ts
//
// PostmortemWorker のシングルトン管理。
// ・gameId 単位で状態（idle / queued / running / done / error）を管理
// ・1件ずつキュー処理（並列実行しない）
// ・コンポーネントのマウント/アンマウントに一切依存しない
// ・STATS画面を離れても Worker は継続動作する

import type { PostmortemResult } from '../game/postmortem'
import type { MoveRecord } from '../game/types'
import { savePostmortemCache, loadPostmortemCache } from '../game/storage'
import type { PostmortemWorkerRequest, PostmortemWorkerResponse } from '../workers/postmortem.worker'

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export type AnalysisJobStatus =
  | { status: 'idle' }
  | { status: 'queued';  history: MoveRecord[] }
  | { status: 'running'; history: MoveRecord[] }
  | { status: 'done';    history: MoveRecord[]; result: PostmortemResult }
  | { status: 'error';   history: MoveRecord[]; message: string }

type Job = {
  gameId: string
  history: MoveRecord[]
  humanColor: 'black' | 'white' | null
}

// ─── Manager class ───────────────────────────────────────────────────────────

class PostmortemWorkerManager {
  private worker:       Worker | null = null
  private queue:        Job[]         = []
  private _runningId:   string | null = null
  private jobMap:       Map<string, AnalysisJobStatus> = new Map()
  private listeners:    Set<() => void> = new Set()

  // ── 読み取り ───────────────────────────────────────────────────────────────

  /** gameId の現在状態を取得（未登録は idle） */
  getStatus(gameId: string): AnalysisJobStatus {
    return this.jobMap.get(gameId) ?? { status: 'idle' }
  }

  /** 現在実行中の gameId（なければ null） */
  get runningId(): string | null {
    return this._runningId
  }

  /** キュー待ち件数 */
  get queueLength(): number {
    return this.queue.length
  }

  // ── 購読 ───────────────────────────────────────────────────────────────────

  /**
   * useSyncExternalStore 用。
   * 状態変化のたびに callback を呼ぶ購読を登録し、解除関数を返す。
   */
  subscribeNotify(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  // ── 内部ユーティリティ ─────────────────────────────────────────────────────

  private notify(): void {
    this.listeners.forEach(fn => fn())
  }

  private setJob(gameId: string, status: AnalysisJobStatus): void {
    this.jobMap.set(gameId, status)
    this.notify()
  }

  // ── 公開 API ───────────────────────────────────────────────────────────────

  /**
   * 分析をキューに積む。
   * ・すでに queued / running なら無視
   * ・キャッシュが存在すれば即 done にする
   */
  run(
    gameId: string,
    history: MoveRecord[],
    humanColor?: 'black' | 'white' | null,
  ): void {
    const current = this.getStatus(gameId)
    if (current.status === 'queued' || current.status === 'running') return

    // キャッシュヒット → 即 done
    const cached = loadPostmortemCache(gameId)
    if (cached) {
      this.setJob(gameId, { status: 'done', result: cached, history })
      return
    }

    // キューに追加して処理を試みる
    this.queue.push({ gameId, history, humanColor: humanColor ?? null })
    this.setJob(gameId, { status: 'queued', history })
    this.processNext()
  }

  /**
   * キューから次のジョブを取り出して Worker を起動する。
   * 既に実行中、またはキューが空なら何もしない。
   */
  private processNext(): void {
    if (this._runningId !== null) return
    if (this.queue.length === 0) return

    const job = this.queue.shift()!
    this._runningId = job.gameId
    this.setJob(job.gameId, { status: 'running', history: job.history })

    const worker = new Worker(
      new URL('../workers/postmortem.worker.ts', import.meta.url),
      { type: 'module' },
    )
    this.worker = worker

    const finish = () => {
      this.worker = null
      this._runningId = null
      this.processNext()   // 次のジョブへ
    }

    worker.addEventListener('message', (e: MessageEvent<PostmortemWorkerResponse>) => {
      if (e.data.type === 'done') {
        savePostmortemCache(job.gameId, e.data.result)
        this.setJob(job.gameId, {
          status: 'done',
          result: e.data.result,
          history: job.history,
        })
      } else {
        this.setJob(job.gameId, {
          status: 'error',
          message: e.data.message,
          history: job.history,
        })
      }
      worker.terminate()
      finish()
    })

    worker.addEventListener('error', (err) => {
      this.setJob(job.gameId, {
        status: 'error',
        message: err.message ?? 'Worker error',
        history: job.history,
      })
      worker.terminate()
      finish()
    })

    worker.postMessage({
      type: 'run',
      history: job.history,
      humanColor: job.humanColor,
    } satisfies PostmortemWorkerRequest)
  }

  /**
   * 特定 gameId をキャンセルする。
   * ・queued なら単純にキューから取り除く
   * ・running なら Worker を terminate して次のジョブへ
   */
  cancelJob(gameId: string): void {
    const current = this.getStatus(gameId)
    if (current.status === 'queued') {
      this.queue = this.queue.filter(j => j.gameId !== gameId)
      this.setJob(gameId, { status: 'idle' })
    } else if (current.status === 'running' && this._runningId === gameId) {
      this.worker?.terminate()
      this.worker = null
      this._runningId = null
      this.setJob(gameId, { status: 'idle' })
      this.processNext()
    }
  }

  /**
   * 全ジョブをキャンセルする（New Game など画面全体リセット時）。
   */
  cancelAll(): void {
    this.worker?.terminate()
    this.worker = null
    this._runningId = null
    this.queue = []
    for (const [gameId, status] of this.jobMap.entries()) {
      if (status.status === 'queued' || status.status === 'running') {
        this.jobMap.set(gameId, { status: 'idle' })
      }
    }
    this.notify()
  }

  /**
   * done / error 状態をクリアして idle に戻す。
   * モーダルを閉じたとき / 再分析前のリセット時に使用。
   */
  dismiss(gameId: string): void {
    const current = this.getStatus(gameId)
    if (current.status === 'done' || current.status === 'error') {
      this.jobMap.delete(gameId)
      this.notify()
    }
  }
}

// ── シングルトンエクスポート ──────────────────────────────────────────────────

export const postmortemWorkerManager = new PostmortemWorkerManager()
