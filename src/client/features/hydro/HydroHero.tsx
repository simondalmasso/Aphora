import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import type { DataStatus, HydrologicalSystem, Snapshot } from '../../../domain/snapshot';

interface Props {
  readonly snapshot: Snapshot;
  readonly refreshing: boolean;
  readonly refreshError: string | null;
  readonly evidenceButtonRef: RefObject<HTMLButtonElement | null>;
  readonly informButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onEvidence: (opener?: HTMLButtonElement | null) => void;
  readonly onInform: (opener?: HTMLButtonElement | null) => void;
}

function dataLabel(status: DataStatus | undefined, mode: Snapshot['mode']): string {
  if (mode === 'OFFLINE' || status === 'OFFLINE') return 'Modo sin conexión';
  if (status === 'LIVE') return 'Datos en vivo';
  if (status === 'STALE') return 'Datos desactualizados';
  return 'Sin datos en vivo';
}

function trendLabel(trend: HydrologicalSystem['trend']): string {
  if (trend === 'RISING') return 'Subiendo';
  if (trend === 'RISING_SLOWLY') return 'Subiendo lentamente';
  if (trend === 'FALLING') return 'Bajando';
  if (trend === 'STABLE') return 'Estable';
  return 'Sin tendencia';
}

function formatTime(value: string | null): string {
  if (!value) return 'sin timestamp';
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(value));
}

function stateFor(system: HydrologicalSystem): string {
  if (!system.available || system.currentMetres === null) return 'Sin datos en vivo';
  const ordered = [...system.thresholds].sort((a, b) => a.metres - b.metres);
  const reached = ordered.filter((threshold) => system.currentMetres! >= threshold.metres).at(-1);
  if (!reached || reached.id === 'NORMAL') return 'Sin umbral de alerta alcanzado';
  if (reached.id === 'EVACUACION') return 'Umbral de evacuación alcanzado; no equivale a una orden oficial';
  return `${reached.label} alcanzado`;
}

function Chart({ system }: { readonly system: HydrologicalSystem }) {
  const titleId = useId();
  const descriptionId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const points = system.points.filter((point) => Number.isFinite(point.metres)).slice(-48);
  const geometry = useMemo(() => {
    if (!points.length) return { plotted: [] as { x: number; y: number }[], path: '', minimum: 0, maximum: 1 };
    const thresholdValues = system.thresholds.map((item) => item.metres);
    const values = [...points.map((point) => point.metres), ...thresholdValues];
    const minimum = Math.min(...values) - .08;
    const maximum = Math.max(...values) + .08;
    const range = Math.max(.01, maximum - minimum);
    const plotted = points.map((point, index) => ({ x: points.length === 1 ? 360 : 24 + index / (points.length - 1) * 466, y: 170 - (point.metres - minimum) / range * 132 }));
    return { plotted, path: plotted.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '), minimum, maximum };
  }, [points, system.thresholds]);
  const y = (value: number) => 170 - (value - geometry.minimum) / Math.max(.01, geometry.maximum - geometry.minimum) * 132;
  const selectFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (!geometry.plotted.length || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(1, bounds.width) * 720;
    let nearest = 0;
    geometry.plotted.forEach((point, index) => { if (Math.abs(point.x - x) < Math.abs(geometry.plotted[nearest]!.x - x)) nearest = index; });
    setActive(nearest);
  };
  const key = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!points.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') return setActive(null);
    if (event.key === 'Home') return setActive(0);
    if (event.key === 'End') return setActive(points.length - 1);
    setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + (event.key === 'ArrowRight' ? 1 : -1))));
  };
  const current = active === null ? null : points[active];
  const marker = active === null ? null : geometry.plotted[active];
  return <div className="hydro-chart" data-testid="main-hydro-chart"><svg ref={svgRef} viewBox="0 0 720 190" role="img" tabIndex={0} aria-labelledby={`${titleId} ${descriptionId}`} onPointerMove={selectFromPointer} onPointerDown={selectFromPointer} onPointerLeave={() => setActive(null)} onKeyDown={key}><title id={titleId}>{`Evolución observada de ${system.watercourse} en ${system.stationName}`}</title><desc id={descriptionId}>{points.length ? `${points.length} lecturas publicadas por la fuente. Usá flechas izquierda y derecha para recorrerlas. Son datos operativos sin validación hidrológica definitiva salvo indicación expresa.` : 'No hay lecturas publicadas disponibles.'}</desc><defs><pattern id="risk-pattern" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M0 8 8 0" stroke="rgba(255,255,255,.13)" strokeWidth="1"/></pattern></defs><rect x="0" y="0" width="720" height="190" rx="18" className="hydro-chart__bg"/>{system.thresholds.map((threshold) => <g key={threshold.id}><line x1="24" x2="696" y1={y(threshold.metres)} y2={y(threshold.metres)} className={`hydro-chart__threshold hydro-chart__threshold--${threshold.id.toLowerCase()}`}/><text x="690" y={y(threshold.metres) - 5} textAnchor="end" className="hydro-chart__threshold-label">{threshold.label} {threshold.metres.toFixed(2)} m</text></g>)}<rect x="510" y="24" width="186" height="146" fill="url(#risk-pattern)" opacity=".28"/><text x="603" y="98" textAnchor="middle" className="hydro-chart__forecast-label">Sin proyección operativa</text>{geometry.path && <path d={geometry.path} className="hydro-chart__line"/>}{geometry.plotted.map((point, index) => <circle key={points[index]!.at} cx={point.x} cy={point.y} r={index === active ? 6 : 3.5} className="hydro-chart__point"/>)}{marker && <><rect x={marker.x - 1} y="20" width="2" height="152" rx="1" className="hydro-chart__crosshair"/><circle cx={marker.x} cy={marker.y} r="7" className="hydro-chart__active-point"/></>}</svg><div className="hydro-chart__axis" aria-hidden="true"><span>Observado</span><strong>Ahora</strong><span>Próximas 24 h</span></div><p className="hydro-chart__readout" data-testid="hydro-chart-active-readout" data-active={current ? 'true' : 'false'} aria-live="polite">{current ? `${formatTime(current.at)} · ${current.metres.toFixed(2)} m · lectura publicada por INA` : points.length ? 'Mové el puntero, tocá el gráfico o usá las flechas para leer cada valor.' : 'No hay una serie observada disponible para esta estación.'}</p></div>;
}

