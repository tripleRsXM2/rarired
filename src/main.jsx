import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

// ─── Service worker registration ─────────────────────────────────────
// Registered in production builds only. Dev runs through Vite which
// already serves the app on localhost without SW caching — registering
// it during dev would intercept HMR module fetches and produce stale-
// asset bugs that are painful to debug.
//
// The SW only handles push events + notificationclick today; no offline
// caching. See public/sw.js for the contract.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (reg) {
        // When the SW asks the page to navigate (notification-click on an
        // already-open tab), let the SPA router pick it up via the
        // History API so we don't lose React state.
        navigator.serviceWorker.addEventListener('message', function (e) {
          var msg = e && e.data;
          if (msg && msg.type === 'navigate' && typeof msg.url === 'string') {
            try {
              var u = new URL(msg.url, window.location.origin);
              window.history.pushState({}, '', u.pathname + u.search + u.hash);
              window.dispatchEvent(new PopStateEvent('popstate'));
            } catch (_) {
              window.location.assign(msg.url);
            }
          }
        });
        // Best-effort: if there's a waiting SW from a previous build,
        // ask it to skip the wait so the latest version takes over.
        if (reg && reg.waiting) {
          try { reg.waiting.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
        }
      })
      .catch(function (err) {
        // SW registration failure isn't fatal — push just won't work
        // until next reload. Log so we see it in production logs.
        console.warn('[sw] registration failed:', err);
      });
  });
}