import { safeStationThresholds } from './hydrometric-context.ts';
import { isObservationTimestampUsable } from './temporal-series.ts';
import type { FreshnessState, HydrologicalSystem, Snapshot, Source } from './snapshot.ts';

export type HazardKind = 'RIVERINE_FLOOD' | 'PLUVIAL_HEAVY_RAIN';
export type HazardSourceRole =
  | 'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION'
  | 'OFFICIAL_WARNING'
  | 'OFFICIAL_STATIC_RISK_CONTEXT'
  | 'SUPPLEMENTARY_SATELLITE_ESTIMATE'
  | 'SUPPLEMENTARY_MODEL_FORECAST'
  | 'COMMUNITY_REPORT'
  | 'INTERNAL_DERIVATION';
export type HydroSituationSignalKind =
  | 'OFFICIAL_HYDROMETRIC_OBSERVATION'
  | 'OFFICIAL_PROTECTION_REFERENCE_REACHED'
  | 'RAPID_CHANGE_OBSERVED'
  | 'OFFICIAL_WEATHER_ALERT'
  | 'OFFICIAL_FLOOD_OR_CIVIL_PROTECTION_ALERT'
  | 'MODEL_FLOOD_SIGNAL'
  | 'HEAVY_RAIN_CONTEXT'
  | 'OFFICIAL_RISK_AREA_CONTEXT'
  | 'SOURCE_DEGRADED'
  | 'COMMUNITY_REPORT_CONTEXT';
export type FloodSituationState = 'ROUTINE' | 'ELEVATED_HYDRO_SITUATION' | 'FLOOD_SITUATION' | 'OFFICIAL_WARNING_ACTIVE' | 'VERIFICATION_DEGRADED' | 'UNKNOWN';

export interface HydroSituationSignal {
  readonly id: string;
  readonly kind: HydroSituationSignalKind;
  readonly hazardKind: HazardKind;
  readonly sourceRole: HazardSourceRole;
  readonly sourceId: string;
  readonly organization: string;
  readonly observedAt: string | null;
  readonly fetchedAt: string | null;
  readonly freshness: FreshnessState;
  readonly systemOrArea: string;
  readonly semanticRole: string;
  readonly canDeterminePublicState: boolean;
  readonly confidenceClass?: 'OFFICIAL' | 'OBSERVED' | 'DERIVED' | 'SUPPLEMENTARY';
  readonly explanation: string;
  readonly active: boolean;
}

export interface FloodSituationDecision {
  readonly state: FloodSituationState;
  readonly displayLabel: string;
  readonly explanation: string;
  readonly affectedSystemIds: readonly string[];
  readonly signals: readonly HydroSituationSignal[];
  readonly officialWarningActive: boolean;
  readonly officialEmergencyDeclared: false;
}

function sourceFor(snapshot: Snapshot, system: HydrologicalSystem): Source | undefined {
  return snapshot.sources.find((source) => source.id === system.sourceId);
}
function validFreshness(value: FreshnessState | undefined): value is Extract<FreshnessState, 'ACTUALIZADO' | 'ACTUALIZACION_DEMORADA'> {
  return value === 'ACTUALIZADO' || value === 'ACTUALIZACION_DEMORADA';
}
function usableOfficialHydrometry(snapshot: Snapshot, system: HydrologicalSystem, source: Source | undefined): boolean {
  if (!source || !source.official || source.kind !== 'OFFICIAL_OBSERVATION' || !source.determinesPrimaryState) return false;
  if (source.status !== 'FRESH' && source.status !== 'STALE') return false;
  if (!system.available || system.currentMetres === null || !validFreshness(system.freshness)) return false;
  if (!isObservationTimestampUsable(system.observedAt, snapshot.generatedAt)) return false;
  if (!system.validUntil || Date.parse(system.validUntil) < Date.parse(snapshot.generatedAt)) return false;
  return true;
}
function normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function floodWarningText(value: string): boolean { return /inund|crecida|desborde|evacua|desbordamiento/.test(normalize(value)); }
function weatherFloodRelevantText(value: string): boolean { return /lluv|torment|precipit|inund|aneg|crecida|desborde/.test(normalize(value)); }
function organization(source: Source | undefined): string { return source?.organizationName ?? source?.name ?? 'Fuente no identificada'; }

