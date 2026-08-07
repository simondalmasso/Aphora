import { describe, expect, it } from 'vitest';
import { validateSnapshot } from '../../src/domain/validation.ts';

const base = (process.env.DEPLOYMENT_URL || 'https://sos-sf.simondalmasso44.workers.dev').replace(/\/$/, '');

describe('020-B final corrective production truth', () => {
  it('accepts the real snapshot and keeps optional source URLs contract-safe', async () => {
    const response = await fetch(`${base}/api/snapshot?truth=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache, no-store' } });
    expect(response.ok).toBe(true);
    const envelope = await response.json() as { data?: unknown };
    const snapshot = validateSnapshot(envelope.data);
    const usable = snapshot.systems?.filter((system) => system.available && system.currentMetres !== null) ?? [];
    expect(usable.some((system) => system.id === 'parana-santa-fe' || system.id === 'salado-santo-tome')).toBe(true);
    expect(snapshot.sources.every((source) => source.url === undefined || (source.url.length > 0 && source.url.startsWith('https://')))).toBe(true);
    expect(snapshot.timeline?.every((event) => event.url === undefined || (event.url.length > 0 && event.url.startsWith('https://')))).toBe(true);
    const allowed = new Set(['OPERATIONAL_FRESH','OPERATIONAL_STALE','DEGRADED','SUPPLEMENTARY','BLOCKED_CREDENTIAL','BLOCKED_NO_MACHINE_ENDPOINT','REJECTED_UNSAFE','RETIRED']);
    expect(snapshot.sources.every((source) => source.classification === undefined || allowed.has(source.classification))).toBe(true);
    console.log('PRODUCTION_SNAPSHOT_TRUTH', JSON.stringify({
      id: snapshot.id,
      usableSystems: usable.map((system) => ({ id: system.id, currentMetres: system.currentMetres, observedAt: system.observedAt, sourceId: system.sourceId })),
      sources: snapshot.sources.map((source) => ({ id: source.id, classification: source.classification ?? null, status: source.status, urlPresent: source.url !== undefined })),
    }));
  }, 30_000);
});
