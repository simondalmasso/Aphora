import { describe, expect, it } from 'vitest';
import worker from '../../src/worker/index';
import type { WorkerEnv } from '../../src/worker/router';

const env: WorkerEnv = {
  ASSETS: {
    fetch: async () => new Response('<!doctype html><title>asset</title>', { headers: { 'Content-Type': 'text/html' } }),
  },
};

async function request(path: string, init?: RequestInit) {
  return worker.fetch(new Request(`https://sos-sf.test${path}`, init), env);
}

describe('public read-only API contract', () => {
  it.each([
    ['/api/health', 'service'],
    ['/api/snapshot', 'state'],
    ['/api/sources', 'sources'],
    ['/api/messages', 'messages'],
  ])('serves %s with a stable envelope', async (path, expectedKey) => {
    const response = await request(path);
    const body = await response.json() as { ok: boolean; data: Record<string, unknown>; meta: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty(expectedKey);
    expect(body.meta).toMatchObject({ schemaVersion: '1.0', mode: 'DEMO', official: false });
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

  it('serves lite HTML without JavaScript and with safety claims', async () => {
    const response = await request('/lite');
    const html = await response.text();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('DEMO / NO OFICIAL');
    expect(html).toContain('Esta pantalla no necesita JavaScript');
    expect(html).not.toContain('<script');
  });

  it('keeps the dashboard public and reports private messaging truthfully disabled', async () => {
    const dashboard = await request('/');
    expect(dashboard.status).toBe(200);
    expect(dashboard.headers.get('content-security-policy')).toContain('accounts.google.com/gsi/client');
    expect(await dashboard.text()).toContain('<title>asset</title>');

    const config = await request('/api/auth/config');
    const configBody = await config.json() as { data: { enabled: boolean; googleClientId: string | null; activationState: string } };
    expect(configBody.data).toEqual({ enabled: false, provider: 'GOOGLE_IDENTITY_SERVICES_DIRECT', googleClientId: null, oneTap: false, scopes: 'openid email profile', activationState: 'REQUIRES_GOOGLE_AND_D1_CONFIGURATION' });
    expect(config.headers.get('cache-control')).toBe('no-store');
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
