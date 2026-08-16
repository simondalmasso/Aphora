import { deriveFloodSituation } from '../../../domain/flood-situation.ts';
import { ESSENTIAL_CONTACTS } from '../../../domain/essential-contacts.ts';
import type { Snapshot } from '../../../domain/snapshot.ts';
import { formatHumanAge } from '../../../domain/public-safety.ts';
import { SituationMapGate } from './SituationMapGate.tsx';

const SIGNAL_LABELS = Object.freeze({
  OFFICIAL_HYDROMETRIC_OBSERVATION: 'Hidrometría oficial',
  OFFICIAL_PROTECTION_REFERENCE_REACHED: 'Referencia de protección alcanzada',
  RAPID_CHANGE_OBSERVED: 'Cambio observado',
  OFFICIAL_WEATHER_ALERT: 'Alerta meteorológica oficial',
  OFFICIAL_FLOOD_OR_CIVIL_PROTECTION_ALERT: 'Alerta hídrica oficial',
  MODEL_FLOOD_SIGNAL: 'Modelo suplementario',
  HEAVY_RAIN_CONTEXT: 'Lluvia en contexto',
  OFFICIAL_RISK_AREA_CONTEXT: 'Riesgo territorial oficial',
  SOURCE_DEGRADED: 'Verificación limitada',
  COMMUNITY_REPORT_CONTEXT: 'Reporte comunitario',
});

export function FloodSituationPanel({ snapshot }: { readonly snapshot: Snapshot }) {
  const decision = deriveFloodSituation(snapshot);
  const relevant = decision.state !== 'ROUTINE';
  const activeSignals = decision.signals.filter((signal) => signal.active && signal.kind !== 'OFFICIAL_HYDROMETRIC_OBSERVATION');
  return <section className={`flood-situation flood-situation--${decision.state.toLowerCase()}`} data-testid="flood-situation" data-flood-state={decision.state} aria-labelledby="flood-situation-title">
    <header className="flood-situation__header">
      <div><span className="section-kicker">Situación de inundación</span><h2 id="flood-situation-title">{decision.displayLabel}</h2><p>{decision.explanation}</p></div>
      <span className="flood-situation__truth">Sin inferir emergencia</span>
    </header>
    {activeSignals.length > 0 && <details className="flood-situation__signals">
      <summary>Por qué se muestra así</summary>
      <div>{activeSignals.map((signal) => <article key={signal.id} data-signal-kind={signal.kind}>
        <strong>{SIGNAL_LABELS[signal.kind]}</strong>
        <p>{signal.explanation}</p>
        <small>{signal.organization} · {signal.observedAt ? `observado ${formatHumanAge(signal.observedAt, snapshot.generatedAt)}` : 'sin hora de observación'} · {signal.sourceRole.replaceAll('_', ' ').toLowerCase()}</small>
      </article>)}</div>
    </details>}
    {relevant && <details className="flood-situation__guidance">
      <summary>Qué conviene hacer con esta información</summary>
      <ol>
        <li>Revisá la medición y su vigencia antes de comparar valores.</li>
        <li>Si hay una alerta oficial, seguí sus indicaciones y área de aplicación.</li>
        <li>El mapa de riesgo territorial es contexto estático: no confirma una calle inundada ahora.</li>
      </ol>
      <div className="flood-situation__contacts">{ESSENTIAL_CONTACTS.slice(0, 2).map((contact) => <a key={contact.id} href={contact.href}><span>{contact.label}</span><strong>{contact.number}</strong></a>)}</div>
    </details>}
    <SituationMapGate snapshot={snapshot}/>
  </section>;
}
