import { useEffect, useRef } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { sourceAgeLabel } from '../../domain/sources';

function formatEvidenceDate(iso: string) {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso));
}

export function DetailsDialog({ snapshot, open, onClose }: { readonly snapshot: Snapshot; readonly open: boolean; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="details-dialog" aria-labelledby="details-title" onClose={onClose}>
      <div className="dialog-head">
        <div><span className="eyebrow">Evidencia del snapshot</span><h2 id="details-title">Fuentes y vigencia</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar detalles">×</button>
      </div>
      <p className="dialog-lead">Cada señal conserva su origen y antigüedad. Ninguna fuente de esta V1 es real u oficial.</p>
      <div className="source-detail-list">
        {snapshot.sources.map((source) => (
          <article key={source.id} className="source-detail">
            <div><span className={`source-dot source-dot--${source.status.toLowerCase()}`} aria-hidden="true" /><strong>{source.name}</strong></div>
            <p>{source.contribution}</p>
            <small>{source.kind.replaceAll('_', ' ')} · {sourceAgeLabel(source.observedAt, snapshot.generatedAt)} · actualizado {formatEvidenceDate(source.observedAt)} · vigencia hasta {formatEvidenceDate(source.validUntil)}</small>
            <code>{source.id}</code>
          </article>
        ))}
      </div>
      <section className="dialog-section" aria-labelledby="contradictions-title">
        <h3 id="contradictions-title">Contradicciones</h3>
        {snapshot.contradictions.map((contradiction) => (
          <div key={contradiction.id} className="dialog-contradiction">
            <strong>{contradiction.title}</strong>
            <ul>{contradiction.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
            <p>{contradiction.explanation}</p>
          </div>
        ))}
      </section>
      <section className="dialog-section" aria-labelledby="uncertainty-title">
        <h3 id="uncertainty-title">Cómo leer la incertidumbre</h3>
        <p>La proyección muestra un rango que se ensancha con el tiempo. No es una medición ni una orden de evacuación.</p>
      </section>
      <section className="dialog-section" aria-labelledby="api-title">
        <h3 id="api-title">Estado de la API</h3>
        <p>Las rutas públicas son de sólo lectura. <a href="/api/health">Comprobar salud</a>.</p>
      </section>
      <button className="primary-button" type="button" onClick={onClose}>Entendido</button>
    </dialog>
  );
}
