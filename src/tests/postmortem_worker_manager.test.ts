// src/tests/postmortem_worker_manager.test.ts
//
// PostmortemWorkerManager の単体テスト。
// Worker 実体は FakeWorker に差し替えてテストから制御する。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PostmortemWorkerResponse } from '../workers/postmortem.worker'
import type { MoveRecord } from '../game/types'
import type { PostmortemResult } from '../game/postmortem'

// ── FakeWorker ────────────────────────────────────────────────────────────────

class FakeWorker extends EventTarget {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null

  // postMessage は何もしない（テストから手動で dispatch する）
  postMessage(_data: unknown) {}
  terminate() {}

  dispatchMsg(data: PostmortemWorkerResponse) {
    const evt = new MessageEvent('message', { data })
    if (this.onmessage) this.onmessage(evt)
    this.dispatchEvent(evt)
  }

  dispatchError(msg: string) {
    const evt = new ErrorEvent('error', { message: msg })
    if (this.onerror) this.onerror(evt)
    this.dispatchEvent(evt)
  }
}

let lastWorker: FakeWorker | null = null
vi.stubGlobal('Worker', class {
  constructor() {
    const w = new FakeWorker()
    lastWorker = w
    // FakeWorker は EventTarget を継承しているので addEventListener が使える
    return w as unknown as Worker
  }
})

// ── storage モック（cache は常に null） ───────────────────────────────────────
vi.mock('../game/storage', () => ({
  loadPostmortemCache: vi.fn().mockReturnValue(null),
  savePostmortemCache: vi.fn(),
  clearPostmortemCache: vi.fn(),
}))

// ── import ────────────────────────────────────────────────────────────────────

import { PostmortemWorkerManager } from '../lib/postmortemWorkerManager'

// ── ヘルパー ──────────────────────────────────────────────────────────────────

const DUMMY_HISTORY: MoveRecord[] = []
const DUMMY_RESULT: PostmortemResult = {
  rows: [],
  totalMs: 0,
  decisiveMove: null,
  topLosses: [],
} as unknown as PostmortemResult

function makeManager() {
  return new PostmortemWorkerManager()
}

// ── テスト ────────────────────────────────────────────────────────────────────

