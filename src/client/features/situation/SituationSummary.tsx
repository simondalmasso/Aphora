import type { Snapshot } from '../../../domain/snapshot';
import { formatHumanAge } from '../../../domain/public-safety';

function trendSymbol(trend: NonNullable<Snapshot['systems']>[number]['trend']): string {
  if (trend === 'RISING' || trend === 'RISING_SLOWLY') return '↗';
  if (trend === 'FALLING') return '↘';
  if (trend === 'STABLE') return '→';
  return '·';
}

export function SituationSummary({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? [];
  return <section className="territory-section" aria-labelledby="territory-title">
    <header className="compact-section-heading">
      <div><p className="section-kicker">Contexto territorial</p><h2 id="territory-title">Dos sistemas, una lectura clara</h2></div>
      <span>{snapshot.rain.available ? `${snapshot.rain.accumulated24hMm.toFixed(1).replace('.', ',')} mm / 24 h` : 'Lluvia local no disponible'}</span>
    </header>
    <div className="territory-schematic" role="img" aria-label="Esquema compacto de las estaciones Paraná y Salado">
      <svg viewBox="0 0 520 116" aria-hidden="true">
        <path d="M20 32 C110 8 172 55 264 30 S410 12 500 36"/>
        <path d="M20 84 C118 108 176 61 270 86 S412 105 500 78"/>
        <circle cx="250" cy="33" r="7"/><circle cx="292" cy="83" r="7"/>
      </svg>
      <div className="territory-stations">
        {systems.slice(0, 2).map((system) => <article key={system.id}>
          <span>{trendSymbol(system.trend)} {system.watercourse}</span>
          <strong>{system.currentMetres === null ? 'Sin dato' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</strong>
          <small>{system.stationName} · {formatHumanAge(system.observedAt, snapshot.generatedAt)}</small>
        </article>)}
      </div>
    </div>
  </section>;
}
