import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core';

export interface NasaGpmReading {
  readonly observedAt: string;
  readonly value: number | null;
  readonly latencyMinutes: number;
  readonly resolution: string;
  readonly uncertainty: string;
}

const POLICY: ProviderPolicy = Object.freeze({
  id: 'nasa-gpm-imerg-early',
  hosts: Object.freeze(['maps.disasters.nasa.gov']),
  paths: Object.freeze([/^\/ags03\/rest\/services\/NRT_Latest\/GPM_NRT_30min_Latest\/ImageServer\/identify$/]),
  contentTypes: Object.freeze(['application/json']),
  maxBytes: 500_000,
  freshMs: 30 * 60_000,
  staleMs: 12 * 60 * 60_000,
});

function timestamp(value: unknown): string | null {
  const visit = (node: unknown, depth: number): string | null => {
    if (depth > 6) return null;
    if (typeof node === 'string' && Number.isFinite(Date.parse(node))) return new Date(node).toISOString();
    if (typeof node === 'number' && node > 1_000_000_000_000 && node < 9_999_999_999_999) return new Date(node).toISOString();
    if (Array.isArray(node)) { for (const item of node) { const result = visit(item, depth + 1); if (result) return result; } }
    if (typeof node === 'object' && node !== null) {
      const record = node as Record<string, unknown>;
      for (const key of ['observedAt', 'timestamp', 'time', 'acquisitionDate', 'date']) if (key in record) { const result = visit(record[key], depth + 1); if (result) return result; }
      for (const item of Object.values(record)) { const result = visit(item, depth + 1); if (result) return result; }
    }
    return null;
  };
  return visit(value, 0);
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') { const parsed = Number(value.replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; }
  if (Array.isArray(value)) { for (const item of value) { const parsed = numeric(item); if (parsed !== null) return parsed; } }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of ['value', 'pixelValue', 'precipitation', 'results']) if (key in record) { const parsed = numeric(record[key]); if (parsed !== null) return parsed; }
  }
  return null;
}

export function fetchNasaGpm(url: string): Promise<ProviderResult<NasaGpmReading>> {
  return fetchProvider(url, POLICY, (body) => {
    const payload = JSON.parse(body) as unknown;
    const observedAt = timestamp(payload);
    if (!observedAt) throw new Error('NASA_OBSERVATION_TIME_MISSING');
    return {
      value: Object.freeze({
        observedAt,
        value: numeric(payload),
        latencyMinutes: 240,
        resolution: 'aprox. 0,1° / 30 minutos',
        uncertainty: 'Estimación satelital temprana; no reemplaza pluviómetros ni se transforma en nivel local.',
      }),
      observedAt,
    };
  });
}
