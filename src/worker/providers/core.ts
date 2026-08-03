export type ProviderStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE';
export type ProviderErrorClass = 'TIMEOUT' | 'HTTP' | 'CONTENT_TYPE' | 'BODY_TOO_LARGE' | 'PARSE' | 'ALLOWLIST' | 'CIRCUIT_OPEN' | 'NETWORK' | null;

export interface ParsedProvider<T> {
  readonly value: T;
  readonly observedAt: string;
}

export interface ProviderPolicy {
  readonly id: string;
  readonly hosts: readonly string[];
  readonly paths: readonly RegExp[];
  readonly contentTypes: readonly string[];
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly freshMs?: number;
  readonly staleMs?: number;
}

export interface ProviderResult<T> {
  readonly value: T | null;
  readonly status: ProviderStatus;
  readonly fetchedAt: string;
  readonly observedAt: string | null;
  readonly errorClass: ProviderErrorClass;
  readonly fromCache: boolean;
}

export interface ProviderHealth {
  readonly id: string;
  readonly status: ProviderStatus;
  readonly lastSuccessAt: string | null;
  readonly lastObservedAt: string | null;
  readonly errorClass: ProviderErrorClass;
  readonly circuitOpenUntil: string | null;
}

interface CachedProvider<T> {
  readonly value: T;
  readonly fetchedAt: string;
  readonly observedAt: string;
}

interface CircuitState {
  readonly failures: number;
  readonly lastSuccessAt: string | null;
  readonly lastObservedAt: string | null;
  readonly errorClass: ProviderErrorClass;
  readonly openUntil: string | null;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_FRESH_MS = 15 * 60_000;
const DEFAULT_STALE_MS = 48 * 60 * 60_000;
const CIRCUIT_FAILURES = 3;
const CIRCUIT_OPEN_MS = 5 * 60_000;
const health = new Map<string, ProviderHealth>();

function defaultCircuit(): CircuitState {
  return { failures: 0, lastSuccessAt: null, lastObservedAt: null, errorClass: null, openUntil: null };
}

function cacheApi(): Cache | null {
  return typeof caches === 'undefined' ? null : caches.default;
}

function classify(error: unknown): ProviderErrorClass {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('ALLOWLIST')) return 'ALLOWLIST';
  if (message.includes('TIMEOUT') || message.includes('AbortError')) return 'TIMEOUT';
  if (message.includes('HTTP_')) return 'HTTP';
  if (message.includes('CONTENT_TYPE')) return 'CONTENT_TYPE';
  if (message.includes('BODY_TOO_LARGE')) return 'BODY_TOO_LARGE';
  if (message.includes('PARSE')) return 'PARSE';
  if (message.includes('CIRCUIT_OPEN')) return 'CIRCUIT_OPEN';
  return 'NETWORK';
}

function allowedUrl(raw: string, policy: ProviderPolicy): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || !policy.hosts.includes(url.hostname) || !policy.paths.some((path) => path.test(url.pathname))) throw new Error('PROVIDER_ALLOWLIST_REJECTED');
  return url;
}

async function fingerprint(policy: ProviderPolicy, url: URL): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${policy.id}\n${url.toString()}`)));
  return Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function cacheRead<T>(key: URL): Promise<T | null> {
  const cache = cacheApi();
  if (!cache) return null;
  const response = await cache.match(new Request(key));
  if (!response) return null;
  try { return await response.json() as T; } catch { return null; }
}

async function cacheWrite(key: URL, value: unknown, maxAgeSeconds: number): Promise<void> {
  const cache = cacheApi();
  if (!cache) return;
  await cache.put(new Request(key), new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${maxAgeSeconds}` } }));
}

async function boundedText(response: Response, maximum: number): Promise<string> {
  const declared = Number(response.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > maximum) throw new Error('PROVIDER_BODY_TOO_LARGE');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maximum) { await reader.cancel(); throw new Error('PROVIDER_BODY_TOO_LARGE'); }
    chunks.push(part.value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(merged);
}

function publishHealth(policy: ProviderPolicy, result: ProviderResult<unknown>, circuit: CircuitState): void {
  health.set(policy.id, Object.freeze({
    id: policy.id,
    status: result.status,
    lastSuccessAt: circuit.lastSuccessAt,
    lastObservedAt: circuit.lastObservedAt,
    errorClass: result.errorClass,
    circuitOpenUntil: circuit.openUntil,
  }));
}

export function providerHealth(): readonly ProviderHealth[] {
  return Object.freeze([...health.values()].sort((a, b) => a.id.localeCompare(b.id)));
}

