import type { HydrologicalSystem, RiverThreshold } from './snapshot.ts';
import { temporalDelta } from './temporal-series.ts';

export type HydrometricReferenceKind =
  | 'OFFICIAL_HYDROLOGIC_CONDITION'
  | 'OFFICIAL_STATISTICAL_REFERENCE'
  | 'OFFICIAL_PROTECTION_THRESHOLD'
  | 'DERIVED_DEFENSIBLE'
  | 'UNAVAILABLE';

export interface HydrometricReference {
  readonly id: string;
  readonly kind: HydrometricReferenceKind;
  readonly label: string;
  readonly metres: number | null;
  readonly sourceLabel: string;
  readonly sourceUrl: string;
  readonly stationId: string;
  readonly seriesId: string;
  readonly period?: string;
  readonly methodology?: string;
}

export interface HydrometricMeaning {
  readonly headline: string;
  readonly detail: string | null;
  readonly reference: HydrometricReference | null;
}

interface StationReferenceProfile {
  readonly stationId: string;
  readonly seriesId: string;
  readonly alertMetres: number | null;
  readonly evacuationMetres: number | null;
  readonly lowWaterMetres: number | null;
  readonly lowWaterPeriod?: string;
  readonly lowWaterMethodology?: string;
  readonly datumExplanation: string;
}

export const INA_HEIGHTS_METADATA_URL = 'https://alerta.ina.gob.ar/pub/gui/metadata&layer=public2:ultimas_alturas_con_timeseries';

const PROFILES: Readonly<Record<string, StationReferenceProfile>> = Object.freeze({
  'parana-santa-fe': Object.freeze({
    stationId: 'parana-santa-fe',
    seriesId: '30',
    alertMetres: 5.3,
    evacuationMetres: 5.7,
    lowWaterMetres: 2,
    lowWaterPeriod: '1991–2020',
    lowWaterMethodology: 'Frecuencia de superación del 95% publicada por INA para la referencia de aguas bajas.',
    datumExplanation: 'La altura corresponde a la escala de la estación Santa Fe. INA publica un cero IGN para esta estación, pero SOS-SF no convierte la lectura a cota geodésica: la muestra como altura de escala de esa estación, no como profundidad total del río.',
  }),
  'salado-santo-tome': Object.freeze({
    stationId: 'salado-santo-tome',
    seriesId: '3044',
    alertMetres: 4.7,
    evacuationMetres: null,
    lowWaterMetres: null,
    datumExplanation: 'La altura corresponde a la escala de la estación Santo Tomé. La metadata pública consultada no publica un cero IGN utilizable para esta serie; por eso SOS-SF no convierte la lectura ni muestra ceros no verificados como referencias físicas.',
  }),
});

function profileFor(system: HydrologicalSystem): StationReferenceProfile | null {
  return PROFILES[system.id] ?? null;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.011;
}

function matchingThreshold(system: HydrologicalSystem, id: RiverThreshold['id'], expected: number | null): RiverThreshold | null {
  if (expected === null) return null;
  return system.thresholds.find((threshold) => threshold.id === id && nearlyEqual(threshold.metres, expected)) ?? null;
}

export function safeStationThresholds(system: HydrologicalSystem): readonly RiverThreshold[] {
  const profile = profileFor(system);
  if (!profile) {
    return system.thresholds.filter((threshold) => Number.isFinite(threshold.metres) && threshold.metres > 0);
  }
  const result: RiverThreshold[] = [];
  const low = matchingThreshold(system, 'NORMAL', profile.lowWaterMetres);
  const alert = matchingThreshold(system, 'ALERTA', profile.alertMetres);
  const evacuation = matchingThreshold(system, 'EVACUACION', profile.evacuationMetres);
  if (low) result.push(low);
  if (alert) result.push(alert);
  if (evacuation) result.push(evacuation);
  return Object.freeze(result.sort((left, right) => left.metres - right.metres));
}

export function referencesForSystem(system: HydrologicalSystem): readonly HydrometricReference[] {
  const profile = profileFor(system);
  if (!profile) {
    return Object.freeze([{
      id: `${system.id}-reference-unavailable`,
      kind: 'UNAVAILABLE' as const,
      label: 'Referencia oficial no disponible',
      metres: null,
      sourceLabel: system.sourceName,
      sourceUrl: INA_HEIGHTS_METADATA_URL,
      stationId: system.id,
      seriesId: system.stationCode,
    }]);
  }
  const safe = safeStationThresholds(system);
  const refs: HydrometricReference[] = [];
  const low = safe.find((threshold) => threshold.id === 'NORMAL');
  if (low && profile.lowWaterMetres !== null) {
    refs.push(Object.freeze({
      id: `${system.id}-low-water`,
      kind: 'OFFICIAL_STATISTICAL_REFERENCE',
      label: 'Referencia de aguas bajas',
      metres: low.metres,
      sourceLabel: 'INA · SIyAH',
      sourceUrl: INA_HEIGHTS_METADATA_URL,
      stationId: system.id,
      seriesId: profile.seriesId,
      period: profile.lowWaterPeriod,
      methodology: profile.lowWaterMethodology,
    }));
  }
  const alert = safe.find((threshold) => threshold.id === 'ALERTA');
  if (alert) {
    refs.push(Object.freeze({
      id: `${system.id}-alert`,
      kind: 'OFFICIAL_PROTECTION_THRESHOLD',
      label: 'Nivel de alerta de referencia',
      metres: alert.metres,
      sourceLabel: 'INA · SIyAH (umbral determinado por protección civil local)',
      sourceUrl: INA_HEIGHTS_METADATA_URL,
      stationId: system.id,
      seriesId: profile.seriesId,
    }));
  }
  const evacuation = safe.find((threshold) => threshold.id === 'EVACUACION');
  if (evacuation) {
    refs.push(Object.freeze({
      id: `${system.id}-evacuation`,
      kind: 'OFFICIAL_PROTECTION_THRESHOLD',
      label: 'Nivel de evacuación de referencia',
      metres: evacuation.metres,
      sourceLabel: 'INA · SIyAH (umbral determinado por protección civil local)',
      sourceUrl: INA_HEIGHTS_METADATA_URL,
      stationId: system.id,
      seriesId: profile.seriesId,
    }));
  }
  return Object.freeze(refs.length ? refs : [{
    id: `${system.id}-reference-unavailable`,
    kind: 'UNAVAILABLE' as const,
    label: 'Referencia oficial no disponible',
    metres: null,
    sourceLabel: 'INA · SIyAH',
    sourceUrl: INA_HEIGHTS_METADATA_URL,
    stationId: system.id,
    seriesId: profile.seriesId,
  }]);
}

