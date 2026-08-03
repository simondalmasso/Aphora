import type { CriticalMessage, CriticalMessageStatus, CriticalMessageType } from './types';

const TYPES = new Set<CriticalMessageType>(['OFFICIAL_NOTICE', 'WEATHER_WARNING', 'SHELTER_UPDATE', 'SOURCE_CONTRADICTION', 'SYSTEM_STATUS', 'COMMUNITY_VERIFIED_REPORT']);
const STATUSES = new Set<CriticalMessageStatus>(['ACTIVE', 'EXPIRED', 'RETRACTED', 'UNKNOWN']);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{2,127}$/;

function assertString(value: unknown, field: string, max = 512): asserts value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) throw new TypeError(`${field} inválido`);
}

export function validateCriticalMessage(value: unknown): asserts value is CriticalMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('mensaje inválido');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError('mensaje debe ser un objeto plano');
  const allowed = new Set(['id', 'type', 'title', 'body', 'sourceId', 'geographicScope', 'createdAt', 'expiresAt', 'priority', 'status', 'evidenceRefs', 'commitment', 'provenance']);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(`campo de mensaje no admitido: ${String(key)}`);
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !('value' in descriptor) || 'get' in descriptor || 'set' in descriptor) throw new TypeError(`campo de mensaje inseguro: ${key}`);
    record[key] = descriptor.value;
  }
  assertString(record.id, 'id', 128);
  if (!ID_PATTERN.test(record.id)) throw new TypeError('id inestable o inválido');
  if (typeof record.type !== 'string' || !TYPES.has(record.type as CriticalMessageType)) throw new TypeError('type inválido');
  assertString(record.title, 'title', 140);
  assertString(record.body, 'body', 700);
  assertString(record.sourceId, 'sourceId', 128);
  if (!ID_PATTERN.test(record.sourceId)) throw new TypeError('sourceId inválido');
  if (!Array.isArray(record.geographicScope) || record.geographicScope.some((item) => typeof item !== 'string')) throw new TypeError('geographicScope inválido');
  if (!Array.isArray(record.evidenceRefs) || record.evidenceRefs.some((item) => typeof item !== 'string')) throw new TypeError('evidenceRefs inválido');
  if (!Number.isInteger(record.priority) || (record.priority as number) < 0 || (record.priority as number) > 3) throw new TypeError('priority inválida');
  if (typeof record.status !== 'string' || !STATUSES.has(record.status as CriticalMessageStatus)) throw new TypeError('status inválido');
  assertString(record.createdAt, 'createdAt');
  assertString(record.expiresAt, 'expiresAt');
  const createdAt = Date.parse(record.createdAt);
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || expiresAt <= createdAt) throw new TypeError('TTL inválido');
  if (record.commitment !== undefined) assertString(record.commitment, 'commitment', 256);
  if (typeof record.provenance !== 'object' || record.provenance === null || Array.isArray(record.provenance)) throw new TypeError('provenance inválida');
  const provenance = record.provenance as Record<string, unknown>;
  const provenanceKeys = Object.keys(provenance);
  if (provenanceKeys.length !== 3 || !['producer', 'sourceKind', 'capturedAt'].every((key) => provenanceKeys.includes(key))) throw new TypeError('provenance incompleta');
  assertString(provenance.producer, 'provenance.producer', 128);
  assertString(provenance.sourceKind, 'provenance.sourceKind', 128);
  assertString(provenance.capturedAt, 'provenance.capturedAt');
  if (!Number.isFinite(Date.parse(provenance.capturedAt))) throw new TypeError('provenance.capturedAt inválido');
}
