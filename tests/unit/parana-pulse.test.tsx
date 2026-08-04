import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HydroHero } from '../../src/client/features/hydro/HydroHero';
import { unavailableSnapshot } from '../../src/data/unavailable-snapshot';

describe('Estado hídrico progressive rendering', () => {
  it('renders semantic station controls and SVG fallback before any optional visual enhancement', () => {
    const evidenceButtonRef = createRef<HTMLButtonElement>();
    const informButtonRef = createRef<HTMLButtonElement>();
    const html = renderToStaticMarkup(<HydroHero
      snapshot={unavailableSnapshot}
      refreshing={false}
      refreshError={null}
      evidenceButtonRef={evidenceButtonRef}
      informButtonRef={informButtonRef}
      onEvidence={() => undefined}
      onInform={() => undefined}
    />);
    expect(html).toContain('Estado hídrico de Santa Fe');
    expect(html).toContain('Sistema Paraná');
    expect(html).toContain('Sistema Salado');
    expect(html).toContain('Sin datos en vivo');
    expect(html).toContain('data-testid="main-hydro-chart"');
    expect(html).toContain('role="img"');
    expect(html).toContain('Informar');
    expect(html).toContain('Ver evidencia');
    expect(html).not.toContain('<canvas');
  });
});
