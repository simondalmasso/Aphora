import { useMemo, useState, type RefObject } from 'react';
import {
  changeCopy,
  changeForSystem,
  meaningForSystem,
  referencesForSystem,
  safeStationThresholds,
  semanticMiniSummary,
} from '../../../domain/hydrometric-context.ts';
import { deriveHydroPriority, hydroPrioritySignalsForSystem, type HydroPriorityDecision } from '../../../domain/hydro-priority.ts';
import type { HydrologicalSystem, Snapshot, Source } from '../../../domain/snapshot.ts';
import { formatHumanAge } from '../../../domain/public-safety.ts';
import { FreshnessBadge, HydrometricChart, HydrometricHero, SourceLine } from '../../components/civic/CivicSystem.tsx';
import { RainContext } from '../rain/RainContext.tsx';

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

function compactMovement(system: HydrologicalSystem): string {
  if (system.delta24h === null) return '24 h · sin comparación';
  const centimetres = Math.round(system.delta24h * 100);
  if (centimetres === 0) return '24 h · sin cambio apreciable';
  return `${centimetres > 0 ? '↑' : '↓'} ${Math.abs(centimetres)} cm / 24 h`;
}

function formatLevel(system: HydrologicalSystem): string {
  return system.currentMetres === null ? 'No disponible' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`;
}

function shortRiverName(system: HydrologicalSystem): string {
  return system.watercourse.replace(/^Río\s+/i, '');
}

function sourceError(source: Source | undefined): string | null {
  if (!source) return 'La fuente no figura en el inventario de esta actualización.';
  if (source.classification === 'OPERATIONAL_FRESH' || source.classification === 'OPERATIONAL_STALE') return null;
  return source.limitations ?? 'La fuente no está operativa en esta actualización.';
}

function MiniRiverTrace({ system }: { readonly system: HydrologicalSystem }) {
  const points = system.points.slice(-30).filter((point) => Number.isFinite(point.metres));
  if (points.length < 2) return <span className="mini-river-trace mini-river-trace--empty" aria-hidden="true">—</span>;
  const values = points.map((point) => point.metres);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(.01, max - min);
  const d = points.map((point, index) => {
    const x = (index / Math.max(1, points.length - 1)) * 100;
    const y = 24 - ((point.metres - min) / range) * 20;
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
  return <svg className="mini-river-trace" viewBox="0 0 100 28" role="img" aria-label={`Tendencia reciente de ${system.watercourse}, estación ${system.stationName}`}>
    <path d={d}/><circle cx="100" cy={24 - ((points.at(-1)!.metres - min) / range) * 20} r="2.6"/>
  </svg>;
}

function RiverContextSelector({ systems, selectedId, onSelect }: {
  readonly systems: readonly HydrologicalSystem[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
}) {
  if (systems.length < 2) return null;
  return <div className="station-selector station-selector--meaning river-switch" role="tablist" aria-label="Elegir río y estación">
    {systems.map((system) => <button
      key={system.id}
      type="button"
      role="tab"
      aria-label={shortRiverName(system)}
      aria-selected={system.id === selectedId}
      onClick={() => onSelect(system.id)}
    >
      <span className="river-switch__name">{shortRiverName(system)}</span>
      <span className="river-switch__trace"><MiniRiverTrace system={system}/></span>
      <small>Est. {system.stationName}</small>
      <em>{semanticMiniSummary(system)}</em>
    </button>)}
  </div>;
}

function ContextualScale({ system }: { readonly system: HydrologicalSystem }) {
  const current = system.currentMetres;
  const references = referencesForSystem(system).filter((reference) => reference.metres !== null && reference.kind !== 'UNAVAILABLE');
  if (current === null || references.length === 0) {
    return <div className="context-scale context-scale--unavailable" data-testid="hydro-context-scale">
      <div><strong>Referencia de esta estación</strong><span>Sin referencia oficial suficiente.</span></div>
    </div>;
  }
  const values = [current, ...references.map((reference) => reference.metres!).filter(Number.isFinite)];
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(.4, rawMax - rawMin);
  const minimum = rawMin - span * .12;
  const maximum = rawMax + span * .12;
  const position = (value: number) => `${Math.max(0, Math.min(100, ((value - minimum) / Math.max(.01, maximum - minimum)) * 100))}%`;
  return <figure className="context-scale context-scale--product" data-testid="hydro-context-scale" aria-label={`Escala contextual específica de ${system.label}`}>
    <figcaption><strong>Referencia de la estación</strong><span>No es profundidad física del río.</span></figcaption>
    <div className="context-scale__track" aria-hidden="true">
      {references.map((reference) => <span
        key={reference.id}
        className={`context-scale__reference context-scale__reference--${reference.kind === 'OFFICIAL_STATISTICAL_REFERENCE' ? 'statistical' : 'protection'}`}
        style={{ left: position(reference.metres!) }}
      />)}
      <span className="context-scale__current" style={{ left: position(current) }}><i/></span>
    </div>
    <div className="context-scale__legend">
      <span className="context-scale__legend-current"><i/>Ahora · {formatLevel(system)}</span>
      {references.map((reference) => <span key={reference.id}><i className={reference.kind === 'OFFICIAL_STATISTICAL_REFERENCE' ? 'statistical' : 'protection'}/>{reference.label} · {reference.metres!.toFixed(2).replace('.', ',')} m</span>)}
    </div>
  </figure>;
}

function OperationalRiverPanel({ system, snapshot, priority }: {
  readonly system: HydrologicalSystem;
  readonly snapshot: Snapshot;
  readonly priority: HydroPriorityDecision;
}) {
  const source = snapshot.sources.find((item) => item.id === system.sourceId);
  const signals = hydroPrioritySignalsForSystem(priority, system.id);
  const meaning = meaningForSystem(system);
  return <article className="river-priority__river river-priority__river--product" data-river-system={system.id}>
    <header className="river-priority__river-header">
      <div><span>{system.watercourse}</span><strong>Est. {system.stationName}</strong></div>
      <FreshnessBadge className={`freshness-badge--${(system.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`} label={freshnessLabel(system)}/>
    </header>
    <MiniRiverTrace system={system}/>
    <div className="river-priority__metric-row"><strong>{formatLevel(system)}</strong><span>{compactMovement(system)}</span></div>
    <p className="river-priority__meaning">{meaning.headline}</p>
    <div className="river-priority__source"><span>Fuente · {source?.organizationName ?? system.sourceName}</span><span>Medición · {formatHumanAge(system.observedAt, snapshot.generatedAt)}</span></div>
    <p className="river-priority__status">{signals.map((signal) => <span key={`${signal.kind}-${signal.sourceId}-${signal.reason}`}>{signal.reason}</span>)}</p>
  </article>;
}

export function HydrometricMonitoring({ snapshot, refreshing, sourcesButtonRef, onRefresh, onSources }: {
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
  const validSelectedId = systems.some((system) => system.id === requestedId) ? requestedId : operationalDefaultId ?? systems[0]?.id ?? '';
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
  const meaning = selected ? meaningForSystem(selected) : null;
  const safeThresholds = selected ? safeStationThresholds(selected) : [];

  return <section
    className="hydrometric-section context-first-hydrometry smooth-civic-hydrometry"
    id="situacion-hidrica"
    aria-labelledby="hydrometric-title"
    data-testid="hydrometric-situation"
    data-priority-mode={priority.mode}
  >
    <HydrometricHero>
      <header className="hydrometric-hero__header hydro-product-header">
        <div className="hydrometric-hero__intro">
          <p className="section-kicker">Santa Fe · monitoreo hídrico</p>
          <h1 id="hydrometric-title">Situación hidrométrica</h1>
          <p className="hydro-product__strapline">Nivel, tendencia y contexto.</p>
          <p className="hydrometric-hero__lede sr-only">Qué marca cada estación, cómo viene cambiando y contra qué referencia puede leerse.</p>
        </div>
        <button className="hydro-refresh-button" type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing || undefined} aria-label="Actualizar información">
          <span aria-hidden="true">{refreshing ? '…' : '↻'}</span>
        </button>
      </header>

      <RiverContextSelector
        systems={systems}
        selectedId={selected?.id}
        onSelect={(id) => setSelection({ snapshotId: snapshot.id, id })}
      />

      {priority.mode !== 'NORMAL' && prioritySystems.length > 0 && <aside
        className={`river-priority river-priority--${priority.mode === 'DUAL_EMERGENCY' ? 'dual' : 'single'}`}
        data-testid="river-operational-priority"
        aria-labelledby="river-priority-title"
      >
        <header className="river-priority__masthead">
          <div><p>{priority.mode === 'DUAL_EMERGENCY' ? 'Atención compartida' : 'Atención prioritaria'}</p><h2 id="river-priority-title">{priority.mode === 'DUAL_EMERGENCY' ? 'Paraná + Salado' : prioritySystems[0]?.watercourse}</h2></div>
          <div className="river-priority__explain"><p>{priority.mode === 'DUAL_EMERGENCY' ? 'prioridad equivalente 50/50' : 'Prioridad temporal por condición verificada.'}</p><button type="button" onClick={(event) => onSources(event.currentTarget)}>Ver por qué</button></div>
        </header>
        <div className="river-priority__grid">{prioritySystems.map((system) => <OperationalRiverPanel key={system.id} system={system} snapshot={snapshot} priority={priority}/>)}</div>
      </aside>}

      {selected ? <article className={`primary-station hydrometric-meaning-module river-product-card${priority.mode === 'DUAL_EMERGENCY' ? ' primary-station--after-dual' : ''}`}>
        <div className="station-identification station-identification--product">
          <div><span>{selected.watercourse}</span><strong>Estación {selected.stationName}</strong><small>Medición · {formatHumanAge(selected.observedAt, snapshot.generatedAt)}</small></div>
          <FreshnessBadge className={`freshness-badge--${(selected.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`} label={freshnessLabel(selected)}/>
        </div>

        <div className="meaning-glance meaning-glance--product">
          <div className="hydro-level">
            <span>Último nivel disponible</span>
            <strong data-testid="hydro-current-level">{selected.currentMetres === null ? '—' : selected.currentMetres.toFixed(2).replace('.', ',')}{selected.currentMetres !== null && <small>m</small>}</strong>
          </div>
          <div className="meaning-copy">
            <div className="meaning-copy__movement meaning-copy__movement--product"><strong>{trendLabel(selected)}</strong><span>{compactMovement(selected)}</span></div>
            <p className="meaning-copy__primary" data-testid="hydro-meaning">{meaning?.headline}</p>
            <button type="button" className="meaning-explain" onClick={(event) => onSources(event.currentTarget)}>Qué significa esta altura</button>
          </div>
        </div>

        {selected.available && selected.currentMetres !== null
          ? <HydrometricChart system={selected} generatedAt={snapshot.generatedAt}/>
          : <div className="data-caveat"><strong>No pudimos obtener una medición reciente</strong><p>La estación no entregó una lectura utilizable. La falta de dato no significa una emergencia.</p></div>}

        {selected.available && selected.currentMetres !== null && <ContextualScale system={selected}/>} 

        <div className="meaning-horizons meaning-horizons--secondary" aria-label="Cambios observados en distintos períodos">
          <span>{changeCopy(changeForSystem(selected, 72), 72)}</span><span>{changeCopy(changeForSystem(selected, 168), 168)}</span>
        </div>

        <SourceLine buttonRef={sourcesButtonRef} onOpen={onSources}>
          <span><b>Fuente · {selectedSource?.organizationName ?? selected.sourceName}</b></span>
          <span>Medición · {formatHumanAge(selected.observedAt, snapshot.generatedAt)}</span>
          <span>Consulta de la fuente · {formatHumanAge(selected.fetchedAt, snapshot.generatedAt)}</span>
          {safeThresholds.length > 0 && <span className="source-strip__technical">Referencias verificadas de esta estación</span>}
          {corroboratingTransport && <span className="source-strip__technical">Otra vía del mismo organismo disponible</span>}
          {sourceError(selectedSource) && <span className="source-strip__error">{sourceError(selectedSource)}</span>}
        </SourceLine>
      </article> : <div className="data-caveat"><strong>No hay mediciones disponibles ahora</strong><p>No se pudo construir la situación hidrométrica. Probá actualizar o consultá las fuentes oficiales.</p></div>}

      <RainContext snapshot={snapshot}/>
    </HydrometricHero>
  </section>;
}
