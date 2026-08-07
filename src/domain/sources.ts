import type { Source, SourceStatus } from './snapshot.ts';

export function sourceFreshness(source: Pick<Source, 'observedAt' | 'validUntil'>, now: Date): SourceStatus {
  const observedAt = Date.parse(source.observedAt);
  const validUntil = Date.parse(source.validUntil);
  if (!Number.isFinite(observedAt) || !Number.isFinite(validUntil)) return 'UNKNOWN';
  if (observedAt > now.getTime() + 60_000) return 'UNKNOWN';
  return now.getTime() <= validUntil ? 'FRESH' : 'STALE';
}

export function sourceAgeLabel(observedAt: string, referenceAt: string): string {
  const ageMinutes = Math.max(0, Math.floor((Date.parse(referenceAt) - Date.parse(observedAt)) / 60_000));
  if (!Number.isFinite(ageMinutes)) return 'antigüedad desconocida';
  if (ageMinutes < 1) return 'ahora';
  if (ageMinutes < 60) return `hace ${ageMinutes} min`;
  const hours = Math.floor(ageMinutes / 60);
  return `hace ${hours} h`;
}
