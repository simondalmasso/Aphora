import { withSecurityHeaders } from './security';

export interface ApiMeta {
  readonly schemaVersion: '1.0';
  readonly generatedAt: string;
  readonly mode: 'DEMO';
  readonly official: false;
}

export function jsonResponse(data: unknown, options: { status?: number; cacheControl?: string; generatedAt?: string } = {}): Response {
  const body = JSON.stringify({
    ok: (options.status ?? 200) < 400,
    data,
    meta: {
      schemaVersion: '1.0',
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      mode: 'DEMO',
      official: false,
    } satisfies ApiMeta,
  });
  return withSecurityHeaders(new Response(body, {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': options.cacheControl ?? 'public, max-age=30, stale-while-revalidate=120',
      'Vary': 'Accept-Encoding',
    },
  }));
}

export function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, { status, cacheControl: 'no-store' });
}
