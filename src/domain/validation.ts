import type { HydrologicalSystem, OfficialAlert, RiverForecastPoint, RiverPoint, RiverThreshold, Snapshot, Source, SourceOrganization, TimelineEvent } from './snapshot.ts';
import { validateCriticalMessage } from './zungun-compat/validation.ts';

function plain(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} debe ser un objeto`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} debe ser un objeto plano`);
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, maximum = 1000): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > maximum) throw new TypeError(`${label} inválido`);
  return value;
}
function iso(value: unknown, label: string): string {
  const result = text(value, label, 80);
  if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${label} debe ser una fecha válida`);
  return result;
}
function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} debe ser finito`);
  return value;
}
function finiteOrNull(value: unknown, label: string): number | null {
  if (value === null) return null;
  return finite(value, label);
}
function httpsUrl(value: unknown, label: string): string {
  const result = text(value, label, 1000);
  let parsed: URL;
  try { parsed = new URL(result); } catch { throw new TypeError(`${label} debe ser una URL HTTPS válida`); }
  if (parsed.protocol !== 'https:') throw new TypeError(`${label} debe usar HTTPS`);
  return result;
}
function points(value: unknown, label: string): readonly RiverPoint[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} debe ser un arreglo`);
  let previous = -Infinity;
  return value.map((item, index) => {
    const row = plain(item, `${label}[${index}]`);
    const at = iso(row.at, `${label}[${index}].at`);
    const time = Date.parse(at);
    if (time <= previous) throw new TypeError(`${label} debe estar ordenado sin duplicados`);
    previous = time;
    if (Math.abs(finite(row.metres, `${label}[${index}].metres`)) > 100) throw new TypeError(`${label}[${index}].metres fuera de rango`);
    if (row.measured !== true) throw new TypeError(`${label}[${index}].measured debe ser true`);
    if (row.quality !== undefined && !['PUBLISHED_OPERATIONAL', 'PROVIDER_VALIDATED', 'UNKNOWN'].includes(String(row.quality))) throw new TypeError(`${label}[${index}].quality inválido`);
    return item as RiverPoint;
  });
}
function forecasts(value: unknown, label: string): readonly RiverForecastPoint[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} debe ser un arreglo`);
  let previous = -Infinity;
  const result = value.map((item, index) => {
    const row = plain(item, `${label}[${index}]`);
    const at = iso(row.at, `${label}[${index}].at`);
    const time = Date.parse(at);
    if (time <= previous) throw new TypeError(`${label} debe estar ordenado sin duplicados`);
    previous = time;
    const metres = finite(row.metres, `${label}[${index}].metres`);
    const low = finite(row.lowMetres, `${label}[${index}].lowMetres`);
    const high = finite(row.highMetres, `${label}[${index}].highMetres`);
    if (low > metres || metres > high) throw new TypeError('la proyección debe quedar dentro de su intervalo de incertidumbre');
    return item as RiverForecastPoint;
  });
  if (result.length > 1 && Date.parse(result.at(-1)!.at) - Date.parse(result[0]!.at) > 24 * 60 * 60 * 1000) throw new TypeError('la superficie proyectada no puede exceder 24 horas');
  return result;
}
function thresholds(value: unknown, label: string): readonly RiverThreshold[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} debe ser un arreglo`);
  const ids = new Set<string>(); let previous = -Infinity;
  return value.map((item, index) => {
    const row = plain(item, `${label}[${index}]`);
    const id = text(row.id, `${label}[${index}].id`, 32);
    if (!['NORMAL', 'VIGILANCIA', 'ALERTA', 'EVACUACION'].includes(id) || ids.has(id)) throw new TypeError(`${label}[${index}].id inválido o duplicado`);
    ids.add(id); text(row.label, `${label}[${index}].label`, 80);
    const metres = finite(row.metres, `${label}[${index}].metres`);
    if (metres <= previous) throw new TypeError(`${label} debe estar estrictamente ordenado`);
    previous = metres; return item as RiverThreshold;
  });
}
function source(value: unknown, index: number): Source {
  const row = plain(value, `snapshot.sources[${index}]`);
  text(row.id, `snapshot.sources[${index}].id`, 160); text(row.name, `snapshot.sources[${index}].name`, 200);
  if (!['OFFICIAL_OBSERVATION', 'OFFICIAL_ALERT', 'FORECAST_MODEL', 'SATELLITE_OBSERVATION', 'COMMUNITY_REPORT', 'INTERNAL_DERIVATION', 'DEMO_FIXTURE'].includes(String(row.kind))) throw new TypeError(`snapshot.sources[${index}].kind inválido`);
  if (!['FRESH', 'STALE', 'UNAVAILABLE', 'UNKNOWN'].includes(String(row.status))) throw new TypeError(`snapshot.sources[${index}].status inválido`);
  iso(row.observedAt, `snapshot.sources[${index}].observedAt`); iso(row.validUntil, `snapshot.sources[${index}].validUntil`); text(row.contribution, `snapshot.sources[${index}].contribution`, 1000);
  if (row.url !== undefined) httpsUrl(row.url, `snapshot.sources[${index}].url`);
  if (typeof row.official !== 'boolean') throw new TypeError(`snapshot.sources[${index}].official inválido`);
  if (row.connected !== undefined && typeof row.connected !== 'boolean') throw new TypeError(`snapshot.sources[${index}].connected inválido`);
  if (row.organizationId !== undefined) text(row.organizationId, `snapshot.sources[${index}].organizationId`, 160);
  if (row.organizationName !== undefined) text(row.organizationName, `snapshot.sources[${index}].organizationName`, 240);
  if (row.feedId !== undefined) text(row.feedId, `snapshot.sources[${index}].feedId`, 160);
  if (row.feedName !== undefined) text(row.feedName, `snapshot.sources[${index}].feedName`, 240);
  if (row.classification !== undefined && !['OPERATIONAL_FRESH', 'OPERATIONAL_STALE', 'DEGRADED', 'SUPPLEMENTARY', 'BLOCKED_CREDENTIAL', 'BLOCKED_NO_MACHINE_ENDPOINT', 'REJECTED_UNSAFE', 'RETIRED'].includes(String(row.classification))) throw new TypeError(`snapshot.sources[${index}].classification inválida`);
  if (row.freshness !== undefined && !['ACTUALIZADO', 'ACTUALIZACION_DEMORADA', 'DESACTUALIZADO', 'NO_DISPONIBLE'].includes(String(row.freshness))) throw new TypeError(`snapshot.sources[${index}].freshness inválida`);
  if (row.fetchedAt !== undefined) iso(row.fetchedAt, `snapshot.sources[${index}].fetchedAt`);
  if (row.lastCheckedAt !== undefined) iso(row.lastCheckedAt, `snapshot.sources[${index}].lastCheckedAt`);
  if (row.instantRateMmPerHour !== undefined && finite(row.instantRateMmPerHour, `snapshot.sources[${index}].instantRateMmPerHour`) < 0) throw new TypeError(`snapshot.sources[${index}].instantRateMmPerHour inválido`);
  if (row.determinesPrimaryState !== undefined && typeof row.determinesPrimaryState !== 'boolean') throw new TypeError(`snapshot.sources[${index}].determinesPrimaryState inválido`);
  if ((row.classification === 'BLOCKED_CREDENTIAL' || row.classification === 'BLOCKED_NO_MACHINE_ENDPOINT' || row.classification === 'REJECTED_UNSAFE') && row.connected !== false) throw new TypeError(`snapshot.sources[${index}] bloqueada no puede figurar conectada`);
  return value as Source;
}

function organization(value: unknown, index: number): SourceOrganization {
  const row = plain(value, `snapshot.sourceOrganizations[${index}]`);
  text(row.id, `snapshot.sourceOrganizations[${index}].id`, 160);
  text(row.name, `snapshot.sourceOrganizations[${index}].name`, 240);
  httpsUrl(row.url, `snapshot.sourceOrganizations[${index}].url`);
  if (row.official !== true) throw new TypeError(`snapshot.sourceOrganizations[${index}].official inválido`);
  return value as SourceOrganization;
}

function officialAlert(value: unknown, index: number): OfficialAlert {
  const row = plain(value, `snapshot.alerts[${index}]`);
  for (const field of ['identifier','sender','status','messageType','scope','category','event','urgency','severity','certainty','headline','description','instruction','area'] as const) text(row[field], `snapshot.alerts[${index}].${field}`, field === 'description' || field === 'instruction' ? 2000 : 1000);
  httpsUrl(row.sourceUrl, `snapshot.alerts[${index}].sourceUrl`);
  iso(row.sent, `snapshot.alerts[${index}].sent`);
  for (const field of ['effective','onset','expires'] as const) if (row[field] !== null) iso(row[field], `snapshot.alerts[${index}].${field}`);
  if (!['ACTIVE','UPDATED','CANCELLED','EXPIRED','UNKNOWN'].includes(String(row.lifecycle))) throw new TypeError(`snapshot.alerts[${index}].lifecycle inválido`);
  if (typeof row.appliesToSantaFe !== 'boolean') throw new TypeError(`snapshot.alerts[${index}].appliesToSantaFe inválido`);
  return value as OfficialAlert;
}

function timelineEvent(value: unknown, index: number): TimelineEvent {
  const row = plain(value, `snapshot.timeline[${index}]`);
  text(row.id, `snapshot.timeline[${index}].id`, 240);
  iso(row.at, `snapshot.timeline[${index}].at`);
  if (!['ALERT_ISSUED','ALERT_UPDATED','ALERT_CANCELLED','MEASUREMENT','VALIDITY_CHANGED','SOURCE_DEGRADED','SOURCE_RECOVERED'].includes(String(row.type))) throw new TypeError(`snapshot.timeline[${index}].type inválido`);
  text(row.title, `snapshot.timeline[${index}].title`, 500);
  text(row.detail, `snapshot.timeline[${index}].detail`, 2000);
  text(row.sourceId, `snapshot.timeline[${index}].sourceId`, 160);
  if (row.url !== undefined) httpsUrl(row.url, `snapshot.timeline[${index}].url`);
  if (typeof row.official !== 'boolean') throw new TypeError(`snapshot.timeline[${index}].official inválido`);
  return value as TimelineEvent;
}

function system(value: unknown, index: number, sourceIds: ReadonlySet<string>): HydrologicalSystem {
  const row = plain(value, `snapshot.systems[${index}]`);
  text(row.id, `snapshot.systems[${index}].id`, 160); text(row.label, `snapshot.systems[${index}].label`, 160); text(row.watercourse, `snapshot.systems[${index}].watercourse`, 160); text(row.stationName, `snapshot.systems[${index}].stationName`, 160); text(row.stationCode, `snapshot.systems[${index}].stationCode`, 80);
  if (typeof row.available !== 'boolean') throw new TypeError(`snapshot.systems[${index}].available inválido`);
  if (!['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(String(row.dataStatus))) throw new TypeError(`snapshot.systems[${index}].dataStatus inválido`);
  if (row.freshness !== undefined && !['ACTUALIZADO','ACTUALIZACION_DEMORADA','DESACTUALIZADO','NO_DISPONIBLE'].includes(String(row.freshness))) throw new TypeError(`snapshot.systems[${index}].freshness inválida`);
  if (row.fetchedAt !== undefined && row.fetchedAt !== null) iso(row.fetchedAt, `snapshot.systems[${index}].fetchedAt`);
  if (row.validUntil !== undefined && row.validUntil !== null) iso(row.validUntil, `snapshot.systems[${index}].validUntil`);
  if (row.currentMetres !== null) finite(row.currentMetres, `snapshot.systems[${index}].currentMetres`);
  if (row.observedAt !== null) iso(row.observedAt, `snapshot.systems[${index}].observedAt`);
  const sourceId = text(row.sourceId, `snapshot.systems[${index}].sourceId`, 160); text(row.sourceName, `snapshot.systems[${index}].sourceName`, 200);
  const observations = points(row.points, `snapshot.systems[${index}].points`); thresholds(row.thresholds, `snapshot.systems[${index}].thresholds`);
  if (!['RISING_SLOWLY', 'RISING', 'STABLE', 'FALLING', 'UNKNOWN'].includes(String(row.trend))) throw new TypeError(`snapshot.systems[${index}].trend inválido`);
  for (const field of ['delta1h', 'delta6h', 'delta24h'] as const) if (row[field] !== null) finite(row[field], `snapshot.systems[${index}].${field}`);
  if (row.available) {
    if (row.currentMetres === null || row.observedAt === null || observations.length === 0) throw new TypeError(`snapshot.systems[${index}] disponible sin lectura completa`);
    if (!sourceIds.has(sourceId)) throw new TypeError(`snapshot.systems[${index}] referencia una fuente inexistente`);
    const latest = observations.at(-1)!;
    if (latest.at !== row.observedAt || Math.abs(latest.metres - Number(row.currentMetres)) > 0.0001) throw new TypeError(`snapshot.systems[${index}] no coincide con su última lectura`);
  }
  return value as HydrologicalSystem;
}

export function validateSnapshot(value: unknown): Snapshot {
  const record = plain(value, 'snapshot');
  const required = ['schemaVersion', 'id', 'mode', 'generatedAt', 'previousSnapshotAt', 'state', 'stateLabel', 'summary', 'dominantSourceId', 'validUntil', 'recommendedAction', 'emergencyDisclaimer', 'changes', 'river', 'rain', 'sources', 'contradictions', 'shelters', 'actions', 'messages'];
  for (const key of required) if (!(key in record)) throw new TypeError(`snapshot.${key} es obligatorio`);
  if (record.schemaVersion !== '1.0' || !['LIVE', 'UNAVAILABLE', 'OFFLINE', 'DEMO'].includes(String(record.mode))) throw new TypeError('snapshot usa versión o modo no admitido');
  text(record.id, 'snapshot.id', 200); const generatedAt = iso(record.generatedAt, 'snapshot.generatedAt'); iso(record.previousSnapshotAt, 'snapshot.previousSnapshotAt'); const validUntil = iso(record.validUntil, 'snapshot.validUntil');
  if (Date.parse(validUntil) < Date.parse(generatedAt)) throw new TypeError('snapshot.validUntil no puede ser anterior a generatedAt');
  if (!['NORMAL', 'VIGILANCIA', 'ALERTA', 'UMBRAL_EVACUACION_ALCANZADO', 'EVACUACION_OFICIAL', 'UNKNOWN'].includes(String(record.state))) throw new TypeError('snapshot.state inválido');
  text(record.stateLabel, 'snapshot.stateLabel', 200); text(record.summary, 'snapshot.summary', 2000); text(record.dominantSourceId, 'snapshot.dominantSourceId', 160); text(record.recommendedAction, 'snapshot.recommendedAction', 2000); text(record.emergencyDisclaimer, 'snapshot.emergencyDisclaimer', 2000);
  if (record.dataStatus !== undefined && !['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(String(record.dataStatus))) throw new TypeError('snapshot.dataStatus inválido');
  if (record.freshness !== undefined && !['ACTUALIZADO','ACTUALIZACION_DEMORADA','DESACTUALIZADO','NO_DISPONIBLE'].includes(String(record.freshness))) throw new TypeError('snapshot.freshness inválida');
  if (record.alertStatus !== undefined && !['ALERTA_OFICIAL_ACTIVA','SIN_ALERTAS_OFICIALES_DETECTADAS','VERIFICACION_DE_ALERTAS_DEGRADADA','FUENTES_DE_ALERTAS_NO_DISPONIBLES'].includes(String(record.alertStatus))) throw new TypeError('snapshot.alertStatus inválido');
  if (record.alerts !== undefined) {
    if (!Array.isArray(record.alerts)) throw new TypeError('snapshot.alerts debe ser un arreglo');
    (record.alerts as unknown[]).forEach(officialAlert);
  }
  if (record.timeline !== undefined) {
    if (!Array.isArray(record.timeline)) throw new TypeError('snapshot.timeline debe ser un arreglo');
    (record.timeline as unknown[]).forEach(timelineEvent);
  }
  if (record.sourceOrganizations !== undefined) {
    if (!Array.isArray(record.sourceOrganizations)) throw new TypeError('snapshot.sourceOrganizations debe ser un arreglo');
    const organizations = (record.sourceOrganizations as unknown[]).map(organization);
    if (new Set(organizations.map((item) => item.id)).size !== organizations.length) throw new TypeError('snapshot.sourceOrganizations contiene IDs duplicados');
  }
  if (record.serviceStatus !== undefined) {
    const service = plain(record.serviceStatus, 'snapshot.serviceStatus');
    if (service.worker !== 'OPERATIONAL' || service.api !== 'OPERATIONAL') throw new TypeError('snapshot.serviceStatus inválido');
    iso(service.checkedAt, 'snapshot.serviceStatus.checkedAt');
    text(service.note, 'snapshot.serviceStatus.note', 1000);
  }

  if (!Array.isArray(record.sources)) throw new TypeError('snapshot.sources debe ser un arreglo');
  const sources = record.sources.map(source); const sourceIds = new Set(sources.map((item) => item.id));
  if (sourceIds.size !== sources.length) throw new TypeError('snapshot.sources contiene IDs duplicados');
  if ((record.mode === 'DEMO') !== sources.some((item) => item.kind === 'DEMO_FIXTURE')) throw new TypeError('snapshot usa un modo incompatible con sus fuentes demo');

  const rawSystems = record.systems ?? [];
  if (!Array.isArray(rawSystems)) throw new TypeError('snapshot.systems debe ser un arreglo');
  const systems = rawSystems.map((item, index) => system(item, index, sourceIds)); const systemIds = new Set(systems.map((item) => item.id));
  if (systemIds.size !== systems.length) throw new TypeError('snapshot.systems contiene IDs duplicados');

  const river = plain(record.river, 'snapshot.river');
  if (typeof river.available !== 'boolean' && river.available !== undefined) throw new TypeError('snapshot.river.available inválido');
  text(river.stationName, 'snapshot.river.stationName', 160); finite(river.currentMetres, 'snapshot.river.currentMetres');
  for (const field of ['delta1h', 'delta6h', 'delta24h'] as const) finite(river[field], `snapshot.river.${field}`);
  if (!['RISING_SLOWLY', 'RISING', 'STABLE', 'FALLING', 'UNKNOWN'].includes(String(river.trend))) throw new TypeError('snapshot.river.trend inválido');
  iso(river.observedAt, 'snapshot.river.observedAt'); iso(river.fetchedAt, 'snapshot.river.fetchedAt'); iso(river.validUntil, 'snapshot.river.validUntil'); text(river.sourceId, 'snapshot.river.sourceId', 160); points(river.points, 'snapshot.river.points'); thresholds(river.thresholds, 'snapshot.river.thresholds'); forecasts(river.forecastPoints, 'snapshot.river.forecastPoints');
  if (river.systemId !== undefined && systems.length && !systemIds.has(String(river.systemId))) throw new TypeError('snapshot.river.systemId no corresponde a un sistema');
  if (river.available === true && !sourceIds.has(String(river.sourceId))) throw new TypeError('snapshot.river.sourceId no corresponde a una fuente');

  const rain = plain(record.rain, 'snapshot.rain');
  finiteOrNull(rain.accumulated1hMm, 'snapshot.rain.accumulated1hMm'); finiteOrNull(rain.accumulated24hMm, 'snapshot.rain.accumulated24hMm'); text(rain.forecast, 'snapshot.rain.forecast', 1000); iso(rain.observedAt, 'snapshot.rain.observedAt'); iso(rain.fetchedAt, 'snapshot.rain.fetchedAt'); iso(rain.validUntil, 'snapshot.rain.validUntil'); text(rain.sourceId, 'snapshot.rain.sourceId', 160);
  if (rain.available === true && (rain.accumulated1hMm === null || rain.accumulated24hMm === null)) throw new TypeError('snapshot.rain disponible sin acumulados');
  if (!Array.isArray(rain.points)) throw new TypeError('snapshot.rain.points debe ser un arreglo');
  for (const field of ['changes', 'contradictions', 'shelters', 'actions', 'messages'] as const) if (!Array.isArray(record[field])) throw new TypeError(`snapshot.${field} debe ser un arreglo`);
  (record.messages as unknown[]).forEach(validateCriticalMessage);
  return value as Snapshot;
}
