import type { DataStatus, HydrologicalSystem, RiverPoint, RiverThreshold, Snapshot, Source } from './snapshot';
import { validateCriticalMessage } from './zungun-compat/validation';

function plainRecord(value: unknown, label: string): Record<string, unknown> {
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
  const parsed = text(value, label, 80);
  if (!Number.isFinite(Date.parse(parsed))) throw new TypeError(`${label} debe ser una fecha válida`);
  return parsed;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} debe ser finito`);
  return value;
}

function validatePoints(value: unknown, label: string): readonly RiverPoint[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} debe ser un arreglo`);
  let previous = -Infinity;
  return value.map((item, index) => {
    const point = plainRecord(item, `${label}[${index}]`);
    const at = iso(point.at, `${label}[${index}].at`);
    const time = Date.parse(at);
    if (time <= previous) throw new TypeError(`${label} debe estar ordenado sin duplicados`);
    previous = time;
    const metres = finite(point.metres, `${label}[${index}].metres`);
    if (Math.abs(metres) > 100) throw new TypeError(`${label}[${index}].metres fuera de rango`);
    if (point.measured !== true) throw new TypeError(`${label}[${index}].measured debe ser true`);
    if (point.quality !== undefined && !['PUBLISHED_OPERATIONAL', 'PROVIDER_VALIDATED', 'UNKNOWN'].includes(String(point.quality))) throw new TypeError(`${label}[${index}].quality inválido`);
    return item as RiverPoint;
  });
}

