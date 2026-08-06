import type { RefObject } from 'react';
import type { Snapshot, Source } from '../../../domain/snapshot';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety';

function statusLabel(source: Source | undefined): string {
  if (!source) return 'No publicada';
  if (source.classification === 'OPERATIONAL_FRESH') return 'Operativa y vigente';
  if (source.classification === 'OPERATIONAL_STALE') return 'Operativa con demora';
  if (source.classification === 'SUPPLEMENTARY') return 'Suplementaria';
  if (source.classification === 'BLOCKED_NO_MACHINE_ENDPOINT') return 'Consulta manual';
  if (source.classification === 'BLOCKED_CREDENTIAL') return 'Acceso restringido';
  return 'Degradada';
}

function healthCard(label: string, source: Source | undefined, generatedAt: string) {
  return <article key={label}>
    <div><span>{label}</span><strong>{source?.organizationName ?? source?.name ?? 'Fuente no publicada'}</strong></div>
    <p>{source?.feedName ?? source?.name ?? 'Sin familia de endpoint declarada'}</p>
    <dl>
      <div><dt>Estado</dt><dd>{statusLabel(source)}</dd></div>
      <div><dt>Recepción</dt><dd>{source ? `${formatLocalDateTime(source.fetchedAt ?? source.lastCheckedAt)} · ${formatHumanAge(source.fetchedAt ?? source.lastCheckedAt, generatedAt)}` : 'No disponible'}</dd></div>
    </dl>
    {source?.limitations && <small>{source.limitations}</small>}
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

  return <section className="source-transparency" aria-labelledby="sources-title">
    <header className="compact-section-heading">
      <div><p className="section-kicker">Fuentes y transparencia</p><h2 id="sources-title">Salud de los datos</h2></div>
      <button ref={sourcesButtonRef} type="button" className="button button--secondary" onClick={(event) => onSources(event.currentTarget)}>
        Ver trazabilidad
      </button>
    </header>
    <div className="source-health-grid">
      {healthCard('Hidrometría', hydro, snapshot.generatedAt)}
      {healthCard('Alertas', alerts, snapshot.generatedAt)}
      {healthCard('Contexto provincial', province, snapshot.generatedAt)}
    </div>
  </section>;
}
