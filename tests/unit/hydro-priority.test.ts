import { describe, expect, it } from 'vitest';
import { deriveHydroPriority } from '../../src/domain/hydro-priority.ts';
import type { HydrologicalSystem, OfficialAlert, Snapshot, Source } from '../../src/domain/snapshot.ts';

function system(id: 'parana-santa-fe' | 'salado-santo-tome', metres: number, alertMetres: number): HydrologicalSystem {
  return {
    id,
    label: id.startsWith('parana') ? 'Río Paraná — Santa Fe' : 'Río Salado — Santo Tomé',
    watercourse: id.startsWith('parana') ? 'Río Paraná' : 'Río Salado',
    stationName: id.startsWith('parana') ? 'Santa Fe' : 'Santo Tomé',
    stationCode: id.startsWith('parana') ? '30' : '1679',
    available: true,
    dataStatus: 'LIVE',
    freshness: 'ACTUALIZADO',
    currentMetres: metres,
    observedAt: '2026-08-12T23:00:00.000Z',
    fetchedAt: '2026-08-12T23:01:00.000Z',
    validUntil: '2026-08-13T23:00:00.000Z',
    sourceId: `source-${id}`,
    sourceName: 'INA',
    points: [],
    thresholds: [{ id: 'ALERTA', label: 'Nivel de alerta de referencia', metres: alertMetres }],
    trend: 'STABLE',
    delta1h: 0,
    delta6h: 0,
    delta24h: 0,
  };
}

function observationSource(target: HydrologicalSystem, official = true): Source {
  return {
    id: target.sourceId,
    name: 'INA REST',
    kind: official ? 'OFFICIAL_OBSERVATION' : 'DEMO_FIXTURE',
    status: 'FRESH',
    observedAt: target.observedAt ?? '2026-08-12T23:00:00.000Z',
    validUntil: target.validUntil ?? '2026-08-13T23:00:00.000Z',
    contribution: 'Lectura hidrométrica',
    official,
    determinesPrimaryState: official,
    classification: official ? 'OPERATIONAL_FRESH' : 'SUPPLEMENTARY',
  };
}

function alertFeed(): Source {
  return {
    id: 'smn-alerts',
    name: 'Alertas oficiales SMN',
    kind: 'OFFICIAL_ALERT',
    status: 'FRESH',
    observedAt: '2026-08-12T23:00:00.000Z',
    validUntil: '2026-08-13T01:00:00.000Z',
    contribution: 'CAP',
    official: true,
    determinesPrimaryState: true,
    classification: 'OPERATIONAL_FRESH',
  };
}

function alert(headline: string): OfficialAlert {
  return {
    identifier: `alert-${headline}`,
    sender: 'SMN',
    sent: '2026-08-12T23:00:00.000Z',
    status: 'Actual',
    messageType: 'Alert',
    scope: 'Public',
    category: 'Met',
    event: headline,
    urgency: 'Immediate',
    severity: 'Severe',
    certainty: 'Observed',
    effective: null,
    onset: null,
    expires: '2026-08-13T01:00:00.000Z',
    headline,
    description: headline,
    instruction: 'Seguir indicaciones oficiales.',
    area: 'Santa Fe',
    sourceUrl: 'https://www.smn.gob.ar/',
    lifecycle: 'ACTIVE',
    appliesToSantaFe: true,
  };
}

