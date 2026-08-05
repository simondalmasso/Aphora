import { useEffect, useRef } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { formatLocalDateTime } from '../../domain/public-safety';

export function DetailsDialog({ snapshot, open, onClose }: { readonly snapshot: Snapshot; readonly open: boolean; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className="details-dialog" aria-labelledby="details-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-surface">
      <header className="dialog-head"><div><p className="section-kicker">Transparencia pública</p><h2 id="details-title">Fuentes y actualización</h2></div><button className="icon-close" type="button" onClick={onClose} aria-label="Cerrar fuentes y actualización">×</button></header>
      <p>La disponibilidad técnica, la fecha de consulta y la fecha de observación son conceptos distintos. La información agregada no se presenta como una instrucción de una autoridad.</p>
      <section><h3>Mediciones por estación</h3><div className="detail-list">{(snapshot.systems ?? []).map((system) => <article key={system.id}><strong>{system.label}</strong><dl><div><dt>Nivel</dt><dd>{system.currentMetres === null ? 'No disponible' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</dd></div><div><dt>Observado</dt><dd>{formatLocalDateTime(system.observedAt)}</dd></div><div><dt>Recibido</dt><dd>{formatLocalDateTime(system.fetchedAt)}</dd></div><div><dt>Vigencia</dt><dd>{system.freshness ?? 'NO_DISPONIBLE'}</dd></div></dl></article>)}</div></section>
      <section><h3>Principios de interpretación</h3><ul><li>INA REST e INA WaterML pertenecen al mismo organismo y no son corroboraciones independientes.</li><li>Una medición por encima de un umbral no constituye una orden de evacuación.</li><li>NASA GPM se usa únicamente como señal suplementaria cuando existe una muestra local válida.</li><li>Los canales humanos oficiales se enlazan como verificación; no se simulan como feeds automáticos.</li></ul></section>
      <section><h3>Acceso técnico</h3><p><a href="/api/sources">Matriz JSON de fuentes</a> · <a href="/api/health">Estado técnico del servicio</a></p></section>
      <button className="button button--primary" type="button" onClick={onClose}>Cerrar</button>
    </div>
  </dialog>;
}