describe('PostmortemWorkerManager', () => {
  beforeEach(() => {
    lastWorker = null
  })
  afterEach(() => {
    vi.clearAllMocks()
  })

  // 1. snapshotVersion がnotify() のたびにインクリメントされる
  it('revision が setJob 毎にインクリメントされる', () => {
    const mgr = makeManager()
    const v0 = mgr.snapshotVersion
    mgr.run('game-1', DUMMY_HISTORY)
    const v1 = mgr.snapshotVersion
    // run() は queued(+1) → processNext → running(+1) の 2 回 notify を呼ぶ
    expect(v1).toBeGreaterThan(v0)
    expect(v1).toBe(v0 + 2)
  })

  // 2. queued → running → done で subscriber が各状態変化を検知する
  it('queued → running → done で subscriber が3回呼ばれる', () => {
    const mgr = makeManager()
    const spy = vi.fn()
    mgr.subscribeNotify(spy)

    mgr.run('game-1', DUMMY_HISTORY) // queued + running (→ 2回)
    expect(spy).toHaveBeenCalledTimes(2) // queued notify + running notify

    // Worker が done を返す
    lastWorker!.dispatchMsg({ type: 'done', result: DUMMY_RESULT })
    expect(spy).toHaveBeenCalledTimes(3) // done notify
  })

  // 3. running → error でも subscriber が検知する
  it('running → error で subscriber が検知する', () => {
    const mgr = makeManager()
    const spy = vi.fn()
    mgr.subscribeNotify(spy)

    mgr.run('game-1', DUMMY_HISTORY) // queued + running
    const beforeError = spy.mock.calls.length

    lastWorker!.dispatchMsg({ type: 'error', message: 'test error' })
    expect(spy.mock.calls.length).toBe(beforeError + 1)

    const st = mgr.getStatus('game-1')
    expect(st.status).toBe('error')
  })

  // 4. Worker の 'error' イベント（ErrorEvent）でも subscriber が検知する
  it('worker ErrorEvent で subscriber が検知する', () => {
    const mgr = makeManager()
    const spy = vi.fn()
    mgr.subscribeNotify(spy)

    mgr.run('game-1', DUMMY_HISTORY)
    const beforeError = spy.mock.calls.length

    lastWorker!.dispatchError('worker crash')
    expect(spy.mock.calls.length).toBe(beforeError + 1)

    const st = mgr.getStatus('game-1')
    expect(st.status).toBe('error')
  })

  // 5. 完了後に runningId が null へ戻る
  it('完了後に runningId が null になる', () => {
    const mgr = makeManager()
    mgr.run('game-1', DUMMY_HISTORY)
    expect(mgr.runningId).toBe('game-1')

    lastWorker!.dispatchMsg({ type: 'done', result: DUMMY_RESULT })
    expect(mgr.runningId).toBeNull()
  })

  // 6. キューに次のジョブがある場合、そのジョブが running へ進む
  it('キュー内の次 job が自動で実行される', () => {
    const mgr = makeManager()
    const spy = vi.fn()
    mgr.subscribeNotify(spy)

    mgr.run('game-1', DUMMY_HISTORY)
    mgr.run('game-2', DUMMY_HISTORY) // queued

    expect(mgr.runningId).toBe('game-1')
    expect(mgr.getStatus('game-2').status).toBe('queued')

    // game-1 完了
    lastWorker!.dispatchMsg({ type: 'done', result: DUMMY_RESULT })

    // game-2 が自動的に running へ
    expect(mgr.runningId).toBe('game-2')
    expect(mgr.getStatus('game-2').status).toBe('running')
  })

  // 7. dismiss で idle 遷移し subscriber が検知する
  it('dismiss で idle 遷移し subscriber が検知する', () => {
    const mgr = makeManager()
    mgr.run('game-1', DUMMY_HISTORY)
    lastWorker!.dispatchMsg({ type: 'done', result: DUMMY_RESULT })

    const spy = vi.fn()
    mgr.subscribeNotify(spy)
    mgr.dismiss('game-1')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(mgr.getStatus('game-1').status).toBe('idle')
  })

  // 8. cancelJob で idle 遷移し subscriber が検知する
  it('cancelJob で idle 遷移し subscriber が検知する', () => {
    const mgr = makeManager()
    // 2 件積んで game-2 を queued 状態にする
    mgr.run('game-1', DUMMY_HISTORY)
    mgr.run('game-2', DUMMY_HISTORY)

    const spy = vi.fn()
    mgr.subscribeNotify(spy)
    mgr.cancelJob('game-2')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(mgr.getStatus('game-2').status).toBe('idle')
  })

  // 9. cancelAll で全件 idle になり subscriber が1回呼ばれる
  it('cancelAll で全件 idle になり subscriber が1回呼ばれる', () => {
    const mgr = makeManager()
    mgr.run('game-1', DUMMY_HISTORY)
    mgr.run('game-2', DUMMY_HISTORY)

    const spy = vi.fn()
    mgr.subscribeNotify(spy)
    mgr.cancelAll()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(mgr.getStatus('game-1').status).toBe('idle')
    expect(mgr.getStatus('game-2').status).toBe('idle')
    expect(mgr.runningId).toBeNull()
  })

  // 10. snapshotVersion がすべての notify() で確実にインクリメントされる
  it('done 遷移後に snapshotVersion がインクリメントされる', () => {
    const mgr = makeManager()
    mgr.run('game-1', DUMMY_HISTORY)
    const vBefore = mgr.snapshotVersion
    lastWorker!.dispatchMsg({ type: 'done', result: DUMMY_RESULT })
    expect(mgr.snapshotVersion).toBeGreaterThan(vBefore)
  })
})
