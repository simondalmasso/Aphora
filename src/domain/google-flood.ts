import type { HydrologicalSystem } from './snapshot.ts';

export type GoogleFloodFreshness = 'CURRENT' | 'STALE' | 'EXPIRED' | 'UNAVAILABLE';
export type GoogleGaugeValueUnit = 'METERS' | 'CUBIC_METERS_PER_SECOND' | 'GAUGE_VALUE_UNIT_UNSPECIFIED';
export type GoogleForecastTrend = 'RISE' | 'FALL' | 'NO_CHANGE' | 'FORECAST_TREND_UNSPECIFIED';
export type GoogleFloodSeverity = 'EXTREME' | 'SEVERE' | 'ABOVE_NORMAL' | 'NO_FLOODING' | 'UNKNOWN' | 'SEVERITY_UNSPECIFIED';
export type GoogleAssociationConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNMAPPED';

export interface GoogleLatLng { readonly latitude: number; readonly longitude: number }
export interface GoogleGaugeCandidate {
  readonly gaugeId: string;
  readonly siteName: string;
  readonly river: string;
  readonly source: string;
  readonly location: GoogleLatLng;
  readonly countryCode: string;
  readonly qualityVerified: boolean;
  readonly hasModel: boolean;
}
export interface LocalStationAnchor {
  readonly systemId: string;
  readonly stationName: string;
  readonly watercourse: string;
  readonly location: GoogleLatLng;
  readonly coordinateSource: string;
}
export interface GoogleGaugeMapping {
  readonly googleGaugeId: string;
  readonly siteName: string;
  readonly river: string;
  readonly source: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly qualityVerified: boolean;
  readonly hasModel: boolean;
  readonly modelId: string | null;
  readonly modelUnit: GoogleGaugeValueUnit | null;
  readonly distanceToLocalStationKm: number | null;
  readonly associatedSosSystem: string | null;
  readonly associationConfidence: GoogleAssociationConfidence;
  readonly associationRationale: string;
}
export interface GoogleFloodSignal {
  readonly provider: 'GOOGLE_FLOOD_FORECASTING';
  readonly gaugeId: string;
  readonly gaugeModelId: string | null;
  readonly qualityVerified: boolean;
  readonly hasModel: boolean;
  readonly siteName: string;
  readonly river: string;
  readonly location: GoogleLatLng;
  readonly source: string;
  readonly issuedAt: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly leadTimeHours: number | null;
  readonly forecastValue: number | null;
  readonly forecastUnit: GoogleGaugeValueUnit | null;
  readonly forecastTrend: GoogleForecastTrend;
  readonly forecastChange: { readonly lowerBound: number; readonly upperBound: number } | null;
  readonly modelSeverity: GoogleFloodSeverity;
  readonly modelThresholdClass: 'WARNING' | 'DANGER' | 'EXTREME_DANGER' | 'NONE' | 'UNKNOWN';
  readonly mapInferenceType: 'MODEL' | 'IMAGE_CLASSIFICATION' | 'MAP_INFERENCE_TYPE_UNSPECIFIED';
  readonly inundationProbabilityAvailable: boolean;
  readonly inundationDepthAvailable: boolean;
  readonly polygonIds: readonly string[];
  readonly retrievedAt: string;
  readonly freshness: GoogleFloodFreshness;
  readonly semanticRole: 'SUPPLEMENTARY_MODEL_FORECAST';
  readonly canDetermineOfficialWarning: false;
  readonly canDetermineOfficialEmergency: false;
  readonly license: 'CC_BY_4_0';
  readonly associatedSosSystem: string | null;
}
export interface GoogleFloodReconciliation {
  readonly localObservationState: 'AVAILABLE' | 'DEGRADED' | 'UNAVAILABLE';
  readonly googleModelState: 'ELEVATED' | 'NO_FLOODING' | 'UNKNOWN' | 'UNAVAILABLE';
  readonly officialWarningState: 'ACTIVE' | 'NONE_CONFIRMED' | 'DEGRADED' | 'UNAVAILABLE';
  readonly territorialContext: 'IDESF_STATIC_CONTEXT';
  readonly rainContext: 'AVAILABLE' | 'UNAVAILABLE';
  readonly relation: 'COINCIDENT_ELEVATED' | 'MODEL_ELEVATED_LOCAL_NOT_AT_REFERENCE' | 'LOCAL_ELEVATED_MODEL_NOT_ELEVATED' | 'NO_CONFLICT' | 'INSUFFICIENT_EVIDENCE';
  readonly explanation: string;
  readonly rawMetreSubtractionPerformed: false;
  readonly officialEmergencyDeclaredByGoogle: false;
}
export interface GoogleFloodFusion {
  readonly schemaVersion: '029.1';
  readonly accessMode: 'APPROVED_LIVE_API' | 'NOT_CONFIGURED_EXTERNAL_APPROVAL';
  readonly retrievedAt: string;
  readonly mappings: readonly GoogleGaugeMapping[];
  readonly signals: readonly GoogleFloodSignal[];
  readonly reconciliation: GoogleFloodReconciliation;
  readonly floodHubUrl: string;
  readonly license: 'CC_BY_4_0';
}

