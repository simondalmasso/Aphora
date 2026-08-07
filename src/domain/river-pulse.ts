import type { RiverForecastPoint, RiverPoint, RiverThreshold } from './snapshot.ts';

export interface RiverPulseData {
  readonly points: readonly RiverPoint[];
  readonly forecastPoints: readonly RiverForecastPoint[];
  readonly thresholds: readonly RiverThreshold[];
}

function assertFinite(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} debe ser un número finito`);
}

function assertChronological(points: readonly { readonly at: string }[], label: string) {
  let previous = -Infinity;
  for (const point of points) {
    const current = Date.parse(point.at);
    if (!Number.isFinite(current) || current <= previous) throw new TypeError(`${label} debe estar ordenado cronológicamente`);
    previous = current;
  }
}

export function validateRiverPulse(value: RiverPulseData): RiverPulseData {
  if (!Array.isArray(value.points) || value.points.length < 2) throw new TypeError('river.points necesita al menos dos observaciones');
  if (!Array.isArray(value.forecastPoints) || value.forecastPoints.length < 2) throw new TypeError('river.forecastPoints necesita al menos dos proyecciones');
  if (!Array.isArray(value.thresholds) || value.thresholds.length !== 4) throw new TypeError('river.thresholds debe incluir cuatro umbrales demo');

  assertChronological(value.points, 'river.points');
  assertChronological(value.forecastPoints, 'river.forecastPoints');
  value.points.forEach((point, index) => {
    assertFinite(point.metres, `river.points[${index}].metres`);
    if (point.measured !== true) throw new TypeError('las observaciones del pulso deben identificarse como medidas');
  });
  value.forecastPoints.forEach((point, index) => {
    assertFinite(point.metres, `river.forecastPoints[${index}].metres`);
    assertFinite(point.lowMetres, `river.forecastPoints[${index}].lowMetres`);
    assertFinite(point.highMetres, `river.forecastPoints[${index}].highMetres`);
    if (point.lowMetres > point.metres || point.metres > point.highMetres) throw new TypeError('la proyección debe quedar dentro de su intervalo de incertidumbre');
  });

  const observedWindow = Date.parse(value.points.at(-1)!.at) - Date.parse(value.points[0]!.at);
  const forecastWindow = Date.parse(value.forecastPoints.at(-1)!.at) - Date.parse(value.forecastPoints[0]!.at);
  if (observedWindow > 48 * 60 * 60 * 1000) throw new TypeError('la superficie observada no puede exceder 48 horas');
  if (forecastWindow > 24 * 60 * 60 * 1000) throw new TypeError('la superficie proyectada no puede exceder 24 horas');

  let lastThreshold = -Infinity;
  for (const threshold of value.thresholds) {
    assertFinite(threshold.metres, `river.thresholds.${threshold.id}`);
    if (threshold.metres <= lastThreshold) throw new TypeError('los umbrales deben ser estrictamente ascendentes');
    lastThreshold = threshold.metres;
  }
  return value;
}
