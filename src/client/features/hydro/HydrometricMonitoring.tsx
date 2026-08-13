import { useMemo, useState, type RefObject } from 'react';
import { deriveHydroPriority, hydroPrioritySignalsForSystem, type HydroPriorityDecision } from '../../../domain/hydro-priority.ts';
import type { HydrologicalSystem, Snapshot, Source } from '../../../domain/snapshot.ts';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety.ts';
import { FreshnessBadge, HydrometricChart, HydrometricHero, SourceLine, StationSwitcher } from '../../components/civic/CivicSystem.tsx';

const EMPTY_SYSTEMS: readonly HydrologicalSystem[] = Object.freeze([]);

function freshnessLabel(system: HydrologicalSystem): string {
  if (system.freshness === 'ACTUALIZADO') return 'Vigente';
  if (system.freshness === 'ACTUALIZACION_DEMORADA') return 'Actualización demorada';
  if (system.freshness === 'DESACTUALIZADO') return 'Desactualizada';
  return 'Vigencia no disponible';
}

function trendLabel(system: HydrologicalSystem): string {
  if (system.trend === 'RISING') return 'En ascenso';
  if (system.trend === 'RISING_SLOWLY') return 'Ascenso lento';
  if (system.trend === 'FALLING') return 'En descenso';
  if (system.trend === 'STABLE') return 'Estable';
  return 'Sin tendencia';
}

function formatDelta(value: number | null): string {
  if (value === null) return 'No disponible';
  const centimetres = Math.round(value * 100);
  return `${centimetres > 0 ? '+' : ''}${centimetres} cm`;
}

