// src/tests/postmortem_display_state.test.ts
//
// UI コンポーネントのボタン表示状態ロジックのテスト。
// DOM レンダリングを使わず、純粋なロジックテストとして実装する。

import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AnalysisJobStatus } from '../lib/postmortemWorkerManager'

// ── ボタンラベル計算ロジック（MyStats / UserPage のロジックを抽出） ──────────────

/**
 * analyze ボタンのラベルを決定する純粋関数
 */
function getAnalyzeBtnLabel(
  st: AnalysisJobStatus,
  analyzeCompletedIds: Set<string>,
  gameId: string,
  t: { analyzing: string; analysisDone: string; analyze: string },
): string {
  const busy = st.status === 'queued' || st.status === 'running'
  const isDone = analyzeCompletedIds.has(gameId)
  if (busy) return st.status === 'queued' ? t.analyzing + '…' : t.analyzing
  if (isDone) return t.analysisDone
  return t.analyze
}

/**
 * analyze ボタンが disabled かどうか
 */
function isAnalyzeBtnDisabled(st: AnalysisJobStatus): boolean {
  return st.status === 'queued' || st.status === 'running'
}

/**
 * refresh ボタンのラベルを決定する純粋関数
 */
function getRefreshBtnLabel(
  refreshingIds: Set<string>,
  refreshCompletedIds: Set<string>,
  gameId: string,
  t: { refreshing: string; refreshDone: string; refresh: string },
): string {
  if (refreshingIds.has(gameId)) return t.refreshing
  if (refreshCompletedIds.has(gameId)) return t.refreshDone
  return t.refresh
}

/**
 * refresh ボタンが disabled かどうか
 */
function isRefreshBtnDisabled(refreshingIds: Set<string>, gameId: string): boolean {
  return refreshingIds.has(gameId)
}

// ── テスト用 i18n ─────────────────────────────────────────────────────────────

const T = {
  analyzing: '分析中…',
  analysisDone: '✓ 分析完了',
  analyze: '分析',
  refreshing: '更新中…',
  refreshDone: '✓ 更新完了',
  refresh: '更新',
}

// ── テスト ────────────────────────────────────────────────────────────────────

describe('Analyze ボタン表示ロジック', () => {
  const gameId = 'game-001'

  it('idle 状態では「分析」と表示される', () => {
    const st: AnalysisJobStatus = { status: 'idle' }
    const label = getAnalyzeBtnLabel(st, new Set(), gameId, T)
    expect(label).toBe('分析')
    expect(isAnalyzeBtnDisabled(st)).toBe(false)
  })

  it('queued 状態では「分析中……」と表示され disabled', () => {
    const st: AnalysisJobStatus = { status: 'queued', history: [] }
    const label = getAnalyzeBtnLabel(st, new Set(), gameId, T)
    expect(label).toBe('分析中……')
    expect(isAnalyzeBtnDisabled(st)).toBe(true)
  })

  it('running 状態では「分析中…」と表示され disabled', () => {
    const st: AnalysisJobStatus = { status: 'running', history: [] }
    const label = getAnalyzeBtnLabel(st, new Set(), gameId, T)
    expect(label).toBe('分析中…')
    expect(isAnalyzeBtnDisabled(st)).toBe(true)
  })

  it('done 後に analyzeCompletedIds に含まれると「✓ 分析完了」と表示される', () => {
    const st: AnalysisJobStatus = { status: 'idle' }
    const completedIds = new Set([gameId])
    const label = getAnalyzeBtnLabel(st, completedIds, gameId, T)
    expect(label).toBe('✓ 分析完了')
    expect(isAnalyzeBtnDisabled(st)).toBe(false)
  })

  it('done 後に「分析中…」が残らない（状態が idle に戻る）', () => {
    // Worker 完了後は status が idle になる（dismiss 済み）
    const st: AnalysisJobStatus = { status: 'idle' }
    const label = getAnalyzeBtnLabel(st, new Set(), gameId, T)
    expect(label).not.toContain('分析中')
  })

  it('別の gameId に完了表示が漏れない', () => {
    const st: AnalysisJobStatus = { status: 'idle' }
    const completedIds = new Set(['other-game'])
    const label = getAnalyzeBtnLabel(st, completedIds, gameId, T)
    expect(label).toBe('分析')
  })
})

