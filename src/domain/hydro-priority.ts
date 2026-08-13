import type { HydrologicalSystem, OfficialAlert, Snapshot, Source } from './snapshot.ts';

export type HydroPriorityMode = 'NORMAL' | 'SINGLE_RIVER_PRIORITY' | 'DUAL_EMERGENCY';
export type HydroPrioritySignalKind = 'OFFICIAL_ALERT' | 'VERIFIED_HYDRO_CONDITION';

export interface HydroPrioritySignal {
  readonly systemId: string;
  readonly kind: HydroPrioritySignalKind;
  readonly reason: string;
  readonly sourceId: string;
  readonly alertHeadline?: string;
}

export interface HydroPriorityDecision {
  readonly mode: HydroPriorityMode;
  readonly affectedSystemIds: readonly string[];
  readonly signals: readonly HydroPrioritySignal[];
}

const EMPTY_DECISION: HydroPriorityDecision = Object.freeze({
  mode: 'NORMAL',
  affectedSystemIds: Object.freeze([]),
  signals: Object.freeze([]),
});

function normalized(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function sourceIsOperationalOfficialObservation(source: Source | undefined): source is Source {
  if (!source || !source.official || source.kind !== 'OFFICIAL_OBSERVATION' || !source.determinesPrimaryState) return false;
  if (source.status !== 'FRESH' && source.status !== 'STALE') return false;
  return source.classification === undefined || source.classification === 'OPERATIONAL_FRESH' || source.classification === 'OPERATIONAL_STALE';
}

function systemHasUsableOfficialReading(system: HydrologicalSystem, source: Source | undefined): boolean {
  if (!sourceIsOperationalOfficialObservation(source)) return false;
  if (!system.available || system.currentMetres === null || !Number.isFinite(system.currentMetres)) return false;
  return system.freshness === 'ACTUALIZADO' || system.freshness === 'ACTUALIZACION_DEMORADA';
}

function verifiedHydroSignal(system: HydrologicalSystem, source: Source | undefined): HydroPrioritySignal | null {
  if (!systemHasUsableOfficialReading(system, source)) return null;
  const reached = [...system.thresholds]
    .filter((threshold) => threshold.id === 'ALERTA' || threshold.id === 'EVACUACION')
    .filter((threshold) => system.currentMetres! >= threshold.metres)
    .sort((left, right) => right.metres - left.metres)[0];
  if (!reached) return null;
  return Object.freeze({
    systemId: system.id,
    kind: 'VERIFIED_HYDRO_CONDITION' as const,
    reason: `Condición hídrica verificada: lectura oficial sobre ${reached.label.toLowerCase()}. No equivale por sí sola a una orden de evacuación.`,
    sourceId: source!.id,
  });
}

function officialAlertFeedIsUsable(snapshot: Snapshot): Source | undefined {
  if (snapshot.alertStatus !== 'ALERTA_OFICIAL_ACTIVA') return undefined;
  return snapshot.sources.find((source) =>
    source.kind === 'OFFICIAL_ALERT' &&
    source.official &&
    source.determinesPrimaryState &&
    (source.status === 'FRESH' || source.status === 'STALE') &&
    (source.classification === undefined || source.classification === 'OPERATIONAL_FRESH' || source.classification === 'OPERATIONAL_STALE'));
}

function activeAlertText(alert: OfficialAlert): string {
  return normalized([alert.event, alert.headline, alert.description, alert.instruction, alert.area].join(' '));
}

function alertMentionsSystem(alert: OfficialAlert, system: HydrologicalSystem): boolean {
  const text = activeAlertText(alert);
  const watercourse = normalized(system.watercourse);
  if (watercourse && text.includes(watercourse)) return true;
  if (system.id.startsWith('parana-')) return text.includes('rio parana') || text.includes('parana');
  if (system.id.startsWith('salado-')) return text.includes('rio salado');
  return false;
}

function verifiedAlertSignals(snapshot: Snapshot, systems: readonly HydrologicalSystem[]): readonly HydroPrioritySignal[] {
  const feed = officialAlertFeedIsUsable(snapshot);
  if (!feed) return Object.freeze([]);
  const activeAlerts = (snapshot.alerts ?? []).filter((alert) =>
    alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
  const signals: HydroPrioritySignal[] = [];
  for (const alert of activeAlerts) {
    for (const system of systems) {
      if (!alertMentionsSystem(alert, system)) continue;
      signals.push(Object.freeze({
        systemId: system.id,
        kind: 'OFFICIAL_ALERT',
        reason: `Alerta oficial relacionada: ${alert.headline || alert.event}.`,
        sourceId: feed.id,
        alertHeadline: alert.headline || alert.event,
      }));
    }
  }
  return Object.freeze(signals);
}

export function deriveHydroPriority(snapshot: Snapshot): HydroPriorityDecision {
  const systems = snapshot.systems ?? Object.freeze([]);
  if (systems.length === 0) return EMPTY_DECISION;

  const signals: HydroPrioritySignal[] = [];
  for (const system of systems) {
    const source = snapshot.sources.find((item) => item.id === system.sourceId);
    const signal = verifiedHydroSignal(system, source);
    if (signal) signals.push(signal);
  }
  signals.push(...verifiedAlertSignals(snapshot, systems));

  const affectedSystemIds = Object.freeze(systems
    .map((system) => system.id)
    .filter((id) => signals.some((signal) => signal.systemId === id)));
  const mode: HydroPriorityMode = affectedSystemIds.length >= 2
    ? 'DUAL_EMERGENCY'
    : affectedSystemIds.length === 1
      ? 'SINGLE_RIVER_PRIORITY'
      : 'NORMAL';

  return Object.freeze({ mode, affectedSystemIds, signals: Object.freeze(signals) });
}

export function hydroPrioritySignalsForSystem(decision: HydroPriorityDecision, systemId: string): readonly HydroPrioritySignal[] {
  return decision.signals.filter((signal) => signal.systemId === systemId);
}
