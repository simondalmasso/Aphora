import { useState, type ReactNode, type RefObject } from 'react';
import type { HydrologicalSystem, Snapshot } from '../../../domain/snapshot.ts';
import { HydroSeriesChart } from '../ui/HydroSeriesChart.tsx';

export const CIVIC_PRIMARY_NAV = Object.freeze([
  { label: 'Inicio', href: '/' },
  { label: 'Situación hídrica', href: '/#situacion-hidrica' },
  { label: 'Gestión de riesgo', href: '/gestion-de-riesgo' },
  { label: 'Fuentes', href: '/#fuentes' },
  { label: 'Transparencia', href: '/#transparencia' },
]);

export const CIVIC_SECONDARY_NAV = Object.freeze([
  { label: 'Reportar', href: '/#alertas' },
  { label: 'Emergencias', href: '/#alertas' },
  { label: 'Acerca de SOS-SF', href: '/#acerca' },
]);

export function SOSBrand({ compact = false }: { readonly compact?: boolean }) {
  return <a className={`sos-brand${compact ? ' sos-brand--compact' : ''}`} href="/" aria-label="SOS SF, información hídrica independiente">
    <span className="sos-brand__mark" aria-hidden="true">
      <b>SOS</b><i/><i/>
    </span>
    {!compact && <span className="sos-brand__wordmark">
      <strong>SOS SF</strong>
      <small>Información hídrica independiente</small>
    </span>}
  </a>;
}

