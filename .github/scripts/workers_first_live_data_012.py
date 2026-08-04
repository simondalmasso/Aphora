from pathlib import Path

INA_SOURCE = r'''import type { RiverPoint } from '../../domain/snapshot';
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
'''


def replace_once(text: str, old: str, new: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'Expected one occurrence, found {count}: {old[:80]}')
    return text.replace(old, new)


Path('src/worker/providers/ina.ts').write_text(INA_SOURCE)

core_path = Path('src/worker/providers/core.ts')
core = core_path.read_text()
health_line = "export function providerHealth(): readonly ProviderHealth[] { return Object.freeze([...health.values()].sort((a, b) => a.id.localeCompare(b.id))); }\n"
core = replace_once(
    core,
    health_line,
    health_line + "export function restoreProviderHealth(entries: readonly ProviderHealth[]): void {\n  for (const entry of entries) {\n    if (!entry || typeof entry.id !== 'string') continue;\n    health.set(entry.id, Object.freeze({ ...entry }));\n  }\n}\n",
)
core_path.write_text(core)

live_path = Path('src/worker/live-data.ts')
live = live_path.read_text()
replacements = [
    ("import { providerHealth, type ProviderResult } from './providers/core';", "import { providerHealth, restoreProviderHealth, type ProviderHealth, type ProviderResult } from './providers/core';"),
    ("const INA_BASE = 'https://alerta.ina.gob.ar/pub/datos/datos';\nconst SNAPSHOT_CACHE_MS = 60_000;", "const INA_BASE = 'https://alerta.ina.gob.ar/a5/getObservaciones';\nconst LIVE_DATA_CACHE_VERSION = 'a5-live-v2';\nconst STATION_FRESH_MS = 36 * 60 * 60_000;\nconst SNAPSHOT_CACHE_MS = 60_000;"),
    ("interface CachedSnapshot { readonly cachedAt: string; readonly snapshot: Snapshot }", "interface CachedSnapshot { readonly cachedAt: string; readonly snapshot: Snapshot; readonly providerHealth: readonly ProviderHealth[] }"),
    ("  const config = JSON.stringify({\n    waterMlParana:", "  const config = JSON.stringify({\n    version: LIVE_DATA_CACHE_VERSION,\n    waterMlParana:"),
    ("    const item = await response.json() as CachedSnapshot;\n    return now.getTime() - Date.parse(item.cachedAt) <= SNAPSHOT_CACHE_MS ? item.snapshot : null;", "    const item = await response.json() as CachedSnapshot;\n    if (now.getTime() - Date.parse(item.cachedAt) > SNAPSHOT_CACHE_MS) return null;\n    if (Array.isArray(item.providerHealth)) restoreProviderHealth(item.providerHealth);\n    return item.snapshot;"),
    ("  const item: CachedSnapshot = { cachedAt: new Date().toISOString(), snapshot };", "  const item: CachedSnapshot = { cachedAt: new Date().toISOString(), snapshot, providerHealth: providerHealth() };"),
    ("  const url = `${INA_BASE}&timeStart=${start}&timeEnd=${end}&seriesId=${station.seriesId}&format=json`;\n  const result = await fetchInaSeries(url, `ina-rest-${station.seriesId}`);", "  const endpoint = new URL(INA_BASE);\n  endpoint.searchParams.set('tipo', 'puntual');\n  endpoint.searchParams.set('series_id', station.seriesId);\n  endpoint.searchParams.set('timestart', start);\n  endpoint.searchParams.set('timeend', end);\n  const sourceUrl = endpoint.toString();\n  const result = await fetchInaSeries(sourceUrl, `ina-rest-${station.seriesId}`, station.seriesId);"),
    ("age > 12 * 3_600_000", "age > STATION_FRESH_MS"),
    ("    url: 'https://alerta.ina.gob.ar/pub/datos/',", "    url: sourceUrl,"),
]
for old, new in replacements:
    live = replace_once(live, old, new)
live_path.write_text(live)

lite_path = Path('src/worker/lite.ts')
lite = lite_path.read_text()
status_function = "function statusLabel(snapshot: Snapshot): string {\n  if (snapshot.mode === 'OFFLINE' || snapshot.dataStatus === 'OFFLINE') return 'Modo sin conexión';\n  if (snapshot.dataStatus === 'STALE') return 'Datos desactualizados';\n  if (snapshot.dataStatus === 'LIVE') return 'Datos en vivo';\n  return 'Sin datos en vivo';\n}\n"
lite = replace_once(
    lite,
    status_function,
    status_function + "\nfunction usableTimestamp(value: string | null | undefined): string | null {\n  if (!value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= 0) return null;\n  return new Date(value).toISOString();\n}\n\nfunction ageLabel(value: string | null | undefined, generatedAt: string): string {\n  const timestamp = usableTimestamp(value);\n  return timestamp ? sourceAgeLabel(timestamp, generatedAt) : 'sin timestamp';\n}\n",
)
lite = replace_once(
    lite,
    "  const systems = snapshot.systems ?? [];\n  const html =",
    "  const systems = snapshot.systems ?? [];\n  const primaryObservedAt = snapshot.river.available === false ? null : usableTimestamp(snapshot.river.observedAt);\n  const html =",
)
lite = replace_once(
    lite,
    '<p class="time">Generado: <time datetime="${snapshot.generatedAt}">${escapeHtml(snapshot.generatedAt)}</time>. Observación principal: <time datetime="${snapshot.river.observedAt}">${escapeHtml(snapshot.river.observedAt)}</time>. Fuente principal: ${escapeHtml(snapshot.river.sourceName ?? snapshot.river.sourceId)}.</p>',
    '<p class="time">Generado: <time datetime="${snapshot.generatedAt}">${escapeHtml(snapshot.generatedAt)}</time>. Observación principal: ${primaryObservedAt ? `<time datetime="${primaryObservedAt}">${escapeHtml(primaryObservedAt)}</time>` : \'sin timestamp\'}. Fuente principal: ${escapeHtml(snapshot.river.sourceName ?? snapshot.river.sourceId)}.</p>',
)
lite = replace_once(lite, "sourceAgeLabel(source.observedAt, snapshot.generatedAt)", "ageLabel(source.observedAt, snapshot.generatedAt)")
lite_path.write_text(lite)

test_path = Path('tests/unit/live-data.test.ts')
test = test_path.read_text()
test = replace_once(
    test,
    "function points(values: readonly [string, number][]) { return { data: values.map(([timestart, valor]) => ({ timestart, valor })) }; }",
    "function points(series: number, values: readonly [string, number][]) { return values.map(([timestart, valor]) => ({ tipo: 'puntual', series_id: series, timestart, valor })); }",
)
test = replace_once(test, "searchParams.get('seriesId')", "searchParams.get('series_id')")
if test.count('json(points([[') != 4:
    raise RuntimeError(f"Expected four point fixtures, found {test.count('json(points([[')}")
test = test.replace('json(points([[', 'json(points(Number(id), [[')
test_path.write_text(test)
