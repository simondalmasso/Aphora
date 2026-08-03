import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types';
import { createSessionCookieForPrincipal } from '../../src/worker/auth';

interface TestEnv {
  readonly MESSAGES_DB: D1Database;
  readonly REPORTS_BUCKET: R2Bucket;
  readonly SESSION_SIGNING_KEY: string;
}

const server = createTestHarness({ workers: [{ configPath: './wrangler.test.jsonc' }] });
const origin = 'http://sos-sf.test';
let env: TestEnv;

async function session(principal: SessionPrincipal): Promise<string> {
  await env.MESSAGES_DB.prepare('INSERT INTO auth_sessions (id,sub,email,role,created_at,expires_at,revoked_at,rotated_from) VALUES (?,?,?,?,?,?,NULL,NULL)')
    .bind(principal.sessionId, principal.sub, principal.email, principal.role, new Date().toISOString(), principal.expiresAt).run();
  return (await createSessionCookieForPrincipal(principal, env.SESSION_SIGNING_KEY)).split(';')[0]!;
}

function principal(id: string, role: SessionPrincipal['role'] = 'AUTHENTICATED_USER'): SessionPrincipal {
  return { sessionId: `session:${id}`, sub: `100000${id}`, email: role === 'VERIFIED_OPERATOR' ? 'operator@example.org' : `${id}@example.org`, role, expiresAt: '2099-08-03T23:00:00.000Z' };
}

async function envelope<T>(response: Response): Promise<T> {
  const body = await response.json() as { data: T };
  return body.data;
}

beforeAll(async () => {
  await server.listen();
  const worker = server.getWorker<TestEnv>('sos-sf-test');
  await worker.applyD1Migrations('MESSAGES_DB');
  env = await worker.getEnv();
});

afterAll(async () => { await server.close(); });

describe.sequential('Worker real con bindings locales', () => {
  test('sirve la página con geolocalización same-origin y headers endurecidos', async () => {
    const response = await server.fetch('/offline.html');
    expect(response.status).toBe(200);
    expect(response.headers.get('Permissions-Policy')).toContain('geolocation=(self)');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  test('rechaza escritura pública y privados anónimos sin cachearlos', async () => {
    expect((await server.fetch('/api/snapshot', { method: 'POST' })).status).toBe(405);
    const sessionResponse = await server.fetch('/api/session');
    expect(sessionResponse.headers.get('Cache-Control')).toContain('private');
    expect(await envelope(sessionResponse)).toMatchObject({ enabled: true, authenticated: false });
    const privateResponse = await server.fetch('/api/private/reports');
    expect(privateResponse.status).toBe(401);
    expect(privateResponse.headers.get('Cache-Control')).toContain('private');
  });

  test('aísla conversaciones y revoca la sesión al cerrar', async () => {
    const first = principal('user-one');
    const second = principal('user-two');
    const firstCookie = await session(first);
    const secondCookie = await session(second);
    const created = await server.fetch('/api/private/conversations', { method: 'POST', headers: { Cookie: firstCookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    expect(created.status).toBe(201);
    const conversation = (await envelope<{ conversation: { id: string } }>(created)).conversation;
    const forbidden = await server.fetch(`/api/private/messages?conversationId=${encodeURIComponent(conversation.id)}`, { headers: { Cookie: secondCookie } });
    expect(forbidden.status).toBe(403);
    const accepted = await server.fetch('/api/private/messages', { method: 'POST', headers: { Cookie: firstCookie, Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' }, body: JSON.stringify({ conversationId: conversation.id, body: 'Necesito orientación.', idempotencyKey: 'runtime-message-one' }) });
    expect(accepted.status).toBe(201);
    const logout = await server.fetch('/api/logout', { method: 'POST', headers: { Cookie: firstCookie, Origin: origin } });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const afterLogout = await server.fetch('/api/session', { headers: { Cookie: firstCookie } });
    expect(await envelope(afterLogout)).toMatchObject({ authenticated: false });
  });

  test('procesa multipart, guarda foto privada y permite revisión operadora auditada', async () => {
    const user = principal('report-user');
    const operator = principal('operator-one', 'VERIFIED_OPERATOR');
    const userCookie = await session(user);
    const operatorCookie = await session(operator);
    const form = new FormData();
    form.set('metadata', JSON.stringify({ category: 'ANEGAMIENTO', description: 'Agua acumulada desde hace una hora.', locationLabel: 'Barrio Centro', exactLocationConsent: false, idempotencyKey: 'runtime-report-one' }));
    form.append('photos', new File([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9])], 'evidence.jpg', { type: 'image/jpeg' }));
    const submitted = await server.fetch('/api/private/reports', { method: 'POST', headers: { Cookie: userCookie, Origin: origin, 'CF-Connecting-IP': '203.0.113.20' }, body: form });
    expect(submitted.status).toBe(201);
    const submittedData = await envelope<{ report: { id: string } }>(submitted);
    const listed = await server.fetch('/api/private/reports', { headers: { Cookie: operatorCookie } });
    const reports = (await envelope<{ reports: Array<{ id: string; photos: Array<{ id: string }> }> }>(listed)).reports;
    const row = reports.find((item) => item.id === submittedData.report.id)!;
    expect(row.photos).toHaveLength(1);
    const photoId = row.photos[0]!.id;
    const photo = await server.fetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { headers: { Cookie: operatorCookie } });
    expect(photo.status).toBe(200);
    expect(photo.headers.get('Cache-Control')).toContain('private');
    expect((await server.fetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { method: 'PATCH', headers: { Cookie: operatorCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED', note: 'Revisión manual.' }) })).status).toBe(200);
    const patch = (status: string, extra: Record<string, unknown> = {}) => server.fetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { Cookie: operatorCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: 'Revisión manual.', ...extra }) });
    expect((await patch('UNDER_REVIEW', { moderationFlags: ['PERSONAL_DATA'], redactedDescription: 'Descripción redactada.', operatorNote: 'Se removió información personal.' })).status).toBe(200);
    expect((await patch('ESCALATION_READY')).status).toBe(200);
    expect((await patch('FORWARDED')).status).toBe(400);
    expect((await patch('FORWARDED', { forwardedDestination: 'COBEM', forwardedReference: 'exp-runtime-1' })).status).toBe(200);
  });

  test('ejecuta la purga programada sobre D1 y R2', async () => {
    const before = await env.MESSAGES_DB.prepare('SELECT COUNT(*) AS count FROM reports').first<{ count: number }>();
    expect(before?.count).toBeGreaterThan(0);
    const worker = server.getWorker<TestEnv>('sos-sf-test');
    await worker.scheduled({ cron: '17 3 * * *', scheduledTime: new Date('2100-08-04T03:17:00.000Z') });
    const after = await env.MESSAGES_DB.prepare('SELECT COUNT(*) AS count FROM reports').first<{ count: number }>();
    expect(after?.count).toBe(0);
    expect((await env.REPORTS_BUCKET.list()).objects).toHaveLength(0);
    expect(server.getLogs().some((entry) => JSON.stringify(entry).includes('retention_purge_completed'))).toBe(true);
  });
});
