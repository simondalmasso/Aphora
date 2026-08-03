import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ParanaPulse } from '../../src/client/components/ParanaPulse';
import { demoSnapshot } from '../../src/data/demo-snapshot';

describe('Pulso del Paraná progressive rendering', () => {
  it('renders the complete semantic and SVG explanation before WebGL loads', () => {
    const html = renderToStaticMarkup(<ParanaPulse snapshot={demoSnapshot} refreshToken={null} />);
    expect(html).toContain('Pulso del Paraná');
    expect(html).toContain('MÁS ALTO = MÁS RIESGO');
    expect(html).toContain('CELESTE = OBSERVADO');
    expect(html).toContain('ÁMBAR = PROYECCIÓN');
    expect(html).toContain('data-grid-observed="48x10"');
    expect(html).toContain('data-grid-projection="24x16"');
    expect(html).toContain('data-fps-cap="30"');
    expect(html).toContain('data-dpr-cap="1.5"');
    expect(html).toContain('class="pulse-fallback"');
    expect(html).not.toContain('<canvas');
  });
});
