import { MessagingService } from '../domain/private-messaging/service';
import type { SessionPrincipal } from '../domain/private-messaging/types';
import { clearSessionCookie, createSessionCookie, readSession, verifyGoogleIdToken } from './auth';
import { D1MessageStore, type D1DatabaseLike } from './d1-message-store';
import { buildLiveSnapshot, type LiveDataEnv } from './live-data';
import { liteResponse } from './lite';
import { createReport, listReports, reportPhoto, updateReport, type R2BucketLike, type ReportEnv } from './reports';
import { errorResponse, jsonResponse, privateErrorResponse, privateJsonResponse } from './responses';
import { withSecurityHeaders } from './security';

export interface AssetFetcher { fetch(request: Request): Promise<Response> }
export interface WorkerEnv extends LiveDataEnv, ReportEnv {
  readonly ASSETS: AssetFetcher;
  readonly PRIVATE_MESSAGING_ENABLED?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly SESSION_SIGNING_KEY?: string;
  readonly SOS_SF_OPERATOR_EMAILS?: string;
  readonly MESSAGE_BLOCKLIST?: string;
  readonly MESSAGES_DB?: D1DatabaseLike;
  readonly REPORTS_BUCKET?: R2BucketLike;
}

const PUBLIC_API_PATHS = new Set(['/api/health', '/api/snapshot', '/api/sources', '/api/messages', '/api/essential-contacts', '/api/auth/config', '/api/session']);
const PRIVATE_PREFIX = '/api/private/';
const ESSENTIAL_CONTACTS = Object.freeze([
  Object.freeze({ id: '911', label: 'Central de Emergencias', number: '911', href: 'tel:911' }),
  Object.freeze({ id: '103', label: 'COBEM', number: '103', href: 'tel:103' }),
  Object.freeze({ id: '107', label: 'Emergencias médicas', number: '107', href: 'tel:107' }),
  Object.freeze({ id: '100', label: 'Bomberos', number: '100', href: 'tel:100' }),
  Object.freeze({ id: '106', label: 'Prefectura / emergencia náutica', number: '106', href: 'tel:106' }),
  Object.freeze({ id: 'municipal', label: 'Atención Ciudadana municipal', number: '0800-777-5000', href: 'tel:08007775000' }),
]);

function privateMessagingEnabled(env: WorkerEnv): boolean {
  return env.PRIVATE_MESSAGING_ENABLED === 'true' && Boolean(env.GOOGLE_CLIENT_ID && env.SESSION_SIGNING_KEY && env.SESSION_SIGNING_KEY.length >= 32 && env.MESSAGES_DB);
}

function reportingEnabled(env: WorkerEnv): boolean { return privateMessagingEnabled(env) && Boolean(env.REPORTS_BUCKET); }

async function publicApiResponse(pathname: string, env: WorkerEnv): Promise<Response> {
  if (pathname === '/api/health') return jsonResponse({ service: 'sos-sf', status: 'healthy', dataMode: 'LIVE_AGGREGATION', privateMessaging: privateMessagingEnabled(env) ? 'ENABLED' : 'FEATURE_DISABLED', reporting: reportingEnabled(env) ? 'ENABLED' : 'FEATURE_DISABLED', providers: ['INA_REST', 'INA_WATERML_OPTIONAL', 'PORTS_JSON_OPTIONAL', 'SMN_JSON_OPTIONAL', 'NASA_GPM_SUPPLEMENTARY'] }, { cacheControl: 'no-store' });
  if (pathname === '/api/essential-contacts') return jsonResponse({ contacts: ESSENTIAL_CONTACTS, sources: ['https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/cobem/', 'https://www.santafe.gov.ar/index.php/web/guia/contactenosAccesible'] }, { cacheControl: 'public, max-age=86400' });
  if (pathname === '/api/auth/config') {
    const enabled = privateMessagingEnabled(env);
    return jsonResponse({ enabled, reportingEnabled: reportingEnabled(env), provider: 'GOOGLE_IDENTITY_SERVICES_DIRECT', googleClientId: enabled ? env.GOOGLE_CLIENT_ID : null, oneTap: false, scopes: 'openid email profile', activationState: enabled ? 'ACTIVE' : 'REQUIRES_PROTECTED_GOOGLE_D1_CONFIGURATION' }, { cacheControl: 'no-store' });
  }
  const snapshot = await buildLiveSnapshot(env);
  if (pathname === '/api/snapshot') return jsonResponse(snapshot, { generatedAt: snapshot.generatedAt, cacheControl: 'no-store' });
  if (pathname === '/api/sources') return jsonResponse({ snapshotId: snapshot.id, systems: snapshot.systems ?? [], sources: snapshot.sources, contradictions: snapshot.contradictions }, { generatedAt: snapshot.generatedAt, cacheControl: 'no-store' });
  if (pathname === '/api/messages') return jsonResponse({ snapshotId: snapshot.id, messages: snapshot.messages, deliveryClaims: 'NONE' }, { generatedAt: snapshot.generatedAt, cacheControl: 'no-store' });
  return errorResponse('NOT_FOUND', 'Ruta API inexistente', 404);
}

