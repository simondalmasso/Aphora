import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('service worker privacy policy', () => {
  it('uses an explicit public API allowlist and network-only private path', async () => {
    const source = await readFile('public/service-worker.js', 'utf8');
    expect(source).toContain("const PUBLIC_API_ALLOWLIST = new Set(['/api/snapshot', '/api/sources', '/api/messages', '/api/essential-contacts'])");
    expect(source).toContain('privateApiNetworkOnly');
    expect(source).toContain("PUBLIC_API_ALLOWLIST.has(url.pathname) ? publicApiNetworkFirst(request) : privateApiNetworkOnly(request)");
    expect(source).not.toContain("if (url.pathname.startsWith('/api/')) { event.respondWith(apiNetworkFirst(request));");
  });

  it('refuses to cache private or no-store responses', async () => {
    const source = await readFile('public/service-worker.js', 'utf8');
    expect(source).toContain("directive.includes('private')");
    expect(source).toContain("directive.includes('no-store')");
    expect(source).toContain("'Cache-Control': 'private, no-store'");
  });
});
