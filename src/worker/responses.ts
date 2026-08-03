import { withSecurityHeaders } from './security';

export interface ApiMeta {
  readonly schemaVersion: '1.0';
  readonly generatedAt: string;
  readonly mode: 'LIVE' | 'UNAVAILABLE' | 'OFFLINE' | 'SERVICE';
  readonly official: false;
}

export function jsonResponse(data: unknown, options: { status?: number; cacheControl?: string; generatedAt?: string; mode?: ApiMeta['mode'] } = {}): Response {
  const body = JSON.stringify({
    ok: (options.status ?? 200) < 400,
    data,
    meta: {
      schemaVersion: '1.0',
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      mode: options.mode ?? 'SERVICE',
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
  return jsonResponse({ error: { code, message } }, { status, cacheControl: 'no-store', mode: 'SERVICE' });
}

export function privateJsonResponse(data: unknown, options: { status?: number; headers?: Readonly<Record<string, string>> } = {}): Response {
  return withSecurityHeaders(new Response(JSON.stringify({ ok: (options.status ?? 200) < 400, data }), {
    status: options.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Pragma': 'no-cache',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      ...options.headers,
    },
  }));
}

export function privateErrorResponse(code: string, message: string, status: number): Response {
  return privateJsonResponse({ error: { code, message } }, { status });
}
