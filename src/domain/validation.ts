import type { HydrologicalSystem, RiverForecastPoint, RiverPoint, RiverThreshold, Snapshot, Source } from './snapshot';
import { validateCriticalMessage } from './zungun-compat/validation';

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
  if (typeof row.official !== 'boolean') throw new TypeError(`snapshot.sources[${index}].official inválido`);
  if (row.connected !== undefined && typeof row.connected !== 'boolean') throw new TypeError(`snapshot.sources[${index}].connected inválido`);
  return value as Source;
}
function system(value: unknown, index: number, sourceIds: ReadonlySet<string>): HydrologicalSystem {
  const row = plain(value, `snapshot.systems[${index}]`);
  text(row.id, `snapshot.systems[${index}].id`, 160); text(row.label, `snapshot.systems[${index}].label`, 160); text(row.watercourse, `snapshot.systems[${index}].watercourse`, 160); text(row.stationName, `snapshot.systems[${index}].stationName`, 160); text(row.stationCode, `snapshot.systems[${index}].stationCode`, 80);
  if (typeof row.available !== 'boolean') throw new TypeError(`snapshot.systems[${index}].available inválido`);
  if (!['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(String(row.dataStatus))) throw new TypeError(`snapshot.systems[${index}].dataStatus inválido`);
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
  iso(river.observedAt, 'snapshot.river.observedAt'); text(river.sourceId, 'snapshot.river.sourceId', 160); points(river.points, 'snapshot.river.points'); thresholds(river.thresholds, 'snapshot.river.thresholds'); forecasts(river.forecastPoints, 'snapshot.river.forecastPoints');
  if (river.systemId !== undefined && systems.length && !systemIds.has(String(river.systemId))) throw new TypeError('snapshot.river.systemId no corresponde a un sistema');
  if (river.available === true && !sourceIds.has(String(river.sourceId))) throw new TypeError('snapshot.river.sourceId no corresponde a una fuente');

  const rain = plain(record.rain, 'snapshot.rain');
  finite(rain.accumulated1hMm, 'snapshot.rain.accumulated1hMm'); finite(rain.accumulated24hMm, 'snapshot.rain.accumulated24hMm'); text(rain.forecast, 'snapshot.rain.forecast', 1000); iso(rain.observedAt, 'snapshot.rain.observedAt'); text(rain.sourceId, 'snapshot.rain.sourceId', 160);
  if (!Array.isArray(rain.points)) throw new TypeError('snapshot.rain.points debe ser un arreglo');
  for (const field of ['changes', 'contradictions', 'shelters', 'actions', 'messages'] as const) if (!Array.isArray(record[field])) throw new TypeError(`snapshot.${field} debe ser un arreglo`);
  (record.messages as unknown[]).forEach(validateCriticalMessage);
  return value as Snapshot;
}
