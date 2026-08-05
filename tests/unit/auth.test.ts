import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearCsrfCookie, clearSessionCookie, createCsrfCookie, createSessionCookie, readSession, securityTokenHash, validateGoogleClaims, verifyGoogleIdToken, type GoogleClaims } from '../../src/worker/auth';

const clientId = 'client.apps.googleusercontent.com';
const now = Date.parse('2026-08-02T15:00:00.000Z');
const claims: GoogleClaims = { iss: 'https://accounts.google.com', aud: clientId, sub: '1234567890', exp: Math.floor(now / 1000) + 600, iat: Math.floor(now / 1000), email: 'operator@example.org', email_verified: true };
let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

async function tokenFor(payload: unknown): Promise<string> {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })));
  const body = base64Url(Buffer.from(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, Buffer.from(`${header}.${body}`)));
  return `${header}.${body}.${base64Url(signature)}`;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

afterEach(() => vi.unstubAllGlobals());

describe('direct Google identity and own sessions', () => {
  it('rejects invalid issuer, audience, authorized party, expiry and unverified email', () => {
    expect(() => validateGoogleClaims({ ...claims, iss: 'https://attacker.test' }, clientId, now)).toThrow('GOOGLE_ISSUER_INVALID');
    expect(() => validateGoogleClaims({ ...claims, aud: 'other-client' }, clientId, now)).toThrow('GOOGLE_AUDIENCE_INVALID');
    expect(() => validateGoogleClaims({ ...claims, aud: [clientId, 'other-client'], azp: 'other-client' }, clientId, now)).toThrow('GOOGLE_AUTHORIZED_PARTY_INVALID');
    expect(() => validateGoogleClaims({ ...claims, aud: [clientId, 'other-client'], azp: clientId }, clientId, now)).not.toThrow();
    expect(() => validateGoogleClaims({ ...claims, exp: Math.floor(now / 1000) - 1 }, clientId, now)).toThrow('GOOGLE_TOKEN_EXPIRED');
    expect(() => validateGoogleClaims({ ...claims, email_verified: false }, clientId, now)).toThrow('GOOGLE_EMAIL_UNVERIFIED');
  });

  it('verifies RS256 signatures against Google JWK shape and rejects tampering', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: 'test-key', use: 'sig' }] }), { status: 200 })));
    const token = await tokenFor(claims);
    await expect(verifyGoogleIdToken(token, clientId, now)).resolves.toMatchObject({ sub: claims.sub, email_verified: true });
    const parts = token.split('.');
    const tampered = `${parts[0]}.${base64Url(Buffer.from(JSON.stringify({ ...claims, sub: '9999999999' })))}.${parts[2]}`;
    await expect(verifyGoogleIdToken(tampered, clientId, now)).rejects.toThrow('GOOGLE_SIGNATURE_INVALID');
  });

  it('creates signed finite HttpOnly sessions with unique identity and server-side role', async () => {
    const secret = 'test-session-key-with-at-least-thirty-two-bytes';
    const cookie = await createSessionCookie(claims, secret, 'operator@example.org', now, 'fixed-session-id');
    expect(cookie).toContain('HttpOnly; Secure; SameSite=Strict');
    const request = new Request('https://sos-sf.test', { headers: { Cookie: cookie.split(';')[0]! } });
    await expect(readSession(request, secret, now + 1)).resolves.toMatchObject({ sessionId: 'session:fixed-session-id', sub: claims.sub, email: claims.email, role: 'VERIFIED_OPERATOR' });
    const rawCookie = cookie.split(';')[0]!;
    const separator = rawCookie.lastIndexOf('.');
    const signature = rawCookie.slice(separator + 1);
    const tamperedCookie = `${rawCookie.slice(0, separator + 1)}${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    await expect(readSession(new Request('https://sos-sf.test', { headers: { Cookie: tamperedCookie } }), secret, now + 1)).resolves.toBeNull();
    await expect(readSession(request, secret, now + 8 * 60 * 60 * 1000 + 1)).resolves.toBeNull();
    expect(clearSessionCookie()).toContain('Max-Age=0');
    const csrf = createCsrfCookie('csrf-token-value-with-more-than-thirty-two-characters', new Date(now + 60_000).toISOString(), now);
    expect(csrf).toContain('Secure; SameSite=Strict');
    await expect(securityTokenHash('csrf-token-value-with-more-than-thirty-two-characters')).resolves.toMatch(/^[a-zA-Z0-9_-]{40,}$/);
    expect(clearCsrfCookie()).toContain('Max-Age=0');
  });
});
