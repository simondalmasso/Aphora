import { useMemo, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { sourceAgeLabel } from '../domain/sources';
import { RainChart, RiverChart } from './components/Charts';
import { DetailsDialog } from './components/DetailsDialog';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso));
}

function DirectionIcon({ direction }: { readonly direction: 'UP' | 'DOWN' | 'NEW' | 'SAME' | 'UNKNOWN' }) {
  return <span className={`change-icon change-icon--${direction.toLowerCase()}`} aria-hidden="true">{direction === 'UP' ? '↗' : direction === 'DOWN' ? '↘' : direction === 'NEW' ? '+' : direction === 'SAME' ? '–' : '?'}</span>;
}

export default function App() {
  const { snapshot, online, savedAt, source } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);

  return (
    <>
      <a className="skip-link" href="#main">Saltar al estado actual</a>
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="SOS Santa Fe, inicio"><span className="brand-mark" aria-hidden="true">SF</span><span>SOS Santa Fe</span></a>
          <div className="header-meta">
            <span className={`connection ${online ? 'connection--online' : 'connection--offline'}`}><span aria-hidden="true" />{online ? 'En línea' : 'Sin conexión'}</span>
            <a href="/lite" className="lite-link">Modo lite</a>
          </div>
        </div>
      </header>

      <main id="main" className="dashboard">
        <div className="demo-banner" role="note"><strong>DEMO / NO OFICIAL</strong><span>Datos, cifras y lugares ficticios</span></div>
        {!online && (
          <div className="offline-banner" role="status">
            <strong>Snapshot offline</strong> · guardado {savedAt ? formatDate(savedAt) : 'sin timestamp de red'}. No es el estado actual.
          </div>
        )}

        <section className="hero-card card" aria-labelledby="state-heading">
          <div className="hero-main">
            <div>
              <span className="eyebrow">Estado hídrico · escenario fijo</span>
              <div className="state-row"><span className="state-pulse" aria-hidden="true" /><h1 id="state-heading">{snapshot.stateLabel}</h1></div>
              <p className="hero-summary">{snapshot.summary}</p>
            </div>
            <div className="state-time"><span>Snapshot</span><time dateTime={snapshot.generatedAt}>{formatDate(snapshot.generatedAt)}</time><small>{source === 'NETWORK' ? 'API verificada' : source === 'OFFLINE_CACHE' ? 'Copia local' : 'Incluido en la app'}</small></div>
          </div>
          <div className="hero-lower">
            <div className="action-now"><span className="action-icon" aria-hidden="true">✓</span><div><strong>Qué hacer ahora</strong><p>{snapshot.recommendedAction}</p></div></div>
            <button className="evidence-button" type="button" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog">Ver evidencia <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <section className="change-card card" aria-labelledby="changes-heading">
          <div className="card-head"><div><span className="eyebrow">Desde el snapshot anterior</span><h2 id="changes-heading">Qué cambió</h2></div><span className="mini-time">1 hora</span></div>
          <div className="changes-list">
            {snapshot.changes.slice(0, 4).map((change) => <div className="change-item" key={change.id}><DirectionIcon direction={change.direction} /><div><strong>{change.label}</strong><span>{change.detail}</span></div></div>)}
          </div>
        </section>

        <section className="river-card card" aria-labelledby="river-heading">
          <div className="metric-head"><div><span className="eyebrow">{snapshot.river.stationName}</span><h2 id="river-heading">Nivel del río</h2></div><div className="metric-value"><strong>{snapshot.river.currentMetres.toFixed(2)}</strong><span>m</span></div></div>
          <div className="deltas" aria-label="Variaciones del nivel"><span><b>+{Math.round(snapshot.river.delta1h * 100)} cm</b> 1 h</span><span><b>+{Math.round(snapshot.river.delta6h * 100)} cm</b> 6 h</span><span><b>+{Math.round(snapshot.river.delta24h * 100)} cm</b> 24 h</span><span className="trend-chip">↗ Ascenso lento</span></div>
          <RiverChart points={snapshot.river.points} />
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
        </section>

        <section className="contradiction-card card" aria-labelledby="contradiction-heading">
          <div className="card-head"><div><span className="eyebrow">Incertidumbre preservada</span><h2 id="contradiction-heading">Señales en tensión</h2></div><span className="watch-badge">VIGILANCIA</span></div>
          {snapshot.contradictions.map((contradiction) => <div key={contradiction.id}><div className="signal-stack">{contradiction.signals.map((signal, index) => <div key={signal}><span aria-hidden="true">{index === 0 ? '◇' : index === 1 ? '∿' : '○'}</span>{signal}</div>)}</div><p className="contradiction-result">{contradiction.explanation}</p></div>)}
        </section>

        <section className="communications-card card" aria-labelledby="communications-heading">
          <div className="card-head"><div><span className="eyebrow">Read-only · prioridad + TTL</span><h2 id="communications-heading">Comunicaciones críticas</h2></div><span className="count-badge">{messages.length}</span></div>
          <div className="message-list">
            {messages.map((message) => <article className="message" key={message.id}><span className={`priority priority--${message.priority}`} aria-label={`Prioridad ${message.priority}`} /><div><div className="message-title"><strong>{message.title}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time></div><p>{message.body}</p><small>{message.sourceId} · vence {formatDate(message.expiresAt)}</small></div></article>)}
          </div>
        </section>

        <section className="places-card card" aria-labelledby="places-heading">
          <div className="card-head"><div><span className="eyebrow">Puntos ficticios</span><h2 id="places-heading">Refugios y encuentro</h2></div><span className="inactive-badge">0 activos</span></div>
          <p className="place-warning">No concurrir: estas ubicaciones son sólo demostrativas.</p>
          <div className="places-list">{snapshot.shelters.map((shelter) => <div key={shelter.id}><span className="place-icon" aria-hidden="true">⌖</span><div><strong>{shelter.name}</strong><span>{shelter.status.replaceAll('_', ' ')} · {shelter.address}</span></div></div>)}</div>
          <div className="quick-actions"><strong>Recordá</strong>{snapshot.actions.slice(0, 2).map((action) => <span key={action}>✓ {action}</span>)}</div>
        </section>
      </main>

      <footer className="app-footer"><p>{snapshot.emergencyDisclaimer}</p><p><a href="/api/health">API</a><span>·</span><a href="/lite">Lite</a><span>·</span>Sin trackers ni fuentes externas</p></footer>
      <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </>
  );
}
