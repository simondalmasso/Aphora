import { useEffect, useRef } from 'react';
import type { OfficialAlert, Snapshot } from '../../../domain/snapshot.ts';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety.ts';

function activeOfficialAlert(snapshot: Snapshot): OfficialAlert | undefined {
  if (snapshot.alertStatus !== 'ALERTA_OFICIAL_ACTIVA') return undefined;
  return (snapshot.alerts ?? []).find((alert) =>
    alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
}

function statusCopy(snapshot: Snapshot): { title: string; detail: string } {
  if (snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS') {
    return {
      title: 'Canal de alertas verificado',
      detail: 'La última consulta automática no detectó alertas oficiales vigentes para Santa Fe.',
    };
  }
  if (snapshot.alertStatus === 'VERIFICACION_DE_ALERTAS_DEGRADADA') {
    return {
      title: 'Verificación de alertas demorada',
      detail: 'La vigencia del canal automático es limitada. El estado hidrométrico permanece visible por separado.',
    };
  }
  return {
    title: 'Alertas sin verificar',
    detail: 'No se pudo confirmar automáticamente el canal de alertas. Esto no modifica ni oculta las mediciones hidrométricas.',
  };
}

export function VerifiedAlertBanner({
  snapshot,
  onOpen,
}: {
  readonly snapshot: Snapshot;
  readonly onOpen: (opener?: HTMLButtonElement | null) => void;
}) {
  const alert = activeOfficialAlert(snapshot);
  if (!alert) return null;
  return <aside className="verified-alert-banner" role="alert" aria-label="Alerta oficial vigente">
    <div>
      <span>Alerta oficial vigente</span>
      <strong>{alert.headline}</strong>
      <small>{alert.area || 'Área indicada por el organismo'} · hasta {formatLocalDateTime(alert.expires)}</small>
    </div>
    <button type="button" className="button button--alert" onClick={(event) => onOpen(event.currentTarget)}>
      Ver detalle
    </button>
  </aside>;
}

export function AlertDetailsDialog({
  snapshot,
  open,
  onClose,
}: {
  readonly snapshot: Snapshot;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const alert = activeOfficialAlert(snapshot);
  const source = snapshot.sources.find((item) => item.id === 'smn-alerts');
  const copy = statusCopy(snapshot);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return <dialog
    ref={ref}
    className="alert-dialog"
    aria-labelledby="alert-dialog-title"
    onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="dialog-surface">
      <header className="dialog-head">
        <div><p className="section-kicker">Alertas oficiales</p><h2 id="alert-dialog-title">{alert?.headline ?? copy.title}</h2></div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="Cerrar alertas">×</button>
      </header>
      {alert ? <div className="alert-detail">
        <dl>
          <div><dt>Área</dt><dd>{alert.area || 'No especificada'}</dd></div>
          <div><dt>Emitida</dt><dd>{formatLocalDateTime(alert.sent)} · {formatHumanAge(alert.sent, snapshot.generatedAt)}</dd></div>
          <div><dt>Vigente hasta</dt><dd>{formatLocalDateTime(alert.expires)}</dd></div>
          <div><dt>Organismo</dt><dd>{alert.sender}</dd></div>
        </dl>
        <section><h3>Indicación publicada</h3><p>{alert.instruction || alert.description || 'Consultá el aviso completo del organismo.'}</p></section>
        <a className="button button--alert" href={alert.sourceUrl} target="_blank" rel="noreferrer">Abrir alerta oficial</a>
      </div> : <div className="alert-detail">
        <p>{copy.detail}</p>
        <dl>
          <div><dt>Última consulta</dt><dd>{formatLocalDateTime(source?.fetchedAt ?? source?.lastCheckedAt ?? snapshot.generatedAt)}</dd></div>
          <div><dt>Estado del feed</dt><dd>{source?.feedName ?? source?.name ?? 'Canal de alertas no publicado'}</dd></div>
          <div><dt>Error o limitación</dt><dd>{source?.limitations || 'Sin detalle adicional publicado.'}</dd></div>
        </dl>
        {source?.url && <a className="button button--secondary" href={source.url} target="_blank" rel="noreferrer">Abrir canal oficial</a>}
      </div>}
      <button className="button button--primary" type="button" onClick={onClose}>Cerrar</button>
    </div>
  </dialog>;
}