async function parseJsonBody(request: Request, maxBytes = 4096): Promise<unknown> {
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) throw new Error('CONTENT_TYPE_REQUIRED');
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('BODY_TOO_LARGE');
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error('BODY_TOO_LARGE');
  try { return JSON.parse(body) as unknown; } catch { throw new Error('INVALID_JSON'); }
}

function requireSameOrigin(request: Request): void {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== new URL(request.url).origin) throw new Error('CSRF_ORIGIN_REJECTED');
}

async function networkActorId(request: Request, secret: string): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${secret}:${ip}`)));
  return `network:${Array.from(bytes.slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function messagingService(env: WorkerEnv): MessagingService {
  if (!env.MESSAGES_DB) throw new Error('PRIVATE_MESSAGING_DISABLED');
  return new MessagingService(new D1MessageStore(env.MESSAGES_DB), { now: () => new Date(), id: () => crypto.randomUUID(), retentionDays: 30, rateLimit: 10, rateWindowMinutes: 10, blockedTerms: env.MESSAGE_BLOCKLIST ?? '' });
}

async function sessionFor(request: Request, env: WorkerEnv): Promise<SessionPrincipal | null> {
  if (!env.SESSION_SIGNING_KEY) return null;
  return readSession(request, env.SESSION_SIGNING_KEY);
}

function privateFailure(error: unknown): Response {
  const code = error instanceof Error ? error.message : 'PRIVATE_REQUEST_FAILED';
  const status = code === 'RATE_LIMITED' ? 429 : code.includes('FORBIDDEN') || code === 'ROLE_CONFLICT' ? 403 : code.includes('NOT_FOUND') ? 404 : code.includes('INVALID') || code.includes('REQUIRED') || code.includes('UNSUPPORTED') || code.includes('CSRF') || code.includes('TOO_') || code === 'CONTENT_REJECTED' ? 400 : code.startsWith('GOOGLE_') || code === 'AUTHENTICATION_REQUIRED' ? 401 : code.includes('DISABLED') ? 503 : 500;
  const publicMessage = status === 429 ? 'Demasiados intentos; esperá antes de volver a enviar.' : status === 401 ? 'La sesión o identidad no pudo validarse.' : status === 403 ? 'No tenés acceso a esta operación.' : status === 404 ? 'El recurso solicitado no existe.' : status === 400 ? 'El contenido no cumple las reglas de este servicio.' : status === 503 ? 'La función todavía no está habilitada.' : 'No se pudo completar la operación privada.';
  return privateErrorResponse(status === 400 ? 'CONTENT_REJECTED' : code, publicMessage, status);
}

async function handleAuth(request: Request, env: WorkerEnv, pathname: string): Promise<Response> {
  if (pathname === '/api/session' && request.method === 'GET') {
    const enabled = privateMessagingEnabled(env);
    const principal = enabled ? await sessionFor(request, env) : null;
    return privateJsonResponse({ enabled, authenticated: Boolean(principal), principal });
  }
  if (pathname === '/api/logout' && request.method === 'POST') {
    requireSameOrigin(request);
    return privateJsonResponse({ authenticated: false }, { headers: { 'Set-Cookie': clearSessionCookie() } });
  }
  if (pathname !== '/api/auth/google' || request.method !== 'POST') return privateErrorResponse('NOT_FOUND', 'Ruta privada inexistente', 404);
  if (!privateMessagingEnabled(env) || !env.GOOGLE_CLIENT_ID || !env.SESSION_SIGNING_KEY) return privateErrorResponse('PRIVATE_MESSAGING_DISABLED', 'La bandeja privada todavía no está activada.', 503);
  requireSameOrigin(request);
  const body = await parseJsonBody(request);
  if (typeof body !== 'object' || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || typeof (body as { credential?: unknown }).credential !== 'string') throw new Error('GOOGLE_CREDENTIAL_INVALID');
  const claims = await verifyGoogleIdToken((body as { credential: string }).credential, env.GOOGLE_CLIENT_ID);
  const cookie = await createSessionCookie(claims, env.SESSION_SIGNING_KEY, env.SOS_SF_OPERATOR_EMAILS ?? '');
  const principal = await readSession(new Request(request.url, { headers: { Cookie: cookie.split(';')[0]! } }), env.SESSION_SIGNING_KEY);
  return privateJsonResponse({ authenticated: true, principal }, { headers: { 'Set-Cookie': cookie } });
}

async function handleReportRoutes(request: Request, env: WorkerEnv, url: URL, principal: SessionPrincipal): Promise<Response | null> {
  if (url.pathname === '/api/private/reports') {
    if (request.method === 'GET') return privateJsonResponse(await listReports(env, principal, url.searchParams.get('status')));
    if (request.method === 'POST') { requireSameOrigin(request); return privateJsonResponse(await createReport(request, env, principal), { status: 201 }); }
  }
  const photoMatch = url.pathname.match(/^\/api\/private\/operator\/reports\/([^/]+)\/photos\/([^/]+)$/);
  if (photoMatch && request.method === 'GET') return reportPhoto(env, principal, decodeURIComponent(photoMatch[1]!), decodeURIComponent(photoMatch[2]!));
  const reportMatch = url.pathname.match(/^\/api\/private\/operator\/reports\/([^/]+)$/);
  if (reportMatch && request.method === 'PATCH') { requireSameOrigin(request); return privateJsonResponse(await updateReport(request, env, principal, decodeURIComponent(reportMatch[1]!))); }
  return null;
}

async function handlePrivate(request: Request, env: WorkerEnv, url: URL): Promise<Response> {
  if (!privateMessagingEnabled(env) || !env.SESSION_SIGNING_KEY) return privateErrorResponse('PRIVATE_MESSAGING_DISABLED', 'Las funciones privadas todavía no están activadas.', 503);
  const principal = await sessionFor(request, env);
  if (!principal) return privateErrorResponse('AUTHENTICATION_REQUIRED', 'Iniciá sesión con Google para usar funciones privadas.', 401);
  const reportResponse = await handleReportRoutes(request, env, url, principal);
  if (reportResponse) return reportResponse;
  const service = messagingService(env);
  if (url.pathname === '/api/private/conversations') {
    if (request.method === 'GET') return privateJsonResponse({ conversations: await service.listConversations(principal), limit: 40 });
    if (request.method === 'POST') { requireSameOrigin(request); return privateJsonResponse({ conversation: await service.getOrCreateConversation(principal) }, { status: 201 }); }
  }
  if (url.pathname === '/api/private/messages') {
    if (request.method === 'GET') {
      const conversationId = url.searchParams.get('conversationId');
      if (!conversationId) throw new Error('CONVERSATION_ID_REQUIRED');
      return privateJsonResponse(await service.listMessages(principal, conversationId, url.searchParams.get('before')));
    }
    if (request.method === 'POST') {
      requireSameOrigin(request);
      const result = await service.send(principal, await parseJsonBody(request), await networkActorId(request, env.SESSION_SIGNING_KEY));
      return privateJsonResponse(result, { status: result.duplicate ? 200 : 201 });
    }
  }
  return privateErrorResponse('NOT_FOUND', 'Ruta privada inexistente', 404);
}

export async function routeRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const isHead = request.method === 'HEAD';
  try {
    if (url.pathname === '/lite') {
      if (request.method !== 'GET' && !isHead) return errorResponse('METHOD_NOT_ALLOWED', 'Sólo se admite lectura por GET o HEAD', 405);
      const response = liteResponse(await buildLiveSnapshot(env), ESSENTIAL_CONTACTS);
      return isHead ? new Response(null, response) : response;
    }
    if (PUBLIC_API_PATHS.has(url.pathname) && url.pathname !== '/api/session') {
      if (request.method !== 'GET' && !isHead) return errorResponse('METHOD_NOT_ALLOWED', 'Sólo se admite lectura por GET o HEAD', 405);
      const response = await publicApiResponse(url.pathname, env);
      return isHead ? new Response(null, response) : response;
    }
    if (url.pathname === '/api/session' || url.pathname === '/api/auth/google' || url.pathname === '/api/logout') return await handleAuth(request, env, url.pathname);
    if (url.pathname.startsWith(PRIVATE_PREFIX)) return await handlePrivate(request, env, url);
    if (url.pathname.startsWith('/api/')) return errorResponse('NOT_FOUND', 'Ruta API inexistente', 404);
    if (request.method !== 'GET' && !isHead) return errorResponse('METHOD_NOT_ALLOWED', 'Método no admitido', 405);
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  } catch (error) {
    if (url.pathname.startsWith(PRIVATE_PREFIX) || ['/api/session', '/api/auth/google', '/api/logout'].includes(url.pathname)) return privateFailure(error);
    return errorResponse('INVALID_REQUEST', 'No se pudo interpretar la solicitud', 400);
  }
}