function snapshot(systems: readonly HydrologicalSystem[], sources: readonly Source[], alerts: readonly OfficialAlert[] = [], alertStatus: Snapshot['alertStatus'] = 'SIN_ALERTAS_OFICIALES_DETECTADAS'): Snapshot {
  const primary = systems[0];
  if (!primary) throw new TypeError('El fixture requiere al menos un sistema hídrico.');
  return {
    schemaVersion: '1.0',
    id: 'test',
    mode: 'LIVE',
    generatedAt: '2026-08-12T23:02:00.000Z',
    previousSnapshotAt: '2026-08-12T23:01:00.000Z',
    state: 'NORMAL',
    stateLabel: 'Normal',
    summary: 'test',
    dominantSourceId: primary.sourceId,
    validUntil: '2026-08-13T00:00:00.000Z',
    recommendedAction: 'test',
    emergencyDisclaimer: 'test',
    alertStatus,
    alerts,
    changes: [],
    systems,
    river: {
      systemId: primary.id,
      stationName: primary.stationName,
      currentMetres: primary.currentMetres ?? 0,
      delta1h: 0,
      delta6h: 0,
      delta24h: 0,
      trend: primary.trend,
      observedAt: primary.observedAt ?? '2026-08-12T23:00:00.000Z',
      fetchedAt: primary.fetchedAt ?? '2026-08-12T23:01:00.000Z',
      validUntil: primary.validUntil ?? '2026-08-13T23:00:00.000Z',
      sourceId: primary.sourceId,
      points: [],
      forecastPoints: [],
      thresholds: primary.thresholds,
    },
    rain: {
      accumulated1hMm: null,
      accumulated24hMm: null,
      forecast: 'test',
      observedAt: '2026-08-12T23:00:00.000Z',
      fetchedAt: '2026-08-12T23:00:00.000Z',
      validUntil: '2026-08-13T00:00:00.000Z',
      sourceId: 'rain',
      points: [],
    },
    sources,
    contradictions: [],
    shelters: [],
    actions: [],
    messages: [],
  };
}

describe('deriveHydroPriority', () => {
  it('keeps editorial hierarchy in normal verified conditions', () => {
    const parana = system('parana-santa-fe', 4.2, 5.3);
    const salado = system('salado-santo-tome', 3.5, 4.7);
    expect(deriveHydroPriority(snapshot([parana, salado], [observationSource(parana), observationSource(salado)])).mode).toBe('NORMAL');
  });

  it('gives one affected river temporary operational priority', () => {
    const parana = system('parana-santa-fe', 5.4, 5.3);
    const salado = system('salado-santo-tome', 3.5, 4.7);
    const decision = deriveHydroPriority(snapshot([parana, salado], [observationSource(parana), observationSource(salado)]));
    expect(decision.mode).toBe('SINGLE_RIVER_PRIORITY');
    expect(decision.affectedSystemIds).toEqual(['parana-santa-fe']);
  });

  it('gives both rivers equivalent operational priority when both have verified relevant conditions', () => {
    const parana = system('parana-santa-fe', 5.4, 5.3);
    const salado = system('salado-santo-tome', 4.8, 4.7);
    const decision = deriveHydroPriority(snapshot([parana, salado], [observationSource(parana), observationSource(salado)]));
    expect(decision.mode).toBe('DUAL_EMERGENCY');
    expect(decision.affectedSystemIds).toEqual(['parana-santa-fe', 'salado-santo-tome']);
  });

  it('never promotes a numeric threshold from an unverified/non-official source', () => {
    const parana = system('parana-santa-fe', 8.2, 5.3);
    const salado = system('salado-santo-tome', 3.5, 4.7);
    const decision = deriveHydroPriority(snapshot([parana, salado], [observationSource(parana, false), observationSource(salado)]));
    expect(decision.mode).toBe('NORMAL');
    expect(decision.signals).toHaveLength(0);
  });

  it('attributes an active verified official river alert only to the river named by the alert', () => {
    const parana = system('parana-santa-fe', 4.2, 5.3);
    const salado = system('salado-santo-tome', 3.5, 4.7);
    const decision = deriveHydroPriority(snapshot(
      [parana, salado],
      [observationSource(parana), observationSource(salado), alertFeed()],
      [alert('Alerta oficial para el Río Salado en Santa Fe')],
      'ALERTA_OFICIAL_ACTIVA',
    ));
    expect(decision.mode).toBe('SINGLE_RIVER_PRIORITY');
    expect(decision.affectedSystemIds).toEqual(['salado-santo-tome']);
    expect(decision.signals[0]?.kind).toBe('OFFICIAL_ALERT');
  });

  it('does not map a generic official alert to either river without explicit attribution', () => {
    const parana = system('parana-santa-fe', 4.2, 5.3);
    const salado = system('salado-santo-tome', 3.5, 4.7);
    const decision = deriveHydroPriority(snapshot(
      [parana, salado],
      [observationSource(parana), observationSource(salado), alertFeed()],
      [alert('Alerta por tormentas fuertes en Santa Fe')],
      'ALERTA_OFICIAL_ACTIVA',
    ));
    expect(decision.mode).toBe('NORMAL');
  });
});