const EARTH_RADIUS_KM = 6371.0088;
function normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
export function distanceKm(a: GoogleLatLng, b: GoogleLatLng): number {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude); const dLon = rad(b.longitude - a.longitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function googleFreshness(issuedAt: string, validTo: string, now: Date): GoogleFloodFreshness {
  const issued = Date.parse(issuedAt); const until = Date.parse(validTo); const time = now.getTime();
  if (!Number.isFinite(issued) || !Number.isFinite(until) || issued > time + 5 * 60_000) return 'UNAVAILABLE';
  if (until < time) return time - until <= 6 * 60 * 60_000 ? 'STALE' : 'EXPIRED';
  return time - issued <= 12 * 60 * 60_000 ? 'CURRENT' : 'STALE';
}
export function associateGoogleGauge(gauge: GoogleGaugeCandidate, anchors: readonly LocalStationAnchor[]): GoogleGaugeMapping {
  if (!anchors.length) return Object.freeze({ googleGaugeId: gauge.gaugeId, siteName: gauge.siteName, river: gauge.river, source: gauge.source, latitude: gauge.location.latitude, longitude: gauge.location.longitude, qualityVerified: gauge.qualityVerified, hasModel: gauge.hasModel, modelId: null, modelUnit: null, distanceToLocalStationKm: null, associatedSosSystem: null, associationConfidence: 'UNMAPPED', associationRationale: 'No hay coordenada local verificada para calcular una asociación física segura.' });
  const ranked = anchors.map((anchor) => {
    const distance = distanceKm(gauge.location, anchor.location);
    const gaugeText = normalize(`${gauge.siteName} ${gauge.river}`); const localText = normalize(`${anchor.stationName} ${anchor.watercourse}`);
    const riverMatch = normalize(gauge.river).length > 2 && localText.includes(normalize(gauge.river));
    const siteMatch = normalize(gauge.siteName).length > 2 && localText.includes(normalize(gauge.siteName));
    const semantic = riverMatch ? 2 : siteMatch ? 1 : gaugeText.includes(normalize(anchor.watercourse)) ? 2 : 0;
    return { anchor, distance, semantic, score: distance + (semantic === 2 ? -20 : semantic === 1 ? -8 : 0) };
  }).sort((a, b) => a.score - b.score);
  const best = ranked[0]!;
  const safeDistance = best.distance <= 35;
  const anchorVerified = !/aproximad/i.test(best.anchor.coordinateSource);
  const confidence: GoogleAssociationConfidence = safeDistance && best.semantic === 2 && gauge.qualityVerified && anchorVerified ? 'HIGH' : safeDistance && best.semantic >= 1 ? 'MEDIUM' : best.distance <= 60 && best.semantic === 2 ? 'LOW' : 'UNMAPPED';
  return Object.freeze({
    googleGaugeId: gauge.gaugeId, siteName: gauge.siteName, river: gauge.river, source: gauge.source, latitude: gauge.location.latitude, longitude: gauge.location.longitude,
    qualityVerified: gauge.qualityVerified, hasModel: gauge.hasModel, modelId: null, modelUnit: null,
    distanceToLocalStationKm: Number(best.distance.toFixed(2)), associatedSosSystem: confidence === 'UNMAPPED' ? null : best.anchor.systemId, associationConfidence: confidence,
    associationRationale: confidence === 'UNMAPPED' ? `Candidato a ${best.distance.toFixed(1)} km sin coincidencia semántica suficiente; no se asocia.` : `Asociación por coordenadas cartográficas disponibles, distancia ${best.distance.toFixed(1)} km y metadatos de río/sitio; coordenada local: ${best.anchor.coordinateSource}.`,
  });
}
function localElevated(systems: readonly HydrologicalSystem[]): boolean {
  return systems.some((system) => system.available && system.currentMetres !== null && system.thresholds.some((threshold) => (threshold.id === 'ALERTA' || threshold.id === 'EVACUACION') && system.currentMetres! >= threshold.metres));
}
export function reconcileGoogleFlood(input: {
  readonly systems: readonly HydrologicalSystem[];
  readonly signals: readonly GoogleFloodSignal[];
  readonly alertStatus?: string;
  readonly rainAvailable: boolean;
}): GoogleFloodReconciliation {
  const usable = input.signals.filter((signal) => signal.freshness === 'CURRENT');
  const modelElevated = usable.some((signal) => ['ABOVE_NORMAL', 'SEVERE', 'EXTREME'].includes(signal.modelSeverity));
  const modelNoFlood = usable.length > 0 && usable.every((signal) => signal.modelSeverity === 'NO_FLOODING');
  const local = localElevated(input.systems);
  const localAvailability = input.systems.some((system) => system.available) ? (input.systems.every((system) => system.available) ? 'AVAILABLE' : 'DEGRADED') : 'UNAVAILABLE';
  const warning = input.alertStatus === 'ALERTA_OFICIAL_ACTIVA' ? 'ACTIVE' : input.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS' ? 'NONE_CONFIRMED' : input.alertStatus === 'VERIFICACION_DE_ALERTAS_DEGRADADA' ? 'DEGRADED' : 'UNAVAILABLE';
  let relation: GoogleFloodReconciliation['relation']; let explanation: string;
  if (!usable.length || localAvailability === 'UNAVAILABLE') { relation = 'INSUFFICIENT_EVIDENCE'; explanation = 'No hay evidencia temporal suficiente para reconciliar el modelo Google con la observación local.'; }
  else if (modelElevated && local) { relation = 'COINCIDENT_ELEVATED'; explanation = 'El modelo Google y al menos una observación INA muestran señales elevadas. Siguen siendo fuentes y semánticas distintas.'; }
  else if (modelElevated && !local) { relation = 'MODEL_ELEVATED_LOCAL_NOT_AT_REFERENCE'; explanation = 'Google proyecta una condición elevada, mientras la medición oficial local no alcanzó una referencia local de protección verificada.'; }
  else if (!modelElevated && local) { relation = 'LOCAL_ELEVATED_MODEL_NOT_ELEVATED'; explanation = 'La observación oficial local alcanzó una referencia relevante, aunque el modelo Google disponible no muestra una señal elevada.'; }
  else { relation = 'NO_CONFLICT'; explanation = modelNoFlood ? 'El modelo Google no proyecta inundación y la observación local no alcanza referencias de protección; esto no garantiza ausencia de riesgo.' : 'Las fuentes disponibles no muestran una discrepancia material interpretable.'; }
  return Object.freeze({ localObservationState: localAvailability, googleModelState: modelElevated ? 'ELEVATED' : modelNoFlood ? 'NO_FLOODING' : usable.length ? 'UNKNOWN' : 'UNAVAILABLE', officialWarningState: warning, territorialContext: 'IDESF_STATIC_CONTEXT', rainContext: input.rainAvailable ? 'AVAILABLE' : 'UNAVAILABLE', relation, explanation, rawMetreSubtractionPerformed: false, officialEmergencyDeclaredByGoogle: false });
}
