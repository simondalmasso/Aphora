import { mkdir, writeFile } from 'node:fs/promises';

const outputDir = process.env.EVIDENCE_DIR ?? 'artifacts/public-safety-015';
const now = new Date();
const timeoutMs = 18000;

async function probe({ id, organization, feed, url, expected, classification, automatic = true }) {
  if (!automatic) return { id, organization, feed, url, automatic, reachable: null, httpStatus: null, contentType: null, classification, checkedAt: now.toISOString(), note: expected };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: expected }, redirect: 'follow', signal: controller.signal });
    const contentType = response.headers.get('content-type') ?? '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hasContent = bytes.length > 0;
    return { id, organization, feed, url, automatic, reachable: response.ok && hasContent, httpStatus: response.status, contentType, bytes: bytes.length, classification: response.ok && hasContent ? classification : 'DEGRADED', checkedAt: now.toISOString(), note: response.ok ? 'Respuesta pública recibida; la validez semántica se verifica en contratos y tests del adaptador.' : `HTTP ${response.status}` };
  } catch (error) {
    return { id, organization, feed, url, automatic, reachable: false, httpStatus: null, contentType: null, classification: 'DEGRADED', checkedAt: now.toISOString(), note: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}

const from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
const to = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
const ina = (series) => `https://alerta.ina.gob.ar/a5/getObservaciones?tipo=puntual&series_id=${series}&timestart=${from}&timeend=${to}`;
const waterml = (series) => `https://alerta.ina.gob.ar/a5/obs/puntual/series/${series}?timestart=${from}&timeend=${to}&format=waterml2`;
const definitions = [
  { id: 'ina-rest-30', organization: 'Instituto Nacional del Agua', feed: 'INA REST · Río Paraná, Santa Fe', url: ina('30'), expected: 'application/json', classification: 'OPERATIONAL_FRESH' },
  { id: 'ina-rest-3044', organization: 'Instituto Nacional del Agua', feed: 'INA REST · Río Salado, Santo Tomé', url: ina('3044'), expected: 'application/json', classification: 'OPERATIONAL_FRESH' },
  { id: 'ina-waterml-parana', organization: 'Instituto Nacional del Agua', feed: 'INA WaterML · Río Paraná, Santa Fe', url: waterml('30'), expected: 'application/xml,text/xml', classification: 'OPERATIONAL_FRESH' },
  { id: 'ina-waterml-salado', organization: 'Instituto Nacional del Agua', feed: 'INA WaterML · Río Salado, Santo Tomé', url: waterml('3044'), expected: 'application/xml,text/xml', classification: 'OPERATIONAL_FRESH' },
  { id: 'smn-alerts', organization: 'Servicio Meteorológico Nacional', feed: 'Alertas oficiales SMN · CAP', url: 'https://ssl.smn.gob.ar/feeds/CAP/rss_alertaCAP_nuevo_2026.xml', expected: 'application/xml,text/xml,application/rss+xml', classification: 'OPERATIONAL_FRESH' },
  { id: 'nasa-gpm-imerg-early', organization: 'NASA', feed: 'GPM IMERG Early', url: 'https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer?f=json', expected: 'application/json', classification: 'SUPPLEMENTARY' },
  { id: 'ports-hydrometers', organization: 'Agencia Nacional de Puertos y Navegación', feed: 'Hidrómetros portuarios', url: 'https://www.argentina.gob.ar/economia/agencia-nacional-de-puertos-y-navegacion/hidrometros', expected: 'text/html', classification: 'BLOCKED_NO_MACHINE_ENDPOINT', automatic: false },
  { id: 'smn-observations', organization: 'Servicio Meteorológico Nacional', feed: 'Observaciones meteorológicas SMN', url: 'https://ws2.smn.gob.ar/', expected: 'Requiere credencial; no se intenta eludir autenticación.', classification: 'BLOCKED_CREDENTIAL', automatic: false },
  { id: 'province-early-warning-page', organization: 'Gobierno de la Provincia de Santa Fe · Protección Civil', feed: 'Canal humano provincial', url: 'https://www.santafe.gov.ar/proteccioncivil/alertatemprana', expected: 'Página humana; no se promueve a feed automático.', classification: 'BLOCKED_NO_MACHINE_ENDPOINT', automatic: false },
  { id: 'cobem-public-page', organization: 'Municipalidad de Santa Fe · COBEM', feed: 'Canal humano municipal', url: 'https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/cobem/', expected: 'Página humana; no se promueve a feed automático.', classification: 'BLOCKED_NO_MACHINE_ENDPOINT', automatic: false },
];
const results = await Promise.all(definitions.map(probe));
const organizations = [...new Set(results.map((item) => item.organization))];
const counts = Object.fromEntries(['OPERATIONAL_FRESH','OPERATIONAL_STALE','DEGRADED','SUPPLEMENTARY','BLOCKED_CREDENTIAL','BLOCKED_NO_MACHINE_ENDPOINT','REJECTED_UNSAFE','RETIRED'].map((value) => [value, results.filter((item) => item.classification === value).length]));
const report = { schemaVersion: 1, checkedAt: now.toISOString(), organizationCount: organizations.length, feedCount: results.length, organizations, counts, feeds: results, rules: { duplicateTransportsAreIndependentCorroboration: false, scrapingPromotedToStableFeed: false, authenticationBypassed: false, supplementaryBlocksDeployment: false } };
await mkdir(outputDir, { recursive: true });
await writeFile(`${outputDir}/source-revalidation.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ organizationCount: report.organizationCount, feedCount: report.feedCount, counts }));
if (results.filter((item) => item.automatic && item.id !== 'nasa-gpm-imerg-early').every((item) => item.reachable === false)) process.exitCode = 1;