export function HydroHero({ snapshot, refreshing, refreshError, evidenceButtonRef, informButtonRef, onEvidence, onInform }: Props) {
  const systems = snapshot.systems ?? [];
  const initialId = snapshot.river.systemId ?? systems[0]?.id ?? '';
  const [selectedId, setSelectedId] = useState(initialId);
  const selected = systems.find((system) => system.id === selectedId) ?? systems[0];
  const delta = selected?.delta24h;
  return <section className="hydro-hero" aria-labelledby="hydro-title" data-testid="hydro-hero"><header className="hydro-hero__head"><div><span className={`data-status data-status--${(selected?.dataStatus ?? snapshot.dataStatus ?? 'UNAVAILABLE').toLowerCase()}`}>{dataLabel(selected?.dataStatus ?? snapshot.dataStatus, snapshot.mode)}</span><h1 id="hydro-title">Estado hídrico de Santa Fe</h1><p>{selected ? `${selected.watercourse} · estación ${selected.stationName}` : 'Estaciones oficiales'}</p></div><time dateTime={selected?.observedAt ?? snapshot.generatedAt}>{refreshing ? 'Actualizando…' : `Fuente: ${selected?.sourceName ?? 'sin fuente disponible'} · observada ${formatTime(selected?.observedAt ?? null)}`}</time></header><div className="system-tabs" role="tablist" aria-label="Sistemas hídricos">{systems.map((system) => <button type="button" role="tab" aria-selected={system.id === selected?.id} key={system.id} onClick={() => setSelectedId(system.id)}><span>{system.label}</span><small>{system.stationName}</small></button>)}</div><div className="hydro-hero__summary"><div data-testid="hydro-level-metric"><span>Nivel actual</span><strong data-testid="hydro-current-level">{selected?.available && selected.currentMetres !== null ? selected.currentMetres.toFixed(2) : '—'} <small>m</small></strong></div><div><span>Estado</span><strong>{selected ? stateFor(selected) : 'Sin datos en vivo'}</strong></div><div><span>Cambio 24 h</span><strong>{delta === null || delta === undefined ? '—' : `${delta >= 0 ? '+' : ''}${Math.round(delta * 100)} cm`}</strong></div><div><span>Tendencia</span><strong>{selected ? trendLabel(selected.trend) : 'Sin tendencia'}</strong></div></div>{selected ? <Chart system={selected}/> : <p className="hydro-empty">No hay sistemas configurados.</p>}<div className="hydro-hero__action"><p><strong>Recomendación:</strong> {snapshot.recommendedAction}</p><div><button ref={informButtonRef} className="ui-button ui-button--primary" type="button" onClick={(event) => onInform(event.currentTarget)}>Informar</button><button ref={evidenceButtonRef} className="ui-button ui-button--secondary" type="button" onClick={(event) => onEvidence(event.currentTarget)}>Ver evidencia</button></div></div>{(refreshError || snapshot.mode === 'OFFLINE') && <p className="hydro-warning" role="status">{refreshError ?? 'Modo sin conexión. No es información actual.'}</p>}</section>;
}