export function CivicNav({ currentPath }: { readonly currentPath: string }) {
  return <nav className="civic-nav" aria-label="Navegación principal">
    {CIVIC_PRIMARY_NAV.map((item) => {
      const active = item.href === '/' ? currentPath === '/' : currentPath.startsWith(item.href.split('#')[0]!);
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
      <div className="civic-mobile-menu__secondary">
        {CIVIC_SECONDARY_NAV.map((item) => <a key={item.label} href={item.href} onClick={onClose}>{item.label}</a>)}
      </div>
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
    <input id="civic-search-q" name="q" type="search" placeholder="Buscar" autoComplete="off"/>
    <button type="submit" aria-label="Buscar">⌕</button>
  </form>;
}

export function CivicHeader({ currentPath, actions }: { readonly currentPath: string; readonly actions: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <>
    <header className="civic-header app-header">
      <div className="civic-header__utility">
        <span>Santa Fe · monitoreo público</span>
        <span>Producto independiente · fuentes oficiales atribuidas</span>
      </div>
      <div className="civic-header__main header-inner">
        <SOSBrand/>
        <CivicNav currentPath={currentPath}/>
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
      <div id="civic-mobile-menu"><CivicMobileMenu open={menuOpen} currentPath={currentPath} onClose={() => setMenuOpen(false)}/></div>
    </header>
  </>;
}

export function CivicQuickAccessTile({ href, label, icon }: { readonly href: string; readonly label: string; readonly icon: 'river' | 'risk' | 'alert' | 'phone' | 'source' }) {
  const paths = {
    river: <><path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 13c3-2 5 2 8 0s5-2 8 0M4 18c3-2 5 2 8 0s5-2 8 0"/></>,
    risk: <><path d="M12 3 3 20h18L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
    alert: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></>,
    phone: <><path d="M7 3h4l2 5-3 2c1 3 3 5 6 6l2-3 4 2v4c0 2-2 3-4 2C9 19 5 15 3 7 2 5 4 3 7 3Z"/></>,
    source: <><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></>,
  } as const;
  return <a className="civic-quick-tile" href={href}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{paths[icon]}</svg>
    <span>{label}</span>
  </a>;
}

export function CivicQuickAccessGrid() {
  const items = [
    { href: '/#situacion-hidrica', label: 'Paraná', icon: 'river' as const },
    { href: '/#situacion-hidrica', label: 'Salado', icon: 'river' as const },
    { href: '/gestion-de-riesgo', label: 'Gestión de riesgo', icon: 'risk' as const },
    { href: '/#alertas', label: 'Alertas', icon: 'alert' as const },
    { href: '/#alertas', label: 'Emergencias', icon: 'phone' as const },
    { href: '/#fuentes', label: 'Fuentes', icon: 'source' as const },
  ];
  return <div className="civic-quick-grid" aria-label="Accesos rápidos">{items.map((item) => <CivicQuickAccessTile key={item.label} {...item}/>)}</div>;
}

export function CivicCampaignBanner({ compact = false }: { readonly compact?: boolean }) {
  return <article className={`civic-campaign${compact ? ' civic-campaign--compact' : ''}`}>
    <div className="civic-campaign__copy">
      <p>Gestión de riesgo · información atribuida</p>
      <h2>Fenómeno El Niño</h2>
      <strong>Lo que tenés que saber para Santa Fe</strong>
      <a href="/gestion-de-riesgo/fenomeno-el-nino">Ver información y fuentes <span aria-hidden="true">→</span></a>
    </div>
    <svg className="civic-campaign__motif" viewBox="0 0 300 180" aria-hidden="true">
      <path d="M30 190 190 20M76 190 236 20M122 190 282 20M168 190 328 20"/>
      <circle cx="230" cy="90" r="52"/><circle cx="230" cy="90" r="31"/>
    </svg>
  </article>;
}

export function OfficialSourceBadge({ observedAt = '7 de agosto de 2026' }: { readonly observedAt?: string }) {
  return <p className="official-source-badge">
    <span aria-hidden="true">↗</span>
    Fuente editorial: <a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/fenomeno-el-nino/" target="_blank" rel="noreferrer">Municipalidad de Santa Fe · Dirección de Gestión de Riesgo</a>
    <small>Consultada {observedAt}. SOS-SF no es un servicio municipal.</small>
  </p>;
}

export function CivicFAQ() {
  const rows = [
    ['¿El Niño significa que habrá una inundación?', 'No. El fenómeno puede modificar patrones de precipitación y temperatura y aumentar la probabilidad de episodios intensos, pero no equivale por sí mismo a una emergencia ni permite anticipar un nivel de río concreto.'],
    ['¿Qué conviene mirar en SOS-SF?', 'La medición observada, la hora de observación, su vigencia y la fuente. Para alertas y decisiones de emergencia, verificá siempre los canales oficiales.'],
    ['¿Qué significa la referencia de 5,30 m?', 'Es una referencia citada por el municipio para un protocolo específico de Vuelta del Paraguayo. SOS-SF no la usa como umbral general de evacuación ni la traslada a otros barrios o estaciones.'],
    ['¿Dónde se publican capacitaciones y agenda?', 'La Municipalidad publica actividades y materiales desde sus canales de Gestión de Riesgo. SOS-SF enlaza la fuente y no presenta una agenda histórica como vigente si no puede verificarse.'],
  ];
  return <div className="civic-faq">{rows.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>;
}

export function CivicNewsGrid() {
  return <div className="civic-news-grid">
    <article><span>Preparación</span><h3>Comunidad preparada</h3><p>Según la Dirección de Gestión de Riesgo, la preparación comunitaria incluye capacitaciones y articulación barrial.</p><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/" target="_blank" rel="noreferrer">Consultar fuente oficial</a></article>
    <article><span>Infraestructura</span><h3>Desagües y bombeo</h3><p>El municipio informa tareas sobre desagües, estaciones de bombeo, reservorios y sistemas hídricos como parte de su preparación.</p><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/" target="_blank" rel="noreferrer">Ver Gestión de Riesgo</a></article>
    <article><span>Coordinación</span><h3>Planificación continua</h3><p>La respuesta hídrica involucra coordinación entre organismos municipales, provinciales y metropolitanos. SOS-SF sólo sintetiza información pública atribuida.</p><a href="/gestion-de-riesgo/fenomeno-el-nino#fuentes-el-nino">Ver fuentes relacionadas</a></article>
  </div>;
}

export function EmergencyStrip() {
  return <aside className="emergency-strip" aria-label="Canales de emergencia"><strong>¿Hay peligro inmediato?</strong><span>Usá los canales oficiales de emergencia.</span><a href="tel:911">911</a><a href="tel:103">COBEM 103</a><a href="tel:107">Emergencias médicas 107</a></aside>;
}

export function CivicFooter({ disclaimer }: { readonly disclaimer: string }) {
  return <footer className="civic-footer app-footer" id="acerca">
    <div className="civic-footer__main">
      <div><SOSBrand compact/><p>{disclaimer}</p><strong>SOS-SF es un producto independiente y no gubernamental.</strong></div>
      <nav aria-label="Información secundaria"><h2>Información</h2><a href="/lite">Modo lite</a><a href="/#fuentes">Fuentes</a><a href="/api/health">Estado técnico</a></nav>
      <nav aria-label="Canales oficiales"><h2>Canales oficiales</h2><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/" target="_blank" rel="noreferrer">Gestión de Riesgo municipal</a><a href="https://www.smn.gob.ar/alertas" target="_blank" rel="noreferrer">Alertas SMN</a><a href="https://www.argentina.gob.ar/ina" target="_blank" rel="noreferrer">Instituto Nacional del Agua</a></nav>
    </div>
    <div className="civic-footer__legal"><span>Santa Fe, Argentina</span><span>Datos públicos con atribución · sin afiliación municipal</span></div>
  </footer>;
}

export function StationSwitcher({ systems, selectedId, onSelect }: { readonly systems: readonly HydrologicalSystem[]; readonly selectedId?: string; readonly onSelect: (id: string) => void }) {
  if (systems.length < 2) return null;
  return <div className="station-selector" role="tablist" aria-label="Elegir estación hidrométrica">{systems.map((system) => <button key={system.id} type="button" role="tab" aria-selected={system.id === selectedId} onClick={() => onSelect(system.id)}>{system.watercourse.replace('Río ', '')}</button>)}</div>;
}

export function FreshnessBadge({ className, label }: { readonly className: string; readonly label: string }) {
  return <span className={`freshness-badge ${className}`}><i aria-hidden="true"/>{label}</span>;
}

export function SourceLine({ children, buttonRef, onOpen }: { readonly children: ReactNode; readonly buttonRef: RefObject<HTMLButtonElement | null>; readonly onOpen: (opener?: HTMLButtonElement | null) => void }) {
  return <div className="source-strip" data-testid="hydro-source-strip">{children}<button ref={buttonRef} type="button" onClick={(event) => onOpen(event.currentTarget)}>Fuente</button></div>;
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
    <header className="civic-section-title"><div><p className="section-kicker">Accesos rápidos</p><h2 id="civic-access-title">Información para moverse rápido</h2></div><span>Santa Fe · datos públicos</span></header>
    <CivicQuickAccessGrid/>
    <div className="civic-water-summary" aria-label="Resumen de sistemas hídricos">{systems.slice(0, 2).map((system) => <article key={system.id}><span>{system.watercourse}</span><strong>{system.currentMetres === null ? 'Sin dato' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`}</strong><small>{system.stationName} · {system.freshness === 'ACTUALIZADO' ? 'vigente' : 'revisar vigencia'}</small></article>)}</div>
    <CivicCampaignBanner compact/>
  </section>;
}

export function RiskHub({ children }: { readonly children?: ReactNode }) {
  return <main id="main" className="civic-page civic-risk-hub">
    <div className="civic-page__intro"><p className="section-kicker">Gestión de riesgo</p><h1>Preparación hídrica para Santa Fe</h1><p>Información pública ordenada para entender la situación, prepararse y llegar rápido a los canales oficiales.</p></div>
    <CivicCampaignBanner/>
    <EmergencyStrip/>
    {children}
    <section className="civic-page-section"><h2>Accesos útiles</h2><CivicQuickAccessGrid/></section>
  </main>;
}

export function ElNinoLanding() {
  return <main id="main" className="civic-page el-nino-page" data-testid="el-nino-landing">
    <CivicCampaignBanner/>
    <OfficialSourceBadge/>
    <div className="el-nino-layout">
      <article className="el-nino-content">
        <section id="que-es"><p className="section-kicker">Qué es</p><h1>Fenómeno El Niño</h1><p className="lead">El Niño es una variación natural del sistema océano-atmósfera que puede modificar patrones de precipitación y temperatura. En Santa Fe puede aumentar la probabilidad de episodios de lluvia más frecuentes o intensos, pero no equivale automáticamente a una inundación ni a una emergencia.</p></section>
        <section><h2>Qué puede implicar en Santa Fe</h2><p>La combinación de lluvias locales, niveles de los ríos, capacidad de drenaje y condiciones territoriales determina el impacto real. Por eso SOS-SF separa mediciones observadas, vigencia de datos y alertas oficiales.</p></section>
        <section><h2>Qué informa la ciudad</h2><p>Según la Dirección de Gestión de Riesgo, la preparación incluye mantenimiento de desagües, estaciones de bombeo, reservorios y sistemas hídricos, junto con planificación y coordinación institucional. Estas acciones se muestran acá como información atribuida; no son acciones ejecutadas por SOS-SF.</p></section>
        <section><h2>Capacitaciones y comunidad preparada</h2><p>El municipio ha publicado el programa <strong>Comunidad Preparada</strong> y capacitaciones barriales orientadas a prevención y respuesta. La agenda cambia con el tiempo: consultá el canal municipal para fechas vigentes.</p></section>
        <section><h2>Planificación continua</h2><p>La gestión del riesgo hídrico requiere coordinación entre áreas municipales, Provincia y actores metropolitanos. SOS-SF no sustituye planes de contingencia, protocolos barriales ni instrucciones de organismos competentes.</p></section>
        <section><h2>Cómo funcionan las estaciones de bombeo</h2><p>Las estaciones permiten evacuar agua desde sectores protegidos cuando la descarga por gravedad no alcanza o las condiciones del sistema lo requieren. Su operación depende de infraestructura, niveles, lluvias y decisiones técnicas; una lectura de río aislada no describe por sí sola su estado operativo.</p></section>
        <section><h2>Referencia específica de Vuelta del Paraguayo</h2><p>La documentación municipal ha citado <strong>5,30 m</strong> dentro de un protocolo territorial específico para Vuelta del Paraguayo. Esa cifra se conserva sólo como referencia municipal atribuida: <strong>no es un umbral general de evacuación de SOS-SF</strong> y no debe extrapolarse a otros barrios o estaciones.</p></section>
        <section><h2>Preguntas frecuentes</h2><CivicFAQ/></section>
        <section id="fuentes-el-nino"><h2>Noticias y fuentes relacionadas</h2><CivicNewsGrid/></section>
      </article>
      <aside className="el-nino-aside"><h2>Para consultar ahora</h2><a href="/#situacion-hidrica">Situación hidrométrica</a><a href="/#alertas">Alertas y emergencias</a><a href="https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/fenomeno-el-nino/" target="_blank" rel="noreferrer">Página municipal fuente ↗</a><p>Última consulta editorial: 7/8/2026. Si una agenda o cifra dejó de estar publicada, prevalece la fuente oficial actual.</p></aside>
    </div>
    <EmergencyStrip/>
  </main>;
}
