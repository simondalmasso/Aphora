import type { Snapshot } from './snapshot';
import { validateRiverPulse } from './river-pulse';
import { validateCriticalMessage } from './zungun-compat/validation';

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${label} debe ser un objeto`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} debe ser un objeto plano`);
  return value as Record<string, unknown>;
}

export function validateSnapshot(value: unknown): Snapshot {
  const record = plainRecord(value, 'snapshot');
  const required = ['schemaVersion', 'id', 'mode', 'generatedAt', 'previousSnapshotAt', 'state', 'stateLabel', 'summary', 'dominantSourceId', 'validUntil', 'recommendedAction', 'emergencyDisclaimer', 'changes', 'river', 'rain', 'sources', 'contradictions', 'shelters', 'actions', 'messages'];
  for (const key of required) if (!(key in record)) throw new TypeError(`snapshot.${key} es obligatorio`);
  if (record.schemaVersion !== '1.0' || !['LIVE', 'UNAVAILABLE', 'OFFLINE', 'DEMO'].includes(String(record.mode))) throw new TypeError('snapshot usa versión o modo no admitido');
  if (typeof record.id !== 'string' || record.id.length < 3) throw new TypeError('snapshot.id inválido');
  if (!Number.isFinite(Date.parse(String(record.generatedAt))) || !Number.isFinite(Date.parse(String(record.validUntil)))) throw new TypeError('snapshot usa fechas inválidas');
  if (!Array.isArray(record.messages)) throw new TypeError('snapshot.messages debe ser un arreglo');
  record.messages.forEach(validateCriticalMessage);
  if (!Array.isArray(record.sources)) throw new TypeError('snapshot.sources debe ser un arreglo');
  if ('systems' in record && !Array.isArray(record.systems)) throw new TypeError('snapshot.systems debe ser un arreglo');
  const river = plainRecord(record.river, 'snapshot.river');
  if (river.available !== false) validateRiverPulse(river as unknown as Snapshot['river']);
  else {
    if (!Array.isArray(river.points) || !Array.isArray(river.thresholds) || !Array.isArray(river.forecastPoints)) throw new TypeError('snapshot.river indisponible inválido');
  }
  return value as Snapshot;
}
