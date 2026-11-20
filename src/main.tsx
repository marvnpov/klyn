import {createRoot} from 'react-dom/client';
import {Analytics} from '@vercel/analytics/react';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  const globalWindow = window as Window & { __klynGlobalErrorsBound?: boolean };
  if (!globalWindow.__klynGlobalErrorsBound) {
    globalWindow.__klynGlobalErrorsBound = true;
    window.addEventListener('error', (event) => {
      const msg = typeof event.message === 'string' ? event.message : '';
      if (msg === 'Script error.' || (!event.filename && !event.error)) {
        event.preventDefault();
        return;
      }
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === 'object' && reason !== null && 'message' in reason
            ? String((reason as { message: unknown }).message)
            : String(reason ?? '');
      const lower = message.toLowerCase();
      if (
        lower.includes('aborted') ||
        lower.includes('script error') ||
        lower.includes('the client is offline')
      ) {
        event.preventDefault();
      }
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
    <Analytics />
  </ErrorBoundary>,
);

