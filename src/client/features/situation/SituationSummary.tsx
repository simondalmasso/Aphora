import type { Snapshot } from '../../../domain/snapshot';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety';

function freshnessLabel(value: Snapshot['freshness']): string {
  if (value === 'ACTUALIZADO') return 'Información vigente';
  if (value === 'ACTUALIZACION_DEMORADA') return 'Actualización demorada';
  if (value === 'DESACTUALIZADO') return 'Información desactualizada';
  return 'Vigencia no disponible';
}

export function SituationSummary({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? [];
  const latest = systems
    .map((system) => system.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  return <section className="situation-summary" aria-labelledby="situation-title">
    <div className="section-heading situation-summary__heading">
      <div><p className="section-kicker">Situación actual</p><h2 id="situation-title">Lo importante en Santa Fe</h2></div>
      <span className={`freshness-badge freshness-badge--${(snapshot.freshness ?? 'NO_DISPONIBLE').toLowerCase()}`}>{freshnessLabel(snapshot.freshness)}</span>
    </div>
    <p className="situation-summary__lead">{snapshot.summary}</p>
    <div className="situation-facts">
      <div><span>Estado hídrico</span><strong>{snapshot.stateLabel}</strong></div>
      <div><span>Última información</span><strong>{formatHumanAge(latest, snapshot.generatedAt)}</strong><small>{formatLocalDateTime(latest)}</small></div>
      <div className="situation-facts__action"><span>Acción principal</span><strong>{snapshot.recommendedAction}</strong></div>
    </div>
  </section>;
}
