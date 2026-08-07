import type { SessionPrincipal, UserRole } from '../domain/private-messaging/types.ts';

const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const SESSION_COOKIE = '__Host-sos_sf_session';
const CSRF_COOKIE = '__Host-sos_sf_csrf';
const SESSION_MS = 8 * 60 * 60 * 1000;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_JWKS_TIMEOUT_MS = 5_000;
const GOOGLE_JWKS_CACHE_MS = 5 * 60_000;
let googleJwksCache: { readonly expiresAt: number; readonly keys: readonly GoogleJwk[] } | null = null;
let googleJwksInFlight: Promise<readonly GoogleJwk[]> | null = null;

export interface GoogleClaims { readonly iss: string; readonly aud: string | readonly string[]; readonly azp?: string; readonly sub: string; readonly exp: number; readonly iat?: number; readonly email: string; readonly email_verified: boolean; readonly name?: string }
interface GoogleJwk extends JsonWebKey { readonly kid?: string; readonly use?: string }

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function bytesToBase64Url(value: Uint8Array): string { let binary = ''; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
function parsePart<T>(value: string): T { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))) as T; }

export function validateGoogleClaims(value: unknown, clientId: string, nowMs: number): GoogleClaims {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('GOOGLE_CLAIMS_INVALID');
  const claims = value as Record<string, unknown>;
  if (typeof claims.iss !== 'string' || !GOOGLE_ISSUERS.has(claims.iss)) throw new Error('GOOGLE_ISSUER_INVALID');
  const audiences = typeof claims.aud === 'string' ? [claims.aud] : Array.isArray(claims.aud) && claims.aud.every((item) => typeof item === 'string') ? claims.aud as string[] : [];
  if (!audiences.includes(clientId)) throw new Error('GOOGLE_AUDIENCE_INVALID');
  if ((audiences.length > 1 || claims.azp !== undefined) && claims.azp !== clientId) throw new Error('GOOGLE_AUTHORIZED_PARTY_INVALID');
  if (!Number.isSafeInteger(claims.exp) || (claims.exp as number) * 1000 <= nowMs) throw new Error('GOOGLE_TOKEN_EXPIRED');
  if (claims.iat !== undefined && (!Number.isSafeInteger(claims.iat) || (claims.iat as number) * 1000 > nowMs + 120_000)) throw new Error('GOOGLE_ISSUED_AT_INVALID');
  if (typeof claims.sub !== 'string' || !/^[0-9]{5,64}$/.test(claims.sub)) throw new Error('GOOGLE_SUB_INVALID');
  if (claims.email_verified !== true) throw new Error('GOOGLE_EMAIL_UNVERIFIED');
  if (typeof claims.email !== 'string' || claims.email.length > 320 || !claims.email.includes('@')) throw new Error('GOOGLE_EMAIL_INVALID');
  return claims as unknown as GoogleClaims;
}


