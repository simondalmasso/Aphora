import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { HydrologicalSystem, Snapshot } from '../../../domain/snapshot.ts';
import { formatHumanAge } from '../../../domain/public-safety.ts';

const ARGENMAP_TMS = 'https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{y}.png';
const IDESF_WMS = 'https://aswe.santafe.gov.ar/idesf/wms';
const IDESF_RISK_LAYER = 'areas_de_riesgo_hidrico';
const STATION_COORDS: Readonly<Record<string, readonly [number, number]>> = {
  'parana-santa-fe': [-31.6505, -60.7012],
  'salado-santo-tome': [-31.6688, -60.7654],
};

function level(system: HydrologicalSystem): string {
  return system.currentMetres === null ? 'Sin lectura utilizable' : `${system.currentMetres.toFixed(2).replace('.', ',')} m`;
}
function trend(system: HydrologicalSystem): string {
  if (system.trend === 'RISING') return 'subiendo';
  if (system.trend === 'RISING_SLOWLY') return 'subiendo lentamente';
  if (system.trend === 'FALLING') return 'bajando';
  if (system.trend === 'STABLE') return 'estable';
  return 'sin tendencia suficiente';
}
function freshness(system: HydrologicalSystem): string {
  if (system.freshness === 'ACTUALIZADO') return 'al día';
  if (system.freshness === 'ACTUALIZACION_DEMORADA') return 'con demora';
  if (system.freshness === 'DESACTUALIZADO') return 'desactualizada';
  return 'sin vigencia confirmada';
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!);
}

export default function SituationMap({ snapshot }: { readonly snapshot: Snapshot }) {
  const mapNode = useRef<HTMLDivElement>(null);
  const [riskLayerState, setRiskLayerState] = useState<'LOADING' | 'READY' | 'UNAVAILABLE'>('LOADING');
  const systems = useMemo(() => (snapshot.systems ?? []).filter((system) => STATION_COORDS[system.id]), [snapshot.systems]);

  useEffect(() => {
    if (!mapNode.current) return;
    const map = L.map(mapNode.current, { center: [-31.66, -60.735], zoom: 11, keyboard: true, zoomControl: true, attributionControl: true });
    L.tileLayer(ARGENMAP_TMS, {
      tms: true,
      maxZoom: 18,
      minZoom: 5,
      attribution: 'Instituto Geográfico Nacional + OpenStreetMap',
      crossOrigin: true,
    }).addTo(map);

    systems.forEach((system) => {
      const [lat, lng] = STATION_COORDS[system.id]!;
      const source = snapshot.sources.find((item) => item.id === system.sourceId);
      const marker = L.circleMarker([lat, lng], { radius: 8, weight: 3, fillOpacity: .86 }).addTo(map);
      marker.bindTooltip(`${system.watercourse} · ${system.stationName}`, { direction: 'top' });
      marker.bindPopup(`<strong>${escapeHtml(system.watercourse)} · Estación ${escapeHtml(system.stationName)}</strong><br>${escapeHtml(level(system))} · ${escapeHtml(trend(system))}<br>Vigencia: ${escapeHtml(freshness(system))}<br>Fuente: ${escapeHtml(source?.organizationName ?? system.sourceName)}<br><small>Referencia cartográfica aproximada; la medición se identifica por estación/serie, no por esta coordenada.</small>`);
    });

    const risk = L.tileLayer.wms(IDESF_WMS, {
      layers: IDESF_RISK_LAYER,
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      attribution: 'IDESF · Gobierno de Santa Fe',
      opacity: .42,
    });
    let settled = false;
    const ready = () => { settled = true; setRiskLayerState('READY'); };
    const unavailable = () => {
      if (settled) return;
      settled = true;
      setRiskLayerState('UNAVAILABLE');
      if (map.hasLayer(risk)) map.removeLayer(risk);
    };
    risk.once('load', ready);
    risk.on('tileerror', unavailable);
    risk.addTo(map);
    const timer = window.setTimeout(unavailable, 8_000);
    requestAnimationFrame(() => map.invalidateSize());
    return () => { window.clearTimeout(timer); risk.off(); map.remove(); };
  }, [snapshot.sources, systems]);

  return <div className="situation-map-shell" data-testid="situation-map">
    <div ref={mapNode} className="situation-map-canvas" role="region" aria-label="Mapa de contexto hídrico de Santa Fe" tabIndex={0}/>
    <div className="situation-map-status" aria-live="polite">
      {riskLayerState === 'LOADING' && <span>Verificando capa de riesgo hídrico IDESF…</span>}
      {riskLayerState === 'READY' && <span>Capa IDESF activa · contexto territorial oficial estático.</span>}
      {riskLayerState === 'UNAVAILABLE' && <span>La capa IDESF no respondió a tiempo. La hidrometría sigue disponible sin inferir riesgo territorial.</span>}
    </div>
    <div className="situation-map-list" aria-label="Equivalente textual del mapa">
      <h4>Lo que muestra el mapa</h4>
      <p><strong>Área oficial de riesgo hídrico · IDESF.</strong> Contexto territorial estático. No representa una zona inundada ahora.</p>
      {systems.map((system) => <article key={system.id}>
        <strong>{system.watercourse} · Estación {system.stationName}</strong>
        <span>{level(system)} · {trend(system)} · {freshness(system)}</span>
        <small>Medición · {formatHumanAge(system.observedAt, snapshot.generatedAt)} · Fuente {snapshot.sources.find((item) => item.id === system.sourceId)?.organizationName ?? system.sourceName}</small>
      </article>)}
      <small>Base: Argenmap · Instituto Geográfico Nacional + OpenStreetMap. Riesgo hídrico: IDESF · Gobierno de Santa Fe.</small>
    </div>
  </div>;
}
