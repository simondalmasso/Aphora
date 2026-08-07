import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSmnAlerts } from '../../src/worker/providers/smn';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; vi.useRealTimers(); vi.restoreAllMocks(); });
const feed = 'https://ssl.smn.gob.ar/feeds/CAP/rss_alertaCAP_nuevo_2026.xml';

function xml(item: string, channel = '<lastBuildDate>2026-08-06T04:30:00.000Z</lastBuildDate>'): string {
  return `<rss><channel>${channel}${item}</channel></rss>`;
}

function response(body: string): Response { return new Response(body, { headers: { 'Content-Type': 'application/xml' } }); }

describe('SMN CAP normalization', () => {
  it('falls back to the HTTPS feed URL and expires alerts without expiry after 12 hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T18:30:00.000Z'));
    globalThis.fetch = vi.fn(async () => response(xml(`<item><title>Alerta para Santa Fe</title><pubDate>2026-08-06T04:00:00.000Z</pubDate><link>javascript:alert(1)</link><areaDesc>Santa Fe</areaDesc></item>`))) as typeof fetch;
    const result = await fetchSmnAlerts(feed);
    expect(result.value?.[0]).toMatchObject({ sourceUrl: feed, lifecycle: 'EXPIRED', appliesToSantaFe: true });
  });

  it('fails closed when an empty channel has no trustworthy timestamp', async () => {
    globalThis.fetch = vi.fn(async () => response(xml('', ''))) as typeof fetch;
    const result = await fetchSmnAlerts(feed);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.errorClass).toBe('PARSE');
  });
});
