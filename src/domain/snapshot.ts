import type { CriticalMessage } from './zungun-compat/types.ts';

export type PublicState = 'NORMAL' | 'VIGILANCIA' | 'ALERTA' | 'UMBRAL_EVACUACION_ALCANZADO' | 'EVACUACION_OFICIAL' | 'UNKNOWN';
export type DataStatus = 'LIVE' | 'STALE' | 'UNAVAILABLE' | 'OFFLINE';
export type FreshnessState = 'ACTUALIZADO' | 'ACTUALIZACION_DEMORADA' | 'DESACTUALIZADO' | 'NO_DISPONIBLE';
export type AlertVerificationState = 'ALERTA_OFICIAL_ACTIVA' | 'SIN_ALERTAS_OFICIALES_DETECTADAS' | 'VERIFICACION_DE_ALERTAS_DEGRADADA' | 'FUENTES_DE_ALERTAS_NO_DISPONIBLES';
export type FeedClassification = 'OPERATIONAL_FRESH' | 'OPERATIONAL_STALE' | 'DEGRADED' | 'SUPPLEMENTARY' | 'BLOCKED_CREDENTIAL' | 'BLOCKED_NO_MACHINE_ENDPOINT' | 'REJECTED_UNSAFE' | 'RETIRED';
export type SourceKind = 'OFFICIAL_OBSERVATION' | 'OFFICIAL_ALERT' | 'FORECAST_MODEL' | 'SATELLITE_OBSERVATION' | 'COMMUNITY_REPORT' | 'INTERNAL_DERIVATION' | 'DEMO_FIXTURE';
export type SourceStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'UNKNOWN';
export type ShelterStatus = 'PREIDENTIFIED' | 'PREPARING' | 'ACTIVE' | 'LIMITED_CAPACITY' | 'FULL' | 'CLOSED' | 'UNKNOWN';

export interface SourceOrganization {
  readonly id: string;
  readonly name: string;
  readonly official: boolean;
  readonly url: string;
}

export interface Source {
  readonly id: string;
  readonly name: string;
  readonly kind: SourceKind;
  readonly status: SourceStatus;
  readonly observedAt: string;
  readonly validUntil: string;
  readonly contribution: string;
  readonly official: boolean;
  readonly url?: string;
  readonly latencyMinutes?: number;
  readonly resolution?: string;
  readonly uncertainty?: string;
  readonly qualityNote?: string;
  readonly connected?: boolean;
  readonly organizationId?: string;
  readonly organizationName?: string;
  readonly feedId?: string;
  readonly feedName?: string;
  readonly classification?: FeedClassification;
  readonly freshness?: FreshnessState;
  readonly fetchedAt?: string;
  readonly lastCheckedAt?: string;
  readonly limitations?: string;
  readonly determinesPrimaryState?: boolean;
}

export interface OfficialAlert {
  readonly identifier: string;
  readonly sender: string;
  readonly sent: string;
  readonly status: string;
  readonly messageType: string;
  readonly scope: string;
  readonly category: string;
  readonly event: string;
  readonly urgency: string;
  readonly severity: string;
  readonly certainty: string;
  readonly effective: string | null;
  readonly onset: string | null;
  readonly expires: string | null;
  readonly headline: string;
  readonly description: string;
  readonly instruction: string;
  readonly area: string;
  readonly sourceUrl: string;
  readonly lifecycle: 'ACTIVE' | 'UPDATED' | 'CANCELLED' | 'EXPIRED' | 'UNKNOWN';
  readonly appliesToSantaFe: boolean;
}

export interface TimelineEvent {
  readonly id: string;
  readonly at: string;
  readonly type: 'ALERT_ISSUED' | 'ALERT_UPDATED' | 'ALERT_CANCELLED' | 'MEASUREMENT' | 'VALIDITY_CHANGED' | 'SOURCE_DEGRADED' | 'SOURCE_RECOVERED';
  readonly title: string;
  readonly detail: string;
  readonly sourceId: string;
  readonly official: boolean;
}

export interface ServiceStatus {
  readonly worker: 'OPERATIONAL';
  readonly api: 'OPERATIONAL';
  readonly checkedAt: string;
  readonly note: string;
}

export interface RiverPoint {
  readonly at: string;
  readonly metres: number;
  readonly measured: boolean;
  readonly quality?: 'PUBLISHED_OPERATIONAL' | 'PROVIDER_VALIDATED' | 'UNKNOWN';
}
export interface RiverForecastPoint { readonly at: string; readonly metres: number; readonly lowMetres: number; readonly highMetres: number }
export interface RiverThreshold { readonly id: 'NORMAL' | 'VIGILANCIA' | 'ALERTA' | 'EVACUACION'; readonly label: string; readonly metres: number }

