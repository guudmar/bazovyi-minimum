import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/golos-text';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Work without a connection: in the published build a service worker caches the files of the app.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      const here = window.location.origin;
      const loaded = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(here) && !u.endsWith('/sw.js'));
      reg.active?.postMessage({ cache: [window.location.pathname, ...loaded] });
    }).catch(() => { /* the app works online without it */ });
  });
}