async function googleSigningKeys(nowMs: number): Promise<readonly GoogleJwk[]> {
  if (googleJwksCache && googleJwksCache.expiresAt > nowMs) return googleJwksCache.keys;
  if (googleJwksInFlight) return googleJwksInFlight;
  const operation = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('GOOGLE_JWKS_TIMEOUT')), GOOGLE_JWKS_TIMEOUT_MS);
    try {
      const response = await fetch(GOOGLE_JWKS_URL, { signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('GOOGLE_JWKS_UNAVAILABLE');
      const payload = await response.json() as { keys?: unknown };
      if (!Array.isArray(payload.keys)) throw new Error('GOOGLE_JWKS_INVALID');
      const keys = Object.freeze(payload.keys.filter((key): key is GoogleJwk => typeof key === 'object' && key !== null));
      if (!keys.length) throw new Error('GOOGLE_JWKS_INVALID');
      googleJwksCache = Object.freeze({ expiresAt: nowMs + GOOGLE_JWKS_CACHE_MS, keys });
      return keys;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('GOOGLE_JWKS_TIMEOUT', { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => { googleJwksInFlight = null; });
  googleJwksInFlight = operation;
  return operation;
}

export function resetGoogleJwksCacheForTests(): void {
  googleJwksCache = null;
  googleJwksInFlight = null;
}

export async function verifyGoogleIdToken(token: string, clientId: string, nowMs = Date.now()): Promise<GoogleClaims> {
  if (token.length > 16_000) throw new Error('GOOGLE_TOKEN_TOO_LARGE');
  const parts = token.split('.'); if (parts.length !== 3) throw new Error('GOOGLE_TOKEN_INVALID');
  const header = parsePart<{ alg?: unknown; kid?: unknown }>(parts[0]!);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('GOOGLE_TOKEN_ALGORITHM_INVALID');
  const jwks = await googleSigningKeys(nowMs);
  const jwk = jwks.find((key) => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
  if (!jwk) throw new Error('GOOGLE_SIGNING_KEY_UNKNOWN');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToBytes(parts[2]!), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('GOOGLE_SIGNATURE_INVALID');
  return validateGoogleClaims(parsePart(parts[1]!), clientId, nowMs);
}

async function hmacKey(secret: string): Promise<CryptoKey> { if (secret.length < 32) throw new Error('SESSION_KEY_INVALID'); return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']); }
function operatorAllowlist(value: string): ReadonlySet<string> { return new Set(value.split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)); }
export function roleForEmail(email: string, operatorEmails: string): Exclude<UserRole, 'PUBLIC_ANONYMOUS'> { return operatorAllowlist(operatorEmails).has(email.toLowerCase()) ? 'VERIFIED_OPERATOR' : 'AUTHENTICATED_USER'; }

export function createSessionPrincipal(claims: GoogleClaims, operatorEmails: string, nowMs = Date.now(), sessionId: string = crypto.randomUUID()): SessionPrincipal {
  return Object.freeze({ sessionId: `session:${sessionId}`, sub: claims.sub, email: claims.email.toLowerCase(), role: roleForEmail(claims.email, operatorEmails), expiresAt: new Date(nowMs + SESSION_MS).toISOString() });
}
export async function createSessionCookieForPrincipal(principal: SessionPrincipal, secret: string, nowMs = Date.now()): Promise<string> {
  if (Date.parse(principal.expiresAt) <= nowMs) throw new Error('SESSION_EXPIRED');
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(principal)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(encoded)));
  const maxAge = Math.max(0, Math.floor((Date.parse(principal.expiresAt) - nowMs) / 1000));
  return `${SESSION_COOKIE}=${encoded}.${bytesToBase64Url(signature)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
export async function createSessionCookie(claims: GoogleClaims, secret: string, operatorEmails: string, nowMs = Date.now(), sessionId: string = crypto.randomUUID()): Promise<string> { return createSessionCookieForPrincipal(createSessionPrincipal(claims, operatorEmails, nowMs, sessionId), secret, nowMs); }

export async function readSession(request: Request, secret: string, nowMs = Date.now()): Promise<SessionPrincipal | null> {
  const cookies = request.headers.get('Cookie') ?? '';
  const raw = cookies.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return null;
  const [payload, signature, extra] = raw.split('.'); if (!payload || !signature || extra) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), base64UrlToBytes(signature), new TextEncoder().encode(payload)); if (!valid) return null;
  let session: SessionPrincipal; try { session = parsePart<SessionPrincipal>(payload); } catch { return null; }
  if (typeof session.sessionId !== 'string' || !/^session:[a-zA-Z0-9-]{8,128}$/.test(session.sessionId)) return null;
  if (typeof session.sub !== 'string' || typeof session.email !== 'string' || !session.email.includes('@')) return null;
  if (!['AUTHENTICATED_USER', 'VERIFIED_OPERATOR', 'ADMIN'].includes(session.role) || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= nowMs) return null;
  return Object.freeze(session);
}

export function randomSecurityToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}
export async function securityTokenHash(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return bytesToBase64Url(digest);
}
export function createCsrfCookie(token: string, expiresAt: string, nowMs = Date.now()): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - nowMs) / 1000));
  return `${CSRF_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict`;
}
export function clearSessionCookie(): string { return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`; }
export function clearCsrfCookie(): string { return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Strict`; }
