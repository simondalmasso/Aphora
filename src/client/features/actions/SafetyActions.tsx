import type { RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot.ts';

const CONTACTS = Object.freeze([
  { number: '911', label: 'Emergencias', href: 'tel:911' },
  { number: '103', label: 'COBEM', href: 'tel:103' },
  { number: '107', label: 'Emergencias médicas', href: 'tel:107' },
  { number: '100', label: 'Bomberos', href: 'tel:100' },
  { number: '106', label: 'Náutica', href: 'tel:106' },
]);

function alertSummary(snapshot: Snapshot): string {
  if (snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA') return 'Alerta oficial vigente';
  if (snapshot.alertStatus === 'SIN_ALERTAS_OFICIALES_DETECTADAS') return 'Canal verificado';
  return 'Alertas sin verificar';
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
      <div><p className="section-kicker">Alertas y acciones</p><h2 id="actions-title">Canales esenciales</h2></div>
      <button type="button" className="button button--secondary" onClick={(event) => onAlerts(event.currentTarget)}>
        {alertSummary(snapshot)}
      </button>
    </header>
    <div className="contact-grid">
      {CONTACTS.map((contact) => <a href={contact.href} key={contact.number}>
        <strong>{contact.number}</strong><span>{contact.label}</span>
      </a>)}
    </div>
    <details className="secondary-actions">
      <summary>Más acciones</summary>
      <div>
        <p>Los reportes ciudadanos se revisan y no modifican automáticamente el estado público.</p>
        <button ref={reportButtonRef} type="button" className="button button--secondary" onClick={(event) => onReport(event.currentTarget)}>
          Reportar una situación
        </button>
      </div>
    </details>
  </section>;
}
