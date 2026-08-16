import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('service worker 028 offline truth policy', () => {
  it('keeps every API request network-only and delegates last public snapshot to validated local storage', async () => {
    const source = await readFile('public/service-worker.js', 'utf8');
    expect(source).toContain("if (url.pathname.startsWith('/api/'))");
    expect(source).toContain('event.respondWith(privateApiNetworkOnly(request));');
    expect(source).not.toContain('PUBLIC_DATA_CACHE');
    expect(source).not.toContain('publicApiNetworkFirst');
  });
  it('never caches no-store responses or cross-origin map tiles', async () => {
    const source = await readFile('public/service-worker.js', 'utf8');
    expect(source).toContain("directive.includes('no-store')");
    expect(source).toContain('if (url.origin !== self.location.origin) return;');
    expect(source).toContain("'Cache-Control': 'private, no-store'");
  });
});
