/**
 * official_match_om1a.test.ts — OM-1a / OM-1d ユニットテスト
 *
 * DB / RLS は Supabase 側のため、ここではクライアント側ロジックをテストする:
 * - isEnterWindowOpen: 時間条件判定（OM-1d: 上限を totalSeconds ベースに変更）
 * - msUntilStart: 残り時間計算
 * - officialMatch 型定義の整合性確認（コンパイル）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isEnterWindowOpen, msUntilStart } from '../lib/officialMatch';

// ─── isEnterWindowOpen テスト ─────────────────────────────────────────────────

describe('isEnterWindowOpen', () => {
  let fakeNow: number;

  beforeEach(() => {
    fakeNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('試合開始ちょうどは入室可能', () => {
    const startsAt = new Date(fakeNow).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(true);
  });

  it('試合開始15分前は入室可能（境界値）', () => {
    const startsAt = new Date(fakeNow + 15 * 60 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(true);
  });

  it('試合開始15分1秒前はまだ入室不可', () => {
    const startsAt = new Date(fakeNow + 15 * 60 * 1000 + 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(false);
  });

  // OM-1d: 入室ウィンドウ上限は totalSeconds（デフォルト 600秒 = 10分）
  it('starts_at + 599秒は入室可能（totalSeconds=600 デフォルト）', () => {
    const startsAt = new Date(fakeNow - 599 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(true);
  });

  it('starts_at + 600秒は入室可能（境界値）', () => {
    const startsAt = new Date(fakeNow - 600 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(true);
  });

  it('starts_at + 601秒は入室不可（no_contest 範囲外）', () => {
    const startsAt = new Date(fakeNow - 601 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(false);
  });

  it('totalSeconds=120 指定: starts_at + 120秒は入室可能', () => {
    const startsAt = new Date(fakeNow - 120 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt, 120)).toBe(true);
  });

  it('totalSeconds=120 指定: starts_at + 121秒は入室不可', () => {
    const startsAt = new Date(fakeNow - 121 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt, 120)).toBe(false);
  });

  it('試合が2時間先なら入室不可', () => {
    const startsAt = new Date(fakeNow + 2 * 60 * 60 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(false);
  });

  it('試合が1時間前に終わっていれば入室不可', () => {
    const startsAt = new Date(fakeNow - 60 * 60 * 1000).toISOString();
    expect(isEnterWindowOpen(startsAt)).toBe(false);
  });
});

// ─── msUntilStart テスト ──────────────────────────────────────────────────────

describe('msUntilStart', () => {
  let fakeNow: number;

  beforeEach(() => {
    fakeNow = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1時間後の試合: 約 3,600,000ms を返す', () => {
    const startsAt = new Date(fakeNow + 3_600_000).toISOString();
    expect(msUntilStart(startsAt)).toBe(3_600_000);
  });

  it('過去（終了済み）: 負値を返す', () => {
    const startsAt = new Date(fakeNow - 3_600_000).toISOString();
    expect(msUntilStart(startsAt)).toBe(-3_600_000);
  });

  it('今から0ms後: 0 を返す', () => {
    const startsAt = new Date(fakeNow).toISOString();
    expect(msUntilStart(startsAt)).toBe(0);
  });
});
