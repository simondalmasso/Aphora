import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';

const server = createTestHarness({
  workers: [{ configPath: './wrangler.jsonc' }],
});

beforeAll(async () => {
  await server.listen();
});

afterEach(async () => {
  await server.reset();
});

afterAll(async () => {
  await server.close();
});

describe('Worker real', () => {
  test('sirve assets con geolocalización same-origin y endurecimiento web', async () => {
    const response = await server.fetch('/offline.html');
    expect(response.status).toBe(200);
    expect(response.headers.get('Permissions-Policy')).toContain('geolocation=(self)');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  test('mantiene sesión y reportes privados desactivados sin bindings protegidos', async () => {
    const session = await server.fetch('/api/session');
    expect(session.status).toBe(200);
    expect(session.headers.get('Cache-Control')).toContain('private');
    const sessionBody = await session.json() as { data?: { enabled?: boolean; authenticated?: boolean } };
    expect(sessionBody.data).toMatchObject({ enabled: false, authenticated: false });

    const report = await server.fetch('/api/private/reports', { method: 'GET' });
    expect(report.status).toBe(503);
    expect(report.headers.get('Cache-Control')).toContain('private');
  });

  test('rechaza escritura API pública y rutas privadas sin autenticación', async () => {
    const publicWrite = await server.fetch('/api/snapshot', { method: 'POST' });
    expect(publicWrite.status).toBe(405);

    const privateRead = await server.fetch('/api/private/messages?conversationId=conv:test');
    expect(privateRead.status).toBe(503);
  });

  test('ejecuta la purga programada sin exponer secretos ni fallar sin bindings', async () => {
    const worker = server.getWorker('sos-sf');
    await expect(worker.scheduled({ cron: '17 3 * * *', scheduledTime: new Date('2026-08-04T03:17:00.000Z') })).resolves.toBeUndefined();
    expect(server.getLogs().some((entry) => JSON.stringify(entry).includes('retention_purge_completed'))).toBe(true);
  });
});
