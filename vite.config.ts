import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect } from 'vite';
import { routeRequest } from './src/worker/router.ts';

function localWorkerMiddleware(): Connect.NextHandleFunction {
  return (request, response, next) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (!pathname.startsWith('/api/') && pathname !== '/lite') { next(); return; }
    void (async () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const method = request.method ?? 'GET';
      const bodyChunks: Buffer[] = [];
      if (method !== 'GET' && method !== 'HEAD') for await (const chunk of request) bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const body = bodyChunks.length ? Buffer.concat(bodyChunks) : undefined;
      const webRequest = new Request(`http://127.0.0.1${request.url ?? '/'}`, { method, headers, body });
      const workerResponse = await routeRequest(webRequest, { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } });
      response.statusCode = workerResponse.status;
      workerResponse.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(Buffer.from(await workerResponse.arrayBuffer()));
    })().catch(next);
  };
}

const localWorkerPlugin = {
  name: 'sos-sf-local-worker',
  configureServer(server: { middlewares: Connect.Server }) { server.middlewares.use(localWorkerMiddleware()); },
  configurePreviewServer(server: { middlewares: Connect.Server }) { server.middlewares.use(localWorkerMiddleware()); },
};

export default defineConfig({
  plugins: [localWorkerPlugin, react()],
  build: {
    target: 'es2022', cssCodeSplit: true, manifest: true, sourcemap: true, assetsInlineLimit: 2048,
    rollupOptions: { output: { manualChunks: undefined } },
  },
  server: { headers: { 'Cache-Control': 'no-store' } },
});
