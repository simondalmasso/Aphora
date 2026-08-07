import { describe, expect, it } from 'vitest';
import { validateSnapshot } from '../../src/domain/validation.ts';

const base = (process.env.DEPLOYMENT_URL || 'https://sos-sf.simondalmasso44.workers.dev').replace(/\/$/, '');

describe('020-B corrective production snapshot contract', () => {
  it('accepts the real atomic snapshot while usable INA REST coexists with degraded optional providers', async () => {
    const response = await fetch(`${base}/api/snapshot?corrective=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache, no-store' } });
    expect(response.ok).toBe(true);
    const payload = await response.json() as { data?: unknown };
    const snapshot = validateSnapshot(payload.data);
    const usable = snapshot.systems?.filter((system) => system.available && system.currentMetres !== null) ?? [];
    expect(usable.some((system) => system.id === 'parana-santa-fe' || system.id === 'salado-santo-tome')).toBe(true);
    expect(snapshot.sources.every((source) => source.url === undefined || (source.url.length > 0 && source.url.startsWith('https://')))).toBe(true);
    expect(snapshot.timeline?.every((event) => event.url === undefined || (event.url.length > 0 && event.url.startsWith('https://')))).toBe(true);
    expect(snapshot.sources.filter((source) => source.classification === 'DEGRADED').some((source) => source.url === undefined || source.url.startsWith('https://'))).toBe(true);
  }, 30_000);
});
