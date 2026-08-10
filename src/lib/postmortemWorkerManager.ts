// src/lib/postmortemWorkerManager.ts
//
// PostmortemWorker のシングルトン管理。
// ・gameId 単位で状態（idle / queued / running / done / error）を管理
// ・1件ずつキュー処理（並列実行しない）
// ・コンポーネントのマウント/アンマウントに一切依存しない
// ・STATS画面を離れても Worker は継続動作する

import type { PostmortemResult, PostmortemMetric } from '../game/postmortem'
import type { MoveRecord } from '../game/types'
import { track } from './kpiTracker'
import { savePostmortemCache, loadPostmortemCache } from '../game/storage'
import type { PostmortemWorkerRequest, PostmortemWorkerResponse } from '../workers/postmortem.worker'

// ─── 型定義 ──────────────────────────────────────────────────────────────────

export type AnalysisJobStatus =
  | { status: 'idle' }
  | { status: 'queued';  history: MoveRecord[] }
  | { status: 'running'; history: MoveRecord[] }
  | { status: 'done';    history: MoveRecord[]; result: PostmortemResult }
  | { status: 'error';   history: MoveRecord[]; message: string }

export type PostmortemMatchMode = 'human_vs_cpu' | 'offline_pvp' | 'online' | 'official' | 'arena' | 'unknown'

// ─── 共通純粋関数 ─────────────────────────────────────────────────────────────────────

/**
 * resolvePostmortemMatchMode — GameRecord.mode / オンライン対局情報 / DB履歴情報から
 * PostmortemMatchMode を決定する共通純粋関数。
 *
 * マッピング:
 * - 'human_vs_cpu'                             → 'human_vs_cpu'
 * - 'human_vs_human'                           → 'offline_pvp'
 * - onlineMode 指定あり                          → onlineMode 優先
 * - 'online_pvp' かつ officialItem なし          → 'online'
 * - 'online_pvp' かつ source_kind='standalone'   → 'official'
 * - 'online_pvp' かつ source_kind='arena'        → 'arena'
 * - 判定不能時                                 → 'unknown'
 *
 * @param localMode    GameRecord.mode
 * @param onlineMode   リアルタイム対局の matchMode ('online' | 'official' | 'arena') | null
 * @param officialItem DB履歴から引いた OfficialMatchListItem（online_pvp 分類の追加情報）
 */
export function resolvePostmortemMatchMode(
  localMode: string | null | undefined,
  onlineMode?: 'online' | 'official' | 'arena' | null,
  officialItem?: { source_kind?: 'standalone' | 'arena' } | null,
): PostmortemMatchMode {
  // onlineMode が明示指定された場合はそちらを最優先
  if (onlineMode === 'arena') return 'arena';
  if (onlineMode === 'official') return 'official';
  if (onlineMode === 'online') return 'online';
  // ローカル対局の分類
  if (localMode === 'human_vs_cpu') return 'human_vs_cpu';
  if (localMode === 'human_vs_human') return 'offline_pvp';
  // DB履歴の online_pvp レコード: officialItem に基づく分類
  if (localMode === 'online_pvp') {
    if (!officialItem) return 'online';               // officialGameMap に存在しない → 通常オンライン
    if (officialItem.source_kind === 'arena') return 'arena';
    if (officialItem.source_kind === 'standalone') return 'official';
    return 'online';                                  // source_kind 不明時のフォールバック
  }
  // 本当に判定不能な場合のみ unknown
  return 'unknown';
}

type Job = {
  gameId: string
  history: MoveRecord[]
  humanColor: 'black' | 'white' | null
  matchMode?: PostmortemMatchMode
}

// ─── Manager class ───────────────────────────────────────────────────────────

class PostmortemWorkerManager {
  private worker:       Worker | null = null
  private queue:        Job[]         = []
  private _runningId:   string | null = null
  private jobMap:       Map<string, AnalysisJobStatus> = new Map()
  private listeners:    Set<() => void> = new Set()
  private _revision = 0

  // ── 読み取り ───────────────────────────────────────────────────────────────