export async function fetchProvider<T>(rawUrl: string, policy: ProviderPolicy, parse: (body: string, contentType: string) => ParsedProvider<T>): Promise<ProviderResult<T>> {
  const now = new Date();
  let url: URL;
  try { url = allowedUrl(rawUrl, policy); }
  catch (error) {
    const result: ProviderResult<T> = { value: null, status: 'UNAVAILABLE', fetchedAt: now.toISOString(), observedAt: null, errorClass: classify(error), fromCache: false };
    publishHealth(policy, result, defaultCircuit());
    return result;
  }
  const key = await fingerprint(policy, url);
  const payloadKey = new URL(`https://cache.sos-sf.invalid/provider/${key}`);
  const circuitKey = new URL(`https://cache.sos-sf.invalid/circuit/${key}`);
  const cached = await cacheRead<CachedProvider<T>>(payloadKey);
  let circuit = await cacheRead<CircuitState>(circuitKey) ?? defaultCircuit();
  const cachedAge = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const freshMs = policy.freshMs ?? DEFAULT_FRESH_MS;
  const staleMs = policy.staleMs ?? DEFAULT_STALE_MS;
  if (cached && cachedAge <= freshMs) {
    const result: ProviderResult<T> = { value: cached.value, status: 'FRESH', fetchedAt: cached.fetchedAt, observedAt: cached.observedAt, errorClass: null, fromCache: true };
    publishHealth(policy, result, circuit);
    return result;
  }
  if (circuit.openUntil && Date.parse(circuit.openUntil) > now.getTime()) {
    const result: ProviderResult<T> = cached && cachedAge <= staleMs
      ? { value: cached.value, status: 'STALE', fetchedAt: cached.fetchedAt, observedAt: cached.observedAt, errorClass: 'CIRCUIT_OPEN', fromCache: true }
      : { value: null, status: 'UNAVAILABLE', fetchedAt: now.toISOString(), observedAt: null, errorClass: 'CIRCUIT_OPEN', fromCache: false };
    publishHealth(policy, result, circuit);
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('PROVIDER_TIMEOUT')), policy.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: policy.contentTypes.join(', ') }, cf: { cacheTtl: 0, cacheEverything: false } });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const contentType = (response.headers.get('Content-Type') ?? '').toLowerCase();
    if (!policy.contentTypes.some((item) => contentType.includes(item.toLowerCase().split(';')[0]!))) throw new Error('PROVIDER_CONTENT_TYPE_REJECTED');
    const body = await boundedText(response, policy.maxBytes ?? DEFAULT_MAX_BYTES);
    let parsed: ParsedProvider<T>;
    try { parsed = parse(body, contentType); } catch { throw new Error('PROVIDER_PARSE_FAILED'); }
    if (!Number.isFinite(Date.parse(parsed.observedAt))) throw new Error('PROVIDER_PARSE_FAILED');
    const fetchedAt = new Date().toISOString();
    const stored: CachedProvider<T> = { value: parsed.value, fetchedAt, observedAt: new Date(parsed.observedAt).toISOString() };
    await cacheWrite(payloadKey, stored, Math.ceil(staleMs / 1000));
    circuit = { failures: 0, lastSuccessAt: fetchedAt, lastObservedAt: stored.observedAt, errorClass: null, openUntil: null };
    await cacheWrite(circuitKey, circuit, Math.ceil(staleMs / 1000));
    const result: ProviderResult<T> = { value: stored.value, status: 'FRESH', fetchedAt, observedAt: stored.observedAt, errorClass: null, fromCache: false };
    publishHealth(policy, result, circuit);
    return result;
  } catch (error) {
    const errorClass = classify(error);
    const failures = circuit.failures + 1;
    circuit = {
      failures,
      lastSuccessAt: circuit.lastSuccessAt,
      lastObservedAt: circuit.lastObservedAt,
      errorClass,
      openUntil: failures >= CIRCUIT_FAILURES ? new Date(now.getTime() + CIRCUIT_OPEN_MS).toISOString() : null,
    };
    await cacheWrite(circuitKey, circuit, Math.ceil(staleMs / 1000));
    const result: ProviderResult<T> = cached && cachedAge <= staleMs
      ? { value: cached.value, status: 'STALE', fetchedAt: cached.fetchedAt, observedAt: cached.observedAt, errorClass, fromCache: true }
      : { value: null, status: 'UNAVAILABLE', fetchedAt: now.toISOString(), observedAt: null, errorClass, fromCache: false };
    publishHealth(policy, result, circuit);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
