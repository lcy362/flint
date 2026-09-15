import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import { AppWithToasts } from './App';
import { I18nProvider } from './i18n';
import { log } from './log/logger';

// Global error fallback: uncaught errors and unhandled promise rejections go to the front-end log.
window.addEventListener('error', (e) => {
  log.error('window', `Uncaught error: ${e.message}`, { file: e.filename, line: e.lineno, col: e.colno });
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
  log.error('window', `Unhandled promise rejection: ${reason}`);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <AppWithToasts />
    </I18nProvider>
  </React.StrictMode>
);
