import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
describe('028 official map contract', () => {
  it('pins exact official endpoints and fail-closed territorial semantics', async () => {
    const source=await readFile('src/client/features/situation/SituationMap.tsx','utf8');
    expect(source).toContain('wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap');
    expect(source).toContain("const IDESF_WMS = 'https://aswe.santafe.gov.ar/idesf/wms'");
    expect(source).toContain("const IDESF_RISK_LAYER = 'areas_de_riesgo_hidrico'");
    expect(source).toContain('No representa una zona inundada ahora');
    expect(source).toContain("setRiskLayerState('UNAVAILABLE')");
  });
  it('keeps map code behind an explicit lazy gate', async () => {
    const gate=await readFile('src/client/features/situation/SituationMapGate.tsx','utf8');
    expect(gate).toContain("lazy(() => import('./SituationMap.tsx'))");
    expect(gate).toContain('open && <Suspense');
  });
});
