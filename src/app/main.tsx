import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthGate } from '../components/AuthGate';
import { LangProvider } from '../lib/lang';
import { JournalListPage } from '../components/JournalListPage';
import { JournalArticlePage } from '../components/JournalArticlePage';
import '../styles/app.css';

// /journal-db 系は AuthGate 外で直接レンダリング（ログイン不要）
const pathname = window.location.pathname;

let rootElement: React.ReactNode;

if (pathname === '/journal-db' || pathname === '/journal-db/') {
  rootElement = (
    <LangProvider>
      <JournalListPage />
    </LangProvider>
  );
} else if (pathname.startsWith('/journal-db/')) {
  rootElement = (
    <LangProvider>
      <JournalArticlePage />
    </LangProvider>
  );
} else {
  rootElement = (
    <LangProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </LangProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {rootElement}
  </React.StrictMode>
);
