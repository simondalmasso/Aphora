import type { OfficialAlert, Snapshot } from '../../../domain/snapshot';
import { ageMinutes, formatLocalDateTime } from '../../../domain/public-safety';

function statusContent(snapshot: Snapshot): { title: string; detail: string; level: 'critical' | 'attention' | 'neutral'; role?: 'alert' } {
  switch (snapshot.alertStatus) {
    case 'ALERTA_OFICIAL_ACTIVA':
      return { title: 'Alerta oficial activa', detail: 'Hay una advertencia oficial vigente que incluye a Santa Fe.', level: 'critical', role: 'alert' };
    case 'SIN_ALERTAS_OFICIALES_DETECTADAS':
      return { title: 'Sin alertas oficiales detectadas', detail: 'El canal automático de alertas fue consultado y está vigente. Esto no equivale a ausencia de riesgo.', level: 'neutral' };
    case 'VERIFICACION_DE_ALERTAS_DEGRADADA':
      return { title: 'Verificación de alertas demorada', detail: 'El canal automático responde con información cuya vigencia es limitada. Verificá la fuente oficial.', level: 'attention' };
    default:
      return { title: 'Fuentes de alertas no disponibles', detail: 'No es posible confirmar automáticamente si existen alertas vigentes. Consultá los canales oficiales.', level: 'attention', role: 'alert' };
  }
}

function AlertCard({ alert, generatedAt }: { readonly alert: OfficialAlert; readonly generatedAt: string }) {
  const age = ageMinutes(alert.sent, generatedAt);
  return <article className="official-alert-card">
    <div className="official-alert-card__meta">
      <span>{alert.sender}</span>
      <span>{alert.lifecycle === 'UPDATED' ? 'Actualizada' : alert.lifecycle === 'CANCELLED' ? 'Cancelada' : alert.lifecycle === 'EXPIRED' ? 'Vencida' : 'Activa'}</span>
    </div>
    <h2>{alert.headline}</h2>
    <dl className="alert-facts">
      <div><dt>Área</dt><dd>{alert.area || 'Área no especificada por el emisor'}</dd></div>
      <div><dt>Emitida</dt><dd>{formatLocalDateTime(alert.sent)}{age === null ? '' : ` · hace ${age} min`}</dd></div>
      <div><dt>Válida hasta</dt><dd>{formatLocalDateTime(alert.expires)}</dd></div>
      <div><dt>Nivel</dt><dd>{alert.severity} · {alert.urgency} · {alert.certainty}</dd></div>
    </dl>
    {alert.instruction && <div className="official-instruction"><strong>Instrucción del organismo</strong><p>{alert.instruction}</p></div>}
    {!alert.instruction && alert.description && <p>{alert.description}</p>}
    <a className="text-link" href={alert.sourceUrl} target="_blank" rel="noreferrer">Ver aviso en la fuente oficial</a>
  </article>;
}

export function OfficialAlertPanel({ snapshot, onSources }: { readonly snapshot: Snapshot; readonly onSources: (opener?: HTMLButtonElement | null) => void }) {
  const content = statusContent(snapshot);
  const active = (snapshot.alerts ?? []).filter((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
  const source = snapshot.sources.find((item) => item.id === 'smn-alerts');
  return <section className={`official-alert official-alert--${content.level}`} aria-labelledby="official-alert-title" role={content.role}>
    <div className="official-alert__status">
      <span className="status-symbol" aria-hidden="true">{content.level === 'critical' ? '!' : content.level === 'attention' ? 'i' : '✓'}</span>
      <div>
        <p className="section-kicker">Alertas oficiales</p>
        <h1 id="official-alert-title">{content.title}</h1>
        <p>{content.detail}</p>
      </div>
    </div>
    {active.map((alert) => <AlertCard key={alert.identifier} alert={alert} generatedAt={snapshot.generatedAt}/>) }
    <div className="official-alert__footer">
      <div>
        <span>Última consulta</span>
        <strong>{formatLocalDateTime(source?.fetchedAt ?? source?.lastCheckedAt ?? snapshot.generatedAt)}</strong>
      </div>
      <button type="button" className="button button--secondary" onClick={(event) => onSources(event.currentTarget)}>Fuentes y actualización</button>
    </div>
  </section>;
}
