import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { changeCopy, changeForSystem, safeStationThresholds } from '../../../domain/hydrometric-context.ts';
import type { HydrologicalSystem, RiverPoint } from '../../../domain/snapshot.ts';
import { formatHumanAge, formatLocalDateTime, isPublicTimestamp, LOCAL_TIME_ZONE } from '../../../domain/public-safety.ts';

const WIDTH = 760;
const HEIGHT = 286;
const LEFT = 58;
const RIGHT = 18;
const TOP = 24;
const BOTTOM = 42;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
const WINDOWS = [24, 72, 168] as const;
type WindowHours = typeof WINDOWS[number];

function freshnessLabel(system: HydrologicalSystem): string {
  if (system.freshness === 'ACTUALIZADO') return 'vigente';
  if (system.freshness === 'ACTUALIZACION_DEMORADA') return 'con actualización demorada';
  if (system.freshness === 'DESACTUALIZADO') return 'desactualizada';
  return 'sin vigencia confirmada';
}

function qualityLabel(point: RiverPoint): string {
  if (point.quality === 'PROVIDER_VALIDATED') return 'Validada por el organismo';
  if (point.quality === 'PUBLISHED_OPERATIONAL') return 'Publicada por el organismo';
  return 'Calidad no informada';
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', timeZone: LOCAL_TIME_ZONE }).format(new Date(value));
}

