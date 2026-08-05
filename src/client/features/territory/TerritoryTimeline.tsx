import type { Snapshot } from '../../../domain/snapshot';
import { formatLocalDateTime } from '../../../domain/public-safety';

export function TerritoryTimeline({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? [];
  return <section className="territory-section" aria-labelledby="territory-title">
    <div className="section-heading"><div><p className="section-kicker">Territorio y cambios</p><h2 id="territory-title">Mapa y timeline de 72 horas</h2></div></div>
    <div className="territory-layout">
      <article className="verified-map-placeholder" aria-labelledby="map-title"><h3 id="map-title">Vista territorial</h3><p>No se dibujan polígonos, refugios ni puntos de encuentro sin geometrías oficiales verificadas y vigentes.</p><ul>{systems.map((system) => <li key={system.id}><strong>{system.label}</strong><span>Estación {system.stationName} · código {system.stationCode}</span></li>)}</ul><p className="map-note">La lista es la alternativa accesible al mapa mientras no exista una geometría pública verificable.</p></article>
      <article className="timeline-panel"><h3>Últimos cambios registrados</h3>{(snapshot.timeline ?? []).length ? <ol>{(snapshot.timeline ?? []).map((event) => <li key={event.id}><time dateTime={event.at}>{formatLocalDateTime(event.at)}</time><div><strong>{event.title}</strong><p>{event.detail}</p><small>{event.official ? 'Fuente oficial' : 'Estado del integrador'}</small></div></li>)}</ol> : <p>No hay eventos verificables dentro de las últimas 72 horas.</p>}</article>
    </div>
  </section>;
}
