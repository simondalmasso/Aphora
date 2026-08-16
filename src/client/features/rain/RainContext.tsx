import type { Snapshot, Source } from '../../../domain/snapshot.ts';
import { formatHumanAge } from '../../../domain/public-safety.ts';

function nasaRainSource(snapshot: Snapshot): Source | undefined {
  return snapshot.sources.find((source) => source.id === 'nasa-gpm-imerg-early');
}

function formatRate(value: number): string {
  const digits = value >= 10 ? 1 : 2;
  return `${value.toFixed(digits).replace('.', ',')} mm/h`;
}

function activeWeatherAlert(snapshot: Snapshot) {
  return snapshot.alerts?.find((alert) => alert.appliesToSantaFe && (alert.lifecycle === 'ACTIVE' || alert.lifecycle === 'UPDATED'));
}

export function RainContext({ snapshot }: { readonly snapshot: Snapshot }) {
  const source = nasaRainSource(snapshot);
  const rate = source?.instantRateMmPerHour;
  const usableRate = source?.connected === true && typeof rate === 'number' && Number.isFinite(rate) && rate >= 0;
  const alert = activeWeatherAlert(snapshot);
  const observedAge = source?.connected ? formatHumanAge(source.observedAt, snapshot.generatedAt) : null;
  const fetchedAge = source?.connected ? formatHumanAge(source.fetchedAt, snapshot.generatedAt) : null;

  return <section className="rain-context" data-testid="rain-context" aria-labelledby="rain-context-title">
    <div className="rain-context__icon" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M9.5 20.5h13a5 5 0 0 0 .4-10 8 8 0 0 0-14.8 2.6A3.8 3.8 0 0 0 9.5 20.5Z"/><path d="M11 24.5 9.8 27M17 24.5 15.8 27M23 24.5 21.8 27"/></svg>
    </div>
    <div className="rain-context__main">
      <span id="rain-context-title">Lluvia en contexto</span>
      <strong>{usableRate ? formatRate(rate) : 'Sin estimación reciente'}</strong>
      <small>{usableRate ? 'Estimación satelital instantánea · NASA IMERG Early' : 'NASA IMERG · sin muestra local utilizable'}</small>
    </div>
    <div className="rain-context__meta">
      {observedAge && <span>Observación · {observedAge}</span>}
      {fetchedAge && <span>Consulta · {fetchedAge}</span>}
      {alert && <a href="#alertas" className="rain-context__alert">Alerta SMN activa</a>}
    </div>
    <p className="sr-only">La lluvia satelital es contexto atmosférico y no determina por sí sola el estado del río.</p>
  </section>;
}
