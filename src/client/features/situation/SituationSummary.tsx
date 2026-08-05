import type { Snapshot } from '../../../domain/snapshot';
import { ageMinutes, formatLocalDateTime } from '../../../domain/public-safety';

function freshnessLabel(value: Snapshot['freshness']): string {
  if (value === 'ACTUALIZADO') return 'Actualizado';
  if (value === 'ACTUALIZACION_DEMORADA') return 'Actualización demorada';
  if (value === 'DESACTUALIZADO') return 'Desactualizado';
  return 'No disponible';
}

export function SituationSummary({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? [];
  const latest = systems
    .map((system) => system.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const age = ageMinutes(latest, snapshot.generatedAt);
  const degraded = snapshot.sources.filter((source) => ['DEGRADED', 'BLOCKED_CREDENTIAL', 'BLOCKED_NO_MACHINE_ENDPOINT'].includes(source.classification ?? '')).length;
  return <section className="situation-summary" aria-labelledby="situation-title">
    <div className="section-heading">
      <div><p className="section-kicker">Resumen territorial</p><h2 id="situation-title">Situación actual en Santa Fe</h2></div>
      <span className={`freshness-badge freshness-badge--${(snapshot.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}>{freshnessLabel(snapshot.freshness)}</span>
    </div>
    <p className="situation-summary__lead">{snapshot.summary}</p>
    <div className="fact-grid">
      <div><span>Última medición disponible</span><strong>{formatLocalDateTime(latest)}</strong><small>{age === null ? 'Antigüedad no disponible' : `Antigüedad: ${age} min`}</small></div>
      <div><span>Fuentes operativas</span><strong>{snapshot.sources.filter((source) => source.connected).length} de {snapshot.sources.length}</strong><small>{degraded} con limitaciones explícitas</small></div>
      <div><span>Acción principal</span><strong>{snapshot.recommendedAction}</strong></div>
    </div>
    {snapshot.contradictions.length > 0 && <div className="data-caveat" role="status"><strong>Información con limitaciones</strong><p>{snapshot.contradictions.map((item) => item.explanation).join(' ')}</p></div>}
  </section>;
}
