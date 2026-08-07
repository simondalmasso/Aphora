import { describe, expect, it } from 'vitest';
import { validateSnapshot } from '../../src/domain/validation.ts';

describe('production snapshot validation diagnostic', () => {
  it('reports whether the current production envelope validates in the client domain', async () => {
    const response = await fetch(`https://sos-sf.simondalmasso44.workers.dev/api/snapshot?validation=${Date.now()}`, {
      headers: { 'Cache-Control': 'no-cache, no-store', Accept: 'application/json' },
    });
    expect(response.status).toBe(200);
    const envelope = await response.json() as { data?: unknown };
    const data = envelope.data as { sources?: readonly Record<string, unknown>[]; timeline?: readonly Record<string, unknown>[] } | undefined;
    console.log('SOURCE_URL_DIAGNOSTIC', JSON.stringify((data?.sources ?? []).map((source, index) => ({ index, id: source.id, url: source.url, urlType: typeof source.url, classification: source.classification })), null, 2));
    console.log('TIMELINE_URL_DIAGNOSTIC', JSON.stringify((data?.timeline ?? []).map((event, index) => ({ index, id: event.id, url: event.url, urlType: typeof event.url })), null, 2));
    try {
      const validated = validateSnapshot(envelope.data);
      console.log(JSON.stringify({ validated: true, id: validated.id, dataStatus: validated.dataStatus, systems: validated.systems?.map((system) => ({ id: system.id, available: system.available, currentMetres: system.currentMetres, sourceId: system.sourceId })) }, null, 2));
    } catch (error) {
      console.error('VALIDATION_ERROR', error instanceof Error ? error.message : String(error));
      throw error;
    }
  });
});
