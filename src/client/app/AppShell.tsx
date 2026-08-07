import type { ReactNode, RefObject } from 'react';
import type { AlertVerificationState } from '../../domain/snapshot.ts';
import { CivicFooter, CivicHeader } from '../components/civic/CivicSystem.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';

interface AppShellProps {
  readonly currentPath: string;
  readonly online: boolean;
  readonly refreshing: boolean;
  readonly unread: number;
  readonly alertStatus?: AlertVerificationState;
  readonly messagesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly alertsButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onRefresh: () => void;
  readonly onAlerts: (opener?: HTMLButtonElement | null) => void;
  readonly onMessages: () => void;
  readonly disclaimer: string;
  readonly children: ReactNode;
}

function alertBadge(status?: AlertVerificationState): { label: string; tone: 'active' | 'verified' | 'unverified' } {
  if (status === 'ALERTA_OFICIAL_ACTIVA') return { label: 'Alerta oficial', tone: 'active' };
  if (status === 'SIN_ALERTAS_OFICIALES_DETECTADAS') return { label: 'Alertas verificadas', tone: 'verified' };
  return { label: 'Alertas: sin verificar', tone: 'unverified' };
}

export function AppShell({
  currentPath,
  online,
  refreshing,
  unread,
  alertStatus,
  messagesButtonRef,
  alertsButtonRef,
  onRefresh,
  onAlerts,
  onMessages,
  disclaimer,
  children,
}: AppShellProps) {
  const alert = alertBadge(alertStatus);
  const actions = <>
    <span className={online ? 'connection-chip' : 'connection-chip connection-chip--offline'}>
      <i aria-hidden="true"/>{online ? 'En línea' : 'Sin conexión'}
    </span>
    <button
      ref={alertsButtonRef}
      type="button"
      className={`alert-chip alert-chip--${alert.tone}`}
      onClick={(event) => onAlerts(event.currentTarget)}
      aria-haspopup="dialog"
    >
      <span aria-hidden="true">{alert.tone === 'active' ? '!' : '◉'}</span>{alert.label}
    </button>
    <IconButton label="Actualizar información" loading={refreshing} onClick={onRefresh} icon={<svg viewBox="0 0 24 24"><path d="M20 6v5h-5M4 18v-5h5M6.1 9A7 7 0 0 1 18.4 6.6L20 9M4 15l1.6 2.4A7 7 0 0 0 17.9 15"/></svg>}/>
    <IconButton ref={messagesButtonRef} label="Abrir comunicaciones" badge={unread} onClick={onMessages} aria-haspopup="dialog" icon={<svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>}/>
  </>;

  return <div className="site-shell">
    <a className="skip-link" href="#main">Saltar al contenido principal</a>
    <CivicHeader currentPath={currentPath} actions={actions}/>
    {children}
    <CivicFooter disclaimer={disclaimer}/>
  </div>;
}
