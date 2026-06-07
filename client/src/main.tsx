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
// Convex Cloud deployment URL injected at build time as VITE_CONVEX_URL. On
// Vercel, set the build command to `npx convex deploy --cmd 'npm run build'`,
// which deploys the backend and sets this variable automatically.
const convex = new ConvexReactClient(
  import.meta.env.PROD
    ? (import.meta.env.VITE_CONVEX_URL as string)
    : window.location.origin
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
