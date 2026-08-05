import type { ReactNode, RefObject } from 'react';
import { IconButton } from '../components/ui/IconButton';

interface AppShellProps {
  readonly online: boolean;
  readonly refreshing: boolean;
  readonly unread: number;
  readonly messagesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onRefresh: () => void;
  readonly onMessages: () => void;
  readonly disclaimer: string;
  readonly children: ReactNode;
}

export function AppShell({ online, refreshing, unread, messagesButtonRef, onRefresh, onMessages, disclaimer, children }: AppShellProps) {
  return <div className="site-shell">
    <a className="skip-link" href="#main">Saltar al contenido principal</a>
    <header className="app-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="SOS Santa Fe, inicio">
          <span className="brand-mark" aria-hidden="true">SOS</span>
          <span><strong>SOS Santa Fe</strong><small>Servicio independiente de información pública</small></span>
        </a>
        <div className="header-actions">
          <IconButton label="Actualizar información" loading={refreshing} onClick={onRefresh} icon={<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.4 6.6L20 9M4 15l1.6 2.4A7 7 0 0 0 17.9 15"/></svg>}/>
          <IconButton ref={messagesButtonRef} label="Abrir comunicaciones" badge={unread} onClick={onMessages} aria-haspopup="dialog" icon={<svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>}/>
        </div>
      </div>
    </header>
    {!online && <div className="offline-banner" role="status"><strong>Sin conexión</strong><span>No se pueden verificar alertas ni vigencia. Se muestra el último snapshot guardado con su fecha.</span></div>}
    {children}
    <footer className="app-footer"><div><strong>SOS Santa Fe</strong><p>{disclaimer}</p></div><nav aria-label="Enlaces de información"><a href="/lite">Modo lite</a><a href="/api/sources">Datos abiertos</a><a href="/api/health">Estado técnico</a></nav></footer>
  </div>;
}
