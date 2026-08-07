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

export function MuniCivicHeader({ currentPath, actions, communications }: {
  readonly currentPath: string;
  readonly actions: ReactNode;
  readonly communications: CommunicationsAction;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="civic-header app-header">
    <div className="civic-header__utility">
      <span>Santa Fe · monitoreo público</span>
      <span>Producto independiente · fuentes oficiales atribuidas</span>
    </div>
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
      <nav aria-label="Navegación móvil">
        <button
          type="button"
          className="civic-mobile-communications"
          aria-haspopup="dialog"
          onClick={(event) => communications.onOpen(event.currentTarget)}
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
  </header>;
}
