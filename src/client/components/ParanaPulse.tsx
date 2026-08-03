import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import type { BufferGeometry, Material, Object3D, WebGLRenderer } from 'three';
import type { Snapshot } from '../../domain/snapshot';

const PULSE_RENDER_BUDGET = Object.freeze({
  observedSegments: Object.freeze({ x: 48, y: 10 }),
  projectionSegments: Object.freeze({ x: 24, y: 16 }),
  fps: 30,
  dpr: 1.5,
  particles: 18,
});

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 170;
const OBSERVED_END_X = 468;
const CHART_PAD_Y = 14;

type RendererState = 'fallback' | 'loading' | 'running' | 'paused' | 'static';

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolate(values: readonly number[], progress: number) {
  const scaled = clamp(progress, 0, 1) * Math.max(values.length - 1, 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(values.length - 1, lower + 1);
  const mix = scaled - lower;
  return (values[lower] ?? 0) * (1 - mix) + (values[upper] ?? values[lower] ?? 0) * mix;
}

function linePath(points: readonly { readonly x: number; readonly y: number }[]) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function areaPath(top: readonly { readonly x: number; readonly y: number }[], bottom: readonly { readonly x: number; readonly y: number }[]) {
  return `${linePath(top)} ${[...bottom].reverse().map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')} Z`;
}

function formatDateTime(iso: string) {
  const parts = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Cordoba' }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value.replace('.', '') ?? '';
  return `${value('day')} ${value('month')}, ${value('hour')}:${value('minute')}`;
}

function staticChartData(snapshot: Snapshot) {
  const { points, forecastPoints, thresholds } = snapshot.river;
  const values = [
    ...points.map((point) => point.metres),
    ...forecastPoints.flatMap((point) => [point.lowMetres, point.metres, point.highMetres]),
    ...thresholds.map((threshold) => threshold.metres),
  ];
  const minimum = Math.min(...values) - 0.06;
  const maximum = Math.max(...values) + 0.08;
  const range = maximum - minimum || 1;
  const y = (value: number) => CHART_PAD_Y + ((maximum - value) / range) * (VIEWBOX_HEIGHT - CHART_PAD_Y * 2);
  const observed = points.map((point, index) => ({ x: 10 + (index / Math.max(points.length - 1, 1)) * (OBSERVED_END_X - 10), y: y(point.metres) }));
  const forecast = forecastPoints.map((point, index) => ({ x: OBSERVED_END_X + (index / Math.max(forecastPoints.length - 1, 1)) * (VIEWBOX_WIDTH - OBSERVED_END_X - 10), y: y(point.metres) }));
  const low = forecastPoints.map((point, index) => ({ x: OBSERVED_END_X + (index / Math.max(forecastPoints.length - 1, 1)) * (VIEWBOX_WIDTH - OBSERVED_END_X - 10), y: y(point.lowMetres) }));
  const high = forecastPoints.map((point, index) => ({ x: OBSERVED_END_X + (index / Math.max(forecastPoints.length - 1, 1)) * (VIEWBOX_WIDTH - OBSERVED_END_X - 10), y: y(point.highMetres) }));
  return { observed, forecast, low, high, y };
}

function PulseFallback({ snapshot, hidden }: { readonly snapshot: Snapshot; readonly hidden: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const chart = useMemo(() => staticChartData(snapshot), [snapshot]);
  return (
    <svg className="pulse-fallback" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`} aria-hidden={hidden || undefined}>
      <title id={titleId}>Superficies del Pulso del Paraná</title>
      <desc id={descriptionId}>Celeste muestra el nivel demo observado durante 48 horas. Ámbar y violeta muestran la proyección demo y su incertidumbre durante 24 horas.</desc>
      <defs>
        <linearGradient id="observed-surface" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#77dcff" stopOpacity=".76" /><stop offset="1" stopColor="#197ba7" stopOpacity=".08" /></linearGradient>
        <linearGradient id="forecast-surface" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#f3b74c" stopOpacity=".58" /><stop offset="1" stopColor="#a975ef" stopOpacity=".48" /></linearGradient>
      </defs>
      {snapshot.river.thresholds.map((threshold) => <line key={threshold.id} x1="8" x2={VIEWBOX_WIDTH - 8} y1={chart.y(threshold.metres)} y2={chart.y(threshold.metres)} className={`pulse-threshold-line pulse-threshold-line--${threshold.id.toLowerCase()}`} />)}
      <path d={`${linePath(chart.observed)} L ${OBSERVED_END_X} ${VIEWBOX_HEIGHT - 8} L 10 ${VIEWBOX_HEIGHT - 8} Z`} fill="url(#observed-surface)" />
      <path d={areaPath(chart.high, chart.low)} fill="url(#forecast-surface)" />
      <path d={linePath(chart.observed)} className="pulse-observed-line" />
      <path d={linePath(chart.forecast)} className="pulse-forecast-line" />
      <line x1={OBSERVED_END_X} x2={OBSERVED_END_X} y1="8" y2={VIEWBOX_HEIGHT - 8} className="pulse-now-line" />
      <circle cx={OBSERVED_END_X} cy={chart.observed.at(-1)!.y} r="7" className="pulse-now-dot" />
    </svg>
  );
}

function PulseMiniChart({ snapshot }: { readonly snapshot: Snapshot }) {
  const titleId = useId();
  const descriptionId = useId();
  const chart = useMemo(() => staticChartData(snapshot), [snapshot]);
  return (
    <div className="pulse-mini-chart">
      <div className="pulse-mini-head"><span>Variación horaria</span><span>48 h observadas · 24 h proyectadas</span></div>
      <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
        <title id={titleId}>Variación horaria del nivel demo</title>
        <desc id={descriptionId}>La línea celeste observada asciende hasta {snapshot.river.currentMetres.toFixed(2)} metros. La línea ámbar proyectada continúa con una banda violeta de incertidumbre creciente.</desc>
        <path d={areaPath(chart.high, chart.low)} className="pulse-mini-uncertainty" />
        <path d={linePath(chart.observed)} className="pulse-mini-observed" />
        <path d={linePath(chart.forecast)} className="pulse-mini-forecast" />
        <line x1={OBSERVED_END_X} x2={OBSERVED_END_X} y1="4" y2={VIEWBOX_HEIGHT - 4} className="pulse-now-line" />
        <circle cx={OBSERVED_END_X} cy={chart.observed.at(-1)!.y} r="6" className="pulse-now-dot" />
      </svg>
      <div className="pulse-mini-axis" aria-hidden="true"><span>−48 h</span><strong>AHORA</strong><span>+24 h</span></div>
    </div>
  );
}

function disposeObject(object: Object3D) {
  object.traverse((child) => {
    const disposable = child as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    disposable.geometry?.dispose();
    if (Array.isArray(disposable.material)) disposable.material.forEach((material) => material.dispose());
    else disposable.material?.dispose();
  });
}

interface ParanaPulseProps {
  readonly snapshot: Snapshot;
  readonly refreshToken: string | null;
  readonly online: boolean;
  readonly savedAt: string | null;
  readonly refreshing: boolean;
  readonly refreshError: string | null;
  readonly evidenceButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onEvidence: () => void;
  readonly onShare: () => void;
  readonly shareStatus: string | null;
}

export function ParanaPulse({ snapshot, refreshToken, online, savedAt, refreshing, refreshError, evidenceButtonRef, onEvidence, onShare, shareStatus }: ParanaPulseProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [rendererState, setRendererState] = useState<RendererState>('loading');
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const forceFallback = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pulseFallback');
  const nextThreshold = snapshot.river.thresholds.find((threshold) => threshold.metres > snapshot.river.currentMetres) ?? snapshot.river.thresholds.at(-1)!;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || forceFallback) {
      setRendererState('fallback');
      return;
    }
    const host = mount;

    let disposed = false;
    let initialized = false;
    let visible = false;
    let frame = 0;
    let lastFrameAt = 0;
    let renderer: WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cleanupPointer: () => void = () => undefined;
    let renderOnce: () => void = () => undefined;
    let startLoop: () => void = () => undefined;

    const intersectionObserver = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (!visible) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        if (initialized && !reducedMotion) setRendererState('paused');
        return;
      }
      if (!initialized) void initialize();
      else if (reducedMotion) {
        renderOnce();
        setRendererState('static');
      } else startLoop();
    }, { rootMargin: '80px 0px' });

    async function initialize() {
      initialized = true;
      try {
        const THREE = await import('../three/pulse-three');
        if (disposed) return;
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
        camera.position.set(-0.45, 4.4, 7.8);
        camera.lookAt(-0.55, 0.62, 0);
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PULSE_RENDER_BUDGET.dpr));
        renderer.shadowMap.enabled = false;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.domElement.className = 'pulse-webgl';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.replaceChildren(renderer.domElement);

        const root = new THREE.Group();
        const surfaceGroup = new THREE.Group();
        root.add(surfaceGroup);
        scene.add(root);
        const observedValues = snapshot.river.points.map((point) => point.metres);
        const forecastValues = snapshot.river.forecastPoints.map((point) => point.metres);
        const forecastWidths = snapshot.river.forecastPoints.map((point) => point.highMetres - point.lowMetres);
        const levelFloor = Math.min(snapshot.river.points[0]!.metres, snapshot.river.thresholds[0]!.metres) - 0.16;
        const levelHeight = (value: number) => Math.max(0.02, (value - levelFloor) * 2.42);

        function surfaceGeometry(values: readonly number[], xStart: number, xEnd: number, xSegments: number, ySegments: number, widthAt: (progress: number) => number) {
          const positions: number[] = [];
          const indices: number[] = [];
          for (let xIndex = 0; xIndex <= xSegments; xIndex += 1) {
            const progress = xIndex / xSegments;
            const level = interpolate(values, progress);
            const halfWidth = widthAt(progress);
            for (let yIndex = 0; yIndex <= ySegments; yIndex += 1) {
              const lateral = yIndex / ySegments * 2 - 1;
              positions.push(xStart + (xEnd - xStart) * progress, levelHeight(level) - Math.abs(lateral) ** 1.6 * 0.045, lateral * halfWidth);
            }
          }
          for (let xIndex = 0; xIndex < xSegments; xIndex += 1) {
            for (let yIndex = 0; yIndex < ySegments; yIndex += 1) {
              const row = ySegments + 1;
              const a = xIndex * row + yIndex;
              const b = a + row;
              indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geometry.setIndex(indices);
          return geometry;
        }

        function addSurface(geometry: BufferGeometry, color: number, wireColor: number) {
          const fill = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.64, side: THREE.DoubleSide, depthWrite: false }));
          const wire = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({ color: wireColor, transparent: true, opacity: 0.17, wireframe: true, depthWrite: false }));
          surfaceGroup.add(fill, wire);
        }

        addSurface(surfaceGeometry(observedValues, -4.1, 0, PULSE_RENDER_BUDGET.observedSegments.x, PULSE_RENDER_BUDGET.observedSegments.y, () => 0.74), 0x46c8ef, 0xbcefff);
        addSurface(surfaceGeometry(forecastValues, 0, 2.55, PULSE_RENDER_BUDGET.projectionSegments.x, PULSE_RENDER_BUDGET.projectionSegments.y, (progress) => 0.65 + interpolate(forecastWidths, progress) * 3.6), 0xd58b4d, 0xc59aff);

        const thresholdColors = [0x4f9d78, 0xd49b3a, 0xe27647, 0xc06586];
        snapshot.river.thresholds.forEach((threshold, index) => {
          const geometry = new THREE.PlaneGeometry(6.8, 3.0, 1, 1);
          geometry.rotateX(-Math.PI / 2);
          const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: thresholdColors[index], transparent: true, opacity: index === 1 ? 0.08 : 0.035, side: THREE.DoubleSide, depthWrite: false }));
          plane.position.set(-0.72, levelHeight(threshold.metres), 0);
          root.add(plane);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: thresholdColors[index], transparent: true, opacity: index === 1 ? 0.42 : 0.22 }));
          edges.position.copy(plane.position);
          root.add(edges);
        });

        const currentY = levelHeight(snapshot.river.currentMetres);
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), new THREE.MeshBasicMaterial({ color: 0xe9fbff }));
        marker.position.set(0, currentY + 0.1, 0);
        root.add(marker);
        const proximity = clamp(1 - (nextThreshold.metres - snapshot.river.currentMetres) / 0.3, 0, 1);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.14, 0.21 + proximity * 0.05, 24), new THREE.MeshBasicMaterial({ color: proximity > 0.72 ? 0xf2bc58 : 0x7ee1ff, transparent: true, opacity: 0.5 + proximity * 0.28, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(marker.position);
        root.add(ring);

        const particlePositions = new Float32Array(PULSE_RENDER_BUDGET.particles * 3);
        for (let index = 0; index < PULSE_RENDER_BUDGET.particles; index += 1) {
          const progress = index / PULSE_RENDER_BUDGET.particles;
          particlePositions[index * 3] = -4.08 + progress * 4.02;
          particlePositions[index * 3 + 1] = levelHeight(interpolate(observedValues, progress)) + 0.035;
          particlePositions[index * 3 + 2] = ((index % 5) / 4 - 0.5) * 1.1;
        }
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
        const particles = new THREE.Points(particleGeometry, new THREE.PointsMaterial({ color: 0xc6f4ff, size: 0.035, transparent: true, opacity: 0.38, depthWrite: false }));
        root.add(particles);

        let parallaxX = 0;
        let parallaxY = 0;
        let targetX = 0;
        let targetY = 0;
        const pointerMove = (event: PointerEvent) => {
          if (reducedMotion || (event.pointerType === 'touch' && event.pressure === 0)) return;
          const bounds = host.getBoundingClientRect();
          targetX = clamp(((event.clientX - bounds.left) / Math.max(bounds.width, 1) - 0.5) * 0.16, -0.08, 0.08);
          targetY = clamp(((event.clientY - bounds.top) / Math.max(bounds.height, 1) - 0.5) * 0.08, -0.04, 0.04);
        };
        const pointerLeave = () => { targetX = 0; targetY = 0; };
        host.addEventListener('pointermove', pointerMove, { passive: true });
        host.addEventListener('pointerleave', pointerLeave, { passive: true });
        cleanupPointer = () => {
          host.removeEventListener('pointermove', pointerMove);
          host.removeEventListener('pointerleave', pointerLeave);
        };

        function resize() {
          if (!renderer) return;
          const bounds = host.getBoundingClientRect();
          const width = Math.max(1, Math.round(bounds.width));
          const height = Math.max(1, Math.round(bounds.height));
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
        resizeObserver = new ResizeObserver(() => { resize(); if (visible) renderOnce(); });
        resizeObserver.observe(host);
        resize();

        const startedAt = performance.now();
        renderOnce = () => renderer?.render(scene, camera);
        const animate = (now: number) => {
          frame = 0;
          if (disposed || !visible || !renderer) return;
          if (now - lastFrameAt >= 1000 / PULSE_RENDER_BUDGET.fps) {
            const seconds = now / 1000;
            lastFrameAt = now;
            parallaxX += (targetX - parallaxX) * 0.08;
            parallaxY += (targetY - parallaxY) * 0.08;
            root.rotation.y = parallaxX;
            root.rotation.x = parallaxY;
            surfaceGroup.position.y = Math.sin(seconds * 0.72) * 0.008;
            const morph = clamp((now - startedAt) / 620, 0, 1);
            surfaceGroup.scale.y = 0.88 + (1 - (1 - morph) ** 3) * 0.12;
            const pulse = 1 + Math.sin(seconds * 2.6) * 0.16;
            ring.scale.setScalar(pulse);
            ring.material.opacity = 0.45 + proximity * 0.3 + Math.sin(seconds * 2.6) * 0.08;
            const positions = particleGeometry.attributes.position.array as Float32Array;
            for (let index = 0; index < PULSE_RENDER_BUDGET.particles; index += 1) {
              let x = positions[index * 3]! + 0.009;
              if (x > -0.04) x = -4.08;
              const progress = (x + 4.08) / 4.04;
              positions[index * 3] = x;
              positions[index * 3 + 1] = levelHeight(interpolate(observedValues, progress)) + 0.035;
            }
            particleGeometry.attributes.position.needsUpdate = true;
            renderOnce();
          }
          frame = requestAnimationFrame(animate);
        };
        startLoop = () => {
          if (frame || disposed || !visible) return;
          setRendererState('running');
          frame = requestAnimationFrame(animate);
        };

        renderer.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          if (frame) cancelAnimationFrame(frame);
          frame = 0;
          host.replaceChildren();
          setRendererState('fallback');
        }, { once: true });
        if (reducedMotion) {
          surfaceGroup.scale.y = 1;
          renderOnce();
          setRendererState('static');
        } else startLoop();

        const originalDispose = () => {
          disposeObject(scene);
          renderer?.dispose();
          renderer?.forceContextLoss();
        };
        cleanupPointer = ((previous) => () => { previous(); originalDispose(); })(cleanupPointer);
      } catch {
        if (!disposed) setRendererState('fallback');
      }
    }

    intersectionObserver.observe(host);
    return () => {
      disposed = true;
      intersectionObserver.disconnect();
      resizeObserver?.disconnect();
      cleanupPointer();
      if (frame) cancelAnimationFrame(frame);
      renderer?.dispose();
      host.replaceChildren();
    };
  }, [forceFallback, nextThreshold.metres, reducedMotion, refreshToken, snapshot]);

  return (
    <section className="pulse-card card" aria-labelledby="pulse-heading" data-testid="parana-pulse" data-renderer={rendererState} data-render-state={rendererState} data-motion={reducedMotion ? 'reduced' : 'full'} data-grid-observed={`${PULSE_RENDER_BUDGET.observedSegments.x}x${PULSE_RENDER_BUDGET.observedSegments.y}`} data-grid-projection={`${PULSE_RENDER_BUDGET.projectionSegments.x}x${PULSE_RENDER_BUDGET.projectionSegments.y}`} data-fps-cap={PULSE_RENDER_BUDGET.fps} data-dpr-cap={PULSE_RENDER_BUDGET.dpr}>
      <div className="pulse-heading-row">
        <div><h1 id="pulse-heading">Pulso del Paraná</h1><span className="pulse-station">{snapshot.river.stationName}</span></div>
        <div className="pulse-demo"><strong>DEMO / NO OFICIAL</strong></div>
      </div>

      <div className="pulse-primary">
        <div className="pulse-status-row">
          <strong className="pulse-state" role="heading" aria-level={2}>{snapshot.stateLabel}</strong>
          <time dateTime={refreshToken ?? snapshot.river.observedAt}>{refreshing ? 'Actualizando…' : `Actualizado ${formatDateTime(refreshToken ?? snapshot.river.observedAt)}`}</time>
        </div>
        <div className="pulse-reading">
          <div className="pulse-level"><span>Nivel actual</span><strong>{snapshot.river.currentMetres.toFixed(2)} <small>m</small></strong></div>
          <div className="pulse-facts">
            <div><span>24 horas</span><strong>+{Math.round(snapshot.river.delta24h * 100)} cm</strong></div>
            <div><span>Tendencia</span><strong data-testid="pulse-trend">↗ Ascenso lento</strong></div>
          </div>
        </div>
        {(!online || refreshError) && (
          <p className="pulse-operational" role="status">
            <strong>{online ? 'Actualización incompleta' : 'Snapshot offline'}</strong> · {online ? refreshError : `guardado ${savedAt ? formatDateTime(savedAt) : 'sin timestamp de red'}. No es el estado actual.`}
          </p>
        )}
      </div>

      <div className="pulse-visual-shell">
        <div ref={mountRef} className="pulse-webgl-mount" aria-hidden="true" />
        <PulseFallback snapshot={snapshot} hidden={rendererState === 'running' || rendererState === 'paused' || rendererState === 'static'} />
        <div className="pulse-thresholds" aria-label="Umbrales demo">
          {[...snapshot.river.thresholds].reverse().map((threshold) => <span key={threshold.id} className={`pulse-threshold pulse-threshold--${threshold.id.toLowerCase()}`}>{threshold.label} <b>{threshold.metres.toFixed(2)} m</b></span>)}
        </div>
        <span className="pulse-renderer-note" aria-live="polite">{rendererState === 'fallback' ? 'Vista SVG de respaldo' : rendererState === 'loading' ? 'Vista SVG · preparando 3D' : rendererState === 'static' ? 'Vista 3D estática por movimiento reducido' : 'Vista 3D explicativa'}</span>
      </div>

      <div className="pulse-legend" aria-label="Cómo leer la visualización">
        <strong>MÁS ALTO = MÁS RIESGO</strong><span><i className="legend-observed" />CELESTE = OBSERVADO</span><span><i className="legend-forecast" />ÁMBAR = PROYECCIÓN</span>
      </div>
      <PulseMiniChart snapshot={snapshot} />
      <div className="pulse-action-zone">
        <p className="pulse-action"><span aria-hidden="true">✓</span><strong>Ahora:</strong> Consultá canales oficiales y mantené preparado tu plan familiar.</p>
        <div className="pulse-actions">
          <button ref={evidenceButtonRef} className="pulse-button pulse-button--primary" type="button" onClick={onEvidence}>Ver evidencia</button>
          <button className="pulse-button" type="button" onClick={onShare}>Compartir</button>
          {shareStatus && <span role="status">{shareStatus}</span>}
        </div>
      </div>
    </section>
  );
}
