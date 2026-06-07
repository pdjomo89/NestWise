import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Convex client connects under /api (HTTP + a /api/.../sync WebSocket).
// Proxy those to the local Convex backend so the browser only needs same-origin
// access to the (already-forwarded) Vite port.
const CONVEX_BACKEND = 'http://127.0.0.1:3210';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Allow access through forwarded dev domains (e.g. GitHub Codespaces),
    // otherwise Vite's host check returns "Blocked request". Localhost is
    // always allowed regardless. Leading dot = match all subdomains.
    allowedHosts: ['.app.github.dev', '.github.dev'],
    proxy: {
      '/api': {
        target: CONVEX_BACKEND,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
