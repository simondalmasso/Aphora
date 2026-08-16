import type { RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot.ts';
import { ESSENTIAL_CONTACTS } from '../../../domain/essential-contacts.ts';

function alertSummary(snapshot: Snapshot): string {
  if (snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA') return 'Ver alerta oficial activa';
  if (snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS') return 'Sin alertas oficiales detectadas';
  return 'Verificación de alertas no disponible';
}

export function SafetyActions({
  snapshot,
  reportButtonRef,
  onAlerts,
  onReport,
}: {
  readonly snapshot: Snapshot;
  readonly reportButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onAlerts: (opener?: HTMLButtonElement | null) => void;
  readonly onReport: (opener?: HTMLButtonElement | null) => void;
}) {
  return <section id="alertas" className="safety-actions" aria-labelledby="actions-title">
    <header className="compact-section-heading">
      <div><p className="section-kicker">Si necesitás actuar</p><h2 id="actions-title">Alertas, ayuda y reportes</h2><p>Los canales esenciales siguen a un toque, sin convertir la pantalla normal en una alarma.</p></div>
      <button type="button" className="button button--secondary" onClick={(event) => onAlerts(event.currentTarget)}>{alertSummary(snapshot)}</button>
    </header>
    <div className="contact-grid">
      {ESSENTIAL_CONTACTS.map((contact, index) => <a className={index === 0 ? 'contact-grid__primary' : undefined} href={contact.href} key={contact.id}><strong>{contact.number}</strong><span>{contact.label}</span></a>)}
    </div>
    <details className="secondary-actions">
      <summary>Reportar una situación o ver más opciones</summary>
      <div><p>Los reportes ciudadanos se revisan. Nunca cambian automáticamente el estado público ni crean una alerta.</p><button ref={reportButtonRef} type="button" className="button button--secondary" onClick={(event) => onReport(event.currentTarget)}>Enviar un reporte</button></div>
    </details>
  </section>;
}
