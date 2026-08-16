import { useState, type ReactNode, type RefObject } from 'react';
import type { HydrologicalSystem, Snapshot } from '../../../domain/snapshot.ts';
import { ESSENTIAL_CONTACTS } from '../../../domain/essential-contacts.ts';
import { HydroSeriesChart } from '../ui/HydroSeriesChart.tsx';

export const CIVIC_PRIMARY_NAV = Object.freeze([
  { label: 'Inicio', href: '/' },
  { label: 'Ríos', href: '/#situacion-hidrica' },
  { label: 'Riesgo', href: '/gestion-de-riesgo' },
  { label: 'Fuentes', href: '/#fuentes' },
]);

export const CIVIC_SECONDARY_NAV = Object.freeze([
  { label: 'Alertas y ayuda', href: '/#alertas' },
  { label: 'Acerca de SOS-SF', href: '/#acerca' },
]);

export function SOSBrand({ compact = false }: { readonly compact?: boolean }) {
  return <a className={`sos-brand${compact ? ' sos-brand--compact' : ''}`} href="/" aria-label="SOS SF, información hídrica independiente">
    <span className="sos-brand__mark" aria-hidden="true"><b>SOS</b><i/><i/></span>
    {!compact && <span className="sos-brand__wordmark"><strong>SOS SF</strong><small>Ríos y riesgo, sin vueltas</small></span>}
  </a>;
}

export function CivicNav({ currentPath }: { readonly currentPath: string }) {
  return <nav className="civic-nav" aria-label="Navegación principal">
    {CIVIC_PRIMARY_NAV.map((item) => {
      const base = item.href.split('#')[0] || '/';
      const active = item.href === '/' ? currentPath === '/' : base === '/' ? currentPath === '/' : currentPath.startsWith(base);
      return <a key={item.label} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</a>;
    })}
  </nav>;
}

export function CivicMobileMenu({ open, currentPath, onClose }: {
  readonly open: boolean;
  readonly currentPath: string;
  readonly onClose: () => void;
}) {
  return <div className={`civic-mobile-menu${open ? ' civic-mobile-menu--open' : ''}`} aria-hidden={!open}>
    <nav aria-label="Navegación móvil">
      {CIVIC_PRIMARY_NAV.map((item) => <a key={item.label} href={item.href} aria-current={currentPath === item.href ? 'page' : undefined} onClick={onClose}>{item.label}</a>)}
      <div className="civic-mobile-menu__secondary">{CIVIC_SECONDARY_NAV.map((item) => <a key={item.label} href={item.href} onClick={onClose}>{item.label}</a>)}</div>
    </nav>
  </div>;
}

export function CivicSearch() {
  return <form className="civic-search" role="search" action="/" onSubmit={(event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const query = String(data.get('q') ?? '').trim().toLowerCase();
    const target = query.includes('riesgo') || query.includes('niño') ? '/gestion-de-riesgo' : query.includes('fuente') ? '/#fuentes' : '/#situacion-hidrica';
    window.location.assign(target);
  }}>
    <label className="sr-only" htmlFor="civic-search-q">Buscar en SOS SF</label>
    <input id="civic-search-q" name="q" type="search" placeholder="¿Qué necesitás?" autoComplete="off"/>
    <button type="submit" aria-label="Buscar">Buscar</button>
  </form>;
}

export function CivicHeader({ currentPath, actions }: { readonly currentPath: string; readonly actions: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="civic-header app-header">
    <div className="civic-header__main header-inner">
      <SOSBrand/>
      <CivicNav currentPath={currentPath}/>
      <div className="civic-header__actions header-actions" aria-label="Comunicaciones y acciones">{actions}</div>
      <button type="button" className="civic-menu-toggle" aria-expanded={menuOpen} aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setMenuOpen((value) => !value)}><span/><span/><span/></button>
    </div>
    <CivicMobileMenu open={menuOpen} currentPath={currentPath} onClose={() => setMenuOpen(false)}/>
  </header>;
}

export function CivicQuickAccessTile({ href, label, icon }: { readonly href: string; readonly label: string; readonly icon: 'river' | 'risk' | 'alert' | 'phone' | 'source' }) {
  const paths = {
    river: <><path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 13c3-2 5 2 8 0s5-2 8 0M4 18c3-2 5 2 8 0s5-2 8 0"/></>,
    risk: <><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
    alert: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></>,
    phone: <><path d="M7 3h4l2 5-3 2c1 3 3 5 6 6l2-3 4 2v4c0 2-2 3-4 2C9 19 5 15 3 7 2 5 4 3 7 3Z"/></>,
    source: <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></>,
  } as const;
  return <a className="civic-quick-tile" href={href}><span className="civic-quick-tile__icon"><svg viewBox="0 0 24 24" aria-hidden="true">{paths[icon]}</svg></span><span>{label}</span><b aria-hidden="true">→</b></a>;
}

