import type { Snapshot } from './snapshot';
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
  if (record.schemaVersion !== '1.0' || record.mode !== 'DEMO') throw new TypeError('snapshot usa versión o modo no admitido');
  if (typeof record.id !== 'string' || !record.id.startsWith('demo-')) throw new TypeError('snapshot.id demo inválido');
  if (!Array.isArray(record.messages)) throw new TypeError('snapshot.messages debe ser un arreglo');
  record.messages.forEach(validateCriticalMessage);
  if (!Array.isArray(record.sources) || record.sources.length < 1) throw new TypeError('snapshot.sources no puede estar vacío');
  return value as Snapshot;
}
