import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types';
import { createSessionCookieForPrincipal } from '../../src/worker/auth';

interface TestEnv {
  readonly MESSAGES_DB: D1Database;
  readonly REPORTS_BUCKET: R2Bucket;
  readonly SESSION_SIGNING_KEY: string;
}
interface JsonResponseLike { json(): Promise<unknown> }

const server = createTestHarness({ workers: [{ configPath: './wrangler.test.jsonc' }] });
type HarnessRequestInit = Parameters<typeof server.fetch>[1];
const origin = 'http://sos-sf.test';
let env: TestEnv;
const workerFetch = (path: string, init?: RequestInit) => server.fetch(`${origin}${path}`, init as HarnessRequestInit);

async function session(principal: SessionPrincipal): Promise<string> {
  await env.MESSAGES_DB.prepare('INSERT INTO auth_sessions (id,sub,email,role,created_at,expires_at,revoked_at,rotated_from) VALUES (?,?,?,?,?,?,NULL,NULL)')
    .bind(principal.sessionId, principal.sub, principal.email, principal.role, new Date().toISOString(), principal.expiresAt).run();
  return (await createSessionCookieForPrincipal(principal, env.SESSION_SIGNING_KEY)).split(';')[0]!;
}

function principal(id: string, role: SessionPrincipal['role'] = 'AUTHENTICATED_USER'): SessionPrincipal {
  return { sessionId: `session:${id}`, sub: `100000${id}`, email: role === 'VERIFIED_OPERATOR' ? 'operator@example.org' : `${id}@example.org`, role, expiresAt: '2099-08-03T23:00:00.000Z' };
}

async function envelope<T>(response: JsonResponseLike): Promise<T> {
  const body = await response.json() as { data: T };
  return body.data;
}

function multipartReportBody(metadata: Record<string, unknown>): { body: Uint8Array; contentType: string } {
  const boundary = 'sos-sf-runtime-boundary-001';
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="evidence.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9]),
    encoder.encode(`\r\n--${boundary}--\r\n`),
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
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
    const response = await workerFetch('/offline.html');
    expect(response.status).toBe(200);
    expect(response.headers.get('Permissions-Policy')).toContain('geolocation=(self)');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  test('rechaza escritura pública y privados anónimos sin cachearlos', async () => {
    expect((await workerFetch('/api/snapshot', { method: 'POST' })).status).toBe(405);
    const sessionResponse = await workerFetch('/api/session');
    expect(sessionResponse.headers.get('Cache-Control')).toContain('private');
    expect(await envelope<{ enabled: boolean; authenticated: boolean }>(sessionResponse)).toMatchObject({ enabled: true, authenticated: false });
    const privateResponse = await workerFetch('/api/private/reports');
    expect(privateResponse.status).toBe(401);
    expect(privateResponse.headers.get('Cache-Control')).toContain('private');
  });

  test('aísla conversaciones y revoca la sesión al cerrar', async () => {
    const first = principal('user-one');
    const second = principal('user-two');
    const firstCookie = await session(first);
    const secondCookie = await session(second);
    const created = await workerFetch('/api/private/conversations', { method: 'POST', headers: { Cookie: firstCookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    expect(created.status).toBe(201);
    const conversation = (await envelope<{ conversation: { id: string } }>(created)).conversation;
    const forbidden = await workerFetch(`/api/private/messages?conversationId=${encodeURIComponent(conversation.id)}`, { headers: { Cookie: secondCookie } });
    expect(forbidden.status).toBe(403);
    const accepted = await workerFetch('/api/private/messages', { method: 'POST', headers: { Cookie: firstCookie, Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' }, body: JSON.stringify({ conversationId: conversation.id, body: 'Necesito orientación.', idempotencyKey: 'runtime-message-one' }) });
    expect(accepted.status).toBe(201);
    const logout = await workerFetch('/api/logout', { method: 'POST', headers: { Cookie: firstCookie, Origin: origin } });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const afterLogout = await workerFetch('/api/session', { headers: { Cookie: firstCookie } });
    expect(await envelope<{ authenticated: boolean }>(afterLogout)).toMatchObject({ authenticated: false });
  });

  test('procesa multipart, guarda foto privada y permite revisión operadora auditada', async () => {
    const user = principal('report-user');
    const operator = principal('operator-one', 'VERIFIED_OPERATOR');
    const userCookie = await session(user);
    const operatorCookie = await session(operator);
    const multipart = multipartReportBody({ category: 'ANEGAMIENTO', description: 'Agua acumulada desde hace una hora.', locationLabel: 'Barrio Centro', exactLocationConsent: false, idempotencyKey: 'runtime-report-one' });
    const submitted = await workerFetch('/api/private/reports', { method: 'POST', headers: { Cookie: userCookie, Origin: origin, 'CF-Connecting-IP': '203.0.113.20', 'Content-Type': multipart.contentType }, body: multipart.body });
    if (submitted.status !== 201) throw new Error(`REPORT_SUBMIT_${submitted.status}:${await submitted.text()}`);
    const submittedData = await envelope<{ report: { id: string } }>(submitted);
    const listed = await workerFetch('/api/private/reports', { headers: { Cookie: operatorCookie } });
    const reports = (await envelope<{ reports: Array<{ id: string; photos: Array<{ id: string }> }> }>(listed)).reports;
    const row = reports.find((item) => item.id === submittedData.report.id)!;
    expect(row.photos).toHaveLength(1);
    const photoId = row.photos[0]!.id;
    const photo = await workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { headers: { Cookie: operatorCookie } });
    expect(photo.status).toBe(200);
    expect(photo.headers.get('Cache-Control')).toContain('private');
    expect((await workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { method: 'PATCH', headers: { Cookie: operatorCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED', note: 'Revisión manual.' }) })).status).toBe(200);
    const patch = (status: string, extra: Record<string, unknown> = {}) => workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: { Cookie: operatorCookie, Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: 'Revisión manual.', ...extra }) });
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
