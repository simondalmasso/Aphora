import type { Snapshot } from '../../../domain/snapshot';
import { LevelGauge } from '../../components/ui/LevelGauge';
import { Sparkline } from '../../components/ui/Sparkline';

export function OutlookCard({ snapshot }: { readonly snapshot: Snapshot }) {
  const nextThreshold = snapshot.river.thresholds.find((threshold) => threshold.metres > snapshot.river.currentMetres) ?? snapshot.river.thresholds.at(-1)!;
  const marginCm = Math.max(0, Math.round((nextThreshold.metres - snapshot.river.currentMetres) * 100));
  const forecastEnd = snapshot.river.forecastPoints.at(-1);
  const forecastValues = snapshot.river.forecastPoints.map((point) => point.metres);
  const uncertaintyCm = forecastEnd ? Math.round((forecastEnd.highMetres - forecastEnd.lowMetres) * 100) : 0;
  return <section className="v3-card outlook-card" aria-labelledby="outlook-title" data-primary-section="true"><header className="v3-card__header"><div><span className="v3-eyebrow">Proyección demo</span><h2 id="outlook-title">Próximas horas</h2></div><span className="outlook-window">+24 h</span></header><div className="outlook-layout"><LevelGauge currentMetres={snapshot.river.currentMetres} thresholds={snapshot.river.thresholds} stateLabel={snapshot.stateLabel} /><div className="outlook-copy"><div className="outlook-metric"><span>Próximo umbral</span><strong>{nextThreshold.label}</strong><small>{nextThreshold.metres.toFixed(2)} m · margen {marginCm} cm</small></div><Sparkline values={forecastValues} label="Curva proyectada" description={`Proyección demo con una incertidumbre final de ${uncertaintyCm} centímetros.`} tone="forecast" /><p><span className="uncertainty-dot" aria-hidden="true" />Rango de incertidumbre final: <strong>{uncertaintyCm} cm</strong>. Crece hacia el final del período.</p></div></div></section>;
}
