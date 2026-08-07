import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardPage } from '../../src/client/app/DashboardPage.tsx';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot.ts';

describe('hydrometric-first progressive rendering', () => {
  it('renders hydrometric status first, four primary sections, emergency channels and no decorative canvas', () => {
    const html = renderToStaticMarkup(<DashboardPage
      snapshot={unavailableSnapshot}
      sourcesButtonRef={createRef<HTMLButtonElement>()}
      reportButtonRef={createRef<HTMLButtonElement>()}
      onSources={() => undefined}
      onAlerts={() => undefined}
      onReport={() => undefined}
    />);

    expect(html).toMatch(/^<main id="main" class="dashboard" data-snapshot-id="unavailable-public-safety-snapshot"><section class="hydrometric-section"/);
    expect(html).toContain('data-testid="hydrometric-situation"');
    expect(html).toContain('Situación hidrométrica');
    expect(html).toContain('Pulso hídrico de Santa Fe');
    expect(html).not.toContain('<h1 id="hydrometric-title">Ríos de Santa Fe</h1>');
    expect(html).toContain('Río Paraná');
    expect(html).toContain('Río Salado');
    expect(html).toContain('Alertas sin verificar');
    expect(html).toContain('Canales esenciales');
    expect(html).toContain('Reportar una situación');
    expect(html).toContain('Fuentes y transparencia');
    expect(html).toContain('Salud de los datos');
    expect(html.match(/<section\b/g)).toHaveLength(4);
    expect(html).not.toContain('Lo importante en Santa Fe');
    expect(html).not.toContain('Sistema Paraná');
    expect(html).not.toContain('Sistema Salado');
    expect(html).not.toContain('Datos en vivo');
    expect(html).not.toContain('<canvas');
  });
});
