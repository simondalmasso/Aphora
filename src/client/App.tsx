import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { RainChart } from './components/Charts';
import { DetailsDialog } from './components/DetailsDialog';
import { MessagesPanel } from './components/MessagesPanel';
import { ParanaPulse } from './components/ParanaPulse';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';

function DirectionIcon({ direction }: { readonly direction: 'UP' | 'DOWN' | 'NEW' | 'SAME' | 'UNKNOWN' }) {
  return <span className={`change-icon change-icon--${direction.toLowerCase()}`} aria-hidden="true">{direction === 'UP' ? '↗' : direction === 'DOWN' ? '↘' : direction === 'NEW' ? '+' : direction === 'SAME' ? '–' : '?'}</span>;
}

export default function App() {
  const { snapshot, online, savedAt, refresh, refreshing, lastSuccessAt, refreshError } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagesSeen, setMessagesSeen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const messagesButtonRef = useRef<HTMLButtonElement>(null);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);
  const unread = messagesSeen ? 0 : messages.length;
  const activeShelters = snapshot.shelters.filter((shelter) => shelter.status === 'ACTIVE' || shelter.status === 'LIMITED_CAPACITY');

  function openMessages() {
    setMessagesSeen(true);
    setMessagesOpen(true);
  }

  function closeDetails() {
    setDetailsOpen(false);
    requestAnimationFrame(() => detailsButtonRef.current?.focus());
  }

  async function shareStatusSnapshot() {
    const deltaCentimetres = Math.round(snapshot.river.delta24h * 100);
    const text = `${snapshot.stateLabel}: ${snapshot.river.currentMetres.toFixed(2)} m, ${deltaCentimetres >= 0 ? '+' : ''}${deltaCentimetres} cm en 24 h. DEMO / NO OFICIAL.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Pulso del Paraná · SOS Santa Fe', text, url: window.location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        setShareStatus('Enlace copiado');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('No se pudo compartir');
    }
  }

  return (
    <>
      <a className="skip-link" href="#main">Saltar al estado actual</a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="SOS Santa Fe, inicio"><span className="brand-mark" aria-hidden="true">SF</span><span>SOS Santa Fe</span></a>
          <div className="header-meta">
            <span className={`connection ${online ? 'connection--online' : 'connection--offline'}`} role="status" aria-label={online ? 'Conexión disponible' : 'Sin conexión'} title={online ? 'Conexión disponible' : 'Sin conexión'}><span aria-hidden="true" /></span>
            <button className="header-icon-button" type="button" onClick={() => void refresh()} disabled={refreshing} aria-label="Actualizar estado" title="Actualizar estado">
              <svg className={refreshing ? 'is-spinning' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.4 6.6L20 9M4 15l1.6 2.4A7 7 0 0 0 17.9 15" /></svg>
            </button>
            <button ref={messagesButtonRef} className="header-icon-button" type="button" onClick={openMessages} aria-label="Abrir mensajes" aria-describedby={unread > 0 ? 'unread-count' : undefined} aria-haspopup="dialog" title="Mensajes">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H9l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></svg>
              {unread > 0 && <><span className="unread-badge" aria-hidden="true">{Math.min(unread, 9)}</span><span id="unread-count" className="sr-only">{unread} mensajes sin leer</span></>}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="dashboard">
        <ParanaPulse
          snapshot={snapshot}
          refreshToken={lastSuccessAt}
          online={online}
          savedAt={savedAt}
          refreshing={refreshing}
          refreshError={refreshError}
          evidenceButtonRef={detailsButtonRef}
          onEvidence={() => setDetailsOpen(true)}
          onShare={() => void shareStatusSnapshot()}
          shareStatus={shareStatus}
        />

        <section className="important-card card" aria-labelledby="important-heading" data-primary-section="true">
          <div className="card-head"><div><span className="eyebrow">Resumen</span><h2 id="important-heading">Lo importante ahora</h2></div></div>
          <div className="important-signals">
            <div><DirectionIcon direction={snapshot.changes[0]?.direction ?? 'UNKNOWN'} /><span><strong>Cambio del río</strong>{snapshot.changes[0]?.detail ?? 'Sin cambios disponibles'}</span></div>
            <div><span className="signal-icon signal-icon--rain" aria-hidden="true">◌</span><span><strong>Lluvia en 24 h</strong>{snapshot.rain.accumulated24hMm.toFixed(1)} mm acumulados en el escenario</span></div>
            <div><span className="signal-icon signal-icon--outlook" aria-hidden="true">◇</span><span><strong>Próximas 24 h</strong>Ascenso proyectado con incertidumbre creciente</span></div>
          </div>
        </section>

        <section className="action-card card" aria-labelledby="action-heading" data-primary-section="true">
          <div className="card-head"><div><span className="eyebrow">Recomendación</span><h2 id="action-heading">Qué hacer ahora</h2></div></div>
          <p className="action-summary">{snapshot.recommendedAction}</p>
          <div className="quick-actions" aria-label="Pasos concretos">
            {snapshot.actions.slice(0, 2).map((action) => <span key={action}>✓ {action}</span>)}
          </div>
          <p className="official-note">Ante peligro inmediato, usá canales oficiales. Esta web no reemplaza al 911 ni al 103.</p>
        </section>

        <details className="more-details card" data-testid="more-information">
          <summary>Más información <span aria-hidden="true">＋</span></summary>
          <div className="more-content">
            <section aria-labelledby="all-changes-heading">
              <h3 id="all-changes-heading">Cambios completos</h3>
              <div className="changes-list">
                {snapshot.changes.map((change) => <div className="change-item" key={change.id}><DirectionIcon direction={change.direction} /><div><strong>{change.label}</strong><span>{change.detail}</span></div></div>)}
              </div>
            </section>
            <section aria-labelledby="rain-detail-heading">
              <h3 id="rain-detail-heading">Lluvia detallada</h3>
              <div className="rain-metrics"><div><strong>{snapshot.rain.accumulated1hMm.toFixed(1)}</strong><span>mm · 1 h</span></div><div><strong>{snapshot.rain.accumulated24hMm.toFixed(1)}</strong><span>mm · 24 h</span></div></div>
              <RainChart points={snapshot.rain.points} />
              <p className="forecast">{snapshot.rain.forecast}</p>
            </section>
            <section aria-labelledby="tension-heading">
              <h3 id="tension-heading">Señales en tensión</h3>
              {snapshot.contradictions.map((contradiction) => <div key={contradiction.id}><div className="signal-stack">{contradiction.signals.map((signal, index) => <div key={signal}><span aria-hidden="true">{index === 0 ? '◇' : index === 1 ? '∿' : '○'}</span>{signal}</div>)}</div><p className="contradiction-result">{contradiction.explanation}</p></div>)}
            </section>
            {activeShelters.length === 0 && snapshot.shelters.length > 0 && (
              <section aria-labelledby="demo-points-heading" className="demo-points">
                <h3 id="demo-points-heading">Puntos demostrativos</h3>
                <p className="place-warning">No hay refugios activos. Estas ubicaciones son ficticias y sólo se muestran a pedido.</p>
                <div className="places-list">{snapshot.shelters.map((shelter) => <div key={shelter.id}><span className="place-icon" aria-hidden="true">⌖</span><div><strong>{shelter.name}</strong><span>{shelter.status.replaceAll('_', ' ')} · {shelter.address}</span></div></div>)}</div>
              </section>
            )}
          </div>
        </details>
      </main>

      <footer className="app-footer"><p>{snapshot.emergencyDisclaimer}</p><p><a href="/api/health">API</a><span>·</span><a href="/lite">Modo lite</a><span>·</span>Sin trackers</p></footer>
      <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={closeDetails} />
      <MessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef} />
    </>
  );
}
