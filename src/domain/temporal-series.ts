import type { HydrologicalSystem, RiverPoint } from './snapshot.ts';

export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;
const EARLIEST_PUBLIC_TIMESTAMP = Date.UTC(2000, 0, 1);
const HOUR_MS = 3_600_000;

export type TemporalAvailability = 'OK' | 'NOT_ENOUGH_DATA' | 'FUTURE_DATA_REJECTED';

export interface TemporalDeltaResult {
  readonly value: number | null;
  readonly status: TemporalAvailability;
  readonly latestAt: string | null;
  readonly referenceAt: string | null;
  readonly typicalIntervalMs: number | null;
}

export interface TemporalWindowResult {
  readonly points: readonly RiverPoint[];
  readonly sufficient: boolean;
  readonly status: TemporalAvailability;
  readonly typicalIntervalMs: number | null;
}

export function parseObservationTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= EARLIEST_PUBLIC_TIMESTAMP ? parsed : null;
}

export function isObservationTimestampUsable(value: string | null | undefined, now: Date | string): boolean {
  const parsed = parseObservationTime(value);
  const anchor = typeof now === 'string' ? Date.parse(now) : now.getTime();
  return parsed !== null && Number.isFinite(anchor) && parsed <= anchor + CLOCK_SKEW_TOLERANCE_MS;
}

export function hasSignificantFutureTimestamp(value: string | null | undefined, now: Date | string): boolean {
  const parsed = parseObservationTime(value);
  const anchor = typeof now === 'string' ? Date.parse(now) : now.getTime();
  return parsed !== null && Number.isFinite(anchor) && parsed > anchor + CLOCK_SKEW_TOLERANCE_MS;
}

export function sanitizeMeasuredRiverPoints(points: readonly RiverPoint[], now: Date | string): readonly RiverPoint[] {
  const anchor = typeof now === 'string' ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(anchor)) return Object.freeze([]);
  const ordered = points
    .filter((point) => point.measured === true && Number.isFinite(point.metres) && isObservationTimestampUsable(point.at, anchorToDate(anchor)))
    .slice()
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const deduped: RiverPoint[] = [];
  for (const point of ordered) {
    if (deduped.length && deduped.at(-1)!.at === point.at) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return Object.freeze(deduped);
}

function anchorToDate(anchor: number): Date { return new Date(anchor); }

export function medianIntervalMs(points: readonly RiverPoint[]): number | null {
  const intervals = points.slice(1)
    .map((point, index) => Date.parse(point.at) - Date.parse(points[index]!.at))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!intervals.length) return null;
  const ordered = intervals.sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function horizonToleranceMs(hours: number, typicalIntervalMs: number | null): number {
  const capHours = hours <= 1 ? .6 : hours <= 6 ? 1.5 : hours <= 24 ? 3 : hours <= 72 ? 6 : 12;
  const typical = typicalIntervalMs ?? Math.min(HOUR_MS, hours * HOUR_MS);
  return Math.min(capHours * HOUR_MS, Math.max(10 * 60_000, typical * 1.75));
}

function internalCoverageIsPlausible(points: readonly RiverPoint[], typicalIntervalMs: number | null, toleranceMs: number, horizonMs: number): boolean {
  if (points.length < 2) return false;
  const typical = typicalIntervalMs ?? HOUR_MS;
  const gapLimit = Math.max(typical * 4, toleranceMs * 2, 2 * HOUR_MS);
  const materialHorizonGap = Math.max(gapLimit, horizonMs * .45);
  for (let index = 1; index < points.length; index += 1) {
    const gap = Date.parse(points[index]!.at) - Date.parse(points[index - 1]!.at);
    if (gap > materialHorizonGap) return false;
  }
  return true;
}

