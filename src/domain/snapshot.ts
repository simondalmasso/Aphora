import type { CriticalMessage } from './zungun-compat/types';

export type PublicState = 'NORMAL' | 'VIGILANCIA' | 'ALERTA' | 'EVACUACION_OFICIAL' | 'UNKNOWN';
export type DataStatus = 'LIVE' | 'STALE' | 'UNAVAILABLE' | 'OFFLINE';
export type SourceKind = 'OFFICIAL_OBSERVATION' | 'OFFICIAL_ALERT' | 'FORECAST_MODEL' | 'SATELLITE_OBSERVATION' | 'COMMUNITY_REPORT' | 'INTERNAL_DERIVATION' | 'DEMO_FIXTURE';
export type SourceStatus = 'FRESH' | 'STALE' | 'UNAVAILABLE' | 'UNKNOWN';
export type ShelterStatus = 'PREIDENTIFIED' | 'PREPARING' | 'ACTIVE' | 'LIMITED_CAPACITY' | 'FULL' | 'CLOSED' | 'UNKNOWN';

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
}

export interface RiverPoint { readonly at: string; readonly metres: number; readonly measured: boolean }
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
  readonly currentMetres: number | null;
  readonly observedAt: string | null;
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
  readonly generatedAt: string;
  readonly previousSnapshotAt: string;
  readonly state: PublicState;
  readonly stateLabel: string;
  readonly summary: string;
  readonly dominantSourceId: string;
  readonly validUntil: string;
  readonly recommendedAction: string;
  readonly emergencyDisclaimer: string;
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
    readonly sourceId: string;
    readonly sourceName?: string;
    readonly points: readonly RiverPoint[];
    readonly forecastPoints: readonly RiverForecastPoint[];
    readonly thresholds: readonly RiverThreshold[];
  };
  readonly rain: {
    readonly available?: boolean;
    readonly dataStatus?: DataStatus;
    readonly accumulated1hMm: number;
    readonly accumulated24hMm: number;
    readonly forecast: string;
    readonly observedAt: string;
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
    generatedAt: snapshot.generatedAt,
    validUntil: snapshot.validUntil,
    state: snapshot.state,
    stateLabel: snapshot.stateLabel,
    summary: snapshot.summary,
    recommendedAction: snapshot.recommendedAction,
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
