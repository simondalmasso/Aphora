import { mkdir, writeFile } from 'node:fs/promises';

const outputDir = process.env.EVIDENCE_DIR ?? 'artifacts/order-020';
const now = new Date();
const timeoutMs = 18_000;

function ageMinutes(at) {
  const parsed = Date.parse(at ?? '');
  return Number.isFinite(parsed) ? Math.max(0, Math.round((now.getTime() - parsed) / 60_000)) : null;
}
function freshness(observedAt, freshMinutes, staleMinutes) {
  const age = ageMinutes(observedAt);
  if (age === null) return 'DEGRADED';
  if (age <= freshMinutes) return 'OPERATIONAL_FRESH';
  if (age <= staleMinutes) return 'OPERATIONAL_STALE';
  return 'DEGRADED';
}
function dateValues(text) {
  const matches = [...text.matchAll(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})\b/g)]
    .map((match) => new Date(match[0]).toISOString());
  return matches.filter((value) => Number.isFinite(Date.parse(value)));
}
function extractTag(text, name) {
  const match = text.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, 'i'));
  return match?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').trim() ?? null;
}
async function request(url, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('SOURCE_TIMEOUT')), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: accept }, redirect: 'follow', signal: controller.signal, cache: 'no-store' });
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { response, bytes, text: new TextDecoder().decode(bytes) };
  } finally { clearTimeout(timer); }
}
async function probe(definition) {
  const base = { ...definition, checkedAt: now.toISOString() };
  delete base.validate;
  if (!definition.automatic) return { ...base, reachable: null, httpStatus: null, contentType: null, bytes: null, schemaValid: null, observedAt: null, ageMinutes: null, classification: definition.classification, note: definition.note };
  try {
    const { response, bytes, text } = await request(definition.url, definition.accept);
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok) return { ...base, reachable: false, httpStatus: response.status, contentType, bytes: bytes.length, schemaValid: false, observedAt: null, ageMinutes: null, classification: 'DEGRADED', note: `HTTP ${response.status}` };
    const validated = await definition.validate({ text, bytes, contentType });
    return { ...base, reachable: true, httpStatus: response.status, contentType, bytes: bytes.length, ...validated };
  } catch (error) {
    return { ...base, reachable: false, httpStatus: null, contentType: null, bytes: null, schemaValid: false, observedAt: null, ageMinutes: null, classification: 'DEGRADED', note: error instanceof Error ? error.message : String(error) };
  }
}

