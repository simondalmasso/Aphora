import { useEffect, useRef } from 'react';
import type { Snapshot, Source } from '../../domain/snapshot.ts';
import { formatHumanAge, formatLocalDateTime } from '../../domain/public-safety.ts';

const FUNCTION_ORDER = ['Hidrometría', 'Alertas oficiales', 'Meteorología y lluvia', 'Canales de verificación'] as const;
type SourceFunction = typeof FUNCTION_ORDER[number];

function sourceFunction(source: Source): SourceFunction {
  if (source.id.includes('ina') || source.id.includes('port') || source.name.toLowerCase().includes('hidrómetro')) return 'Hidrometría';
  if (source.kind === 'OFFICIAL_ALERT') return 'Alertas oficiales';
  if (source.kind === 'SATELLITE_OBSERVATION' || source.kind === 'FORECAST_MODEL' || source.id.includes('smn-observation')) return 'Meteorología y lluvia';
  return 'Canales de verificación';
}

function classificationLabel(source: Source): string {
  switch (source.classification) {
    case 'OPERATIONAL_FRESH': return 'Disponible y vigente';
    case 'OPERATIONAL_STALE': return 'Disponible con demora';
    case 'SUPPLEMENTARY': return 'Información complementaria';
    case 'BLOCKED_CREDENTIAL': return 'Requiere acceso oficial';
    case 'BLOCKED_NO_MACHINE_ENDPOINT': return 'Consulta manual';
    case 'REJECTED_UNSAFE': return 'No utilizado por seguridad';
    case 'RETIRED': return 'Retirado';
    default: return 'Disponibilidad limitada';
  }
}

function roleLabel(source: Source): string {
  if (source.determinesPrimaryState) return 'Puede determinar el estado principal cuando está vigente.';
  if (source.kind === 'SATELLITE_OBSERVATION' || source.kind === 'FORECAST_MODEL') return 'Aporta contexto; no determina por sí sola el estado principal.';
  return 'Sirve para verificación o contexto; no determina por sí sola el estado principal.';
}

function SourceInventory({ snapshot }: { readonly snapshot: Snapshot }) {
  const grouped = snapshot.sources.reduce<Record<SourceFunction, Source[]>>((result, source) => {
    result[sourceFunction(source)].push(source);
    return result;
  }, { 'Hidrometría': [], 'Alertas oficiales': [], 'Meteorología y lluvia': [], 'Canales de verificación': [] });

  return <>{FUNCTION_ORDER.map((functionName) => {
    const sources = grouped[functionName];
    if (!sources.length) return null;
    const organizations = sources.reduce<Record<string, Source[]>>((result, source) => {
      const organization = source.organizationName ?? source.name;
      (result[organization] ??= []).push(source);
      return result;
    }, {});
    return <section key={functionName} className="source-group" aria-labelledby={`source-group-${functionName.replaceAll(' ', '-').toLowerCase()}`}>
      <h3 id={`source-group-${functionName.replaceAll(' ', '-').toLowerCase()}`}>{functionName}</h3>
      {Object.entries(organizations).map(([organization, feeds]) => <div className="source-organization" key={organization}>
        <h4>{organization}</h4>
        <div className="table-scroll"><table><caption>Feeds y canales de {organization}</caption><thead><tr><th>Feed o canal</th><th>Observación</th><th>Recepción</th><th>Vigencia</th><th>Estado y función</th><th>Acceso</th></tr></thead><tbody>{feeds.map((source) => <tr key={source.id}>
          <td><strong>{source.feedName ?? source.name}</strong></td>
          <td>{formatLocalDateTime(source.observedAt)}<small>{formatHumanAge(source.observedAt, snapshot.generatedAt)}</small></td>
          <td>{formatLocalDateTime(source.fetchedAt ?? source.lastCheckedAt)}</td>
          <td>{formatLocalDateTime(source.validUntil)}</td>
          <td><span className={`classification classification--${(source.classification ?? 'DEGRADED').toLowerCase()}`}>{classificationLabel(source)}</span><small>{roleLabel(source)}</small>{source.limitations && <small>{source.limitations}</small>}</td>
          <td>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">Abrir fuente</a> : 'Sin enlace público'}</td>
        </tr>)}</tbody></table></div>
      </div>)}
    </section>;
  })}</>;
}

export function DetailsDialog({ snapshot, open, onClose }: { readonly snapshot: Snapshot; readonly open: boolean; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  const technicalEvents = (snapshot.timeline ?? []).filter((event) => !event.official);
  return <dialog ref={ref} className="details-dialog" aria-labelledby="details-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-surface">
      <header className="dialog-head"><div><p className="section-kicker">Transparencia pública</p><h2 id="details-title">Datos y fuentes</h2></div><button className="icon-close" type="button" onClick={onClose} aria-label="Cerrar Datos y fuentes">×</button></header>
      <p className="dialog-lead">SOS Santa Fe separa la hora observada por el organismo, la hora de recepción del integrador y el período de vigencia. Dos transportes del mismo organismo no cuentan como corroboraciones independientes.</p>
      <section><h3>Mediciones por estación</h3><div className="detail-list">{(snapshot.systems ?? []).map((system) => <article key={system.id}><strong>{system.label}</strong><dl><div><dt>Nivel</dt><dd>{system.currentMetres === null ? 'No disponible' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</dd></div><div><dt>Observada</dt><dd>{formatLocalDateTime(system.observedAt)}<small>{formatHumanAge(system.observedAt, snapshot.generatedAt)}</small></dd></div><div><dt>Recibida</dt><dd>{formatLocalDateTime(system.fetchedAt)}</dd></div><div><dt>Válida hasta</dt><dd>{formatLocalDateTime(system.validUntil)}</dd></div></dl></article>)}</div></section>
      <SourceInventory snapshot={snapshot}/>
      <details className="technical-disclosure"><summary>Estado técnico y limitaciones</summary>
        <div className="technical-grid"><div><h3>API pública</h3><p>{snapshot.serviceStatus?.api === 'OPERATIONAL' ? 'Disponible en la última verificación técnica.' : 'No disponible en la última verificación técnica.'}</p><small>Verificada {formatLocalDateTime(snapshot.serviceStatus?.checkedAt ?? snapshot.generatedAt)}.</small></div><div><h3>Limitaciones conocidas</h3><ul>{snapshot.sources.filter((source) => source.limitations).map((source) => <li key={source.id}><strong>{source.organizationName ?? source.name}:</strong> {source.limitations}</li>)}</ul></div></div>
        {technicalEvents.length > 0 && <div><h3>Historial técnico del integrador</h3><ol className="technical-timeline">{technicalEvents.map((event) => <li key={event.id}><time dateTime={event.at}>{formatLocalDateTime(event.at)}</time><div><strong>{event.title}</strong><p>{event.detail}</p></div></li>)}</ol></div>}
      </details>
      <details className="technical-disclosure"><summary>Metodología de interpretación</summary><ul><li>Una medición por encima de un umbral no constituye una orden de evacuación.</li><li>INA REST e INA WaterML pertenecen al mismo organismo y no se presentan como confirmaciones independientes.</li><li>La información satelital o de modelos se utiliza sólo como contexto cuando existe una muestra válida.</li><li>Los canales humanos oficiales se enlazan para verificación y no se simulan como feeds automáticos.</li></ul></details>
      <section><h3>Acceso técnico</h3><p><a href="/api/sources">Matriz JSON de fuentes</a> · <a href="/api/health">Estado técnico de la API</a></p></section>
      <button className="button button--primary" type="button" onClick={onClose}>Cerrar</button>
    </div>
  </dialog>;
}
