import { lazy, Suspense, useState } from 'react';
import type { Snapshot } from '../../../domain/snapshot.ts';

const SituationMap = lazy(() => import('./SituationMap.tsx'));

export function SituationMapGate({ snapshot }: { readonly snapshot: Snapshot }) {
  const [open, setOpen] = useState(false);
  return <section className="situation-map-gate" aria-labelledby="situation-map-title" data-testid="situation-map-gate">
    <div className="situation-map-gate__copy">
      <span>Contexto territorial</span>
      <h3 id="situation-map-title">Mapa oficial, cuando lo necesitás</h3>
      <p>Estaciones y áreas oficiales de riesgo hídrico. El mapa no representa zonas inundadas en tiempo real.</p>
    </div>
    {!open && <button type="button" onClick={() => setOpen(true)} data-testid="open-situation-map">Abrir mapa</button>}
    {open && <Suspense fallback={<div className="situation-map-loading" role="status">Cargando mapa oficial…</div>}><SituationMap snapshot={snapshot}/></Suspense>}
  </section>;
}