function formatMetres(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} m`;
}

export function meaningForSystem(system: HydrologicalSystem): HydrometricMeaning {
  if (!system.available || system.currentMetres === null) {
    return Object.freeze({ headline: 'Sin una medición utilizable para interpretar ahora', detail: null, reference: null });
  }
  const references = referencesForSystem(system);
  const alert = references.find((reference) => reference.kind === 'OFFICIAL_PROTECTION_THRESHOLD' && reference.label.includes('alerta') && reference.metres !== null);
  const statistical = references.find((reference) => reference.kind === 'OFFICIAL_STATISTICAL_REFERENCE' && reference.metres !== null);
  const alertReached = alert?.metres !== null && alert?.metres !== undefined && system.currentMetres >= alert.metres;
  if (statistical?.metres !== null && statistical?.metres !== undefined && !alertReached) {
    const difference = system.currentMetres - statistical.metres;
    return Object.freeze({
      headline: `${formatMetres(Math.abs(difference))} ${difference >= 0 ? 'por encima' : 'por debajo'} de la ${statistical.label.toLowerCase()} · ${formatMetres(statistical.metres)}`,
      detail: statistical.period ? `Referencia estadística oficial · período ${statistical.period}.` : 'Referencia estadística oficial de esta estación.',
      reference: statistical,
    });
  }
  if (alert?.metres !== null && alert?.metres !== undefined) {
    const difference = system.currentMetres - alert.metres;
    const amount = formatMetres(Math.abs(difference));
    if (Math.abs(difference) < 0.005) {
      return Object.freeze({
        headline: `En el nivel de alerta de referencia · ${formatMetres(alert.metres)}`,
        detail: 'Es un umbral contextual publicado; no equivale por sí solo a una orden oficial.',
        reference: alert,
      });
    }
    return Object.freeze({
      headline: `${amount} ${difference < 0 ? 'por debajo' : 'por encima'} del nivel de alerta de referencia · ${formatMetres(alert.metres)}`,
      detail: difference > 0 ? 'Superar el umbral no equivale por sí solo a una orden oficial.' : null,
      reference: alert,
    });
  }
  return Object.freeze({
    headline: 'Sin una referencia oficial suficiente para contextualizar esta lectura',
    detail: 'Se conserva la medición y su tendencia sin inventar un rango habitual.',
    reference: null,
  });
}

export function semanticMiniSummary(system: HydrologicalSystem): string {
  if (!system.available || system.currentMetres === null) return 'Sin medición utilizable';
  const meaning = meaningForSystem(system);
  if (meaning.reference?.kind === 'OFFICIAL_PROTECTION_THRESHOLD' && meaning.reference.metres !== null) {
    if (system.currentMetres < meaning.reference.metres) return 'Por debajo del nivel de alerta de referencia';
    if (system.currentMetres > meaning.reference.metres) return 'Por encima del nivel de alerta de referencia';
    return 'En el nivel de alerta de referencia';
  }
  return meaning.headline;
}

export function stationDatumExplanation(system: HydrologicalSystem): string {
  return profileFor(system)?.datumExplanation
    ?? 'La altura se interpreta en la escala de su propia estación. SOS-SF no asume que sea profundidad total del río ni que comparta cero con otras estaciones.';
}

export function deltaAtHours(points: HydrologicalSystem['points'], hours: number, now?: Date | string): number | null {
  const anchor = now ?? points.at(-1)?.at ?? new Date().toISOString();
  return temporalDelta(points, hours, anchor).value;
}

export function changeCopy(value: number | null, hours: 24 | 72 | 168): string {
  const label = hours === 168 ? '7 días' : `${hours} h`;
  if (value === null) return `Sin datos suficientes para comparar ${label}`;
  const centimetres = Math.round(value * 100);
  if (centimetres === 0) return `Sin cambio apreciable en ${label}`;
  return `${centimetres > 0 ? 'Subió' : 'Bajó'} ${Math.abs(centimetres)} cm en ${label}`;
}

export function changeForSystem(system: HydrologicalSystem, hours: 24 | 72 | 168): number | null {
  if (hours === 24) return system.delta24h;
  if (hours === 72 && system.delta72h !== undefined) return system.delta72h;
  if (hours === 168 && system.delta7d !== undefined) return system.delta7d;
  return deltaAtHours(system.points, hours, system.observedAt ?? undefined);
}