export function deriveFloodSituation(snapshot: Snapshot): FloodSituationDecision {
  const systems = snapshot.systems ?? Object.freeze([]);
  const signals: HydroSituationSignal[] = [];
  const materiallyRelevant = new Set<string>();
  let rapidChange = false;
  let criticalDegraded = systems.length === 0;

  for (const system of systems) {
    const source = sourceFor(snapshot, system);
    const usable = usableOfficialHydrometry(snapshot, system, source);
    if (usable) {
      signals.push(Object.freeze({
        id: `hydrometry:${system.id}`,
        kind: 'OFFICIAL_HYDROMETRIC_OBSERVATION', hazardKind: 'RIVERINE_FLOOD', sourceRole: 'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION',
        sourceId: system.sourceId, organization: organization(source), observedAt: system.observedAt, fetchedAt: system.fetchedAt ?? source?.fetchedAt ?? null,
        freshness: system.freshness ?? 'NO_DISPONIBLE', systemOrArea: system.id, semanticRole: 'Observación hidrométrica primaria', canDeterminePublicState: false,
        confidenceClass: 'OFFICIAL', explanation: `Lectura oficial de ${system.watercourse}, estación ${system.stationName}.`, active: true,
      }));
      const reached = [...safeStationThresholds(system)]
        .filter((threshold) => threshold.id === 'ALERTA' || threshold.id === 'EVACUACION')
        .filter((threshold) => system.currentMetres! >= threshold.metres)
        .sort((left, right) => right.metres - left.metres)[0];
      if (reached) {
        materiallyRelevant.add(system.id);
        signals.push(Object.freeze({
          id: `protection-reference:${system.id}:${reached.id}`,
          kind: 'OFFICIAL_PROTECTION_REFERENCE_REACHED', hazardKind: 'RIVERINE_FLOOD', sourceRole: 'INTERNAL_DERIVATION', sourceId: system.sourceId,
          organization: organization(source), observedAt: system.observedAt, fetchedAt: system.fetchedAt ?? source?.fetchedAt ?? null, freshness: system.freshness ?? 'NO_DISPONIBLE',
          systemOrArea: system.id, semanticRole: 'Comparación con referencia oficial de protección', canDeterminePublicState: false, confidenceClass: 'DERIVED',
          explanation: `La lectura oficial alcanzó ${reached.label.toLowerCase()}. Esto vuelve materialmente relevante al río, pero no constituye una emergencia ni una orden oficial.`, active: true,
        }));
      }
      const delta6 = system.delta6h;
      const delta24 = system.delta24h;
      if ((delta6 !== null && delta6 >= .12) || (delta24 !== null && delta24 >= .25)) {
        rapidChange = true;
        signals.push(Object.freeze({
          id: `rapid-change:${system.id}`,
          kind: 'RAPID_CHANGE_OBSERVED', hazardKind: 'RIVERINE_FLOOD', sourceRole: 'INTERNAL_DERIVATION', sourceId: system.sourceId,
          organization: organization(source), observedAt: system.observedAt, fetchedAt: system.fetchedAt ?? source?.fetchedAt ?? null, freshness: system.freshness ?? 'NO_DISPONIBLE',
          systemOrArea: system.id, semanticRole: 'Cambio observado derivado de serie oficial', canDeterminePublicState: false, confidenceClass: 'DERIVED',
          explanation: 'La serie oficial muestra un cambio material en una ventana con cobertura suficiente. Es observación de tendencia, no pronóstico.', active: true,
        }));
      }
    } else {
      criticalDegraded = true;
      signals.push(Object.freeze({
        id: `source-degraded:${system.id}`,
        kind: 'SOURCE_DEGRADED', hazardKind: 'RIVERINE_FLOOD', sourceRole: 'OFFICIAL_LOCAL_OR_NATIONAL_OBSERVATION', sourceId: system.sourceId,
        organization: organization(source), observedAt: system.observedAt, fetchedAt: system.fetchedAt ?? source?.fetchedAt ?? null, freshness: system.freshness ?? 'NO_DISPONIBLE',
        systemOrArea: system.id, semanticRole: 'Disponibilidad de observación hidrométrica', canDeterminePublicState: false, confidenceClass: 'OFFICIAL',
        explanation: `No hay una lectura oficial suficientemente vigente y utilizable para ${system.watercourse}, estación ${system.stationName}.`, active: true,
      }));
    }
  }

  const alertSource = snapshot.sources.find((source) => source.kind === 'OFFICIAL_ALERT' && source.determinesPrimaryState);
  const activeAlerts = (snapshot.alerts ?? []).filter((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
  let officialWarningActive = false;
  for (const alert of activeAlerts) {
    const text = [alert.event, alert.headline, alert.description, alert.instruction, alert.area].join(' ');
    if (!weatherFloodRelevantText(text)) continue;
    officialWarningActive = true;
    const isFlood = floodWarningText(text);
    signals.push(Object.freeze({
      id: `official-warning:${alert.identifier}`,
      kind: isFlood ? 'OFFICIAL_FLOOD_OR_CIVIL_PROTECTION_ALERT' : 'OFFICIAL_WEATHER_ALERT', hazardKind: isFlood ? 'RIVERINE_FLOOD' : 'PLUVIAL_HEAVY_RAIN', sourceRole: 'OFFICIAL_WARNING',
      sourceId: alertSource?.id ?? 'official-alert', organization: alertSource?.organizationName ?? alert.sender, observedAt: alert.sent, fetchedAt: alertSource?.fetchedAt ?? null,
      freshness: alertSource?.freshness ?? 'NO_DISPONIBLE', systemOrArea: alert.area, semanticRole: 'Advertencia oficial', canDeterminePublicState: true, confidenceClass: 'OFFICIAL',
      explanation: `${alert.headline || alert.event}. Es una advertencia oficial; no implica que toda el área esté inundada ni que exista una emergencia declarada.`, active: true,
    }));
  }
  if (snapshot.alertStatus === 'FUENTES_DE_ALERTAS_NO_DISPONIBLES' || snapshot.alertStatus === 'VERIFICACION_DE_ALERTAS_DEGRADADA') {
    criticalDegraded = true;
    signals.push(Object.freeze({
      id: 'source-degraded:official-alerts', kind: 'SOURCE_DEGRADED', hazardKind: 'PLUVIAL_HEAVY_RAIN', sourceRole: 'OFFICIAL_WARNING', sourceId: alertSource?.id ?? 'smn-alerts',
      organization: organization(alertSource), observedAt: alertSource?.observedAt ?? null, fetchedAt: alertSource?.fetchedAt ?? null, freshness: alertSource?.freshness ?? 'NO_DISPONIBLE',
      systemOrArea: 'Santa Fe', semanticRole: 'Verificación de alertas oficiales', canDeterminePublicState: false, confidenceClass: 'OFFICIAL',
      explanation: 'La verificación automática de alertas oficiales no está suficientemente vigente; no se puede inferir ausencia de advertencias.', active: true,
    }));
  }

  const nasa = snapshot.sources.find((source) => source.id === 'nasa-gpm-imerg-early');
  if (nasa?.connected && nasa.freshness === 'ACTUALIZADO' && typeof nasa.instantRateMmPerHour === 'number' && Number.isFinite(nasa.instantRateMmPerHour)) {
    signals.push(Object.freeze({
      id: 'rain:nasa-gpm-imerg-early', kind: 'HEAVY_RAIN_CONTEXT', hazardKind: 'PLUVIAL_HEAVY_RAIN', sourceRole: 'SUPPLEMENTARY_SATELLITE_ESTIMATE', sourceId: nasa.id,
      organization: organization(nasa), observedAt: nasa.observedAt, fetchedAt: nasa.fetchedAt ?? null, freshness: nasa.freshness, systemOrArea: 'Santa Fe', semanticRole: 'Estimación satelital suplementaria',
      canDeterminePublicState: false, confidenceClass: 'SUPPLEMENTARY', explanation: 'Estimación satelital reciente de precipitación. No demuestra anegamiento ni explica por sí sola un cambio del río.', active: true,
    }));
  }
  for (const model of snapshot.sources.filter((source) => source.kind === 'FORECAST_MODEL')) {
    signals.push(Object.freeze({
      id: `model:${model.id}`, kind: 'MODEL_FLOOD_SIGNAL', hazardKind: 'RIVERINE_FLOOD', sourceRole: 'SUPPLEMENTARY_MODEL_FORECAST', sourceId: model.id, organization: organization(model),
      observedAt: model.observedAt, fetchedAt: model.fetchedAt ?? null, freshness: model.freshness ?? 'NO_DISPONIBLE', systemOrArea: 'Santa Fe', semanticRole: 'Pronóstico/modelo suplementario',
      canDeterminePublicState: false, confidenceClass: 'SUPPLEMENTARY', explanation: 'Señal de modelo suplementario. Nunca reemplaza observación INA ni una advertencia oficial.', active: model.connected === true,
    }));
  }
  for (const report of snapshot.sources.filter((source) => source.kind === 'COMMUNITY_REPORT')) {
    signals.push(Object.freeze({
      id: `community:${report.id}`, kind: 'COMMUNITY_REPORT_CONTEXT', hazardKind: 'PLUVIAL_HEAVY_RAIN', sourceRole: 'COMMUNITY_REPORT', sourceId: report.id, organization: organization(report),
      observedAt: report.observedAt, fetchedAt: report.fetchedAt ?? null, freshness: report.freshness ?? 'NO_DISPONIBLE', systemOrArea: 'Santa Fe', semanticRole: 'Reporte comunitario no oficial',
      canDeterminePublicState: false, confidenceClass: 'SUPPLEMENTARY', explanation: 'Contexto comunitario sujeto a revisión; no cambia automáticamente el estado público.', active: report.connected === true,
    }));
  }

  let state: FloodSituationState;
  let displayLabel: string;
  let explanation: string;
  if (officialWarningActive) {
    state = 'OFFICIAL_WARNING_ACTIVE'; displayLabel = 'Alerta oficial vigente'; explanation = 'Hay una advertencia oficial relevante para lluvia o inundación. La evidencia hidrométrica se mantiene separada.';
  } else if (materiallyRelevant.size > 0) {
    state = 'FLOOD_SITUATION'; displayLabel = 'Situación hídrica relevante'; explanation = materiallyRelevant.size > 1 ? 'Ambos ríos tienen condiciones hidrométricas materialmente relevantes verificadas.' : 'Un río alcanzó una referencia oficial de protección y requiere seguimiento reforzado.';
  } else if (rapidChange) {
    state = 'ELEVATED_HYDRO_SITUATION'; displayLabel = 'Seguimiento reforzado'; explanation = 'Existe un cambio hidrométrico material observado con cobertura temporal suficiente; no es un pronóstico ni una emergencia declarada.';
  } else if (criticalDegraded) {
    state = systems.length ? 'VERIFICATION_DEGRADED' : 'UNKNOWN'; displayLabel = systems.length ? 'Verificación limitada' : 'Situación no disponible'; explanation = 'Falta evidencia crítica suficientemente vigente para describir toda la situación como rutinaria.';
  } else {
    state = 'ROUTINE'; displayLabel = 'Seguimiento habitual'; explanation = 'Las observaciones disponibles no activan una condición hídrica material ni una advertencia oficial relevante.';
  }
  return Object.freeze({ state, displayLabel, explanation, affectedSystemIds: Object.freeze([...materiallyRelevant]), signals: Object.freeze(signals), officialWarningActive, officialEmergencyDeclared: false });
}
