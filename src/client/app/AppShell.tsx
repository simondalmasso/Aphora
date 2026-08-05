import type { ReactNode, RefObject } from 'react';
import { IconButton } from '../components/ui/IconButton';

interface AppShellProps {
  readonly online: boolean;
  readonly refreshing: boolean;
  readonly unread: number;
  readonly messagesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly reportButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onRefresh: () => void;
  readonly onMessages: () => void;
  readonly onReport: (opener?: HTMLButtonElement | null) => void;
  readonly disclaimer: string;
  readonly children: ReactNode;
}

export function AppShell({ online, refreshing, unread, messagesButtonRef, reportButtonRef, onRefresh, onMessages, onReport, disclaimer, children }: AppShellProps) {
  return <div className="site-shell">
    <a className="skip-link" href="#main">Saltar al contenido principal</a>
    <header className="app-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="SOS Santa Fe, inicio">
          <span className="brand-mark" aria-hidden="true">SOS</span>
          <span><strong>SOS Santa Fe</strong><small>Información pública para emergencias</small></span>
        </a>
        <div className="header-actions">
          <span className={`connection-state ${online ? '' : 'connection-state--offline'}`} role="status">{online ? 'Con conexión' : 'Sin conexión'}</span>
          <button ref={reportButtonRef} type="button" className="button button--primary header-report" onClick={(event) => onReport(event.currentTarget)}>Reportar una situación</button>
          <IconButton label="Actualizar información" loading={refreshing} onClick={onRefresh} icon={<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.4 6.6L20 9M4 15l1.6 2.4A7 7 0 0 0 17.9 15"/></svg>}/>
          <IconButton ref={messagesButtonRef} label="Abrir comunicaciones" badge={unread} onClick={onMessages} aria-haspopup="dialog" icon={<svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>}/>
        </div>
      </div>
      <div className="independence-note">Servicio independiente que integra y organiza fuentes públicas oficiales.</div>
    </header>
    {children}
    <footer className="app-footer"><div><strong>SOS Santa Fe</strong><p>{disclaimer}</p></div><nav aria-label="Enlaces técnicos"><a href="/lite">Modo lite</a><a href="/api/health">Estado del servicio</a><a href="/api/sources">Datos y fuentes</a></nav></footer>
  </div>;
}
