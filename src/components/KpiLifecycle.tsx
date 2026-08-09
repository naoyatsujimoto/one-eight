/**
 * KpiLifecycle.tsx — KPI Lifecycle 初期化コンポーネント
 *
 * Phase 2: アプリ起動時に一度だけKPI Trackerを初期化する。
 * LangProviderの内側に配置してlocaleを取得し、setTrackerLocale()を同期する。
 *
 * 要件:
 * - /ai-check-login では初期化・送信しない
 * - 子コンポーネントには何も変更を加えない
 * - tracker初期化失敗でアプリを止めない
 * - React StrictModeや再renderで二重初期化しない
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useLang } from '../lib/lang';
import { setTrackerLocale } from '../lib/kpiTracker';
import { useKpiLifecycle } from '../hooks/useKpiLifecycle';

// ---------------------------------------------------------------------------
// Inner hook: locale同期
// ---------------------------------------------------------------------------

function useKpiLocaleSync(): void {
  const { lang } = useLang();
  const prevLangRef = useRef<string | null>(null);

  useEffect(() => {
    // /ai-check-login は除外
    try {
      const p = window.location.pathname;
      if (p === '/ai-check-login' || p === '/ai-check-login/') return;
    } catch {
      return;
    }

    // trackerのlocaleを現在のlangに同期
    try {
      setTrackerLocale(lang);
    } catch {
      // locale設定失敗は無視
    }

    prevLangRef.current = lang;
  }, [lang]);
}

// ---------------------------------------------------------------------------
// KpiLifecycleInner: Lifecycle + Locale同期
// ---------------------------------------------------------------------------

function KpiLifecycleInner(): null {
  useKpiLifecycle();
  useKpiLocaleSync();
  return null;
}

// ---------------------------------------------------------------------------
// KpiLifecycle: Provider wrapper
// ---------------------------------------------------------------------------

interface KpiLifecycleProps {
  children: ReactNode;
}

export function KpiLifecycle({ children }: KpiLifecycleProps): JSX.Element {
  return (
    <>
      <KpiLifecycleInner />
      {children as JSX.Element}
    </>
  );
}
