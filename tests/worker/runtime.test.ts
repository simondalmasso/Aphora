import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestHarness } from 'wrangler';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types';
import { createSessionCookieForPrincipal, securityTokenHash } from '../../src/worker/auth';

interface TestEnv {
  readonly MESSAGES_DB: D1Database;
  readonly REPORTS_KV: KVNamespace;
  readonly SESSION_SIGNING_KEY: string;
}
interface JsonResponseLike { json(): Promise<unknown> }

const server = createTestHarness({ workers: [{ configPath: './wrangler.test.jsonc' }] });
type HarnessRequestInit = Parameters<typeof server.fetch>[1];
const origin = 'http://sos-sf.test';
let env: TestEnv;
const workerFetch = (path: string, init?: RequestInit) => server.fetch(`${origin}${path}`, init as HarnessRequestInit);

interface SessionFixture { readonly cookie: string; readonly csrf: string }
async function session(principal: SessionPrincipal): Promise<SessionFixture> {
  const csrf = `csrf-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  await env.MESSAGES_DB.prepare('INSERT INTO auth_sessions (id,sub,email,role,created_at,expires_at,revoked_at,rotated_from,csrf_hash,last_seen_at) VALUES (?,?,?,?,?,?,NULL,NULL,?,?)')
    .bind(principal.sessionId, principal.sub, principal.email, principal.role, new Date().toISOString(), principal.expiresAt, await securityTokenHash(csrf), new Date().toISOString()).run();
  return { cookie: (await createSessionCookieForPrincipal(principal, env.SESSION_SIGNING_KEY)).split(';')[0]!, csrf };
}

function principal(id: string, role: SessionPrincipal['role'] = 'AUTHENTICATED_USER'): SessionPrincipal {
  return { sessionId: `session:${id}`, sub: `100000${id.replaceAll('-', '')}`, email: role === 'VERIFIED_OPERATOR' ? 'operator@example.org' : `${id}@example.org`, role, expiresAt: '2099-08-03T23:00:00.000Z' };
}

function writeHeaders(value: SessionFixture, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set('Cookie', value.cookie);
  headers.set('Origin', origin);
  headers.set('Sec-Fetch-Site', 'same-origin');
  headers.set('X-CSRF-Token', value.csrf);
  return headers;
}

async function envelope<T>(response: JsonResponseLike): Promise<T> {
  const body = await response.json() as { data: T };
  return body.data;
}

function multipartReportBody(metadata: Record<string, unknown>): { body: ArrayBuffer; contentType: string } {
  const boundary = `sos-sf-runtime-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="evidence.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9]),
    encoder.encode(`\r\n--${boundary}--\r\n`),
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const body = new ArrayBuffer(total); const view = new Uint8Array(body); let offset = 0;
  for (const chunk of chunks) { view.set(chunk, offset); offset += chunk.byteLength; }
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

beforeAll(async () => {
  await server.listen();
  const worker = server.getWorker<TestEnv>('sos-sf-test');
  await worker.applyD1Migrations('MESSAGES_DB');
  env = await worker.getEnv();
});
afterAll(async () => { await server.close(); });

describe.sequential('Worker real con D1 y KV locales', () => {
  test('sirve la página con headers endurecidos', async () => {
    const response = await workerFetch('/offline.html');
    expect(response.status).toBe(200);
    expect(response.headers.get('Permissions-Policy')).toContain('geolocation=(self)');
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()');
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'");
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  test('falla cerrado y rechaza escrituras sin CSRF', async () => {
    expect((await workerFetch('/api/snapshot', { method: 'POST' })).status).toBe(405);
    const anonymous = await workerFetch('/api/private/reports');
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('Cache-Control')).toContain('private');
    const userSession = await session(principal('csrf-user'));
    const rejected = await workerFetch('/api/private/conversations', { method: 'POST', headers: { Cookie: userSession.cookie, Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    expect(rejected.status).toBe(400);
  });

  test('aísla conversaciones, conserva idempotencia y revoca logout', async () => {
    const first = principal('user-one'); const second = principal('user-two');
    const firstSession = await session(first); const secondSession = await session(second);
    const created = await workerFetch('/api/private/conversations', { method: 'POST', headers: writeHeaders(firstSession, { 'Content-Type': 'application/json' }), body: '{}' });
    expect(created.status).toBe(201);
    const conversation = (await envelope<{ conversation: { id: string } }>(created)).conversation;
    const forbidden = await workerFetch(`/api/private/messages?conversationId=${encodeURIComponent(conversation.id)}`, { headers: { Cookie: secondSession.cookie } });
    expect(forbidden.status).toBe(403);
    const payload = { conversationId: conversation.id, body: 'Necesito orientación.', idempotencyKey: 'runtime-message-one' };
    const accepted = await workerFetch('/api/private/messages', { method: 'POST', headers: writeHeaders(firstSession, { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' }), body: JSON.stringify(payload) });
    const duplicate = await workerFetch('/api/private/messages', { method: 'POST', headers: writeHeaders(firstSession, { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.10' }), body: JSON.stringify(payload) });
    expect(accepted.status).toBe(201); expect(duplicate.status).toBe(200);
    expect(await envelope<{ duplicate: boolean }>(duplicate)).toMatchObject({ duplicate: true });
    const logout = await workerFetch('/api/logout', { method: 'POST', headers: writeHeaders(firstSession) });
    expect(logout.status).toBe(200); expect(logout.headers.get('Set-Cookie')).toContain('Max-Age=0');
    const afterLogout = await workerFetch('/api/session', { headers: { Cookie: firstSession.cookie } });
    expect(await envelope<{ authenticated: boolean }>(afterLogout)).toMatchObject({ authenticated: false });
  });

  test('aplica rate limit atómico ante envíos concurrentes', async () => {
    const userSession = await session(principal('rate-user'));
    const created = await workerFetch('/api/private/conversations', { method: 'POST', headers: writeHeaders(userSession, { 'Content-Type': 'application/json' }), body: '{}' });
    const conversation = (await envelope<{ conversation: { id: string } }>(created)).conversation;
    const responses = await Promise.all(Array.from({ length: 12 }, (_, index) => workerFetch('/api/private/messages', { method: 'POST', headers: writeHeaders(userSession, { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.77' }), body: JSON.stringify({ conversationId: conversation.id, body: `Mensaje ${index}`, idempotencyKey: `rate-message-${index}` }) })));
    expect(responses.filter((response) => response.status === 201)).toHaveLength(10);
    expect(responses.filter((response) => response.status === 429)).toHaveLength(2);
  });

  test('procesa multipart idempotente, guarda KV binario con metadata y usa acceso corto y único', async () => {
    const userSession = await session(principal('report-user'));
    const operatorSession = await session(principal('operator-one', 'VERIFIED_OPERATOR'));
    const metadata = { category: 'ANEGAMIENTO', description: 'Agua acumulada desde hace una hora.', locationLabel: 'Barrio Centro', exactLocationConsent: false, idempotencyKey: 'runtime-report-one' };
    const multipart = multipartReportBody(metadata);
    const submitted = await workerFetch('/api/private/reports', { method: 'POST', headers: writeHeaders(userSession, { 'CF-Connecting-IP': '203.0.113.20', 'Content-Type': multipart.contentType }), body: multipart.body });
    if (submitted.status !== 201) throw new Error(`REPORT_SUBMIT_${submitted.status}:${await submitted.text()}`);
    const submittedData = await envelope<{ report: { id: string } }>(submitted);
    const retry = multipartReportBody(metadata);
    const duplicate = await workerFetch('/api/private/reports', { method: 'POST', headers: writeHeaders(userSession, { 'CF-Connecting-IP': '203.0.113.20', 'Content-Type': retry.contentType }), body: retry.body });
    expect(duplicate.status).toBe(200); expect(await envelope<{ duplicate: boolean }>(duplicate)).toMatchObject({ duplicate: true });
    const listed = await workerFetch('/api/private/reports', { headers: { Cookie: operatorSession.cookie } });
    const reports = (await envelope<{ reports: Array<{ id: string; photos: Array<{ id: string }> }> }>(listed)).reports;
    const row = reports.find((item) => item.id === submittedData.report.id)!; const photoId = row.photos[0]!.id;
    const storedRow = await env.MESSAGES_DB.prepare("SELECT object_key,mime_type,bytes,expires_at,storage_backend FROM report_photos WHERE id = ?").bind(photoId).first<{ object_key: string; mime_type: string; bytes: number; expires_at: string; storage_backend: string }>();
    expect(storedRow).toMatchObject({ mime_type: 'image/jpeg', bytes: 6, storage_backend: 'KV' });
    const stored = await env.REPORTS_KV.getWithMetadata<{ mime: string; reportId: string; expiresAt: string }>(storedRow!.object_key, 'arrayBuffer');
    expect(stored.value).toBeInstanceOf(ArrayBuffer);
    expect(stored.value?.byteLength).toBe(6);
    expect(stored.metadata).toEqual({ mime: 'image/jpeg', reportId: row.id, expiresAt: storedRow!.expires_at });
    const direct = await workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { headers: { Cookie: operatorSession.cookie } });
    expect(direct.status).toBe(404);
    const grantResponse = await workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { method: 'POST', headers: writeHeaders(operatorSession) });
    expect(grantResponse.status).toBe(201);
    const grant = await envelope<{ access: { url: string; singleUse: boolean } }>(grantResponse);
    expect(grant.access.singleUse).toBe(true);
    const photo = await workerFetch(grant.access.url, { headers: { Cookie: operatorSession.cookie } });
    expect(photo.status).toBe(200); expect(photo.headers.get('Cache-Control')).toContain('private');
    expect((await workerFetch(grant.access.url, { headers: { Cookie: operatorSession.cookie } })).status).toBe(400);
    expect((await workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}/photos/${encodeURIComponent(photoId)}`, { method: 'PATCH', headers: writeHeaders(operatorSession, { 'Content-Type': 'application/json' }), body: JSON.stringify({ status: 'APPROVED', note: 'Revisión manual.' }) })).status).toBe(200);
    const patch = (status: string, extra: Record<string, unknown> = {}) => workerFetch(`/api/private/operator/reports/${encodeURIComponent(row.id)}`, { method: 'PATCH', headers: writeHeaders(operatorSession, { 'Content-Type': 'application/json' }), body: JSON.stringify({ status, note: 'Revisión manual.', ...extra }) });
    expect((await patch('UNDER_REVIEW', { moderationFlags: ['PERSONAL_DATA'], redactedDescription: 'Descripción redactada.', operatorNote: 'Se removió información personal.' })).status).toBe(200);
    expect((await patch('ESCALATION_READY')).status).toBe(200);
    expect((await patch('FORWARDED')).status).toBe(400);
    expect((await patch('FORWARDED', { forwardedDestination: 'COBEM', forwardedReference: 'exp-runtime-1' })).status).toBe(200);
  });

  test('ejecuta la purga programada sobre D1 y KV', async () => {
    const before = await env.MESSAGES_DB.prepare('SELECT COUNT(*) AS count FROM reports').first<{ count: number }>();
    expect(before?.count).toBeGreaterThan(0);
    const worker = server.getWorker<TestEnv>('sos-sf-test');
    await worker.scheduled({ cron: '17 3 * * *', scheduledTime: new Date('2100-08-04T03:17:00.000Z') });
    const after = await env.MESSAGES_DB.prepare('SELECT COUNT(*) AS count FROM reports').first<{ count: number }>();
    expect(after?.count).toBe(0);
    expect((await env.REPORTS_KV.list({ prefix: 'reports/' })).keys).toHaveLength(0);
    expect(server.getLogs().some((entry) => JSON.stringify(entry).includes('retention_purge_completed'))).toBe(true);
  });
});
