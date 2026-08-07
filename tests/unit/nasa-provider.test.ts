import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNasaGpm } from '../../src/worker/providers/nasa.ts';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NASA GPM bounded sample chain', () => {
  it('locks getSamples to the latest queried raster and calculates latency from StdTime', async () => {
    const stdTime = Date.now() - 95 * 60_000;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith('/query')) {
        return new Response(JSON.stringify({ features: [{ attributes: { objectid: 586368, stdtime: stdTime } }] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ samples: [{ rasterId: 586368, value: '1.25' }] }), { headers: { 'Content-Type': 'application/json' } });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const result = await fetchNasaGpm('https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer');
    expect(result.value?.value).toBe(1.25);
    expect(result.value?.latencyMinutes).toBeGreaterThanOrEqual(94);
    expect(result.value?.latencyMinutes).toBeLessThanOrEqual(96);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sampleUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(JSON.parse(sampleUrl.searchParams.get('mosaicRule') ?? '{}')).toEqual({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [586368] });
  });

  it('returns UNAVAILABLE when the locked raster has no real numeric sample', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith('/query')) {
        return new Response(JSON.stringify({ features: [{ attributes: { objectid: 42, stdtime: Date.now() - 60_000 } }] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: { code: 503, message: 'Wait timeout' } }), { headers: { 'Content-Type': 'application/json' } });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    const result = await fetchNasaGpm('https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer');
    expect(result.value).toBeNull();
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.errorClass).toBe('PARSE');
  });
});
