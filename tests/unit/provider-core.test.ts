import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProvider, type ProviderPolicy } from '../../src/worker/providers/core';

const policy: ProviderPolicy = {
  id: 'test-provider',
  hosts: ['provider.example.org'],
  paths: [/^\/api\/values$/],
  contentTypes: ['application/json'],
  maxBytes: 64,
  freshMs: 0,
  staleMs: 60_000,
};

class MemoryCache {
  readonly values = new Map<string, Response>();
  async match(request: Request) { const value = this.values.get(request.url); return value?.clone(); }
  async put(request: Request, response: Response) { this.values.set(request.url, response.clone()); }
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('bounded provider transport', () => {
  it('rejects non-allowlisted host or path before network access', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const host = await fetchProvider('https://attacker.example/api/values', policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    const path = await fetchProvider('https://provider.example.org/other', policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    expect(host.errorClass).toBe('ALLOWLIST');
    expect(path.errorClass).toBe('ALLOWLIST');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects oversized upstream payloads before parsing', async () => {
    globalThis.fetch = vi.fn(async () => new Response('x'.repeat(80), { headers: { 'Content-Type': 'application/json', 'Content-Length': '80' } })) as typeof fetch;
    const result = await fetchProvider('https://provider.example.org/api/values', policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.errorClass).toBe('BODY_TOO_LARGE');
  });


  it('refetches after refreshMs even while the cached observation remains fresh', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-03T18:00:00.000Z'));
    const cache = new MemoryCache();
    vi.stubGlobal('caches', { default: cache });
    const observedAt = '2026-08-03T17:00:00.000Z';
    const fetchMock = vi.fn(async () => new Response('{"value":1}', { headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;
    const refreshPolicy: ProviderPolicy = { ...policy, refreshMs: 5 * 60_000, freshMs: 36 * 60 * 60_000 };
    const parse = () => ({ value: { ok: true }, observedAt });

    const first = await fetchProvider('https://provider.example.org/api/values', refreshPolicy, parse);
    vi.advanceTimersByTime(4 * 60_000);
    const second = await fetchProvider('https://provider.example.org/api/values', refreshPolicy, parse);
    vi.advanceTimersByTime(2 * 60_000);
    const third = await fetchProvider('https://provider.example.org/api/values', refreshPolicy, parse);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.status).toBe('FRESH');
    expect(third.fromCache).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('opens the circuit after repeated provider failures', async () => {
    const cache = new MemoryCache();
    vi.stubGlobal('caches', { default: cache });
    const fetchMock = vi.fn(async () => new Response('failed', { status: 503, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;
    const url = 'https://provider.example.org/api/values?station=30';
    await fetchProvider(url, policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    await fetchProvider(url, policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    await fetchProvider(url, policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    const fourth = await fetchProvider(url, policy, () => ({ value: {}, observedAt: new Date().toISOString() }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fourth.errorClass).toBe('CIRCUIT_OPEN');
  });
});
