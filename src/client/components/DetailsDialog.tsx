import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { sourceAgeLabel } from '../../domain/sources';
import { RainChart } from './Charts';

type EvidenceView = 'sources' | 'data' | 'communications' | 'demo';

function formatEvidenceDate(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso));
}

export function DetailsDialog({ snapshot, open, onClose }: { readonly snapshot: Snapshot; readonly open: boolean; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<EvidenceView>('sources');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setView('sources');
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="details-dialog details-dialog--v3" aria-labelledby="details-title" onClose={onClose} onClick={(event: MouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="dialog-head dialog-head--v3">
        <div><span className="v3-eyebrow">Evidencia del snapshot</span><h2 id="details-title">Entender los datos</h2></div>
        <button className="ui-icon-button" type="button" onClick={onClose} aria-label="Cerrar detalles" title="Cerrar detalles"><span aria-hidden="true">×</span></button>
      </div>
      <nav className="evidence-tabs" aria-label="Secciones de evidencia">
        {([['sources', 'Evidencia'], ['data', 'Datos completos'], ['communications', 'Comunicaciones'], ['demo', 'Modo demo']] as const).map(([id, label]) => <button key={id} type="button" className={view === id ? 'is-active' : ''} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
      </nav>
      <div className="evidence-panels">
        {view === 'sources' && <section aria-labelledby="sources-view-title"><h3 id="sources-view-title">Fuentes y vigencia</h3><p className="dialog-lead">Cada señal conserva origen, antigüedad y vencimiento. Ninguna fuente de esta versión es real u oficial.</p><div className="source-detail-list">{snapshot.sources.map((source) => <article key={source.id} className="source-detail"><div><span className={`source-dot source-dot--${source.status.toLowerCase()}`} aria-hidden="true" /><strong>{source.name}</strong></div><p>{source.contribution}</p><small>{source.kind.replaceAll('_', ' ')} · {sourceAgeLabel(source.observedAt, snapshot.generatedAt)} · actualizado {formatEvidenceDate(source.observedAt)} · vigente hasta {formatEvidenceDate(source.validUntil)}</small><code>{source.id}</code></article>)}</div></section>}
        {view === 'data' && <section aria-labelledby="data-view-title"><h3 id="data-view-title">Datos completos</h3><div className="evidence-data-grid"><article><span>Nivel actual</span><strong>{snapshot.river.currentMetres.toFixed(2)} m</strong><small>{snapshot.river.stationName}</small></article><article><span>Lluvia</span><strong>{snapshot.rain.accumulated24hMm.toFixed(1)} mm</strong><small>{snapshot.rain.accumulated1hMm.toFixed(1)} mm en 1 h</small></article><article><span>Vigencia</span><strong>{formatEvidenceDate(snapshot.validUntil)}</strong><small>Snapshot {snapshot.generatedAt}</small></article></div><h4>Lluvia por hora</h4><RainChart points={snapshot.rain.points} /><h4>Contradicciones</h4>{snapshot.contradictions.map((contradiction) => <article className="dialog-contradiction" key={contradiction.id}><strong>{contradiction.title}</strong><ul>{contradiction.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul><p>{contradiction.explanation}</p></article>)}</section>}
        {view === 'communications' && <section aria-labelledby="communications-view-title"><h3 id="communications-view-title">Comunicaciones</h3><p>Los mensajes públicos se consultan desde el botón del encabezado. La bandeja privada permanece desactivada hasta que exista configuración legítima.</p><div className="evidence-callout"><strong>No es un canal de emergencias.</strong><span>Ante peligro inmediato, usá 911, 103 o canales oficiales.</span></div></section>}
        {view === 'demo' && <section aria-labelledby="demo-view-title"><h3 id="demo-view-title">Acerca del modo demo</h3><p>Los niveles, umbrales, lugares y proyecciones son fixtures demostrativos. La banda proyectada expresa incertidumbre y se ensancha con el tiempo; no es una medición ni una orden de evacuación.</p><div className="demo-facts"><span>API pública: sólo lectura</span><span>Fuentes externas: ninguna</span><span>Tracking: desactivado</span><span>Estado: no oficial</span></div><p><a href="/api/health">Comprobar estado de la API</a></p></section>}
      </div>
      <button className="ui-button ui-button--primary dialog-done" type="button" onClick={onClose}><span className="ui-button__label">Entendido</span></button>
    </dialog>
  );
}
