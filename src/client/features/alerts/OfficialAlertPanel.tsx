import type { OfficialAlert, Snapshot } from '../../../domain/snapshot';
import { formatHumanAge, formatLocalDateTime } from '../../../domain/public-safety';

function statusContent(snapshot: Snapshot): { title: string; detail: string; level: 'critical' | 'attention' | 'neutral'; role?: 'alert' } {
  switch (snapshot.alertStatus) {
    case 'ALERTA_OFICIAL_ACTIVA':
      return { title: 'Alerta oficial activa', detail: 'Hay una advertencia oficial vigente que incluye a Santa Fe.', level: 'critical', role: 'alert' };
    case 'SIN_ALERTAS_OFICIALES_DETECTADAS':
      return { title: 'Sin alertas oficiales detectadas', detail: 'El canal automático fue consultado y continúa vigente. Esto no equivale a ausencia de riesgo.', level: 'neutral' };
    case 'VERIFICACION_DE_ALERTAS_DEGRADADA':
      return { title: 'Verificación de alertas demorada', detail: 'La consulta automática tiene vigencia limitada. Confirmá la situación en el canal oficial.', level: 'attention' };
    default:
      return { title: 'No se pudieron verificar alertas', detail: 'No es posible confirmar automáticamente si existen alertas vigentes. Consultá los canales oficiales.', level: 'attention', role: 'alert' };
  }
}

function ActiveAlert({ alert, generatedAt }: { readonly alert: OfficialAlert; readonly generatedAt: string }) {
  return <>
    <div className="official-alert__copy">
      <p className="section-kicker">Alerta oficial</p>
      <h1 id="official-alert-title">{alert.headline}</h1>
      <p className="official-alert__area">{alert.area || 'Área no especificada por el organismo'}</p>
    </div>
    <div className="official-alert__times">
      <span><strong>Emitida</strong>{formatLocalDateTime(alert.sent)} · {formatHumanAge(alert.sent, generatedAt)}</span>
      <span><strong>Vigente hasta</strong>{formatLocalDateTime(alert.expires)}</span>
    </div>
    <div className="official-alert__instruction">
      <strong>Qué indica el organismo</strong>
      <p>{alert.instruction || alert.description || 'Consultá el aviso oficial para conocer las indicaciones vigentes.'}</p>
    </div>
    <a className="button button--alert" href={alert.sourceUrl} target="_blank" rel="noreferrer">Ver alerta oficial</a>
  </>;
}

export function OfficialAlertPanel({ snapshot }: { readonly snapshot: Snapshot }) {
  const content = statusContent(snapshot);
  const active = snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA'
    ? (snapshot.alerts ?? []).find((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'))
    : undefined;
  const source = snapshot.sources.find((item) => item.id === 'smn-alerts');
  return <section className={`official-alert official-alert--${content.level}`} aria-labelledby="official-alert-title" role={content.role}>
    {active ? <ActiveAlert alert={active} generatedAt={snapshot.generatedAt}/> : <>
      <div className="official-alert__copy">
        <p className="section-kicker">Alertas oficiales</p>
        <h1 id="official-alert-title">{content.title}</h1>
        <p>{content.detail}</p>
      </div>
      <div className="official-alert__check"><strong>Última consulta</strong><span>{formatLocalDateTime(source?.fetchedAt ?? source?.lastCheckedAt ?? snapshot.generatedAt)}</span></div>
      {source?.url && <a className="button button--secondary" href={source.url} target="_blank" rel="noreferrer">Abrir canal oficial</a>}
    </>}
  </section>;
}