describe('Refresh ボタン表示ロジック', () => {
  const gameId = 'game-001'

  it('通常状態では「更新」と表示される', () => {
    const label = getRefreshBtnLabel(new Set(), new Set(), gameId, T)
    expect(label).toBe('更新')
    expect(isRefreshBtnDisabled(new Set(), gameId)).toBe(false)
  })

  it('refreshingIds に含まれると「更新中…」と表示され disabled', () => {
    const refreshingIds = new Set([gameId])
    const label = getRefreshBtnLabel(refreshingIds, new Set(), gameId, T)
    expect(label).toBe('更新中…')
    expect(isRefreshBtnDisabled(refreshingIds, gameId)).toBe(true)
  })

  it('done 後に refreshCompletedIds に含まれると「✓ 更新完了」と表示される', () => {
    const completedIds = new Set([gameId])
    const label = getRefreshBtnLabel(new Set(), completedIds, gameId, T)
    expect(label).toBe('✓ 更新完了')
    expect(isRefreshBtnDisabled(new Set(), gameId)).toBe(false)
  })

  it('done 後に「更新中…」が残らない', () => {
    // refreshingIds から除去された後は refreshing を表示しない
    const label = getRefreshBtnLabel(new Set(), new Set(), gameId, T)
    expect(label).not.toContain('更新中')
  })

  it('error 後に refreshingIds から除去されると再試行可能になる', () => {
    // error → refreshingIds.delete(gameId) で disabled が false になる
    const refreshingIds = new Set<string>() // error後は削除済み
    expect(isRefreshBtnDisabled(refreshingIds, gameId)).toBe(false)
  })

  it('別の gameId の完了が別行に漏れない', () => {
    const completedIds = new Set(['other-game'])
    const label = getRefreshBtnLabel(new Set(), completedIds, gameId, T)
    expect(label).toBe('更新')
  })
})

describe('完了表示タイマーロジック', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('2500ms 後に完了表示が消える（fake timers）', async () => {
    vi.useFakeTimers()

    const completedIds = new Set<string>(['game-001'])
    let currentIds = completedIds

    // タイマー発火後にセットから削除する処理のシミュレーション
    const gameId = 'game-001'
    let timerFired = false
    setTimeout(() => {
      currentIds = new Set(currentIds)
      currentIds.delete(gameId)
      timerFired = true
    }, 2500)

    // 2499ms 時点ではまだ表示中
    vi.advanceTimersByTime(2499)
    expect(timerFired).toBe(false)
    expect(currentIds.has(gameId)).toBe(true)

    // 2500ms でタイマー発火
    vi.advanceTimersByTime(1)
    expect(timerFired).toBe(true)
    expect(currentIds.has(gameId)).toBe(false)

    vi.useRealTimers()
  })

  it('新規 refresh 時にタイマーがリセットされる', () => {
    vi.useFakeTimers()

    // 既存タイマーをクリアして新しいタイマーをセットする処理のシミュレーション
    const timerMap = new Map<string, ReturnType<typeof setTimeout>>()
    const gameId = 'game-001'
    let firstFired = false
    let secondFired = false

    // 1回目のタイマー
    const t1 = setTimeout(() => { firstFired = true }, 2500)
    timerMap.set(gameId, t1)

    vi.advanceTimersByTime(1000) // 1000ms 経過

    // リフレッシュ: 既存タイマーをクリアして新しいタイマーをセット
    clearTimeout(timerMap.get(gameId)!)
    const t2 = setTimeout(() => { secondFired = true }, 2500)
    timerMap.set(gameId, t2)

    vi.advanceTimersByTime(2499) // 合計 3499ms → 1回目は 2500ms で発火のはずだったが、クリアされているので未発火
    expect(firstFired).toBe(false) // クリア済み
    expect(secondFired).toBe(false) // まだ 2500ms 未到達

    vi.advanceTimersByTime(1)
    expect(secondFired).toBe(true) // 2500ms に到達

    vi.useRealTimers()
  })
})

describe('revision ベースの再描画ロジック確認', () => {
  it('snapshotVersion が done 遷移で変化する', async () => {
    // FakeWorker を使って PostmortemWorkerManager を直接テスト
    // (postmortem_worker_manager.test.ts でも確認済みだが、ここでも検証)
    const { PostmortemWorkerManager } = await import('../lib/postmortemWorkerManager')

    class LocalFakeWorker extends EventTarget {
      postMessage(_data: unknown) {}
      terminate() {}
      dispatch(data: unknown) {
        this.dispatchEvent(new MessageEvent('message', { data }))
      }
    }
    let fw: LocalFakeWorker | null = null
    vi.stubGlobal('Worker', class {
      constructor() {
        fw = new LocalFakeWorker()
        return fw as unknown as Worker
      }
    })

    const mgr = new PostmortemWorkerManager()
    mgr.run('game-x', [])
    const vBefore = mgr.snapshotVersion

    // done メッセージを送信
    fw!.dispatch({ type: 'done', result: { rows: [], totalMs: 0, decisiveMove: null, topLosses: [] } })

    expect(mgr.snapshotVersion).toBeGreaterThan(vBefore)
    expect(mgr.getStatus('game-x').status).toBe('done')

    vi.unstubAllGlobals()
  })
})