export interface HydrologicalSystem {
  readonly id: string;
  readonly label: string;
  readonly watercourse: string;
  readonly stationName: string;
  readonly stationCode: string;
  readonly available: boolean;
  readonly dataStatus: DataStatus;
  readonly freshness?: FreshnessState;
  readonly currentMetres: number | null;
  readonly observedAt: string | null;
  readonly fetchedAt?: string | null;
  readonly validUntil?: string | null;
  readonly sourceId: string;
  readonly sourceName: string;
  readonly points: readonly RiverPoint[];
  readonly thresholds: readonly RiverThreshold[];
  readonly trend: 'RISING_SLOWLY' | 'RISING' | 'STABLE' | 'FALLING' | 'UNKNOWN';
  readonly delta1h: number | null;
  readonly delta6h: number | null;
  readonly delta24h: number | null;
}

export interface RainPoint { readonly at: string; readonly millimetres: number }
export interface Shelter { readonly id: string; readonly name: string; readonly area: string; readonly address: string; readonly status: ShelterStatus; readonly sourceId: string; readonly updatedAt: string }
export interface Contradiction { readonly id: string; readonly title: string; readonly signals: readonly string[]; readonly result: PublicState; readonly explanation: string }
export interface ChangeItem { readonly id: string; readonly label: string; readonly direction: 'UP' | 'DOWN' | 'NEW' | 'SAME' | 'UNKNOWN'; readonly detail: string }

export interface Snapshot {
  readonly schemaVersion: '1.0';
  readonly id: string;
  readonly mode: 'LIVE' | 'UNAVAILABLE' | 'OFFLINE' | 'DEMO';
  readonly dataStatus?: DataStatus;
  readonly freshness?: FreshnessState;
  readonly generatedAt: string;
  readonly previousSnapshotAt: string;
  readonly state: PublicState;
  readonly stateLabel: string;
  readonly summary: string;
  readonly dominantSourceId: string;
  readonly validUntil: string;
  readonly recommendedAction: string;
  readonly emergencyDisclaimer: string;
  readonly alertStatus?: AlertVerificationState;
  readonly alerts?: readonly OfficialAlert[];
  readonly timeline?: readonly TimelineEvent[];
  readonly sourceOrganizations?: readonly SourceOrganization[];
  readonly serviceStatus?: ServiceStatus;
  readonly changes: readonly ChangeItem[];
  readonly systems?: readonly HydrologicalSystem[];
  readonly river: {
    readonly systemId?: string;
    readonly available?: boolean;
    readonly dataStatus?: DataStatus;
    readonly stationName: string;
    readonly currentMetres: number;
    readonly delta1h: number;
    readonly delta6h: number;
    readonly delta24h: number;
    readonly trend: 'RISING_SLOWLY' | 'RISING' | 'STABLE' | 'FALLING' | 'UNKNOWN';
    readonly observedAt: string;
    readonly fetchedAt: string;
    readonly validUntil: string;
    readonly sourceId: string;
    readonly sourceName?: string;
    readonly points: readonly RiverPoint[];
    readonly forecastPoints: readonly RiverForecastPoint[];
    readonly thresholds: readonly RiverThreshold[];
  };
  readonly rain: {
    readonly available?: boolean;
    readonly dataStatus?: DataStatus;
    readonly accumulated1hMm: number | null;
    readonly accumulated24hMm: number | null;
    readonly forecast: string;
    readonly observedAt: string;
    readonly fetchedAt: string;
    readonly validUntil: string;
    readonly sourceId: string;
    readonly points: readonly RainPoint[];
  };
  readonly sources: readonly Source[];
  readonly contradictions: readonly Contradiction[];
  readonly shelters: readonly Shelter[];
  readonly actions: readonly string[];
  readonly messages: readonly CriticalMessage[];
}

export function compactSnapshot(snapshot: Snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    id: snapshot.id,
    mode: snapshot.mode,
    dataStatus: snapshot.dataStatus,
    freshness: snapshot.freshness,
    generatedAt: snapshot.generatedAt,
    validUntil: snapshot.validUntil,
    state: snapshot.state,
    stateLabel: snapshot.stateLabel,
    summary: snapshot.summary,
    recommendedAction: snapshot.recommendedAction,
    alertStatus: snapshot.alertStatus,
    alerts: snapshot.alerts,
    timeline: snapshot.timeline,
    sourceOrganizations: snapshot.sourceOrganizations,
    serviceStatus: snapshot.serviceStatus,
    changes: snapshot.changes,
    systems: snapshot.systems,
    river: snapshot.river,
    rain: snapshot.rain,
    contradictions: snapshot.contradictions,
    shelters: snapshot.shelters,
    actions: snapshot.actions,
    messages: snapshot.messages,
  } as const;
}