  /** useSyncExternalStore 用スナップショット: 変化するたびにインクリメントされる整数値 */
  get snapshotVersion(): number { return this._revision }

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
    this._revision++
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
    matchMode?: PostmortemMatchMode,
  ): void {
    const current = this.getStatus(gameId)
    if (current.status === 'queued' || current.status === 'running') return

    console.log('[PM/manager] analyze start', {
      gameId,
      historyLength: history.length,
      queued: this.queue.length,
      running: this._runningId !== null ? 1 : 0,
    })

    // KPI: postmortem_started (キャッシュヒットかどうかにかかわらず1回)
    track('postmortem_started', {
      match_mode: matchMode ?? 'unknown',
      move_count: history.length,
    })

    // キャッシュヒット → 即 done
    const cached = loadPostmortemCache(gameId)
    if (cached) {
      console.log('[PM/manager] cache hit', { gameId })
      this.setJob(gameId, { status: 'done', result: cached, history })
      // KPI: postmortem_completed (cache hit)
      // candidate_countは候補昤調済みの時点では履歴数だけ記録、候補数は candidates_opened で記録
      track('postmortem_completed', {
        match_mode: matchMode ?? 'unknown',
        elapsed_seconds: 0,
      })
      return
    }

    // キューに追加して処理を試みる
    this.queue.push({ gameId, history, humanColor: humanColor ?? null, matchMode })
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

    const workerStartTime = performance.now()
    console.log('[PM/manager] worker start', {
      gameId: job.gameId,
      historyLength: job.history.length,
      queued: this.queue.length,
      running: 1,
    })

    const finish = () => {
      this.worker = null
      this._runningId = null
      this.processNext()   // 次のジョブへ
    }

    worker.addEventListener('message', (e: MessageEvent<PostmortemWorkerResponse>) => {
      // metric / metric-warn は main thread 側で出力（Worker console は Web Inspector に出ない）
      if (e.data.type === 'metric') {
        console.log('[PM/run]', e.data.payload)
        return
      }
      if (e.data.type === 'metric-warn') {
        const p: PostmortemMetric = e.data.payload
        if (p.label === 'slow row') {
          const s = p as Extract<PostmortemMetric, { label: 'slow row' }>
          console.warn(
            `[PM/run] slow row index=${s.index} move=${s.moveNumber} total=${s.totalMs}ms ` +
            `apply=${s.applyMs}ms evaluate=${s.evaluateMs}ms enumerate=${s.enumerateMs}ms ` +
            `simulate=${s.simulateTotalMs}ms count=${s.simulateCount} strategy=${s.strategyMs}ms`
          )
        }
        console.warn('[PM/run]', p)
        return
      }

      const elapsedMs = Math.round(performance.now() - workerStartTime)
      if (e.data.type === 'done') {
        console.log('[PM/manager] worker done', { gameId: job.gameId, elapsedMs })
        savePostmortemCache(job.gameId, e.data.result)
        this.setJob(job.gameId, {
          status: 'done',
          result: e.data.result,
          history: job.history,
        })
        // KPI: postmortem_completed (worker done)
        // candidate_countは candidates_opened で記録するためここでは省略
        track('postmortem_completed', {
          match_mode: job.matchMode ?? 'unknown',
          elapsed_seconds: Math.min(Math.round(elapsedMs / 1000), 86400),
        })
        // KPI: performance_measure (worker ms)
        track('performance_measure', {
          metric_name: 'postmortem_worker_ms',
          value_ms: Math.min(elapsedMs, 300000),
        })
      } else {
        console.log('[PM/manager] worker error', { gameId: job.gameId, error: e.data.message })
        this.setJob(job.gameId, {
          status: 'error',
          message: e.data.message,
          history: job.history,
        })
        // KPI: postmortem_failed (worker error)
        track('postmortem_failed', {
          error_code: 'WORKER_ERROR',
          stage: 'worker',
        })
      }
      worker.terminate()
      finish()
    })

    worker.addEventListener('error', (err) => {
      const elapsedMs = Math.round(performance.now() - workerStartTime)
      console.log('[PM/manager] worker error', { gameId: job.gameId, error: err.message ?? 'Worker error', elapsedMs })
      this.setJob(job.gameId, {
        status: 'error',
        message: err.message ?? 'Worker error',
        history: job.history,
      })
      // KPI: postmortem_failed (worker onerror)
      track('postmortem_failed', {
        error_code: 'WORKER_FATAL',
        stage: 'worker',
      })
      // KPI: performance_measure
      track('performance_measure', {
        metric_name: 'postmortem_worker_ms',
        value_ms: Math.min(elapsedMs, 300000),
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

export { PostmortemWorkerManager } // テスト用
export const postmortemWorkerManager = new PostmortemWorkerManager()
