import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core';

export interface PortsHydrometerReading {
  readonly station: string;
  readonly observedAt: string;
  readonly metres: number;
}

const POLICY: ProviderPolicy = Object.freeze({
  id: 'ports-hydrometers',
  hosts: Object.freeze(['www.argentina.gob.ar', 'argentina.gob.ar', 'api.argentina.gob.ar']),
  paths: Object.freeze([/^\/.*(?:hidrometr|hydrometr|puertos).*\.(?:json|geojson)$/i, /^\/api\/.*(?:hidrometr|puertos).*$/i]),
  contentTypes: Object.freeze(['application/json', 'application/geo+json']),
  maxBytes: 1_500_000,
});

function records(value: unknown): readonly Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 7 || output.length >= 1000) return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (['altura', 'nivel', 'value', 'metres'].some((key) => key in record)) output.push(record);
    Object.values(record).forEach((item) => visit(item, depth + 1));
  };
  visit(value, 0);
  return output;
}

function metres(record: Record<string, unknown>): number | null {
  for (const key of ['altura', 'nivel', 'value', 'metres']) {
    const raw = record[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number.NaN;
    if (Number.isFinite(value) && Math.abs(value) < 100) return value;
  }
  return null;
}

function observed(record: Record<string, unknown>): string | null {
  for (const key of ['fecha', 'timestamp', 'observed_at', 'date']) {
    const raw = record[key];
    if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  }
  return null;
}

export function fetchPortsHydrometers(url: string): Promise<ProviderResult<readonly PortsHydrometerReading[]>> {
  return fetchProvider(url, POLICY, (body) => {
    const readings = records(JSON.parse(body) as unknown).map((record) => {
      const value = metres(record);
      const observedAt = observed(record);
      const station = typeof record.estacion === 'string' ? record.estacion : typeof record.station === 'string' ? record.station : typeof record.nombre === 'string' ? record.nombre : null;
      if (value === null || !observedAt || !station) return null;
      return Object.freeze({ station: station.slice(0, 160), observedAt, metres: value });
    }).filter((item): item is PortsHydrometerReading => item !== null);
    const observedAt = readings.map((item) => item.observedAt).sort().at(-1);
    if (!observedAt) throw new Error('PORTS_SCHEMA_MISMATCH');
    return { value: Object.freeze(readings.slice(-200)), observedAt };
  });
}
