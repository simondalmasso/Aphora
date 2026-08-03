import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { sourceAgeLabel } from '../domain/sources';
import { RainChart } from './components/Charts';
import { DetailsDialog } from './components/DetailsDialog';
import { MessagesPanel } from './components/MessagesPanel';
import { ParanaPulse } from './components/ParanaPulse';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso));
}

function DirectionIcon({ direction }: { readonly direction: 'UP' | 'DOWN' | 'NEW' | 'SAME' | 'UNKNOWN' }) {
  return <span className={`change-icon change-icon--${direction.toLowerCase()}`} aria-hidden="true">{direction === 'UP' ? '↗' : direction === 'DOWN' ? '↘' : direction === 'NEW' ? '+' : direction === 'SAME' ? '–' : '?'}</span>;
}

export default function App() {
  const { snapshot, online, savedAt, refresh, refreshing, lastSuccessAt, refreshError } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagesSeen, setMessagesSeen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const messagesButtonRef = useRef<HTMLButtonElement>(null);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);
  const unread = messagesSeen ? 0 : messages.length;

  function openMessages() {
    setMessagesSeen(true);
    setMessagesOpen(true);
  }

  async function shareStatusSnapshot() {
    const text = `${snapshot.stateLabel}: ${snapshot.river.currentMetres.toFixed(2)} m, ${Math.round(snapshot.river.delta24h * 100) >= 0 ? '+' : ''}${Math.round(snapshot.river.delta24h * 100)} cm en 24 h. DEMO / NO OFICIAL.`;
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
            <span className={`connection ${online ? 'connection--online' : 'connection--offline'}`}><span aria-hidden="true" />{online ? 'En línea' : 'Sin conexión'}</span>
            <a href="/lite" className="lite-link">Modo lite</a>
            <button className="header-icon-button" type="button" onClick={() => void refresh()} disabled={refreshing} aria-label={refreshing ? 'Actualizando datos' : 'Actualizar datos'} title="Actualizar datos">
              <svg className={refreshing ? 'is-spinning' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.4 6.6L20 9M4 15l1.6 2.4A7 7 0 0 0 17.9 15" /></svg>
            </button>
            <button ref={messagesButtonRef} className="header-icon-button" type="button" onClick={openMessages} aria-label={unread > 0 ? `Abrir comunicaciones, ${unread} sin leer` : 'Abrir comunicaciones'} aria-haspopup="dialog" title="Comunicaciones">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H9l-4 3V5Z" /><path d="M8 9h8M8 12h5" /></svg>
              {unread > 0 && <span className="unread-badge" aria-hidden="true">{Math.min(unread, 9)}</span>}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="dashboard">
        <div className="demo-banner" role="note"><strong>DEMO / NO OFICIAL</strong><span>Datos, cifras y lugares ficticios</span></div>
        <div className={`refresh-status ${refreshError ? 'refresh-status--error' : ''}`} role="status" aria-live="polite">
          {refreshing ? 'Actualizando snapshot, fuentes y mensajes…' : refreshError ?? (lastSuccessAt ? `Última actualización correcta: ${formatDate(lastSuccessAt)}` : 'Snapshot demostrativo incluido en la app')}
        </div>
        {!online && (
          <div className="offline-banner" role="status">
            <strong>Snapshot offline</strong> · guardado {savedAt ? formatDate(savedAt) : 'sin timestamp de red'}. No es el estado actual.
          </div>
        )}

        <ParanaPulse key={lastSuccessAt ?? 'bundled-pulse'} snapshot={snapshot} refreshToken={lastSuccessAt} />

        <section className="change-card card" aria-labelledby="changes-heading">
          <div className="card-head"><div><span className="eyebrow">Desde el snapshot anterior</span><h2 id="changes-heading">Qué cambió</h2></div><span className="mini-time">1 hora</span></div>
          <div className="changes-list">
            {snapshot.changes.slice(0, 4).map((change) => <div className="change-item" key={change.id}><DirectionIcon direction={change.direction} /><div><strong>{change.label}</strong><span>{change.detail}</span></div></div>)}
          </div>
        </section>

        <section className="rain-card card" aria-labelledby="rain-heading">
          <div className="card-head"><div><span className="eyebrow">Pluviómetro demo</span><h2 id="rain-heading">Lluvia acumulada</h2></div><span className="source-state"><i />Fresco</span></div>
          <div className="rain-metrics"><div><strong>{snapshot.rain.accumulated1hMm.toFixed(1)}</strong><span>mm · 1 h</span></div><div><strong>{snapshot.rain.accumulated24hMm.toFixed(1)}</strong><span>mm · 24 h</span></div></div>
          <RainChart points={snapshot.rain.points} />
          <p className="forecast">{snapshot.rain.forecast}</p>
        </section>

        <section className="sources-card card" aria-labelledby="sources-heading">
          <div className="card-head"><div><span className="eyebrow">Provenance visible</span><h2 id="sources-heading">Fuentes</h2></div><button className="text-button" type="button" onClick={() => setDetailsOpen(true)}>Detalle</button></div>
          <div className="source-list">
            {snapshot.sources.map((source) => <div className="source-item" key={source.id}><span className={`source-dot source-dot--${source.status.toLowerCase()}`} aria-label={source.status} /><div><strong>{source.name}</strong><span>{sourceAgeLabel(source.observedAt, snapshot.generatedAt)} · {source.contribution}</span></div></div>)}
          </div>
          <div className="source-actions">
            <button type="button" onClick={() => void shareStatusSnapshot()} aria-label="Compartir estado demo"><span aria-hidden="true">↗</span> Compartir</button>
            <a href="/lite">Modo lite</a>
            {shareStatus && <span role="status">{shareStatus}</span>}
          </div>
        </section>

        <section className="contradiction-card card" aria-labelledby="outlook-heading">
          <div className="card-head"><div><span className="eyebrow">Próximas 24 horas · escenario demo</span><h2 id="outlook-heading">Qué puede pasar</h2></div><span className="watch-badge">VIGILANCIA</span></div>
          {snapshot.contradictions.map((contradiction) => <div key={contradiction.id}><div className="signal-stack">{contradiction.signals.map((signal, index) => <div key={signal}><span aria-hidden="true">{index === 0 ? '◇' : index === 1 ? '∿' : '○'}</span>{signal}</div>)}</div><p className="contradiction-result">{contradiction.explanation}</p></div>)}
        </section>

        <section className="communications-card card" aria-labelledby="communications-heading">
          <div className="card-head"><div><span className="eyebrow">Read-only · prioridad + TTL</span><h2 id="communications-heading">Comunicaciones críticas</h2></div><span className="count-badge">{messages.length}</span></div>
          <div className="message-list">
            {messages.map((message) => <article className="message" key={message.id}><span className={`priority priority--${message.priority}`} aria-label={`Prioridad ${message.priority}`} /><div><div className="message-title"><strong>{message.title}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time></div><p>{message.body}</p><small>{message.sourceId} · vence {formatDate(message.expiresAt)}</small></div></article>)}
          </div>
        </section>

        <section className="places-card card" aria-labelledby="action-heading">
          <div className="card-head"><div><span className="eyebrow">Acción recomendada primero</span><h2 id="action-heading">Qué hacer ahora</h2></div><span className="inactive-badge">0 refugios activos</span></div>
          <p className="action-summary">{snapshot.recommendedAction}</p>
          <p className="place-warning">No concurrir: estas ubicaciones son sólo demostrativas.</p>
          <div className="quick-actions"><strong>Pasos concretos</strong>{snapshot.actions.map((action) => <span key={action}>✓ {action}</span>)}</div>
          <div className="places-details"><strong>Puntos demo preidentificados</strong><div className="places-list">{snapshot.shelters.map((shelter) => <div key={shelter.id}><span className="place-icon" aria-hidden="true">⌖</span><div><strong>{shelter.name}</strong><span>{shelter.status.replaceAll('_', ' ')} · {shelter.address}</span></div></div>)}</div></div>
        </section>
      </main>

      <footer className="app-footer"><p>{snapshot.emergencyDisclaimer}</p><p><a href="/api/health">API</a><span>·</span><a href="/lite">Lite</a><span>·</span>Sin trackers ni fuentes externas</p></footer>
      <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <MessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef} />
    </>
  );
}
