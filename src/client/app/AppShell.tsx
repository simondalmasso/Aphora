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
  return (
    <>
      <a className="skip-link" href="#main">Saltar al estado actual</a>
      <header className="app-header app-header--v3">
        <div className="header-inner header-inner--v3">
          <a className="brand brand--v3" href="/" aria-label="SOS Santa Fe, inicio"><span className="brand-mark" aria-hidden="true">SF</span><span><strong>SOS</strong> Santa Fe</span></a>
          <div className="header-actions">
            <span className={`connection-pill ${online ? 'connection-pill--online' : 'connection-pill--offline'}`} role="status"><i aria-hidden="true" />{online ? 'En línea' : 'Offline'}</span>
            <IconButton label="Actualizar estado" loading={refreshing} onClick={onRefresh} icon={<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.4 6.6L20 9M4 15l1.6 2.4A7 7 0 0 0 17.9 15" /></svg>} />
            <IconButton ref={messagesButtonRef} label="Abrir mensajes" badge={unread} onClick={onMessages} aria-haspopup="dialog" icon={<svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>} />
          </div>
        </div>
      </header>
      {children}
      <footer className="app-footer app-footer--v3"><p>{disclaimer}</p><p><a href="/api/health">API</a><span>·</span><a href="/lite">Modo lite</a><span>·</span>Sin trackers</p></footer>
    </>
  );
}
