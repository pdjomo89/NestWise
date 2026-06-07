import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import App from './App';
import { PrefsProvider } from './prefs';
import './index.css';

// In development we talk to Convex through the same origin that served the app:
// Vite proxies the Convex paths (HTTP + WebSocket) to the local backend on
// 127.0.0.1:3210 (see vite.config.ts), which keeps everything same-origin and
// works through remote port-forwarding (e.g. Codespaces) with no extra setup.
//
// In a production build there is no Vite proxy, so we connect directly to the
// Convex Cloud deployment. The backend is deployed separately (not from the
// web host), so we hardcode the production URL here; it's a public value (it
// ships in the client bundle either way). We deliberately do NOT read
// VITE_CONVEX_URL — a stale value in the host's env once pointed the site at
// the wrong deployment, so this is the single source of truth.
const PROD_CONVEX_URL = 'https://outgoing-spaniel-316.convex.cloud';
const convex = new ConvexReactClient(
  import.meta.env.PROD ? PROD_CONVEX_URL : window.location.origin
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convex}>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </ConvexProvider>
  </React.StrictMode>
);
