import { useMemo, useState, type RefObject } from 'react';
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

function sourceFamily(source: Source | undefined, system: HydrologicalSystem): string {
  return source?.feedName ?? source?.name ?? system.sourceName;
}

function sourceError(source: Source | undefined): string | null {
  if (!source) return 'La fuente no figura en el inventario del snapshot.';
  if (source.classification === 'OPERATIONAL_FRESH' || source.classification === 'OPERATIONAL_STALE') return null;
  return source.limitations ?? 'La fuente no está operativa en este snapshot.';
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
  const [selectedId, setSelectedId] = useState(() => snapshot.river.systemId ?? systems[0]?.id ?? '');
  const validSelectedId = systems.some((system) => system.id === selectedId)
    ? selectedId
    : snapshot.river.systemId ?? systems[0]?.id ?? '';
  const selected = systems.find((system) => system.id === validSelectedId) ?? systems[0];

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
  >
    <HydrometricHero>
      <header className="hydrometric-hero__header">
        <div>
          <p className="section-kicker">Situación hidrométrica</p>
          <h1 id="hydrometric-title">Ríos de Santa Fe</h1>
        </div>
        <div className="hydrometric-hero__controls">
          <StationSwitcher systems={systems} selectedId={selected?.id} onSelect={setSelectedId}/>
          <button className="hydro-refresh-button" type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing || undefined} aria-label="Actualizar información">
            <span aria-hidden="true">{refreshing ? '…' : '↻'}</span>
          </button>
        </div>
      </header>

      {selected ? <article className="primary-station">
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
            <div><dt>Cambio 24 h</dt><dd>{formatDelta(selected.delta24h)}</dd></div>
          </dl>
        </div>

        <SourceLine buttonRef={sourcesButtonRef} onOpen={onSources}>
          <span><b>{selectedSource?.organizationName ?? selected.sourceName}</b> · {sourceFamily(selectedSource, selected)}</span>
          <span>{formatLocalDateTime(selected.fetchedAt)}</span>
          <span>{corroboratingTransport ? `Mismo organismo · segundo transporte: ${corroboratingTransport.feedName ?? corroboratingTransport.name}` : 'Sin corroboración independiente'}</span>
          {sourceError(selectedSource) && <span className="source-strip__error">{sourceError(selectedSource)}</span>}
        </SourceLine>

        {selected.available && selected.currentMetres !== null
          ? <HydrometricChart system={selected} generatedAt={snapshot.generatedAt}/>
          : <div className="data-caveat"><strong>Medición no disponible</strong><p>La estación no entregó una lectura utilizable.</p></div>}
      </article> : <div className="data-caveat"><strong>Sin estaciones disponibles</strong><p>No se pudo construir la situación hidrométrica.</p></div>}
    </HydrometricHero>
  </section>;
}
