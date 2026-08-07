import { describe, expect, it } from 'vitest';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types.ts';
import { createSessionCookieForPrincipal, securityTokenHash } from '../../src/worker/auth.ts';
import type { D1DatabaseLike, D1Statement } from '../../src/worker/d1-message-store.ts';
import { routeRequest } from '../../src/worker/router.ts';

class Statement implements D1Statement {
  values: unknown[] = [];
  constructor(private readonly db: Db, private readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.query.startsWith('SELECT id,sub,email,role')) return this.db.sessions.get(String(this.values[0])) as T ?? null;
    return null;
  }
  async all<T>() { return { results: [] as T[] }; }
  async run() {
    if (this.query.startsWith('UPDATE auth_sessions SET revoked_at')) {
      const row = this.db.sessions.get(String(this.values[1]));
      if (row) this.db.sessions.set(String(this.values[1]), { ...row, revoked_at: row.revoked_at ?? this.values[0] });
    }
    return { success: true };
  }
}
class Db implements D1DatabaseLike {
  sessions = new Map<string, Record<string, unknown>>();
  prepare(query: string) { return new Statement(this, query); }
}

const secret = 'test-session-key-with-at-least-thirty-two-bytes';
const csrfToken = 'csrf-token-value-with-more-than-thirty-two-characters';
const principal: SessionPrincipal = { sessionId: 'session:test-session', sub: '1234567890', email: 'operator@example.org', role: 'VERIFIED_OPERATOR', expiresAt: '2099-08-03T23:00:00.000Z' };

async function fixture(operatorEmails = 'operator@example.org') {
  const db = new Db();
  db.sessions.set(principal.sessionId, { id: principal.sessionId, sub: principal.sub, email: principal.email, role: principal.role, expires_at: principal.expiresAt, revoked_at: null, csrf_hash: await securityTokenHash(csrfToken) });
  const cookie = await createSessionCookieForPrincipal(principal, secret, Date.parse('2026-08-03T20:00:00.000Z'));
  const env = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) }, PRIVATE_MESSAGING_ENABLED: 'true', GOOGLE_CLIENT_ID: 'client.apps.googleusercontent.com', SESSION_SIGNING_KEY: secret, SOS_SF_OPERATOR_EMAILS: operatorEmails, MESSAGES_DB: db };
  return { db, cookie: cookie.split(';')[0]!, env };
}

function writeHeaders(cookie: string, csrf = csrfToken): HeadersInit {
  return { Cookie: cookie, Origin: 'https://sos-sf.test', 'Sec-Fetch-Site': 'same-origin', 'X-CSRF-Token': csrf };
}

describe('revocable CSRF-bound sessions', () => {
  it('rejects logout without the session CSRF token', async () => {
    const { cookie, env } = await fixture();
    const response = await routeRequest(new Request('https://sos-sf.test/api/logout', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://sos-sf.test' } }), env);
    expect(response.status).toBe(400);
  });

  it('revokes the server-side session on CSRF-protected logout', async () => {
    const { db, cookie, env } = await fixture();
    const response = await routeRequest(new Request('https://sos-sf.test/api/logout', { method: 'POST', headers: writeHeaders(cookie) }), env);
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(db.sessions.get(principal.sessionId)?.revoked_at).toBeTruthy();
    const session = await routeRequest(new Request('https://sos-sf.test/api/session', { headers: { Cookie: cookie } }), env);
    expect(await session.json()).toMatchObject({ data: { authenticated: false } });
  });

  it('revokes an operator session when the protected allowlist no longer grants the role', async () => {
    const { db, cookie, env } = await fixture('');
    const response = await routeRequest(new Request('https://sos-sf.test/api/session', { headers: { Cookie: cookie } }), env);
    expect(await response.json()).toMatchObject({ data: { authenticated: false } });
    expect(db.sessions.get(principal.sessionId)?.revoked_at).toBeTruthy();
  });
});