const from = new Date(now.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
const to = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
const ina = (series) => `https://alerta.ina.gob.ar/a5/getObservaciones?tipo=puntual&series_id=${series}&timestart=${from}&timeend=${to}`;
const waterml = (series) => `https://alerta.ina.gob.ar/a5/obs/puntual/series/${series}?timestart=${from}&timeend=${to}&format=waterml2`;
const cap = `https://ssl.smn.gob.ar/feeds/CAP/rss_alertaCAP_nuevo_${now.getUTCFullYear()}.xml`;

function validateInaRest(series) {
  return ({ text, contentType }) => {
    if (!contentType.toLowerCase().includes('application/json')) throw new Error('INA_CONTENT_TYPE_INVALID');
    const payload = JSON.parse(text);
    if (!Array.isArray(payload)) throw new Error('INA_SCHEMA_INVALID');
    const rows = payload.filter((row) => row && row.tipo === 'puntual' && Number(row.series_id) === Number(series) && typeof row.valor === 'number' && Number.isFinite(row.valor) && Number.isFinite(Date.parse(row.timestart)));
    if (!rows.length) throw new Error('INA_SERIES_EMPTY');
    const observedAt = rows.map((row) => new Date(row.timestart).toISOString()).sort().at(-1);
    return { schemaValid: true, observedAt, ageMinutes: ageMinutes(observedAt), classification: freshness(observedAt, 36 * 60, 365 * 24 * 60), sampleCount: rows.length, note: 'Serie puntual numérica validada para la estación solicitada.' };
  };
}
function validateWaterMl({ text, contentType }) {
  if (!/xml/i.test(contentType) || !/<(?:\w+:)?(?:Collection|Observation|MeasurementTimeseries)\b/i.test(text)) throw new Error('WATERML_SCHEMA_INVALID');
  const dates = dateValues(text);
  if (!dates.length || !/<(?:\w+:)?value\b[^>]*>\s*-?\d+(?:[.,]\d+)?/i.test(text)) throw new Error('WATERML_SERIES_EMPTY');
  const observedAt = dates.sort().at(-1);
  return { schemaValid: true, observedAt, ageMinutes: ageMinutes(observedAt), classification: freshness(observedAt, 36 * 60, 365 * 24 * 60), note: 'WaterML contiene marcas temporales y valores numéricos.' };
}
function validateCap({ text, contentType }) {
  if (!/xml|rss/i.test(contentType) || !/<rss\b|<feed\b/i.test(text)) throw new Error('SMN_CAP_SCHEMA_INVALID');
  const dates = [extractTag(text, 'lastBuildDate'), extractTag(text, 'updated'), ...dateValues(text)].filter((value) => value && Number.isFinite(Date.parse(value))).map((value) => new Date(value).toISOString());
  if (!dates.length) throw new Error('SMN_CAP_TIMESTAMP_MISSING');
  const observedAt = dates.sort().at(-1);
  return { schemaValid: true, observedAt, ageMinutes: ageMinutes(observedAt), classification: freshness(observedAt, 30, 12 * 60), note: 'Canal CAP/RSS con timestamp verificable; el contenido puede tener cero o más alertas.' };
}
async function validateNasa({ text, contentType }) {
  if (!contentType.toLowerCase().includes('application/json')) throw new Error('NASA_CONTENT_TYPE_INVALID');
  const metadata = JSON.parse(text);
  if (!metadata || typeof metadata !== 'object' || typeof metadata.name !== 'string') throw new Error('NASA_SERVICE_SCHEMA_INVALID');
  const base = 'https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer';
  const query = new URL(`${base}/query`);
  query.search = new URLSearchParams({ f: 'json', where: '1=1', outFields: 'OBJECTID,StdTime', returnGeometry: 'false', orderByFields: 'StdTime DESC', resultRecordCount: '1' }).toString();
  const latest = await request(query.toString(), 'application/json');
  const payload = JSON.parse(latest.text);
  const attributes = payload?.features?.[0]?.attributes;
  const rasterId = Number(attributes?.OBJECTID ?? attributes?.objectid);
  const observedMs = Number(attributes?.StdTime ?? attributes?.stdtime);
  if (!Number.isSafeInteger(rasterId) || !Number.isFinite(observedMs)) throw new Error('NASA_LATEST_RASTER_INVALID');
  const sample = new URL(`${base}/getSamples`);
  sample.search = new URLSearchParams({ f: 'json', geometry: '-60.7,-31.63', geometryType: 'esriGeometryPoint', returnFirstValueOnly: 'true', mosaicRule: JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [rasterId] }) }).toString();
  const sampled = await request(sample.toString(), 'application/json');
  const samplePayload = JSON.parse(sampled.text);
  const value = Number(samplePayload?.samples?.[0]?.value);
  if (!Number.isFinite(value)) throw new Error('NASA_LOCAL_SAMPLE_INVALID');
  const observedAt = new Date(observedMs).toISOString();
  return { schemaValid: true, observedAt, ageMinutes: ageMinutes(observedAt), classification: 'SUPPLEMENTARY', sampleValueMmPerHour: value, rasterId, note: 'Muestra satelital numérica bloqueada al raster más reciente; no es medición oficial local.' };
}

