import { useMemo, useState, type RefObject } from 'react';
import { deriveHydroPriority, hydroPrioritySignalsForSystem, type HydroPriorityDecision } from '../../../domain/hydro-priority.ts';
import type { HydrologicalSystem, Snapshot, Source } from '../../../domain/snapshot.ts';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety.ts';
import { FreshnessBadge, HydrometricChart, HydrometricHero, SourceLine, StationSwitcher } from '../../components/civic/CivicSystem.tsx';

const EMPTY_SYSTEMS: readonly HydrologicalSystem[] = Object.freeze([]);

function freshnessLabel(system: HydrologicalSystem): string {
  if (system.freshness === 'ACTUALIZADO') return 'Al día';
  if (system.freshness === 'ACTUALIZACION_DEMORADA') return 'Con demora';
  if (system.freshness === 'DESACTUALIZADO') return 'Dato desactualizado';
  return 'Sin vigencia confirmada';
}

function trendLabel(system: HydrologicalSystem): string {
  if (system.trend === 'RISING') return 'Está subiendo';
  if (system.trend === 'RISING_SLOWLY') return 'Sube lentamente';
  if (system.trend === 'FALLING') return 'Está bajando';
  if (system.trend === 'STABLE') return 'Se mantiene estable';
  return 'Sin tendencia suficiente';
}

function formatDelta(value: number | null): string {
  if (value === null) return 'Cambio no disponible';
  const centimetres = Math.round(value * 100);
  if (centimetres === 0) return 'Sin cambio en 24 h';
  const amount = Math.abs(centimetres);
  return `${centimetres > 0 ? 'Subió' : 'Bajó'} ${amount} cm en 24 h`;
}

function formatLevel(system: HydrologicalSystem): string {
  return system.currentMetres === null ? 'No disponible' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`;
}

function sourceError(source: Source | undefined): string | null {
  if (!source) return 'La fuente no figura en el inventario de esta actualización.';
  if (source.classification === 'OPERATIONAL_FRESH' || source.classification === 'OPERATIONAL_STALE') return null;
  return source.limitations ?? 'La fuente no está operativa en esta actualización.';
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
      <div><dt>Movimiento</dt><dd>{trendLabel(system)}</dd></div>
      <div><dt>Últimas 24 h</dt><dd>{formatDelta(system.delta24h)}</dd></div>
      <div><dt>Vigencia</dt><dd>{freshnessLabel(system)} · hasta {formatLocalDateTime(system.validUntil)}</dd></div>
      <div className="river-priority__source"><dt>Fuente</dt><dd>{source?.organizationName ?? system.sourceName}</dd></div>
      <div className="river-priority__status"><dt>Por qué se prioriza</dt><dd>{signals.map((signal) => <span key={`${signal.kind}-${signal.sourceId}-${signal.reason}`}>{signal.reason}</span>)}</dd></div>
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
        <div className="hydrometric-hero__intro">
          <p className="section-kicker">Santa Fe · monitoreo hídrico</p>
          <h1 id="hydrometric-title">Situación hidrométrica</h1>
          <p className="hydrometric-hero__lede">Niveles, tendencia y vigencia de las últimas mediciones disponibles.</p>
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
            <p>{priority.mode === 'DUAL_EMERGENCY' ? 'Atención compartida' : 'Atención prioritaria'}</p>
            <h2 id="river-priority-title">{priority.mode === 'DUAL_EMERGENCY'
              ? 'Paraná y Salado requieren el mismo peso ahora'
              : `${prioritySystems[0]?.watercourse ?? 'Este sistema'} requiere atención primero`}</h2>
          </div>
          <div className="river-priority__explain">
            <p>{priority.mode === 'DUAL_EMERGENCY'
              ? 'Hay condiciones verificables relacionadas con ambos sistemas. La vista mantiene prioridad equivalente 50/50.'
              : 'La jerarquía cambia temporalmente porque hay una condición verificable relacionada con este río. El otro sistema sigue disponible.'}</p>
            <button type="button" onClick={(event) => onSources(event.currentTarget)}>Ver por qué</button>
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
            <small>Última medición · {formatHumanAge(selected.observedAt, snapshot.generatedAt)}</small>
          </div>
          <FreshnessBadge
            className={`freshness-badge--${(selected.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}
            label={freshnessLabel(selected)}
          />
        </div>

        <div className="hydro-reading">
          <div className="hydro-level">
            <span>Último nivel disponible</span>
            <strong data-testid="hydro-current-level">
              {selected.currentMetres === null ? '—' : selected.currentMetres.toFixed(2).replace('.', ',')}
              {selected.currentMetres !== null && <small>m</small>}
            </strong>
            <time dateTime={selected.observedAt ?? undefined}>{formatLocalDateTime(selected.observedAt)}</time>
          </div>
          <dl className="hydro-metrics">
            <div><dt>Movimiento</dt><dd>{trendLabel(selected)}</dd></div>
            <div><dt>Cambio reciente</dt><dd>{formatDelta(selected.delta24h)}</dd></div>
          </dl>
        </div>

        <SourceLine buttonRef={sourcesButtonRef} onOpen={onSources}>
          <span><b>Fuente · {selectedSource?.organizationName ?? selected.sourceName}</b></span>
          <span>Medición · {formatHumanAge(selected.observedAt, snapshot.generatedAt)}</span>
          <span>Consulta de la fuente · {formatHumanAge(selected.fetchedAt, snapshot.generatedAt)}</span>
          {corroboratingTransport && <span className="source-strip__technical">Otra vía del mismo organismo disponible</span>}
          {sourceError(selectedSource) && <span className="source-strip__error">{sourceError(selectedSource)}</span>}
        </SourceLine>

        {selected.available && selected.currentMetres !== null
          ? <HydrometricChart system={selected} generatedAt={snapshot.generatedAt}/>
          : <div className="data-caveat"><strong>No pudimos obtener una medición reciente</strong><p>La estación no entregó una lectura utilizable. La falta de dato no significa una emergencia.</p></div>}
      </article> : <div className="data-caveat"><strong>No hay mediciones disponibles ahora</strong><p>No se pudo construir la situación hidrométrica. Probá actualizar o consultá las fuentes oficiales.</p></div>}
    </HydrometricHero>
  </section>;
}
