import type { Snapshot } from '../../../domain/snapshot.ts';

export function GoogleFloodFusionPanel({ snapshot }: { readonly snapshot: Snapshot }) {
  const f = snapshot.googleFlood;
  const s = f?.accessMode === 'APPROVED_LIVE_API' ? f.signals.find((x) => x.freshness === 'CURRENT') : undefined;
  if (!f || !s) return null;
  return <section className="google-flood-fusion" data-testid="google-flood-fusion"><h3>Google Flood · modelo suplementario</h3><strong>No es alerta oficial</strong><p>{f.reconciliation.explanation}</p><p><b>{s.river || s.siteName}</b> · {s.modelSeverity} · {s.forecastTrend} · {s.forecastUnit ?? 'unidad n/d'}</p><small>{s.issuedAt} → {s.validTo} · {s.qualityVerified ? 'qualityVerified' : 'Confianza reducida: qualityVerified=false'} · {s.gaugeModelId ?? 'sin modelo'}</small>{s.polygonIds.length > 0 && <small>Mapa modelado; no representa extensión observada actual.</small>}<p><a href={f.floodHubUrl} target="_blank" rel="noreferrer">Flood Hub · CC BY 4.0</a></p></section>;
}
