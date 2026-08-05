import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DashboardPage } from '../../src/client/app/DashboardPage';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot';

describe('public-safety progressive rendering', () => {
  it('renders alert verification, real stations, emergency separation and no decorative canvas', () => {
    const html = renderToStaticMarkup(<DashboardPage
      snapshot={unavailableSnapshot}
      refreshing={false}
      refreshError={null}
      sourcesButtonRef={createRef<HTMLButtonElement>()}
      reportButtonRef={createRef<HTMLButtonElement>()}
      onSources={() => undefined}
      onReport={() => undefined}
    />);
    expect(html).toContain('Fuentes de alertas no disponibles');
    expect(html).toContain('Situación actual en Santa Fe');
    expect(html).toContain('Situación hidrométrica');
    expect(html).toContain('Río Paraná — Santa Fe');
    expect(html).toContain('Río Salado — Santo Tomé');
    expect(html).toContain('Última medición');
    expect(html).toContain('Qué hacer ahora');
    expect(html).toContain('Reportar una situación');
    expect(html).toContain('Fuentes, vigencia y metodología');
    expect(html).not.toContain('Sistema Paraná');
    expect(html).not.toContain('Sistema Salado');
    expect(html).not.toContain('Datos en vivo');
    expect(html).not.toContain('<canvas');
  });
});
