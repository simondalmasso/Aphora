import { useId } from 'react';
import type { HydrologicalSystem } from '../../../domain/snapshot';
import { formatLocalDateTime } from '../../../domain/public-safety';

export function HydroSeriesChart({ system }: { readonly system: HydrologicalSystem }) {
  const titleId = useId();
  const descriptionId = useId();
  const points = system.points.filter((point) => Number.isFinite(point.metres)).slice(-48);
  if (points.length < 2) return <div className="chart-unavailable"><p>No hay suficientes puntos observados para construir una serie.</p></div>;
  const values = points.map((point) => point.metres);
  const min = Math.floor((Math.min(...values) - 0.1) * 10) / 10;
  const max = Math.ceil((Math.max(...values) + 0.1) * 10) / 10;
  const range = Math.max(0.1, max - min);
  const plot = points.map((point, index) => ({
    x: 52 + (index / Math.max(1, points.length - 1)) * 596,
    y: 18 + ((max - point.metres) / range) * 172,
    point,
  }));
  const path = plot.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const yTicks = [max, min + range / 2, min];
  const first = points[0]!;
  const last = points.at(-1)!;
  return <div className="hydro-chart">
    <svg viewBox="0 0 700 230" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
      <title id={titleId}>Serie observada de {system.label}</title>
      <desc id={descriptionId}>Niveles en metros desde {formatLocalDateTime(first.at)} hasta {formatLocalDateTime(last.at)}. La tabla posterior contiene los valores.</desc>
      {yTicks.map((tick, index) => <g key={tick}><line x1="52" x2="648" y1={18 + index * 86} y2={18 + index * 86}/><text x="45" y={23 + index * 86} textAnchor="end">{tick.toFixed(1)}</text></g>)}
      <path className="hydro-chart__line" d={path}/>
      {plot.map(({ x, y, point }, index) => <circle key={`${point.at}-${index}`} cx={x} cy={y} r="3"><title>{formatLocalDateTime(point.at)}: {point.metres.toFixed(2)} m</title></circle>)}
      <text x="52" y="218">{formatLocalDateTime(first.at)}</text>
      <text x="648" y="218" textAnchor="end">{formatLocalDateTime(last.at)}</text>
      <text x="18" y="110" transform="rotate(-90 18 110)" textAnchor="middle">Metros</text>
    </svg>
    <details className="data-table-disclosure"><summary>Ver tabla de mediciones</summary><div className="table-scroll"><table><caption>Últimas mediciones de {system.label}</caption><thead><tr><th>Fecha y hora</th><th>Nivel</th><th>Calidad</th></tr></thead><tbody>{points.map((point) => <tr key={point.at}><td>{formatLocalDateTime(point.at)}</td><td>{point.metres.toFixed(2).replace('.', ',')} m</td><td>{point.quality === 'PROVIDER_VALIDATED' ? 'Validada por el proveedor' : 'Publicada operativa'}</td></tr>)}</tbody></table></div></details>
  </div>;
}
