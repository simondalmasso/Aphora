import type { Snapshot } from '../../../domain/snapshot';
import { formatLocalDateTime } from '../../../domain/public-safety';

function classificationLabel(value: string | undefined): string {
  return (value ?? 'DEGRADED').replaceAll('_', ' ');
}

export function SourceTransparency({ snapshot }: { readonly snapshot: Snapshot }) {
  const organizations = snapshot.sourceOrganizations ?? [];
  return <section className="source-transparency" aria-labelledby="sources-title">
    <div className="section-heading"><div><p className="section-kicker">Transparencia</p><h2 id="sources-title">Fuentes, vigencia y metodología</h2></div></div>
    <p>Los feeds se agrupan por organismo. Dos transportes del mismo organismo no se presentan como corroboraciones independientes.</p>
    <div className="table-scroll"><table><caption>Inventario de fuentes públicas y su función</caption><thead><tr><th>Organismo / feed</th><th>Última consulta</th><th>Última observación</th><th>Estado</th><th>Función y limitaciones</th><th>Fuente</th></tr></thead><tbody>{snapshot.sources.map((source) => <tr key={source.id}><td><strong>{source.organizationName ?? source.name}</strong><span>{source.feedName ?? source.name}</span></td><td>{formatLocalDateTime(source.fetchedAt ?? source.lastCheckedAt)}</td><td>{formatLocalDateTime(source.observedAt)}</td><td><span className={`classification classification--${(source.classification ?? 'DEGRADED').toLowerCase()}`}>{classificationLabel(source.classification)}</span></td><td>{source.contribution}{source.limitations ? <small>{source.limitations}</small> : null}<small>{source.determinesPrimaryState ? 'Determina el estado principal cuando está vigente.' : 'No determina por sí sola el estado principal.'}</small></td><td>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">Abrir canal oficial</a> : 'Sin enlace'}</td></tr>)}</tbody></table></div>
    {organizations.length > 0 && <p className="organization-count">{organizations.length} organismos · {snapshot.sources.length} feeds o canales inventariados</p>}
  </section>;
}