export function CivicQuickAccessGrid() {
  const items = [
    { href: '/#situacion-hidrica', label: 'Ver los ríos', icon: 'river' as const },
    { href: '/gestion-de-riesgo', label: 'Prepararse', icon: 'risk' as const },
    { href: '/#alertas', label: 'Alertas y ayuda', icon: 'alert' as const },
    { href: '/#fuentes', label: 'De dónde salen los datos', icon: 'source' as const },
  ];
  return <div className="civic-quick-grid" aria-label="Accesos rápidos">{items.map((item) => <CivicQuickAccessTile key={item.label} {...item}/>)}</div>;
}

export function CivicCampaignBanner({ compact = false }: { readonly compact?: boolean }) {
  return <article className={`civic-campaign${compact ? ' civic-campaign--compact' : ''}`}>
    <div className="civic-campaign__copy">
      <p>Entender antes de preocuparse</p>
      <h2>Fenómeno El Niño</h2>
      <strong>Qué significa para Santa Fe y qué no.</strong>
      <a href="/gestion-de-riesgo/fenomeno-el-nino">Leer la guía <span aria-hidden="true">→</span></a>
    </div>
    <svg className="civic-campaign__motif" viewBox="0 0 300 180" aria-hidden="true"><path d="M24 134c40-52 77-53 111-10s72 42 141-30"/><path d="M24 154c42-35 80-34 115 1s72 31 137-8"/><circle cx="235" cy="55" r="25"/></svg>
  </article>;
}

export function OfficialSourceBadge({ observedAt = '7 de agosto de 2026' }: { readonly observedAt?: string }) {
  return <p className="official-source-badge"><span aria-hidden="true">↗</span><span>Información editorial basada en <a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/fenomeno-el-nino/" target="_blank" rel="noreferrer">Gestión de Riesgo de la Municipalidad de Santa Fe</a><small>Consultada {observedAt}. SOS-SF es independiente.</small></span></p>;
}

