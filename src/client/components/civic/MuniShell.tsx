import { useState, type ReactNode } from 'react';
import { CIVIC_PRIMARY_NAV, CIVIC_SECONDARY_NAV, SOSBrand } from './CivicSystem.tsx';

function isActive(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === '/';
  if (href.startsWith('/#')) return false;
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export function MuniCivicHeader({ currentPath, actions }: { readonly currentPath: string; readonly actions: ReactNode }) {
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
        {CIVIC_PRIMARY_NAV.map((item) => <a key={item.label} href={item.href} aria-current={isActive(currentPath, item.href) ? 'page' : undefined} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
        <div className="civic-mobile-menu__secondary">
          {CIVIC_SECONDARY_NAV.map((item) => <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>)}
        </div>
      </nav>
    </div>
  </header>;
}
