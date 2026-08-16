import { useState, type ReactNode } from 'react';
import { CIVIC_PRIMARY_NAV, CIVIC_SECONDARY_NAV, SOSBrand } from './CivicSystem.tsx';

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/';
  if (href.startsWith('/#')) return false;
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

interface CommunicationsAction {
  readonly unread: number;
  readonly onOpen: (opener?: HTMLButtonElement | null) => void;
}

function DockIcon({ name }: { readonly name: 'home' | 'river' | 'risk' | 'more' }) {
  const paths = {
    home: <><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/></>,
    river: <><path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 13c3-2 5 2 8 0s5-2 8 0M4 18c3-2 5 2 8 0s5-2 8 0"/></>,
    risk: <><path d="M12 3 3.5 20h17L12 3Z"/><path d="M12 9v5M12 17.5h.01"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  } as const;
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function MuniCivicHeader({ currentPath, actions, communications }: {
  readonly currentPath: string;
  readonly actions: ReactNode;
  readonly communications: CommunicationsAction;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <header className="civic-header app-header">
      <div className="civic-header__main header-inner">
        <SOSBrand/>
        <nav className="civic-nav" aria-label="Navegación principal">
          {CIVIC_PRIMARY_NAV.map((item) => <a key={item.label} href={item.href} aria-current={isActive(currentPath, item.href) ? 'page' : undefined}>{item.label}</a>)}
        </nav>
        <div className="civic-header__actions header-actions">{actions}</div>
        <button
          type="button"
          className="civic-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="civic-mobile-menu"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setMenuOpen((value) => !value)}
        ><span/><span/><span/></button>
      </div>
      <div id="civic-mobile-menu" className={`civic-mobile-menu${menuOpen ? ' civic-mobile-menu--open' : ''}`} aria-hidden={!menuOpen}>
        <nav aria-label="Más opciones">
          <button
            type="button"
            className="civic-mobile-communications"
            aria-haspopup="dialog"
            onClick={(event) => {
              setMenuOpen(false);
              communications.onOpen(event.currentTarget);
            }}
          >
            <span>Comunicaciones</span>
            {communications.unread > 0 && <span className="civic-mobile-communications__badge" aria-hidden="true">{Math.min(communications.unread, 9)}</span>}
            {communications.unread > 0 && <span className="sr-only">{communications.unread} {communications.unread === 1 ? 'mensaje sin leer' : 'mensajes sin leer'}</span>}
          </button>
          {CIVIC_PRIMARY_NAV.map((item) => <a key={item.label} href={item.href} aria-current={isActive(currentPath, item.href) ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
          <div className="civic-mobile-menu__secondary">
            {CIVIC_SECONDARY_NAV.map((item) => <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
          </div>
        </nav>
      </div>
    </header>

    <nav className="mobile-dock" aria-label="Navegación rápida">
      <a href="/" aria-current={currentPath === '/' ? 'page' : undefined}><DockIcon name="home"/><span>Inicio</span></a>
      <a href="/#situacion-hidrica"><DockIcon name="river"/><span>Ríos</span></a>
      <a href="/gestion-de-riesgo" aria-current={currentPath.startsWith('/gestion-de-riesgo') ? 'page' : undefined}><DockIcon name="risk"/><span>Riesgo</span></a>
      <button type="button" aria-expanded={menuOpen} aria-controls="civic-mobile-menu" onClick={() => setMenuOpen((value) => !value)}><DockIcon name="more"/><span>Más</span>{communications.unread > 0 && <i aria-hidden="true">{Math.min(communications.unread, 9)}</i>}</button>
    </nav>
  </>;
}
