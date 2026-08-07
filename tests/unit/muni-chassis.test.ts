import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('MUNI 021 civic chassis contract', () => {
  it('ships the required civic component vocabulary', async () => {
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    for (const name of ['CivicHeader','CivicNav','CivicMobileMenu','CivicSearch','SOSBrand','HydrometricHero','StationSwitcher','HydrometricChart','FreshnessBadge','SourceLine','CivicQuickAccessGrid','CivicQuickAccessTile','CivicCampaignBanner','RiskHub','ElNinoLanding','CivicFAQ','CivicNewsGrid','OfficialSourceBadge','EmergencyStrip','CivicFooter']) {
      expect(civic).toContain(`function ${name}`);
    }
  });

  it('keeps an original independent SOS identity', async () => {
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    const shell = await read('src/client/app/AppShell.tsx');
    expect(civic).toContain('Información hídrica independiente');
    expect(civic).toContain('SOS-SF es un producto independiente y no gubernamental');
    expect(shell).not.toContain('brand-mark');
    expect(shell).not.toContain('>SF<');
    expect(civic).not.toMatch(/<img[^>]+santafeciudad/i);
  });

  it('provides the required civic information architecture', async () => {
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    for (const label of ['Inicio','Situación hídrica','Gestión de riesgo','Fuentes','Transparencia','Paraná','Salado','Alertas','Emergencias']) expect(civic).toContain(label);
  });

  it('keeps hydrometry first on the home surface', async () => {
    const page = await read('src/client/app/DashboardPage.tsx');
    const hydro = page.indexOf('<HydrometricMonitoring');
    const discovery = page.indexOf('<CivicDiscovery');
    expect(hydro).toBeGreaterThan(0);
    expect(discovery).toBeGreaterThan(hydro);
    expect(page).not.toContain('SituationSummary');
  });

  it('routes risk and El Nino without a client routing dependency', async () => {
    const app = await read('src/client/App.tsx');
    expect(app).toContain("'/gestion-de-riesgo'");
    expect(app).toContain("'/gestion-de-riesgo/fenomeno-el-nino'");
    expect(app).toContain("./components/civic/MuniPages.tsx");
  });

  it('attributes El Nino and refuses municipal impersonation', async () => {
    const page = await read('src/client/components/civic/MuniPages.tsx');
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    expect(page).toContain('Según la Dirección de Gestión de Riesgo');
    expect(page).toContain('no son acciones ejecutadas por SOS-SF');
    expect(civic).toContain('Fuente editorial:');
    expect(civic).toContain('SOS-SF no es un servicio municipal');
    expect(page).not.toMatch(/\b(hacemos|invertimos|capacitamos)\b/i);
  });

  it('treats 5.30 m as a territorial citation, never a general threshold', async () => {
    const page = await read('src/client/components/civic/MuniPages.tsx');
    expect(page).toContain('5,30 m');
    expect(page).toContain('no es un umbral general de evacuación de SOS-SF');
    expect(page).toContain('Vuelta del Paraguayo');
  });

  it('contains all required El Nino editorial sections', async () => {
    const page = await read('src/client/components/civic/MuniPages.tsx');
    for (const heading of ['Qué puede implicar en Santa Fe','Qué está haciendo la ciudad','Capacitaciones · Comunidad Preparada','Agenda vigente','Preguntas frecuentes','Planificación continua','Cómo funcionan las bombas','Plan de contingencia','Noticias y fuentes relacionadas']) expect(page).toContain(heading);
  });

  it('defines the full MUNI token families', async () => {
    const css = await read('src/client/styles/muni-021.css');
    for (const token of ['--muni-navy-','--muni-accent-','--muni-neutral-','--surface-','--text-','--space-','--radius-','--shadow-','--container-','--font-','--line-','--motion-']) expect(css).toContain(token);
    expect(css).not.toContain('backdrop-filter: blur');
  });

  it('records 40+ fidelity traits and the blocked measurement truth', async () => {
    const matrix = JSON.parse(await read('docs/municipal-reverse-matrix.json')) as { computedStyleStatus: string; measurementHonesty: string; traits: unknown[] };
    expect(matrix.computedStyleStatus).toBe('BLOCKED_BY_CLOUDFLARE_CHALLENGE');
    expect(matrix.measurementHonesty).toBe('NO_PIXEL_PERFECT_CLAIM');
    expect(matrix.traits.length).toBeGreaterThanOrEqual(40);
  });
});