function validateThresholds(value: unknown, label: string): readonly RiverThreshold[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} debe ser un arreglo`);
  const ids = new Set<string>();
  let previous = -Infinity;
  return value.map((item, index) => {
    const threshold = plainRecord(item, `${label}[${index}]`);
    const id = text(threshold.id, `${label}[${index}].id`, 32);
    if (!['NORMAL', 'VIGILANCIA', 'ALERTA', 'EVACUACION'].includes(id) || ids.has(id)) throw new TypeError(`${label}[${index}].id inválido o duplicado`);
    ids.add(id);
    text(threshold.label, `${label}[${index}].label`, 80);
    const metres = finite(threshold.metres, `${label}[${index}].metres`);
    if (metres <= previous) throw new TypeError(`${label} debe estar estrictamente ordenado`);
    previous = metres;
    return item as RiverThreshold;
  });
}

function validateSource(value: unknown, index: number): Source {
  const source = plainRecord(value, `snapshot.sources[${index}]`);
  text(source.id, `snapshot.sources[${index}].id`, 160);
  text(source.name, `snapshot.sources[${index}].name`, 200);
  if (!['OFFICIAL_OBSERVATION', 'OFFICIAL_ALERT', 'FORECAST_MODEL', 'SATELLITE_OBSERVATION', 'COMMUNITY_REPORT', 'INTERNAL_DERIVATION', 'DEMO_FIXTURE'].includes(String(source.kind))) throw new TypeError(`snapshot.sources[${index}].kind inválido`);
  if (!['FRESH', 'STALE', 'UNAVAILABLE', 'UNKNOWN'].includes(String(source.status))) throw new TypeError(`snapshot.sources[${index}].status inválido`);
  iso(source.observedAt, `snapshot.sources[${index}].observedAt`);
  iso(source.validUntil, `snapshot.sources[${index}].validUntil`);
  text(source.contribution, `snapshot.sources[${index}].contribution`, 1000);
  if (typeof source.official !== 'boolean') throw new TypeError(`snapshot.sources[${index}].official inválido`);
  if (source.connected !== undefined && typeof source.connected !== 'boolean') throw new TypeError(`snapshot.sources[${index}].connected inválido`);
  return value as Source;
}

function validateSystem(value: unknown, index: number, sourceIds: ReadonlySet<string>): HydrologicalSystem {
  const system = plainRecord(value, `snapshot.systems[${index}]`);
  text(system.id, `snapshot.systems[${index}].id`, 160);
  text(system.label, `snapshot.systems[${index}].label`, 160);
  text(system.watercourse, `snapshot.systems[${index}].watercourse`, 160);
  text(system.stationName, `snapshot.systems[${index}].stationName`, 160);
  text(system.stationCode, `snapshot.systems[${index}].stationCode`, 80);
  if (typeof system.available !== 'boolean') throw new TypeError(`snapshot.systems[${index}].available inválido`);
  if (!['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(String(system.dataStatus))) throw new TypeError(`snapshot.systems[${index}].dataStatus inválido`);
  if (system.currentMetres !== null) finite(system.currentMetres, `snapshot.systems[${index}].currentMetres`);
  if (system.observedAt !== null) iso(system.observedAt, `snapshot.systems[${index}].observedAt`);
  const sourceId = text(system.sourceId, `snapshot.systems[${index}].sourceId`, 160);
  text(system.sourceName, `snapshot.systems[${index}].sourceName`, 200);
  const points = validatePoints(system.points, `snapshot.systems[${index}].points`);
  validateThresholds(system.thresholds, `snapshot.systems[${index}].thresholds`);
  if (!['RISING_SLOWLY', 'RISING', 'STABLE', 'FALLING', 'UNKNOWN'].includes(String(system.trend))) throw new TypeError(`snapshot.systems[${index}].trend inválido`);
  for (const field of ['delta1h', 'delta6h', 'delta24h'] as const) if (system[field] !== null) finite(system[field], `snapshot.systems[${index}].${field}`);
  if (system.available) {
    if (system.currentMetres === null || system.observedAt === null || points.length === 0) throw new TypeError(`snapshot.systems[${index}] disponible sin lectura completa`);
    if (!sourceIds.has(sourceId)) throw new TypeError(`snapshot.systems[${index}] referencia una fuente inexistente`);
    const latest = points.at(-1)!;
    if (latest.at !== system.observedAt || Math.abs(latest.metres - system.currentMetres) > 0.0001) throw new TypeError(`snapshot.systems[${index}] no coincide con su última lectura`);
  }
  return value as HydrologicalSystem;
}

export function validateSnapshot(value: unknown): Snapshot {
  const record = plainRecord(value, 'snapshot');
  const required = ['schemaVersion', 'id', 'mode', 'generatedAt', 'previousSnapshotAt', 'state', 'stateLabel', 'summary', 'dominantSourceId', 'validUntil', 'recommendedAction', 'emergencyDisclaimer', 'changes', 'river', 'rain', 'sources', 'contradictions', 'shelters', 'actions', 'messages'];
  for (const key of required) if (!(key in record)) throw new TypeError(`snapshot.${key} es obligatorio`);
  if (record.schemaVersion !== '1.0' || !['LIVE', 'UNAVAILABLE', 'OFFLINE', 'DEMO'].includes(String(record.mode))) throw new TypeError('snapshot usa versión o modo no admitido');
  text(record.id, 'snapshot.id', 200);
  const generatedAt = iso(record.generatedAt, 'snapshot.generatedAt');
  iso(record.previousSnapshotAt, 'snapshot.previousSnapshotAt');
  const validUntil = iso(record.validUntil, 'snapshot.validUntil');
  if (Date.parse(validUntil) < Date.parse(generatedAt)) throw new TypeError('snapshot.validUntil no puede ser anterior a generatedAt');
  if (!['NORMAL', 'VIGILANCIA', 'ALERTA', 'UMBRAL_EVACUACION_ALCANZADO', 'EVACUACION_OFICIAL', 'UNKNOWN'].includes(String(record.state))) throw new TypeError('snapshot.state inválido');
  text(record.stateLabel, 'snapshot.stateLabel', 200);
  text(record.summary, 'snapshot.summary', 2000);
  text(record.dominantSourceId, 'snapshot.dominantSourceId', 160);
  text(record.recommendedAction, 'snapshot.recommendedAction', 2000);
  text(record.emergencyDisclaimer, 'snapshot.emergencyDisclaimer', 2000);
  if (record.dataStatus !== undefined && !['LIVE', 'STALE', 'UNAVAILABLE', 'OFFLINE'].includes(String(record.dataStatus))) throw new TypeError('snapshot.dataStatus inválido');

  if (!Array.isArray(record.sources)) throw new TypeError('snapshot.sources debe ser un arreglo');
  const sources = record.sources.map(validateSource);
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) throw new TypeError('snapshot.sources contiene IDs duplicados');

  const systemsValue = record.systems ?? [];
  if (!Array.isArray(systemsValue)) throw new TypeError('snapshot.systems debe ser un arreglo');
  const systems = systemsValue.map((system, index) => validateSystem(system, index, sourceIds));
  const systemIds = new Set(systems.map((system) => system.id));
  if (systemIds.size !== systems.length) throw new TypeError('snapshot.systems contiene IDs duplicados');

  const river = plainRecord(record.river, 'snapshot.river');
  if (typeof river.available !== 'boolean' && river.available !== undefined) throw new TypeError('snapshot.river.available inválido');
  text(river.stationName, 'snapshot.river.stationName', 160);
  finite(river.currentMetres, 'snapshot.river.currentMetres');
  for (const field of ['delta1h', 'delta6h', 'delta24h'] as const) finite(river[field], `snapshot.river.${field}`);
  if (!['RISING_SLOWLY', 'RISING', 'STABLE', 'FALLING', 'UNKNOWN'].includes(String(river.trend))) throw new TypeError('snapshot.river.trend inválido');
  iso(river.observedAt, 'snapshot.river.observedAt');
  text(river.sourceId, 'snapshot.river.sourceId', 160);
  validatePoints(river.points, 'snapshot.river.points');
  validateThresholds(river.thresholds, 'snapshot.river.thresholds');
  if (!Array.isArray(river.forecastPoints)) throw new TypeError('snapshot.river.forecastPoints debe ser un arreglo');
  if (river.systemId !== undefined && systems.length && !systemIds.has(String(river.systemId))) throw new TypeError('snapshot.river.systemId no corresponde a un sistema');
  if (river.available === true && !sourceIds.has(String(river.sourceId))) throw new TypeError('snapshot.river.sourceId no corresponde a una fuente');

  const rain = plainRecord(record.rain, 'snapshot.rain');
  finite(rain.accumulated1hMm, 'snapshot.rain.accumulated1hMm');
  finite(rain.accumulated24hMm, 'snapshot.rain.accumulated24hMm');
  text(rain.forecast, 'snapshot.rain.forecast', 1000);
  iso(rain.observedAt, 'snapshot.rain.observedAt');
  text(rain.sourceId, 'snapshot.rain.sourceId', 160);
  if (!Array.isArray(rain.points)) throw new TypeError('snapshot.rain.points debe ser un arreglo');

  for (const field of ['changes', 'contradictions', 'shelters', 'actions', 'messages'] as const) if (!Array.isArray(record[field])) throw new TypeError(`snapshot.${field} debe ser un arreglo`);
  (record.messages as unknown[]).forEach(validateCriticalMessage);
  return value as Snapshot;
}
