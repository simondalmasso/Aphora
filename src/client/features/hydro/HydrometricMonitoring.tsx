import type { HydrologicalSystem, Snapshot } from '../../../domain/snapshot';
import { ageMinutes, formatLocalDateTime } from '../../../domain/public-safety';
import { HydroSeriesChart } from '../../components/ui/HydroSeriesChart';
import { LevelRuler } from '../../components/ui/LevelRuler';

function freshnessLabel(system: HydrologicalSystem): string {
  if (system.freshness === 'ACTUALIZADO') return 'Actualizado';
  if (system.freshness === 'ACTUALIZACION_DEMORADA') return 'Actualización demorada';
  if (system.freshness === 'DESACTUALIZADO') return 'Desactualizado';
  return 'No disponible';
}

function trendLabel(system: HydrologicalSystem): string {
  if (system.trend === 'RISING') return 'En ascenso';
  if (system.trend === 'RISING_SLOWLY') return 'Ascenso lento';
  if (system.trend === 'FALLING') return 'En descenso';
  if (system.trend === 'STABLE') return 'Estable';
  return 'Tendencia no disponible';
}

function StationCard({ system, generatedAt }: { readonly system: HydrologicalSystem; readonly generatedAt: string }) {
  const age = ageMinutes(system.observedAt, generatedAt);
  return <article className="station-card">
    <header>
      <div><p className="section-kicker">Estación hidrométrica {system.stationName}</p><h3>{system.label}</h3></div>
      <span className={`freshness-badge freshness-badge--${(system.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}>{freshnessLabel(system)}</span>
    </header>
    <div className="station-reading">
      <div><span>Última medición</span><strong>{system.currentMetres === null ? 'No disponible' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</strong><small>{trendLabel(system)}</small></div>
      <dl>
        <div><dt>Observado a las</dt><dd>{formatLocalDateTime(system.observedAt)}</dd></div>
        <div><dt>Recibido a las</dt><dd>{formatLocalDateTime(system.fetchedAt)}</dd></div>
        <div><dt>Válido hasta</dt><dd>{formatLocalDateTime(system.validUntil)}</dd></div>
        <div><dt>Antigüedad</dt><dd>{age === null ? 'No disponible' : `${age} min`}</dd></div>
      </dl>
    </div>
    {system.available && system.currentMetres !== null ? <><LevelRuler system={system}/><HydroSeriesChart system={system}/></> : <div className="data-caveat"><strong>Medición no disponible</strong><p>La estación no entregó una lectura utilizable. No se infiere ausencia de riesgo.</p></div>}
    <p className="source-line">Fuente: {system.sourceName}</p>
  </article>;
}

export function HydrometricMonitoring({ snapshot }: { readonly snapshot: Snapshot }) {
  return <section className="hydrometric-section" aria-labelledby="hydrometric-title">
    <div className="section-heading"><div><p className="section-kicker">Observaciones instrumentales</p><h2 id="hydrometric-title">Situación hidrométrica</h2></div><p>Las estaciones se muestran por separado y en su propia escala.</p></div>
    <div className="station-grid">{(snapshot.systems ?? []).map((system) => <StationCard key={system.id} system={system} generatedAt={snapshot.generatedAt}/>)}</div>
  </section>;
}
