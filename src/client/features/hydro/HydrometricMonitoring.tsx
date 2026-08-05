import { useState } from 'react';
import type { HydrologicalSystem, Snapshot } from '../../../domain/snapshot';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety';
import { HydroSeriesChart } from '../../components/ui/HydroSeriesChart';

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
  return 'Sin tendencia confirmada';
}

function formatDelta(value: number | null): string {
  if (value === null) return 'No disponible';
  const centimetres = Math.round(value * 100);
  return `${centimetres > 0 ? '+' : ''}${centimetres} cm`;
}

function StationSummary({ system, generatedAt, onSelect }: { readonly system: HydrologicalSystem; readonly generatedAt: string; readonly onSelect: () => void }) {
  return <article className="secondary-station" aria-labelledby={`secondary-${system.id}`}>
    <div><p className="section-kicker">Segunda estación</p><h3 id={`secondary-${system.id}`}>{system.label}</h3><p>{system.available ? `${trendLabel(system)} · ${formatDelta(system.delta24h)} en 24 h` : 'Sin medición utilizable'}</p></div>
    <div className="secondary-station__reading"><strong>{system.currentMetres === null ? '—' : system.currentMetres.toFixed(2).replace('.', ',')} <small>m</small></strong><span>{formatHumanAge(system.observedAt, generatedAt)}</span></div>
    <button type="button" className="button button--secondary" onClick={onSelect}>Ver esta estación</button>
  </article>;
}

export function HydrometricMonitoring({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? EMPTY_SYSTEMS;
  const [selectedId, setSelectedId] = useState(() => snapshot.river.systemId ?? systems[0]?.id ?? '');
  const selected = systems.find((system) => system.id === selectedId) ?? systems[0];
  const secondary = systems.find((system) => system.id !== selected?.id);

  return <section className="hydrometric-section" aria-labelledby="hydrometric-title">
    <div className="hydrometric-section__heading">
      <div><p className="section-kicker">Observaciones oficiales</p><h2 id="hydrometric-title">Situación hidrométrica</h2><p>Serie histórica observada, sin proyecciones ni valores interpolados como mediciones.</p></div>
      {systems.length > 1 && <div className="station-selector" role="tablist" aria-label="Elegir estación hidrométrica">{systems.map((system) => <button key={system.id} type="button" role="tab" aria-selected={system.id === selected?.id} onClick={() => setSelectedId(system.id)}>{system.label}</button>)}</div>}
    </div>
    {selected ? <article className="primary-station">
      <header className="primary-station__header">
        <div><span>Estación {selected.stationName}</span><h3>{selected.label}</h3><p>Fuente: {selected.sourceName}</p></div>
        <span className={`freshness-badge freshness-badge--${(selected.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}>{freshnessLabel(selected)}</span>
      </header>
      <div className="primary-station__metrics">
        <div><span>Nivel actual</span><strong data-testid="hydro-current-level">{selected.currentMetres === null ? '—' : selected.currentMetres.toFixed(2).replace('.', ',')} <small>m</small></strong></div>
        <div><span>Tendencia</span><strong>{trendLabel(selected)}</strong></div>
        <div><span>Cambio en 24 h</span><strong>{formatDelta(selected.delta24h)}</strong></div>
        <div><span>Última medición</span><strong>{formatLocalDateTime(selected.observedAt)}</strong></div>
      </div>
      {selected.available && selected.currentMetres !== null ? <HydroSeriesChart system={selected} generatedAt={snapshot.generatedAt}/> : <div className="data-caveat"><strong>Medición no disponible</strong><p>La estación no entregó una lectura utilizable. No se infiere ausencia de riesgo.</p></div>}
    </article> : <div className="data-caveat"><strong>Sin estaciones disponibles</strong><p>No se pudo construir una situación hidrométrica automática.</p></div>}
    {secondary && <StationSummary system={secondary} generatedAt={snapshot.generatedAt} onSelect={() => setSelectedId(secondary.id)}/>}
  </section>;
}
