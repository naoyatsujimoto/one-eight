import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from '../components/AuthGate';
import { LangProvider } from '../lib/lang';
import { KpiLifecycle } from '../components/KpiLifecycle';
import { JournalListPage } from '../components/JournalListPage';
import { JournalArticlePage } from '../components/JournalArticlePage';
import { AiCheckLogin } from '../components/AiCheckLogin';
import '../styles/app.css';

// /journal 系・/journal-db 系は AuthGate 外で直接レンダリング（ログイン不要）
const pathname = window.location.pathname;

let rootElement: React.ReactNode;

// /journal または /journal/ → DB版一覧
// /journal/:slug → DB版記事詳細 (ただし .html 拡張子付きは静的ファイルとして優先される)
// /journal-db / /journal-db/:slug → 互換ルート（従来通り）
const isAiCheckLogin =
  pathname === '/ai-check-login' ||
  pathname === '/ai-check-login/';

const isJournalList =
  pathname === '/journal' ||
  pathname === '/journal/' ||
  pathname === '/journal-db' ||
  pathname === '/journal-db/';

const isJournalArticle =
  (pathname.startsWith('/journal/') && !pathname.endsWith('.html')) ||
  pathname.startsWith('/journal-db/');

if (isAiCheckLogin) {
  rootElement = <AiCheckLogin />;
} else if (isJournalList) {
  rootElement = (
    <LangProvider>
      <KpiLifecycle>
        <JournalListPage />
      </KpiLifecycle>
    </LangProvider>
  );
} else if (isJournalArticle) {
  rootElement = (
    <LangProvider>
      <KpiLifecycle>
        <JournalArticlePage />
      </KpiLifecycle>
    </LangProvider>
  );
} else {
  rootElement = (
    <LangProvider>
      <KpiLifecycle>
        <AuthGate>
          <App />
        </AuthGate>
      </KpiLifecycle>
    </LangProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {rootElement}
  </React.StrictMode>
);