export function CivicFAQ() {
  const rows = [
    ['¿El Niño significa que habrá una inundación?', 'No. Puede modificar patrones de precipitación y temperatura, pero no equivale por sí solo a una emergencia ni permite anticipar un nivel de río concreto.'],
    ['¿Qué conviene mirar primero?', 'La última medición, cuándo fue tomada, cómo viene moviéndose el río y si existe una alerta oficial real.'],
    ['¿Qué significa la referencia de 5,30 m?', 'Es una referencia citada por el municipio para un protocolo específico de Vuelta del Paraguayo. SOS-SF no la usa como umbral general de evacuación.'],
    ['¿Dónde veo actividades y capacitaciones?', 'La Municipalidad publica actividades y materiales desde sus canales de Gestión de Riesgo. Para fechas vigentes, conviene consultar siempre la fuente actual.'],
  ];
  return <div className="civic-faq">{rows.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>;
}

export function CivicNewsGrid() {
  return <div className="civic-news-grid">
    <article><span>Preparación</span><h3>Comunidad preparada</h3><p>Capacitaciones y trabajo barrial forman parte de la preparación ante eventos hídricos.</p><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/" target="_blank" rel="noreferrer">Consultar fuente oficial</a></article>
    <article><span>Infraestructura</span><h3>Desagües y bombeo</h3><p>La ciudad informa tareas sobre desagües, estaciones de bombeo, reservorios y otros sistemas hídricos.</p><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/" target="_blank" rel="noreferrer">Ver Gestión de Riesgo</a></article>
    <article><span>Contexto</span><h3>Una lectura no cuenta toda la historia</h3><p>Nivel de río, lluvia, drenaje y condiciones territoriales se leen en conjunto. SOS-SF separa cada evidencia para no exagerar conclusiones.</p><a href="/gestion-de-riesgo/fenomeno-el-nino#fuentes-el-nino">Ver fuentes relacionadas</a></article>
  </div>;
}

export function EmergencyStrip() {
  return <aside className="emergency-strip" aria-label="Canales de emergencia"><div><strong>Si hay peligro inmediato</strong><span>Usá los canales oficiales. SOS-SF no reemplaza una emergencia.</span></div>{ESSENTIAL_CONTACTS.map((contact) => <a key={contact.id} href={contact.href}>{contact.label === 'Emergencias' ? contact.number : `${contact.label} ${contact.number}`}</a>)}</aside>;
}

export function CivicFooter({ disclaimer }: { readonly disclaimer: string }) {
  return <footer className="civic-footer app-footer" id="acerca">
    <div className="civic-footer__main">
      <div className="civic-footer__identity"><SOSBrand compact/><p>{disclaimer}</p><strong>Independiente · no gubernamental</strong></div>
      <nav aria-label="Información secundaria"><h2>Seguir explorando</h2><a href="/lite">Modo liviano</a><a href="/#fuentes">Fuentes y detalle</a><a href="/api/health">Estado técnico</a></nav>
      <nav aria-label="Canales oficiales"><h2>Fuentes oficiales</h2><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/" target="_blank" rel="noreferrer">Gestión de Riesgo</a><a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noreferrer">Alertas SMN</a><a href="https://www.argentina.gob.ar/ina" target="_blank" rel="noreferrer">Instituto Nacional del Agua</a></nav>
    </div>
    <div className="civic-footer__legal"><span>Hecho para leer Santa Fe con calma.</span><span>Datos públicos con atribución.</span></div>
  </footer>;
}

export function StationSwitcher({ systems, selectedId, onSelect }: { readonly systems: readonly HydrologicalSystem[]; readonly selectedId?: string; readonly onSelect: (id: string) => void }) {
  if (systems.length < 2) return null;
  return <div className="station-selector" role="tablist" aria-label="Elegir río">{systems.map((system) => <button key={system.id} type="button" role="tab" aria-selected={system.id === selectedId} onClick={() => onSelect(system.id)}><span>{system.watercourse.replace('Río ', '')}</span><small>{system.currentMetres === null ? 'Sin dato' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</small></button>)}</div>;
}

export function FreshnessBadge({ className, label }: { readonly className: string; readonly label: string }) {
  return <span className={`freshness-badge ${className}`}><i aria-hidden="true"/>{label}</span>;
}

export function SourceLine({ children, buttonRef, onOpen }: { readonly children: ReactNode; readonly buttonRef: RefObject<HTMLButtonElement | null>; readonly onOpen: (opener?: HTMLButtonElement | null) => void }) {
  return <div className="source-strip" data-testid="hydro-source-strip"><div className="source-strip__copy">{children}</div><button ref={buttonRef} type="button" onClick={(event) => onOpen(event.currentTarget)}>Ver fuente y detalle</button></div>;
}

export function HydrometricChart({ system, generatedAt }: { readonly system: HydrologicalSystem; readonly generatedAt: string }) {
  return <HydroSeriesChart system={system} generatedAt={generatedAt}/>;
}

export function HydrometricHero({ children }: { readonly children: ReactNode }) {
  return <div className="muni-hydrometric-hero">{children}</div>;
}

export function CivicDiscovery({ snapshot }: { readonly snapshot: Snapshot }) {
  const systems = snapshot.systems ?? [];
  return <section className="civic-discovery" aria-labelledby="civic-access-title">
    <header className="civic-section-title"><div><p className="section-kicker">Para seguir</p><h2 id="civic-access-title">Todo lo importante, a mano</h2></div><span>Santa Fe · datos públicos</span></header>
    <div className="civic-water-summary" aria-label="Resumen de los ríos">{systems.slice(0, 2).map((system) => <article key={system.id}><span>{system.watercourse}</span><strong>{system.currentMetres === null ? 'Sin dato' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</strong><small>{system.stationName} · {system.freshness === 'ACTUALIZADO' ? 'al día' : 'revisar vigencia'}</small></article>)}</div>
    <CivicQuickAccessGrid/>
    <CivicCampaignBanner compact/>
  </section>;
}

export function RiskHub({ children }: { readonly children?: ReactNode }) {
  return <main id="main" className="civic-page civic-risk-hub">
    <div className="civic-page__intro"><p className="section-kicker">Prepararse también es entender</p><h1>Riesgo hídrico, explicado para la vida diaria</h1><p>Qué mirar, qué significa cada señal y dónde verificar información oficial cuando realmente hace falta.</p></div>
    <CivicCampaignBanner/>
    <section className="civic-page-section civic-page-section--soft"><h2>Accesos útiles</h2><CivicQuickAccessGrid/></section>
    {children}
    <EmergencyStrip/>
  </main>;
}

export function ElNinoLanding() {
  return <main id="main" className="civic-page el-nino-page" data-testid="el-nino-landing"><CivicCampaignBanner/><OfficialSourceBadge/><div className="el-nino-layout"><article className="el-nino-content"><section id="que-es"><p className="section-kicker">Entender el fenómeno</p><h1>Fenómeno El Niño</h1><p className="lead">El Niño puede modificar patrones de lluvia y temperatura. En Santa Fe puede aumentar la probabilidad de episodios intensos, pero no significa automáticamente inundación ni emergencia.</p></section><section><h2>Qué puede implicar en Santa Fe</h2><p>El impacto real depende de lluvia local, niveles de los ríos, drenaje y condiciones territoriales. Por eso SOS-SF separa mediciones, vigencia y alertas oficiales.</p></section><section><h2>Qué conviene mirar</h2><p>La última medición, cómo viene cambiando, cuándo fue tomada y si existe una alerta oficial real. Una cifra aislada no alcanza para decidir.</p></section><section><h2>Preguntas frecuentes</h2><CivicFAQ/></section><section id="fuentes-el-nino"><h2>Fuentes relacionadas</h2><CivicNewsGrid/></section></article><aside className="el-nino-aside"><h2>Para consultar ahora</h2><a href="/#situacion-hidrica">Ver los ríos</a><a href="/#alertas">Alertas y ayuda</a><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/fenomeno-el-nino/" target="_blank" rel="noreferrer">Fuente municipal ↗</a><p>Si una agenda o cifra cambia, prevalece la fuente oficial actual.</p></aside></div><EmergencyStrip/></main>;
}