const definitions = [
  { id: 'ina-rest-30', organization: 'Instituto Nacional del Agua', feed: 'INA REST · Río Paraná, Santa Fe', url: ina('30'), accept: 'application/json', automatic: true, validate: validateInaRest('30') },
  { id: 'ina-rest-3044', organization: 'Instituto Nacional del Agua', feed: 'INA REST · Río Salado, Santo Tomé', url: ina('3044'), accept: 'application/json', automatic: true, validate: validateInaRest('3044') },
  { id: 'ina-waterml-parana', organization: 'Instituto Nacional del Agua', feed: 'INA WaterML · Río Paraná, Santa Fe', url: waterml('30'), accept: 'application/xml,text/xml', automatic: true, validate: validateWaterMl },
  { id: 'ina-waterml-salado', organization: 'Instituto Nacional del Agua', feed: 'INA WaterML · Río Salado, Santo Tomé', url: waterml('3044'), accept: 'application/xml,text/xml', automatic: true, validate: validateWaterMl },
  { id: 'smn-alerts', organization: 'Servicio Meteorológico Nacional', feed: 'Alertas oficiales SMN · CAP', url: cap, accept: 'application/xml,text/xml,application/rss+xml', automatic: true, validate: validateCap },
  { id: 'nasa-gpm-imerg-early', organization: 'NASA', feed: 'GPM IMERG Early', url: 'https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer?f=json', accept: 'application/json', automatic: true, validate: validateNasa },
  { id: 'ports-hydrometers', organization: 'Agencia Nacional de Puertos y Navegación', feed: 'Hidrómetros portuarios', url: 'https://www.argentina.gob.ar/economia/agencia-nacional-de-puertos-y-navegacion/hidrometros', automatic: false, classification: 'BLOCKED_NO_MACHINE_ENDPOINT', note: 'Página humana; no se promueve a feed automático.' },
  { id: 'smn-observations', organization: 'Servicio Meteorológico Nacional', feed: 'Observaciones meteorológicas SMN', url: 'https://ws2.smn.gob.ar/', automatic: false, classification: 'BLOCKED_CREDENTIAL', note: 'Requiere credencial; no se intenta eludir autenticación.' },
  { id: 'province-early-warning-page', organization: 'Gobierno de la Provincia de Santa Fe · Protección Civil', feed: 'Canal humano provincial', url: 'https://www.santafe.gov.ar/proteccioncivil/alertatemprana', automatic: false, classification: 'BLOCKED_NO_MACHINE_ENDPOINT', note: 'Página humana; no se promueve a feed automático.' },
  { id: 'cobem-public-page', organization: 'Municipalidad de Santa Fe · COBEM', feed: 'Canal humano municipal', url: 'https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/cobem/', automatic: false, classification: 'BLOCKED_NO_MACHINE_ENDPOINT', note: 'Página humana y teléfonos; no se promueve a feed automático.' },
];

const results = await Promise.all(definitions.map(probe));
const organizations = [...new Set(results.map((item) => item.organization))];
const classes = ['OPERATIONAL_FRESH','OPERATIONAL_STALE','DEGRADED','SUPPLEMENTARY','BLOCKED_CREDENTIAL','BLOCKED_NO_MACHINE_ENDPOINT','REJECTED_UNSAFE','RETIRED'];
const counts = Object.fromEntries(classes.map((value) => [value, results.filter((item) => item.classification === value).length]));
const report = { schemaVersion: 2, orderId: 'SOS-SF-AUD-FULL-CODEBASE-REVIEW-AND-END-TO-END-CLOSE-020', checkedAt: now.toISOString(), organizationCount: organizations.length, feedCount: results.length, organizations, counts, feeds: results, rules: { timestampsRequired: true, schemaValidationRequired: true, duplicateTransportsAreIndependentCorroboration: false, scrapingPromotedToStableFeed: false, authenticationBypassed: false, supplementaryDeterminesPrimaryState: false } };
await mkdir(outputDir, { recursive: true });
await writeFile(`${outputDir}/source-revalidation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ organizationCount: report.organizationCount, feedCount: report.feedCount, counts }));
const inaUsable = results.filter((item) => item.id.startsWith('ina-') && item.automatic).some((item) => item.schemaValid === true && ['OPERATIONAL_FRESH','OPERATIONAL_STALE'].includes(item.classification));
if (!inaUsable) throw new Error('NO_USABLE_INA_SOURCE');
