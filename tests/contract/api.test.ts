import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/worker/index';
import type { WorkerEnv } from '../../src/worker/router';

const originalFetch = globalThis.fetch;
const env: WorkerEnv = {
  ASSETS: {
    fetch: async () => new Response('<!doctype html><title>asset</title>', { headers: { 'Content-Type': 'text/html' } }),
  },
};

async function request(path: string, init?: RequestInit) {
  return worker.fetch(new Request(`https://sos-sf.test${path}`, init), env);
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => { throw new Error('provider unavailable'); }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('public read-only API contract', () => {
  it.each([
    ['/api/health', 'service'],
    ['/api/snapshot', 'state'],
    ['/api/sources', 'sources'],
    ['/api/messages', 'messages'],
  ])('serves %s with a stable non-demo envelope', async (path, expectedKey) => {
    const response = await request(path);
    const body = await response.json() as { ok: boolean; data: Record<string, unknown>; meta: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty(expectedKey);
    expect(body.meta).toMatchObject({ schemaVersion: '1.0', official: false });
    expect(['SERVICE', 'LIVE', 'UNAVAILABLE', 'OFFLINE']).toContain(body.meta.mode);
    expect(JSON.stringify(body)).not.toContain('DEMO_FIXTURE');
  });

  it('reports unavailable data without inventing a live reading', async () => {
    const response = await request('/api/snapshot');
    const body = await response.json() as { data: { mode: string; dataStatus: string; state: string; systems: Array<{ available: boolean }> }; meta: { mode: string } };
    expect(body.data).toMatchObject({ mode: 'UNAVAILABLE', dataStatus: 'UNAVAILABLE', state: 'UNKNOWN' });
    expect(body.data.systems.every((system) => system.available === false)).toBe(true);
    expect(body.meta.mode).toBe('UNAVAILABLE');
  });

  it('returns a stable error shape for unknown API routes', async () => {
    const response = await request('/api/nope');
    const body = await response.json() as { ok: boolean; data: { error: { code: string } } };
    expect(response.status).toBe(404);
    expect(body).toMatchObject({ ok: false, data: { error: { code: 'NOT_FOUND' } } });
  });

  it('rejects writes and avoids caching health responses', async () => {
    expect((await request('/api/messages', { method: 'POST', body: '{}' })).status).toBe(405);
    expect((await request('/api/health')).headers.get('cache-control')).toBe('no-store');
  });

  it('serves lite HTML without JavaScript or demo claims', async () => {
    const response = await request('/lite');
    const html = await response.text();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Estado hídrico de Santa Fe');
    expect(html).toContain('Esta pantalla no necesita JavaScript');
    expect(html).toContain('Un umbral numérico no constituye una orden oficial');
    expect(html).not.toContain('DEMO / NO OFICIAL');
    expect(html).not.toContain('<script');
  });

  it('keeps the dashboard public and auth disabled truthfully without protected config', async () => {
    const dashboard = await request('/');
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get('content-security-policy')).toContain('accounts.google.com/gsi/client');
    expect(dashboard.headers.get('permissions-policy')).toContain('geolocation=(self)');
    expect(await dashboard.text()).toContain('<title>asset</title>');

    const config = await request('/api/auth/config');
    const configBody = await config.json() as { data: Record<string, unknown> };
    expect(configBody.data).toEqual({
      enabled: false,
      reportingEnabled: false,
      provider: 'GOOGLE_IDENTITY_SERVICES_DIRECT',
      googleClientId: null,
      oneTap: false,
      scopes: 'openid email profile',
      activationState: 'REQUIRES_PROTECTED_GOOGLE_D1_CONFIGURATION',
    });
    expect(config.headers.get('cache-control')).toBe('no-store');
  });

  it('enables reporting only when the protected D1 and KV bindings are both present', async () => {
    const protectedEnv: WorkerEnv = {
      ...env,
      PRIVATE_MESSAGING_ENABLED: 'true',
      GOOGLE_CLIENT_ID: '123-example.apps.googleusercontent.com',
      SESSION_SIGNING_KEY: 'x'.repeat(48),
      MESSAGES_DB: {} as NonNullable<WorkerEnv['MESSAGES_DB']>,
      REPORTS_KV: {} as NonNullable<WorkerEnv['REPORTS_KV']>,
    };
    const response = await worker.fetch(new Request('https://sos-sf.test/api/auth/config'), protectedEnv);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        enabled: true,
        reportingEnabled: true,
        activationState: 'ACTIVE',
      },
    });
    expect(JSON.stringify(body)).not.toContain('REPORTS_BUCKET');
  });

  it('isolates private endpoints with no-store/noindex and no login wall', async () => {
    const session = await request('/api/session');
    expect(session.status).toBe(200);
    expect(session.headers.get('cache-control')).toBe('private, no-store');
    expect(session.headers.get('x-robots-tag')).toContain('noindex');
    expect(await session.json()).toMatchObject({ data: { enabled: false, authenticated: false, principal: null } });

    const privateResponse = await request('/api/private/conversations');
    expect(privateResponse.status).toBe(503);
    expect(privateResponse.headers.get('cache-control')).toBe('private, no-store');
    expect((await request('/api/logout', { method: 'POST' })).status).toBe(400);
  });
});
