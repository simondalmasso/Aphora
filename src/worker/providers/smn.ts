import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core';

export interface SmnObservationSummary {
  readonly observedAt: string;
  readonly station: string | null;
  readonly precipitationMm: number | null;
}

export interface SmnAlertSummary {
  readonly issuedAt: string;
  readonly title: string;
  readonly severity: string | null;
}

const OBSERVATION_POLICY: ProviderPolicy = Object.freeze({
  id: 'smn-observations',
  hosts: Object.freeze(['ws2.smn.gob.ar']),
  paths: Object.freeze([/^\/(?:map_items\/weather|observaciones|api\/.*observ.*)$/i]),
  contentTypes: Object.freeze(['application/json', 'application/geo+json']),
  maxBytes: 1_500_000,
  freshMs: 20 * 60_000,
});

const ALERT_POLICY: ProviderPolicy = Object.freeze({
  id: 'smn-alerts',
  hosts: Object.freeze(['ws2.smn.gob.ar']),
  paths: Object.freeze([/^\/alertas(?:\/.*)?$/i, /^\/api\/.*alert.*$/i]),
  contentTypes: Object.freeze(['application/json', 'application/geo+json']),
  maxBytes: 1_500_000,
  freshMs: 10 * 60_000,
});

function objects(value: unknown): readonly Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 7 || output.length >= 1000) return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    output.push(record);
    Object.values(record).forEach((item) => visit(item, depth + 1));
  };
  visit(value, 0);
  return output;
}

function timestamp(record: Record<string, unknown>): string | null {
  for (const key of ['date', 'fecha', 'timestamp', 'observed_at', 'observation_time', 'issued_at', 'updated_at', 'update']) {
    const raw = record[key];
    if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  }
  return null;
}

function number(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const raw = record[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number.NaN;
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function fetchSmnObservations(url: string): Promise<ProviderResult<SmnObservationSummary>> {
  return fetchProvider(url, OBSERVATION_POLICY, (body) => {
    const records = objects(JSON.parse(body) as unknown);
    const candidate = records.find((record) => timestamp(record) && (number(record, ['precipitation', 'precip', 'pp', 'rain_mm']) !== null || 'name' in record || 'station' in record));
    if (!candidate) throw new Error('SMN_OBSERVATION_SCHEMA_MISMATCH');
    const observedAt = timestamp(candidate)!;
    const station = typeof candidate.name === 'string' ? candidate.name : typeof candidate.station === 'string' ? candidate.station : null;
    const precipitationMm = number(candidate, ['precipitation', 'precip', 'pp', 'rain_mm']);
    return { value: Object.freeze({ observedAt, station, precipitationMm }), observedAt };
  });
}

export function fetchSmnAlerts(url: string): Promise<ProviderResult<readonly SmnAlertSummary[]>> {
  return fetchProvider(url, ALERT_POLICY, (body) => {
    const records = objects(JSON.parse(body) as unknown);
    const alerts = records.map((record) => {
      const issuedAt = timestamp(record);
      const title = typeof record.title === 'string' ? record.title : typeof record.titulo === 'string' ? record.titulo : typeof record.headline === 'string' ? record.headline : null;
      if (!issuedAt || !title) return null;
      const severity = typeof record.severity === 'string' ? record.severity : typeof record.nivel === 'string' ? record.nivel : null;
      return Object.freeze({ issuedAt, title: title.slice(0, 240), severity });
    }).filter((item): item is SmnAlertSummary => item !== null);
    const issuedAt = alerts.map((item) => item.issuedAt).sort().at(-1);
    if (!issuedAt) throw new Error('SMN_ALERT_SCHEMA_MISMATCH');
    return { value: Object.freeze(alerts.slice(0, 50)), observedAt: issuedAt };
  });
}
