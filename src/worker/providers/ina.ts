import type { RiverPoint } from '../../domain/snapshot';
import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core';

const INA_REST_POLICY: ProviderPolicy = Object.freeze({
  id: 'ina-rest',
  hosts: Object.freeze(['alerta.ina.gob.ar']),
  paths: Object.freeze([/^\/pub\/datos\/datos$/]),
  contentTypes: Object.freeze(['application/json', 'application/geo+json', 'text/json']),
  maxBytes: 1_500_000,
});

const INA_WATERML_POLICY: ProviderPolicy = Object.freeze({
  id: 'ina-waterml',
  hosts: Object.freeze(['alerta.ina.gob.ar', 'www.ina.gov.ar', 'ina.gob.ar']),
  paths: Object.freeze([/^\/.*(?:waterml|wateroneflow|cuahsi|hydroserver|GetValues|GetValuesObject).*$/i]),
  contentTypes: Object.freeze(['application/xml', 'text/xml', 'application/json']),
  maxBytes: 1_500_000,
});

function records(value: unknown): readonly Record<string, unknown>[] {
  const output: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (depth > 8 || output.length > 500) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (['valor', 'value', 'metres', 'valor_num'].some((key) => key in record) && ['timestart', 'timeStart', 'fecha', 'timestamp', 'at', 'dateTime'].some((key) => key in record)) output.push(record);
    for (const child of Object.values(record)) visit(child, depth + 1);
  };
  visit(value, 0);
  return output;
}

function numberValue(record: Record<string, unknown>): number | null {
  for (const key of ['valor', 'value', 'metres', 'valor_num']) {
    const raw = record[key];
    const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : Number.NaN;
    if (Number.isFinite(value) && Math.abs(value) < 100) return value;
  }
  return null;
}

function timeValue(record: Record<string, unknown>): string | null {
  for (const key of ['timestart', 'timeStart', 'fecha', 'timestamp', 'at', 'dateTime']) {
    const raw = record[key];
    if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  }
  return null;
}

function quality(record: Record<string, unknown>): RiverPoint['quality'] {
  const raw = String(record.quality ?? record.calidad ?? record.qualifier ?? '').toLowerCase();
  if (raw.includes('valid') || raw === '1' || raw === 'approved') return 'PROVIDER_VALIDATED';
  return 'PUBLISHED_OPERATIONAL';
}

function normalizedInaUrl(value: string): string {
  return value.replace('/pub/datos/datos&', '/pub/datos/datos?');
}

export async function fetchInaSeries(url: string, providerId: string): Promise<ProviderResult<readonly RiverPoint[]>> {
  return fetchProvider(normalizedInaUrl(url), { ...INA_REST_POLICY, id: providerId }, (body) => {
    const payload = JSON.parse(body) as unknown;
    const unique = new Map<string, RiverPoint>();
    for (const record of records(payload)) {
      const metres = numberValue(record);
      const at = timeValue(record);
      if (metres === null || at === null) continue;
      unique.set(at, Object.freeze({ at, metres, measured: true, quality: quality(record) }));
    }
    const points = [...unique.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-96);
    const observedAt = points.at(-1)?.at;
    if (!observedAt) throw new Error('INA_SERIES_EMPTY');
    return { value: Object.freeze(points), observedAt };
  });
}

function xmlValues(body: string): readonly RiverPoint[] {
  const points: RiverPoint[] = [];
  const pattern = /<(?:\w+:)?value\b([^>]*)>([-+]?\d+(?:[.,]\d+)?)<\/(?:\w+:)?value>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null && points.length < 500) {
    const attributes = match[1] ?? '';
    const dateMatch = attributes.match(/(?:dateTime|time|timestamp)=["']([^"']+)["']/i);
    const metres = Number((match[2] ?? '').replace(',', '.'));
    if (!dateMatch || !Number.isFinite(Date.parse(dateMatch[1]!)) || !Number.isFinite(metres) || Math.abs(metres) >= 100) continue;
    points.push(Object.freeze({ at: new Date(dateMatch[1]!).toISOString(), metres, measured: true, quality: 'PUBLISHED_OPERATIONAL' }));
  }
  return Object.freeze(points.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
}

export async function fetchInaWaterMl(url: string, providerId: string): Promise<ProviderResult<readonly RiverPoint[]>> {
  return fetchProvider(url, { ...INA_WATERML_POLICY, id: providerId }, (body, contentType) => {
    const points: RiverPoint[] = contentType.includes('json')
      ? records(JSON.parse(body) as unknown).flatMap((record) => {
          const metres = numberValue(record);
          const at = timeValue(record);
          return metres === null || at === null ? [] : [Object.freeze({ at, metres, measured: true, quality: quality(record) } satisfies RiverPoint)];
        }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      : [...xmlValues(body)];
    const observedAt = points.at(-1)?.at;
    if (!observedAt) throw new Error('INA_WATERML_EMPTY');
    return { value: Object.freeze(points.slice(-96)), observedAt };
  });
}
