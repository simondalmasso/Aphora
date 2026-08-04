import type { RiverPoint } from '../../domain/snapshot';
import { fetchProvider, type ProviderPolicy, type ProviderResult } from './core';

const INA_A5_POLICY: ProviderPolicy = Object.freeze({
  id: 'ina-a5',
  hosts: Object.freeze(['alerta.ina.gob.ar']),
  paths: Object.freeze([/^\/a5\/getObservaciones$/]),
  contentTypes: Object.freeze(['application/json', 'application/geo+json', 'text/json']),
  maxBytes: 1_500_000,
  freshMs: 30 * 60_000,
  staleMs: 7 * 24 * 60 * 60_000,
});

const INA_WATERML_POLICY: ProviderPolicy = Object.freeze({
  id: 'ina-waterml',
  hosts: Object.freeze(['alerta.ina.gob.ar', 'www.ina.gov.ar', 'ina.gob.ar']),
  paths: Object.freeze([/^\/.*(?:waterml|wateroneflow|cuahsi|hydroserver|GetValues|GetValuesObject).*$/i]),
  contentTypes: Object.freeze(['application/xml', 'text/xml']),
  maxBytes: 1_500_000,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function explicitQuality(record: Record<string, unknown>): RiverPoint['quality'] {
  const raw = String(record.quality ?? record.calidad ?? record.qualifier ?? '').trim().toLowerCase();
  return raw.includes('valid') || raw === '1' || raw === 'approved' ? 'PROVIDER_VALIDATED' : 'PUBLISHED_OPERATIONAL';
}

function parseA5Observations(body: string, expectedSeriesId: string): readonly RiverPoint[] {
  const payload = JSON.parse(body) as unknown;
  if (!Array.isArray(payload)) throw new Error('INA_A5_SCHEMA');
  const expected = Number(expectedSeriesId);
  const points: RiverPoint[] = [];
  for (const item of payload) {
    if (!isRecord(item)) throw new Error('INA_A5_SCHEMA');
    const seriesId = Number(item.series_id);
    const metres = typeof item.valor === 'number' ? item.valor : Number.NaN;
    const at = typeof item.timestart === 'string' ? item.timestart : '';
    if (item.tipo !== 'puntual' || seriesId !== expected || !Number.isFinite(metres) || Math.abs(metres) >= 100 || !Number.isFinite(Date.parse(at))) throw new Error('INA_A5_SCHEMA');
    points.push(Object.freeze({ at: new Date(at).toISOString(), metres, measured: true, quality: explicitQuality(item) }));
  }
  const unique = new Map(points.map((point) => [point.at, point]));
  return Object.freeze([...unique.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-96));
}

export async function fetchInaSeries(url: string, providerId: string, expectedSeriesId: string): Promise<ProviderResult<readonly RiverPoint[]>> {
  return fetchProvider(url, { ...INA_A5_POLICY, id: providerId }, (body) => {
    const points = parseA5Observations(body, expectedSeriesId);
    const observedAt = points.at(-1)?.at;
    if (!observedAt) throw new Error('INA_A5_EMPTY');
    return { value: points, observedAt };
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
  return fetchProvider(url, { ...INA_WATERML_POLICY, id: providerId }, (body) => {
    const points = xmlValues(body);
    const observedAt = points.at(-1)?.at;
    if (!observedAt) throw new Error('INA_WATERML_EMPTY');
    return { value: Object.freeze(points.slice(-96)), observedAt };
  });
}
