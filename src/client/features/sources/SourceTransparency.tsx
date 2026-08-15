import type { RefObject } from 'react';
import type { Snapshot, Source } from '../../../domain/snapshot.ts';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety.ts';

function statusLabel(source: Source | undefined): string {
  if (!source) return 'No disponible ahora';
  if (source.classification === 'OPERATIONAL_FRESH') return 'Al día';
  if (source.classification === 'OPERATIONAL_STALE') return 'Con demora';
  if (source.classification === 'SUPPLEMENTARY') return 'Dato de apoyo';
  if (source.classification === 'BLOCKED_NO_MACHINE_ENDPOINT') return 'Consulta manual';
  if (source.classification === 'BLOCKED_CREDENTIAL') return 'Acceso restringido';
  return 'Con limitaciones';
}

function healthCard(label: string, source: Source | undefined, generatedAt: string) {
  return <article key={label}>
    <div className="source-health-card__head"><span>{label}</span><strong>{statusLabel(source)}</strong></div>
    <h3>{source?.organizationName ?? source?.name ?? 'Fuente no publicada'}</h3>
    <p>{source ? `Última consulta ${formatHumanAge(source.fetchedAt ?? source.lastCheckedAt, generatedAt)}` : 'No hay una consulta pública disponible para esta actualización.'}</p>
    <small>{source ? formatLocalDateTime(source.fetchedAt ?? source.lastCheckedAt) : 'Sin hora disponible'}</small>
    {source?.limitations && <details><summary>Ver limitación</summary><p>{source.limitations}</p></details>}
  </article>;
}

export function SourceTransparency({
  snapshot,
  sourcesButtonRef,
  onSources,
}: {
  readonly snapshot: Snapshot;
  readonly sourcesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onSources: (opener?: HTMLButtonElement | null) => void;
}) {
  const hydro = snapshot.sources.find((source) => source.determinesPrimaryState && source.kind === 'OFFICIAL_OBSERVATION')
    ?? snapshot.sources.find((source) => source.id.includes('ina'));
  const alerts = snapshot.sources.find((source) => source.id === 'smn-alerts' || source.kind === 'OFFICIAL_ALERT');
  const province = snapshot.sources.find((source) => source.organizationId === 'province' || source.name.toLowerCase().includes('protección civil'));

  return <section id="transparencia" className="source-transparency" aria-labelledby="sources-title">
    <span id="fuentes" className="anchor-offset" aria-hidden="true"/>
    <header className="compact-section-heading">
      <div><p className="section-kicker">Confianza sin ruido</p><h2 id="sources-title">De dónde salen los datos</h2><p>La información técnica sigue disponible, pero no tiene que competir con lo que necesitás entender primero.</p></div>
      <button ref={sourcesButtonRef} type="button" className="button button--secondary" onClick={(event) => onSources(event.currentTarget)}>Ver fuentes y detalle</button>
    </header>
    <div className="source-health-grid">
      {healthCard('Ríos', hydro, snapshot.generatedAt)}
      {healthCard('Alertas', alerts, snapshot.generatedAt)}
      {healthCard('Contexto', province, snapshot.generatedAt)}
    </div>
  </section>;
}