function median(values: readonly number[]): number {
  if (!values.length) return 60 * 60_000;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle]! : (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function labelForWindow(hours: WindowHours): string {
  return hours === 168 ? '7 días' : `${hours} h`;
}

export function HydroSeriesChart({ system, generatedAt }: { readonly system: HydrologicalSystem; readonly generatedAt: string }) {
  const titleId = useId();
  const descriptionId = useId();
  const patternId = useId().replaceAll(':', '');
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [windowHours, setWindowHours] = useState<WindowHours>(24);
  const allPoints = useMemo(() => system.points
    .filter((point) => Number.isFinite(point.metres) && isPublicTimestamp(point.at)), [system.points]);
  const safeThresholds = useMemo(() => safeStationThresholds(system), [system]);
  const latestTime = allPoints.length ? Date.parse(allPoints.at(-1)!.at) : 0;
  const availableSpanHours = allPoints.length > 1 ? (latestTime - Date.parse(allPoints[0]!.at)) / 3_600_000 : 0;
  const points = useMemo(() => {
    if (!allPoints.length) return [];
    const start = latestTime - windowHours * 3_600_000;
    const selected = allPoints.filter((point) => Date.parse(point.at) >= start);
    return selected.length >= 2 ? selected : allPoints.slice(-Math.min(48, allPoints.length));
  }, [allPoints, latestTime, windowHours]);

  const geometry = useMemo(() => {
    if (!points.length) return null;
    const timestamps = points.map((point) => Date.parse(point.at));
    const intervals = timestamps.slice(1).map((value, index) => value - timestamps[index]!).filter((value) => value > 0);
    const gapLimit = Math.max(6 * 60 * 60_000, median(intervals) * 2.5);
    const values = points.map((point) => point.metres);
    const rawMinimum = Math.min(...values);
    const rawMaximum = Math.max(...values);
    const rawSpan = Math.max(.02, rawMaximum - rawMinimum);
    const padding = Math.max(.05, rawSpan * .18);
    const minimum = Math.floor((rawMinimum - padding) * 100) / 100;
    const maximum = Math.ceil((rawMaximum + padding) * 100) / 100;
    const range = Math.max(.1, maximum - minimum);
    const minimumTime = timestamps[0]!;
    const maximumTime = timestamps.at(-1)!;
    const timeRange = Math.max(1, maximumTime - minimumTime);
    const plotted = points.map((point, index) => ({
      x: LEFT + ((timestamps[index]! - minimumTime) / timeRange) * PLOT_WIDTH,
      y: TOP + ((maximum - point.metres) / range) * PLOT_HEIGHT,
      point,
    }));
    const segments: Array<typeof plotted> = [];
    const gaps: Array<{ fromX: number; toX: number; fromAt: string; toAt: string }> = [];
    let current: typeof plotted = [];
    plotted.forEach((item, index) => {
      if (index > 0 && timestamps[index]! - timestamps[index - 1]! > gapLimit) {
        if (current.length) segments.push(current);
        const previous = plotted[index - 1]!;
        gaps.push({ fromX: previous.x, toX: item.x, fromAt: previous.point.at, toAt: item.point.at });
        current = [];
      }
      current.push(item);
    });
    if (current.length) segments.push(current);
    const yTicks = Array.from({ length: 4 }, (_, index) => maximum - (range * index) / 3);
    const xTicks = [0, .5, 1].map((ratio) => {
      const timestamp = minimumTime + timeRange * ratio;
      return { x: LEFT + PLOT_WIDTH * ratio, at: new Date(timestamp).toISOString() };
    });
    const visibleThresholds = safeThresholds.filter((threshold) => threshold.metres >= minimum && threshold.metres <= maximum);
    const externalThresholds = safeThresholds.filter((threshold) => threshold.metres < minimum || threshold.metres > maximum);
    return { minimum, maximum, range, plotted, segments, gaps, yTicks, xTicks, visibleThresholds, externalThresholds };
  }, [points, safeThresholds]);

  if (!geometry || points.length < 2) {
    return <div className="hydro-chart hydro-chart--unavailable" data-testid="main-hydro-chart"><div className="hydro-chart__meta"><span><strong>Última observación</strong>{formatLocalDateTime(system.observedAt)}</span><span><strong>Vigencia</strong>{freshnessLabel(system)}</span></div><p>No hay suficientes mediciones observadas para construir una serie histórica.</p></div>;
  }

  const y = (value: number) => TOP + ((geometry.maximum - value) / geometry.range) * PLOT_HEIGHT;
  const active = activeIndex === null ? null : geometry.plotted[activeIndex];
  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * WIDTH;
    let nearest = 0;
    geometry.plotted.forEach((point, index) => {
      if (Math.abs(point.x - pointerX) < Math.abs(geometry.plotted[nearest]!.x - pointerX)) nearest = index;
    });
    setActiveIndex(nearest);
  };
  const handleKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') return setActiveIndex(null);
    if (event.key === 'Home') return setActiveIndex(0);
    if (event.key === 'End') return setActiveIndex(points.length - 1);
    setActiveIndex((current) => Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
  };
  const tooltipX = active ? Math.min(WIDTH - 206, Math.max(LEFT + 8, active.x - 92)) : 0;
  const tooltipY = active ? Math.max(TOP + 6, active.y - 70) : 0;

  return <div
    className="hydro-chart hydro-chart--contextual"
    data-testid="main-hydro-chart"
    data-plot-min={geometry.minimum.toFixed(2)}
    data-plot-max={geometry.maximum.toFixed(2)}
    data-window-hours={windowHours}
  >
    <header className="hydro-chart__context-head">
      <div><span>Cómo viene</span><strong>{changeCopy(changeForSystem(system, windowHours), windowHours)}</strong></div>
      <div className="hydro-chart__windows" aria-label="Período del gráfico">
        {WINDOWS.map((hours) => <button
          key={hours}
          type="button"
          aria-pressed={windowHours === hours}
          disabled={availableSpanHours < Math.min(hours * .75, hours - 1)}
          onClick={() => { setWindowHours(hours); setActiveIndex(null); }}
        >{labelForWindow(hours)}</button>)}
      </div>
    </header>
    <div className="hydro-chart__meta">
      <span><strong>Última observación</strong>{formatLocalDateTime(system.observedAt)} · {formatHumanAge(system.observedAt, generatedAt)}</span>
      <span><strong>Vigencia</strong>{freshnessLabel(system)} · hasta {formatLocalDateTime(system.validUntil)}</span>
    </div>
    <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" tabIndex={0} aria-labelledby={`${titleId} ${descriptionId}`} onFocus={() => setActiveIndex((current) => current ?? points.length - 1)} onPointerMove={selectFromPointer} onPointerDown={selectFromPointer} onPointerLeave={() => setActiveIndex(null)} onKeyDown={handleKey}>
      <title id={titleId}>Evolución observada de {system.label}</title>
      <desc id={descriptionId}>{points.length} mediciones del período seleccionado. La escala vertical se ajusta a la serie reciente para no comprimir cambios de centímetros; las referencias lejanas se informan fuera del gráfico. Las discontinuidades no se interpolan.</desc>
      <defs><pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 8 0" className="hydro-chart__gap-pattern"/></pattern></defs>
      <rect className="hydro-chart__plot" x={LEFT} y={TOP} width={PLOT_WIDTH} height={PLOT_HEIGHT} rx="10"/>
      {geometry.yTicks.map((tick) => <g key={tick}><line className="hydro-chart__grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)}/><text className="hydro-chart__axis-label" x={LEFT - 9} y={y(tick) + 4} textAnchor="end">{tick.toFixed(2).replace('.', ',')}</text></g>)}
      {geometry.xTicks.map((tick) => <g key={tick.at}><text className="hydro-chart__axis-label" x={tick.x} y={HEIGHT - 16} textAnchor={tick.x === LEFT ? 'start' : tick.x === WIDTH - RIGHT ? 'end' : 'middle'}>{shortDate(tick.at)}</text></g>)}
      <text className="hydro-chart__unit" x="17" y={TOP + PLOT_HEIGHT / 2} transform={`rotate(-90 17 ${TOP + PLOT_HEIGHT / 2})`} textAnchor="middle">Altura de escala (m)</text>
      {geometry.visibleThresholds.map((threshold) => <g key={threshold.id}><line x1={LEFT} x2={WIDTH - RIGHT} y1={y(threshold.metres)} y2={y(threshold.metres)} className={`hydro-chart__threshold hydro-chart__threshold--${threshold.id.toLowerCase()}`}/><text x={WIDTH - RIGHT - 8} y={y(threshold.metres) - 5} textAnchor="end" className="hydro-chart__threshold-label">{threshold.label} · {threshold.metres.toFixed(2).replace('.', ',')} m</text></g>)}
      {geometry.gaps.map((gap) => <g className="hydro-chart__gap" key={`${gap.fromAt}-${gap.toAt}`}><rect x={gap.fromX} y={TOP} width={Math.max(3, gap.toX - gap.fromX)} height={PLOT_HEIGHT} fill={`url(#${patternId})`}/>{gap.toX - gap.fromX > 58 && <text x={(gap.fromX + gap.toX) / 2} y={TOP + PLOT_HEIGHT / 2} textAnchor="middle">Sin datos</text>}</g>)}
      {geometry.segments.map((segment, index) => <path key={index} className="hydro-chart__line" d={segment.map((point, pointIndex) => `${pointIndex ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')}/>)}
      {geometry.plotted.map((point, index) => <circle key={`${point.point.at}-${index}`} cx={point.x} cy={point.y} r={index === activeIndex ? 5.5 : 3} className={index === activeIndex ? 'hydro-chart__point hydro-chart__point--active' : 'hydro-chart__point'}/>) }
      {active && <g className="hydro-chart__tooltip" aria-hidden="true"><line x1={active.x} x2={active.x} y1={TOP} y2={HEIGHT - BOTTOM}/><rect x={tooltipX} y={tooltipY} width="198" height="58" rx="9"/><text x={tooltipX + 12} y={tooltipY + 22}>{formatLocalDateTime(active.point.at)}</text><text x={tooltipX + 12} y={tooltipY + 44}>{active.point.metres.toFixed(2).replace('.', ',')} m · {qualityLabel(active.point)}</text></g>}
    </svg>
    {geometry.externalThresholds.length > 0 && <p className="hydro-chart__external-reference"><strong>Referencias fuera de esta escala reciente:</strong> {geometry.externalThresholds.map((threshold) => `${threshold.label} ${threshold.metres.toFixed(2).replace('.', ',')} m`).join(' · ')}</p>}
    <p className="hydro-chart__readout" aria-live="polite">{active ? `${formatLocalDateTime(active.point.at)}: ${active.point.metres.toFixed(2).replace('.', ',')} metros. ${qualityLabel(active.point)}.` : 'Tocá o recorré el gráfico con las flechas para leer cada medición.'}</p>
    <details className="data-table-disclosure"><summary>Ver tabla de mediciones</summary><div className="table-scroll"><table><caption>Mediciones de {system.label} · {labelForWindow(windowHours)}</caption><thead><tr><th>Fecha y hora</th><th>Altura de escala</th><th>Calidad</th></tr></thead><tbody>{points.map((point) => <tr key={point.at}><td>{formatLocalDateTime(point.at)}</td><td>{point.metres.toFixed(2).replace('.', ',')} m</td><td>{qualityLabel(point)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
