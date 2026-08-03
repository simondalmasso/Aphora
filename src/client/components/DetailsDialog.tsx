import { useEffect, useRef } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { sourceAgeLabel } from '../../domain/sources';

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
            <small>{source.kind.replaceAll('_', ' ')} · {sourceAgeLabel(source.observedAt, snapshot.generatedAt)} · vigencia hasta {new Date(source.validUntil).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' })}</small>
          </article>
        ))}
      </div>
      <button className="primary-button" type="button" onClick={onClose}>Entendido</button>
    </dialog>
  );
}
