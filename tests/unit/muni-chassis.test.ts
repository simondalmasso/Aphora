import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

describe('Final Product 023 civic product contract', () => {
  it('ships the reusable civic component vocabulary', async () => {
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    for (const name of ['CivicHeader','CivicNav','CivicMobileMenu','CivicSearch','SOSBrand','HydrometricHero','StationSwitcher','HydrometricChart','FreshnessBadge','SourceLine','CivicQuickAccessGrid','CivicQuickAccessTile','CivicCampaignBanner','RiskHub','ElNinoLanding','CivicFAQ','CivicNewsGrid','OfficialSourceBadge','EmergencyStrip','CivicFooter']) {
      expect(civic).toContain(`function ${name}`);
    }
  });

  it('keeps an original independent SOS identity without municipal impersonation', async () => {
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    const shell = await read('src/client/app/AppShell.tsx');
    expect(civic.toLowerCase()).toContain('información hídrica independiente');
    expect(civic).toContain('Independiente · no gubernamental');
    expect(civic).toContain('SOS-SF es independiente.');
    expect(shell).not.toContain('brand-mark');
    expect(shell).not.toContain('>SF<');
    expect(civic).not.toMatch(/<img[^>]+santafeciudad/i);
  });

  it('uses the final consumer-grade information architecture', async () => {
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    for (const label of ['Inicio','Ríos','Riesgo','Fuentes','Alertas y ayuda','Comunicaciones','Acerca de SOS-SF']) {
      expect(civic).toContain(label);
    }
    expect(civic).toContain('De dónde salen los datos');
    expect(civic).toContain('Ver los ríos');
  });

  it('keeps hydrometry first on the home surface', async () => {
    const page = await read('src/client/app/DashboardPage.tsx');
    const hydro = page.indexOf('<HydrometricMonitoring');
    const discovery = page.indexOf('<ContextDiscovery');
    expect(hydro).toBeGreaterThan(0);
    expect(discovery).toBeGreaterThan(hydro);
    expect(page).not.toContain('SituationSummary');
  });

  it('routes risk and El Niño without adding a client routing dependency', async () => {
    const app = await read('src/client/App.tsx');
    expect(app).toContain("'/gestion-de-riesgo'");
    expect(app).toContain("'/gestion-de-riesgo/fenomeno-el-nino'");
    expect(app).toContain("./components/civic/MuniPages.tsx");
  });

  it('attributes El Niño clearly and describes municipal work in third person', async () => {
    const page = await read('src/client/components/civic/MuniPages.tsx');
    const civic = await read('src/client/components/civic/CivicSystem.tsx');
    expect(page).toContain('La Dirección de Gestión de Riesgo publica información');
    expect(page).toContain('SOS-SF la muestra con atribución');
    expect(civic).toContain('Información editorial basada en');
    expect(civic).toContain('SOS-SF es independiente.');
    expect(page).not.toMatch(/\b(hacemos|invertimos|capacitamos)\b/i);
  });

  it('treats 5.30 m as a territorial citation, never a general threshold', async () => {
    const page = await read('src/client/components/civic/MuniPages.tsx');
    expect(page).toContain('5,30 m');
    expect(page.toLowerCase()).toContain('no es un umbral general de evacuación de sos-sf');
    expect(page).toContain('Vuelta del Paraguayo');
  });

  it('contains the final calm El Niño editorial structure', async () => {
    const page = await read('src/client/components/civic/MuniPages.tsx');
    for (const heading of ['Qué significa El Niño para Santa Fe','Qué conviene mirar de verdad','Cómo lo presenta SOS-SF','Preparación de la ciudad','La referencia de 5,30 m','Preguntas comunes','Para profundizar']) {
      expect(page).toContain(heading);
    }
    expect(page).toContain('no significa automáticamente inundación ni emergencia');
  });

  it('defines a warm, calm, responsive final-product visual system', async () => {
    const css = await read('src/client/styles/final-product-023.css');
    for (const token of ['--023-canvas','--023-surface','--023-ink','--023-teal','--023-navy','--023-line','--023-shadow']) expect(css).toContain(token);
    for (const viewport of ['980px','720px','390px','340px']) expect(css).toContain(viewport);
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toContain('.mobile-dock');
    expect(css).not.toContain('<canvas');
  });

  it('keeps legacy reverse-engineering evidence as historical evidence, not final-product dogma', async () => {
    const matrix = JSON.parse(await read('docs/municipal-reverse-matrix.json')) as { computedStyleStatus: string; measurementHonesty: string; traits: unknown[] };
    expect(matrix.computedStyleStatus).toBe('BLOCKED_BY_CLOUDFLARE_CHALLENGE');
    expect(matrix.measurementHonesty).toBe('NO_PIXEL_PERFECT_CLAIM');
    expect(matrix.traits.length).toBeGreaterThanOrEqual(40);
  });
});
