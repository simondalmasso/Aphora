import type { RainPoint, RiverPoint } from '../../domain/snapshot';

const WIDTH = 560;
const HEIGHT = 176;
const PAD_X = 16;
const PAD_Y = 18;

function formatClock(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso));
}

export function RiverChart({ points }: { readonly points: readonly RiverPoint[] }) {
  const values = points.map((point) => point.metres);
  const minimum = Math.min(...values) - 0.06;
  const maximum = Math.max(...values) + 0.10;
  const range = maximum - minimum || 1;
  const innerWidth = WIDTH - PAD_X * 2;
  const innerHeight = HEIGHT - PAD_Y * 2;
  const x = (index: number) => PAD_X + (innerWidth * index) / Math.max(points.length - 1, 1);
  const y = (value: number) => PAD_Y + ((maximum - value) / range) * innerHeight;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point.metres)}`).join(' ');
  const area = `${path} L ${x(points.length - 1)} ${HEIGHT - PAD_Y} L ${PAD_X} ${HEIGHT - PAD_Y} Z`;

  return (
    <div className="chart-wrap">
      <svg className="river-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="river-chart-title river-chart-description">
        <title id="river-chart-title">Tendencia del nivel demo durante 24 horas</title>
        <desc id="river-chart-description">Siete mediciones reales del fixture demo, desde {values[0]?.toFixed(2)} hasta {values.at(-1)?.toFixed(2)} metros. Sin interpolaciones presentadas como mediciones.</desc>
        <defs>
          <linearGradient id="water-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1984c5" stopOpacity=".22" />
            <stop offset="1" stopColor="#1984c5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={WIDTH} height={HEIGHT * .22} rx="10" className="threshold-band threshold-high" />
        <rect x="0" y={HEIGHT * .22} width={WIDTH} height={HEIGHT * .23} className="threshold-band threshold-watch" />
        <line x1="0" y1={HEIGHT * .45} x2={WIDTH} y2={HEIGHT * .45} className="grid-line" />
        <path d={area} fill="url(#water-fill)" />
        <path d={path} className="trend-line" pathLength="1" />
        {points.map((point, index) => (
          <circle key={point.at} cx={x(index)} cy={y(point.metres)} r="4" className="data-point" tabIndex={0} role="img" aria-label={`${formatClock(point.at)}: ${point.metres.toFixed(2)} metros, medición demo`}>
            <title>{formatClock(point.at)} · {point.metres.toFixed(2)} m · medición demo</title>
          </circle>
        ))}
      </svg>
      <div className="chart-axis" aria-hidden="true"><span>hace 24 h</span><span>ahora</span></div>
      <p className="chart-note">Bandas visuales demo · no son umbrales oficiales</p>
    </div>
  );
}

export function RainChart({ points }: { readonly points: readonly RainPoint[] }) {
  const maximum = Math.max(...points.map((point) => point.millimetres), 1);
  return (
    <div className="rain-bars" role="img" aria-label="Lluvia demo por hora durante las últimas siete horas">
      {points.map((point) => (
        <div key={point.at} className="rain-column">
          <span className="rain-bar" style={{ height: `${Math.max(8, (point.millimetres / maximum) * 52)}px` }} title={`${formatClock(point.at)} · ${point.millimetres.toFixed(1)} mm`} />
          <small>{formatClock(point.at).slice(0, 2)}</small>
        </div>
      ))}
    </div>
  );
}
