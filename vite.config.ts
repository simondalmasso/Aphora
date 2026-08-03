import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect } from 'vite';
import { routeRequest } from './src/worker/router';

function localWorkerMiddleware(): Connect.NextHandleFunction {
  return (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (!pathname.startsWith('/api/') && pathname !== '/lite') {
      next();
      return;
    }
    const webRequest = new Request(`http://127.0.0.1${request.url ?? '/'}`, { method: request.method ?? 'GET' });
    routeRequest(webRequest, { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } })
      .then(async (workerResponse) => {
        response.statusCode = workerResponse.status;
        workerResponse.headers.forEach((value, name) => response.setHeader(name, value));
        response.end(Buffer.from(await workerResponse.arrayBuffer()));
      })
      .catch(next);
  };
}

const localWorkerPlugin = {
  name: 'sos-sf-local-worker',
  configureServer(server: { middlewares: Connect.Server }) {
    server.middlewares.use(localWorkerMiddleware());
  },
  configurePreviewServer(server: { middlewares: Connect.Server }) {
    server.middlewares.use(localWorkerMiddleware());
  },
};

export default defineConfig({
  plugins: [localWorkerPlugin, react()],
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: true,
    assetsInlineLimit: 2048,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    headers: {
      'Cache-Control': 'no-store',
    },
  },
});
