import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardPage } from '../../src/client/app/DashboardPage.tsx';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot.ts';

describe('final product 023 hydrometric-first progressive rendering', () => {
  it('renders the calm hydrometric product first, preserves safety actions and avoids decorative canvas', () => {
    const html = renderToStaticMarkup(<DashboardPage
      snapshot={unavailableSnapshot}
      sourcesButtonRef={createRef<HTMLButtonElement>()}
      reportButtonRef={createRef<HTMLButtonElement>()}
      onSources={() => undefined}
      onAlerts={() => undefined}
      onReport={() => undefined}
    />);

    expect(html).toMatch(/^<main id="main" class="dashboard" data-snapshot-id="unavailable-public-safety-snapshot"><section class="hydrometric-section context-first-hydrometry smooth-civic-hydrometry"/);
    expect(html).toContain('data-testid="hydrometric-situation"');
    expect(html).toContain('Santa Fe · monitoreo hídrico');
    expect(html).toContain('Situación hidrométrica');
    expect(html).toContain('Qué marca cada estación, cómo viene cambiando y contra qué referencia puede leerse.');
    expect(html).toContain('Último nivel disponible');
    expect(html).toContain('Medición · antigüedad no disponible');
    expect(html).toContain('Consulta de la fuente · antigüedad no disponible');
    expect(html).toContain('Río Paraná');
    expect(html).toContain('aria-label="Salado"');
    expect(html).toContain('Estación Santo Tomé');
    expect(html).toContain('No pudimos obtener una medición reciente');
    expect(html).toContain('La falta de dato no significa una emergencia.');
    expect(html).toContain('Alertas, ayuda y reportes');
    expect(html).toContain('Reportar una situación');
    expect(html).toContain('De dónde salen los datos');
    expect(html).toContain('911');
    expect(html).toContain('103');
    expect(html).toContain('107');
    expect(html).not.toContain('Santa Fe, hoy');
    expect(html).not.toContain('Así están el Paraná y el Salado');
    expect(html).not.toContain('Pulso hídrico de Santa Fe');
    expect(html).not.toContain('Datos en vivo');
    expect(html).not.toContain('<canvas');
  });
});