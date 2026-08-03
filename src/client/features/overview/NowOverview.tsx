import type { Snapshot } from '../../../domain/snapshot';
import { Sparkline } from '../../components/ui/Sparkline';

function trendLabel(trend: Snapshot['river']['trend']) {
  if (trend === 'RISING') return 'Sube';
  if (trend === 'RISING_SLOWLY') return 'Sube lento';
  if (trend === 'FALLING') return 'Baja';
  if (trend === 'STABLE') return 'Estable';
  return 'Sin tendencia';
}

export function NowOverview({ snapshot }: { readonly snapshot: Snapshot }) {
  const forecastValues = snapshot.river.forecastPoints.map((point) => point.metres);
  const forecastEnd = snapshot.river.forecastPoints.at(-1)?.metres ?? snapshot.river.currentMetres;
  const forecastDeltaCm = Math.round((forecastEnd - snapshot.river.currentMetres) * 100);
  return <section className="v3-card now-overview" aria-labelledby="now-overview-title" data-primary-section="true"><header className="v3-card__header"><div><span className="v3-eyebrow">Lectura rápida</span><h2 id="now-overview-title">Ahora</h2></div><span className="status-chip status-chip--watch">Vigilancia</span></header><div className="signal-grid"><article className="signal-card"><div className="signal-card__top"><span className="signal-icon" aria-hidden="true">≈</span><span>Río</span></div><strong>{snapshot.river.delta24h >= 0 ? '+' : ''}{Math.round(snapshot.river.delta24h * 100)} <small>cm</small></strong><span>{trendLabel(snapshot.river.trend)} en 24 h</span><Sparkline values={snapshot.river.points.map((point) => point.metres)} label="Tendencia del río" description={`El nivel demo termina en ${snapshot.river.currentMetres.toFixed(2)} metros y ${trendLabel(snapshot.river.trend).toLowerCase()}.`} /></article><article className="signal-card"><div className="signal-card__top"><span className="signal-icon" aria-hidden="true">◌</span><span>Lluvia</span></div><strong>{snapshot.rain.accumulated24hMm.toFixed(1)} <small>mm</small></strong><span>{snapshot.rain.accumulated1hMm.toFixed(1)} mm en la última hora</span><Sparkline values={snapshot.rain.points.map((point) => point.millimetres)} label="Lluvia reciente" description={`${snapshot.rain.accumulated24hMm.toFixed(1)} milímetros acumulados en 24 horas dentro del escenario demo.`} tone="rain" /></article><article className="signal-card"><div className="signal-card__top"><span className="signal-icon" aria-hidden="true">◇</span><span>24 horas</span></div><strong>{forecastDeltaCm >= 0 ? '+' : ''}{forecastDeltaCm} <small>cm</small></strong><span>Proyección central demo</span><Sparkline values={forecastValues} label="Proyección de nivel" description={`La proyección demo central termina ${Math.abs(forecastDeltaCm)} centímetros ${forecastDeltaCm >= 0 ? 'por encima' : 'por debajo'} del nivel actual.`} tone="forecast" /></article></div></section>;
}