function formatLevel(system: HydrologicalSystem): string {
  return system.currentMetres === null ? 'No disponible' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`;
}

function sourceFamily(source: Source | undefined, system: HydrologicalSystem): string {
  return source?.feedName ?? source?.name ?? system.sourceName;
}

function sourceError(source: Source | undefined): string | null {
  if (!source) return 'La fuente no figura en el inventario del snapshot.';
  if (source.classification === 'OPERATIONAL_FRESH' || source.classification === 'OPERATIONAL_STALE') return null;
  return source.limitations ?? 'La fuente no está operativa en este snapshot.';
}

function OperationalRiverPanel({ system, snapshot, priority }: {
  readonly system: HydrologicalSystem;
  readonly snapshot: Snapshot;
  readonly priority: HydroPriorityDecision;
}) {
  const source = snapshot.sources.find((item) => item.id === system.sourceId);
  const signals = hydroPrioritySignalsForSystem(priority, system.id);
  return <article className="river-priority__river" data-river-system={system.id}>
    <header className="river-priority__river-header">
      <div>
        <span>{system.watercourse}</span>
        <strong>Estación {system.stationName}</strong>
      </div>
      <FreshnessBadge
        className={`freshness-badge--${(system.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}
        label={`${freshnessLabel(system)} · ${formatHumanAge(system.observedAt, snapshot.generatedAt)}`}
      />
    </header>
    <dl className="river-priority__facts">
      <div className="river-priority__level"><dt>Nivel</dt><dd>{formatLevel(system)}</dd></div>
      <div><dt>Tendencia</dt><dd>{trendLabel(system)}</dd></div>
      <div><dt>Δ24h</dt><dd>{formatDelta(system.delta24h)}</dd></div>
      <div><dt>Vigencia</dt><dd>{freshnessLabel(system)} · hasta {formatLocalDateTime(system.validUntil)}</dd></div>
      <div className="river-priority__source"><dt>Fuente</dt><dd>{source?.organizationName ?? system.sourceName} · {sourceFamily(source, system)}</dd></div>
      <div className="river-priority__status"><dt>Estado / alerta relacionada</dt><dd>{signals.map((signal) => <span key={`${signal.kind}-${signal.sourceId}-${signal.reason}`}>{signal.reason}</span>)}</dd></div>
    </dl>
  </article>;
}

export function HydrometricMonitoring({
  snapshot,
  refreshing,
  sourcesButtonRef,
  onRefresh,
  onSources,
}: {
  readonly snapshot: Snapshot;
  readonly refreshing: boolean;
  readonly sourcesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onRefresh: () => void;
  readonly onSources: (opener?: HTMLButtonElement | null) => void;
}) {
  const systems = snapshot.systems ?? EMPTY_SYSTEMS;
  const priority = useMemo(() => deriveHydroPriority(snapshot), [snapshot]);
  const operationalDefaultId = priority.mode === 'SINGLE_RIVER_PRIORITY'
    ? priority.affectedSystemIds[0]
    : snapshot.river.systemId ?? systems[0]?.id;
  const [selection, setSelection] = useState(() => ({ snapshotId: snapshot.id, id: operationalDefaultId ?? '' }));
  const requestedId = selection.snapshotId === snapshot.id ? selection.id : operationalDefaultId ?? '';
  const validSelectedId = systems.some((system) => system.id === requestedId)
    ? requestedId
    : operationalDefaultId ?? systems[0]?.id ?? '';
  const selected = systems.find((system) => system.id === validSelectedId) ?? systems[0];
  const prioritySystems = priority.affectedSystemIds
    .map((id) => systems.find((system) => system.id === id))
    .filter((system): system is HydrologicalSystem => Boolean(system));

  const selectedSource = useMemo(
    () => selected ? snapshot.sources.find((source) => source.id === selected.sourceId) : undefined,
    [selected, snapshot.sources],
  );
  const corroboratingTransport = useMemo(
    () => selected ? snapshot.sources.find((source) =>
      source.id !== selected.sourceId &&
      source.organizationId === selectedSource?.organizationId &&
      (source.id.includes('waterml') || source.feedName?.toLowerCase().includes('waterml'))) : undefined,
    [selected, selectedSource, snapshot.sources],
  );

  return <section
    className="hydrometric-section"
    id="situacion-hidrica"
    aria-labelledby="hydrometric-title"
    data-testid="hydrometric-situation"
    data-priority-mode={priority.mode}
  >
    <HydrometricHero>
      <header className="hydrometric-hero__header">
        <div>
          <p className="section-kicker">Situación hidrométrica</p>
          <h1 id="hydrometric-title">Pulso hídrico de Santa Fe</h1>
        </div>
        <div className="hydrometric-hero__controls">
          <StationSwitcher
            systems={systems}
            selectedId={selected?.id}
            onSelect={(id) => setSelection({ snapshotId: snapshot.id, id })}
          />
          <button className="hydro-refresh-button" type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing || undefined} aria-label="Actualizar información">
            <span aria-hidden="true">{refreshing ? '…' : '↻'}</span>
          </button>
        </div>
      </header>

      {priority.mode !== 'NORMAL' && prioritySystems.length > 0 && <aside
        className={`river-priority river-priority--${priority.mode === 'DUAL_EMERGENCY' ? 'dual' : 'single'}`}
        data-testid="river-operational-priority"
        aria-labelledby="river-priority-title"
      >
        <header className="river-priority__masthead">
          <div>
            <p>Jerarquía operativa</p>
            <h2 id="river-priority-title">{priority.mode === 'DUAL_EMERGENCY'
              ? 'Paraná + Salado · prioridad equivalente 50/50'
              : `${prioritySystems[0]?.watercourse ?? 'Sistema hídrico'} · prioridad temporal`}</h2>
          </div>
          <div className="river-priority__explain">
            <p>{priority.mode === 'DUAL_EMERGENCY'
              ? 'Hay condiciones verificables relacionadas con ambos sistemas. Los dos ríos se muestran con el mismo peso visual.'
              : 'La prioridad cambia temporalmente porque existe una condición verificable relacionada con este sistema.'}</p>
            <button type="button" onClick={(event) => onSources(event.currentTarget)}>Ver trazabilidad de fuentes</button>
          </div>
        </header>
        <div className="river-priority__grid">
          {prioritySystems.map((system) => <OperationalRiverPanel key={system.id} system={system} snapshot={snapshot} priority={priority}/>) }
        </div>
      </aside>}

      {selected ? <article className={`primary-station${priority.mode === 'DUAL_EMERGENCY' ? ' primary-station--after-dual' : ''}`}>
        <div className="station-identification">
          <div>
            <span>Estación {selected.stationName}</span>
            <strong>{selected.watercourse}</strong>
          </div>
          <FreshnessBadge
            className={`freshness-badge--${(selected.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}
            label={`${freshnessLabel(selected)} · ${formatHumanAge(selected.observedAt, snapshot.generatedAt)}`}
          />
        </div>

        <div className="hydro-signature-axis" aria-label="Lectura organizada por río, regla y tiempo">
          <span>RÍO</span><i aria-hidden="true"/><span>REGLA</span><i aria-hidden="true"/><span>TIEMPO</span>
        </div>

        <div className="hydro-reading">
          <div className="hydro-level">
            <span>Nivel</span>
            <strong data-testid="hydro-current-level">
              {selected.currentMetres === null ? '—' : selected.currentMetres.toFixed(2).replace('.', ',')}
              {selected.currentMetres !== null && <small>m</small>}
            </strong>
            <time dateTime={selected.observedAt ?? undefined}>{formatLocalDateTime(selected.observedAt)}</time>
          </div>
          <dl className="hydro-metrics">
            <div><dt>Tendencia</dt><dd>{trendLabel(selected)}</dd></div>
            <div><dt aria-label="Cambio en 24 horas">Δ24h</dt><dd>{formatDelta(selected.delta24h)}</dd></div>
          </dl>
        </div>

        <SourceLine buttonRef={sourcesButtonRef} onOpen={onSources}>
          <span><b>{selectedSource?.organizationName ?? selected.sourceName}</b> · {sourceFamily(selectedSource, selected)}</span>
          <span>{formatLocalDateTime(selected.fetchedAt)}</span>
          <span>{corroboratingTransport ? `Mismo organismo · transporte: ${corroboratingTransport.feedName ?? corroboratingTransport.name}` : 'Sin corroboración'}</span>
          {sourceError(selectedSource) && <span className="source-strip__error">{sourceError(selectedSource)}</span>}
        </SourceLine>

        {selected.available && selected.currentMetres !== null
          ? <HydrometricChart system={selected} generatedAt={snapshot.generatedAt}/>
          : <div className="data-caveat"><strong>Medición no disponible</strong><p>La estación no entregó una lectura utilizable.</p></div>}
      </article> : <div className="data-caveat"><strong>Sin estaciones disponibles</strong><p>No se pudo construir la situación hidrométrica.</p></div>}
    </HydrometricHero>
  </section>;
}
