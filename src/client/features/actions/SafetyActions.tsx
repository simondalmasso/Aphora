import type { RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot';

const CONTACTS = Object.freeze([
  { number: '911', label: 'Emergencias', href: 'tel:911' },
  { number: '103', label: 'COBEM', href: 'tel:103' },
  { number: '107', label: 'Emergencias médicas', href: 'tel:107' },
  { number: '100', label: 'Bomberos', href: 'tel:100' },
  { number: '106', label: 'Emergencias náuticas', href: 'tel:106' },
]);

export function SafetyActions({ snapshot, reportButtonRef, onReport }: { readonly snapshot: Snapshot; readonly reportButtonRef: RefObject<HTMLButtonElement | null>; readonly onReport: (opener?: HTMLButtonElement | null) => void }) {
  return <section className="safety-actions" aria-labelledby="actions-title">
    <div className="section-heading"><div><p className="section-kicker">Acciones</p><h2 id="actions-title">Qué hacer ahora</h2></div></div>
    <div className="action-origin"><span>Origen: {snapshot.alertStatus === 'ALERTA_OFICIAL_ACTIVA' ? 'instrucción oficial' : 'recomendación preventiva general'}</span><p>{snapshot.recommendedAction}</p></div>
    <div className="emergency-callout" role="note"><strong>¿Existe peligro inmediato?</strong><p>Llamá al servicio de emergencias correspondiente. Reportar una situación no inicia un despacho de emergencia.</p></div>
    <div className="contact-grid">{CONTACTS.map((contact) => <a href={contact.href} key={contact.number}><strong>{contact.number}</strong><span>{contact.label}</span></a>)}</div>
    <div className="report-action"><div><h3>Reporte ciudadano</h3><p>Podés guardar una observación para revisión de SOS Santa Fe. No modifica automáticamente el estado público.</p></div><button ref={reportButtonRef} type="button" className="button button--primary" onClick={(event) => onReport(event.currentTarget)}>Reportar una situación</button></div>
  </section>;
}