export function temporalDelta(points: readonly RiverPoint[], hours: number, now: Date | string): TemporalDeltaResult {
  const futureRejected = points.some((point) => point.measured === true && hasSignificantFutureTimestamp(point.at, now));
  const usable = sanitizeMeasuredRiverPoints(points, now);
  const latest = usable.at(-1);
  if (!latest || hours <= 0) return Object.freeze({ value: null, status: futureRejected ? 'FUTURE_DATA_REJECTED' : 'NOT_ENOUGH_DATA', latestAt: latest?.at ?? null, referenceAt: null, typicalIntervalMs: null });
  const typicalIntervalMs = medianIntervalMs(usable);
  const horizonMs = hours * HOUR_MS;
  const target = Date.parse(latest.at) - horizonMs;
  const candidates = usable.slice(0, -1);
  let reference: RiverPoint | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of candidates) {
    const currentDistance = Math.abs(Date.parse(point.at) - target);
    if (currentDistance < distance) { reference = point; distance = currentDistance; }
  }
  const toleranceMs = horizonToleranceMs(hours, typicalIntervalMs);
  if (!reference || distance > toleranceMs) return Object.freeze({ value: null, status: futureRejected ? 'FUTURE_DATA_REJECTED' : 'NOT_ENOUGH_DATA', latestAt: latest.at, referenceAt: reference?.at ?? null, typicalIntervalMs });
  const segment = usable.filter((point) => Date.parse(point.at) >= Date.parse(reference!.at) && Date.parse(point.at) <= Date.parse(latest.at));
  if (!internalCoverageIsPlausible(segment, typicalIntervalMs, toleranceMs, horizonMs)) return Object.freeze({ value: null, status: futureRejected ? 'FUTURE_DATA_REJECTED' : 'NOT_ENOUGH_DATA', latestAt: latest.at, referenceAt: reference.at, typicalIntervalMs });
  return Object.freeze({ value: latest.metres - reference.metres, status: futureRejected ? 'FUTURE_DATA_REJECTED' : 'OK', latestAt: latest.at, referenceAt: reference.at, typicalIntervalMs });
}

export function strictTimeWindow(points: readonly RiverPoint[], hours: number, now: Date | string): TemporalWindowResult {
  const futureRejected = points.some((point) => point.measured === true && hasSignificantFutureTimestamp(point.at, now));
  const usable = sanitizeMeasuredRiverPoints(points, now);
  const latest = usable.at(-1);
  if (!latest || hours <= 0) return Object.freeze({ points: Object.freeze([]), sufficient: false, status: futureRejected ? 'FUTURE_DATA_REJECTED' : 'NOT_ENOUGH_DATA', typicalIntervalMs: null });
  const horizonMs = hours * HOUR_MS;
  const start = Date.parse(latest.at) - horizonMs;
  const selected = usable.filter((point) => Date.parse(point.at) >= start && Date.parse(point.at) <= Date.parse(latest.at));
  const typicalIntervalMs = medianIntervalMs(usable);
  const toleranceMs = horizonToleranceMs(hours, typicalIntervalMs);
  const span = selected.length > 1 ? Date.parse(selected.at(-1)!.at) - Date.parse(selected[0]!.at) : 0;
  const startDistance = selected.length ? Math.abs(Date.parse(selected[0]!.at) - start) : Number.POSITIVE_INFINITY;
  const sufficient = selected.length >= 2
    && span >= horizonMs * .7
    && startDistance <= Math.max(toleranceMs, horizonMs * .3)
    && internalCoverageIsPlausible(selected, typicalIntervalMs, toleranceMs, horizonMs);
  return Object.freeze({ points: Object.freeze(selected), sufficient, status: sufficient ? 'OK' : futureRejected ? 'FUTURE_DATA_REJECTED' : 'NOT_ENOUGH_DATA', typicalIntervalMs });
}

export function hasTemporalCoverage(points: readonly RiverPoint[], hours: number, now: Date | string): boolean {
  return strictTimeWindow(points, hours, now).sufficient;
}

export function deriveHydrometricTrend(points: readonly RiverPoint[], now: Date | string): HydrologicalSystem['trend'] {
  const delta = temporalDelta(points, 6, now).value;
  if (delta === null) return 'UNKNOWN';
  if (delta >= .12) return 'RISING';
  if (delta >= .02) return 'RISING_SLOWLY';
  if (delta <= -.02) return 'FALLING';
  return 'STABLE';
}
