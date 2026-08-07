import type { AlertVerificationState, DataStatus, FeedClassification, FreshnessState, HydrologicalSystem, OfficialAlert, Source, TimelineEvent } from './snapshot.ts';

export const LOCAL_TIME_ZONE = 'America/Argentina/Cordoba';
const EARLIEST_PUBLIC_TIMESTAMP = Date.UTC(2000, 0, 1);

export function isPublicTimestamp(value: string | null | undefined): value is string {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= EARLIEST_PUBLIC_TIMESTAMP;
}

export function freshnessFor(observedAt: string | null | undefined, now: Date, delayedMs: number, staleMs: number): FreshnessState {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt))) return 'NO_DISPONIBLE';
  const age = Math.max(0, now.getTime() - Date.parse(observedAt));
  if (age <= delayedMs) return 'ACTUALIZADO';
  if (age <= staleMs) return 'ACTUALIZACION_DEMORADA';
  return 'DESACTUALIZADO';
}

export function dataStatusForFreshness(value: FreshnessState): DataStatus {
  if (value === 'ACTUALIZADO') return 'LIVE';
  if (value === 'ACTUALIZACION_DEMORADA' || value === 'DESACTUALIZADO') return 'STALE';
  return 'UNAVAILABLE';
}

export function classificationForSource(source: Pick<Source, 'connected' | 'status' | 'kind'>, blocked?: FeedClassification): FeedClassification {
  if (blocked) return blocked;
  if (!source.connected || source.status === 'UNAVAILABLE') return 'DEGRADED';
  if (source.kind === 'SATELLITE_OBSERVATION' || source.kind === 'FORECAST_MODEL') return 'SUPPLEMENTARY';
  return source.status === 'FRESH' ? 'OPERATIONAL_FRESH' : 'OPERATIONAL_STALE';
}

export function alertVerificationState(alertSource: Source | undefined, alerts: readonly OfficialAlert[]): AlertVerificationState {
  if (!alertSource || alertSource.classification === 'BLOCKED_CREDENTIAL' || alertSource.classification === 'BLOCKED_NO_MACHINE_ENDPOINT' || alertSource.status === 'UNAVAILABLE') {
    return 'FUENTES_DE_ALERTAS_NO_DISPONIBLES';
  }
  if (alerts.some((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'))) return 'ALERTA_OFICIAL_ACTIVA';
  if (alertSource.status === 'STALE' || alertSource.freshness === 'ACTUALIZACION_DEMORADA' || alertSource.freshness === 'DESACTUALIZADO') return 'VERIFICACION_DE_ALERTAS_DEGRADADA';
  return 'SIN_ALERTAS_OFICIALES_DETECTADAS';
}

export function highestFreshness(systems: readonly HydrologicalSystem[]): FreshnessState {
  const available = systems.filter((system) => system.available);
  if (!available.length) return 'NO_DISPONIBLE';
  const rank: Record<FreshnessState, number> = { ACTUALIZADO: 0, ACTUALIZACION_DEMORADA: 1, DESACTUALIZADO: 2, NO_DISPONIBLE: 3 };
  return available.reduce<FreshnessState>((worst, system) => {
    const value = system.freshness ?? 'NO_DISPONIBLE';
    return rank[value] > rank[worst] ? value : worst;
  }, 'ACTUALIZADO');
}

export function timelineFor(systems: readonly HydrologicalSystem[], alerts: readonly OfficialAlert[], sources: readonly Source[], now: Date): readonly TimelineEvent[] {
  const horizon = now.getTime() - 72 * 60 * 60_000;
  const events: TimelineEvent[] = [];
  for (const alert of alerts) {
    if (Date.parse(alert.sent) < horizon) continue;
    const type: TimelineEvent['type'] = alert.lifecycle === 'CANCELLED' ? 'ALERT_CANCELLED' : alert.lifecycle === 'UPDATED' ? 'ALERT_UPDATED' : 'ALERT_ISSUED';
    events.push(Object.freeze({ id: `alert:${alert.identifier}`, at: alert.sent, type, title: alert.headline, detail: `${alert.sender} · ${alert.area}`, sourceId: 'smn-alerts', official: true }));
  }
  for (const system of systems) {
    if (!system.observedAt || Date.parse(system.observedAt) < horizon) continue;
    events.push(Object.freeze({ id: `measurement:${system.id}:${system.observedAt}`, at: system.observedAt, type: 'MEASUREMENT', title: `Nueva medición: ${system.watercourse} — ${system.stationName}`, detail: system.currentMetres === null ? 'Medición sin valor utilizable.' : `${system.currentMetres.toFixed(2)} m · ${system.sourceName}`, sourceId: system.sourceId, official: true }));
  }
  for (const source of sources) {
    if (source.classification !== 'DEGRADED' && source.classification !== 'BLOCKED_CREDENTIAL' && source.classification !== 'BLOCKED_NO_MACHINE_ENDPOINT') continue;
    events.push(Object.freeze({ id: `source:${source.id}:${source.classification}`, at: source.lastCheckedAt ?? now.toISOString(), type: 'SOURCE_DEGRADED', title: `Fuente con disponibilidad limitada: ${source.feedName ?? source.name}`, detail: source.limitations ?? source.contribution, sourceId: source.id, official: false }));
  }
  return Object.freeze(events.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 30));
}

export function formatLocalDateTime(value: string | null | undefined): string {
  if (!isPublicTimestamp(value)) return 'Sin fecha disponible';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: LOCAL_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value));
}

export function ageMinutes(value: string | null | undefined, now: string): number | null {
  if (!isPublicTimestamp(value) || !isPublicTimestamp(now)) return null;
  return Math.max(0, Math.floor((Date.parse(now) - Date.parse(value)) / 60_000));
}

export function formatHumanAge(value: string | null | undefined, now: string): string {
  const minutes = ageMinutes(value, now);
  if (minutes === null) return 'antigüedad no disponible';
  if (minutes < 1) return 'hace menos de un minuto';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
