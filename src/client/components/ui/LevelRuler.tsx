import type { HydrologicalSystem } from '../../../domain/snapshot';

function thresholdDifference(system: HydrologicalSystem): string {
  if (system.currentMetres === null) return 'No hay una lectura utilizable.';
  const next = [...system.thresholds].sort((a, b) => a.metres - b.metres).find((item) => item.metres > system.currentMetres!);
  if (!next) {
    const highest = [...system.thresholds].sort((a, b) => b.metres - a.metres)[0];
    return highest ? `Nivel por encima del umbral de referencia ${highest.label.toLowerCase()}.` : 'No hay umbrales publicados para esta estación.';
  }
  return `Diferencia respecto de ${next.label.toLowerCase()}: ${(next.metres - system.currentMetres).toFixed(2).replace('.', ',')} m`;
}

export function LevelRuler({ system }: { readonly system: HydrologicalSystem }) {
  const values = [system.currentMetres ?? 0, ...system.thresholds.map((item) => item.metres)];
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, minimum + 1);
  const range = maximum - minimum;
  const position = (value: number) => Math.max(0, Math.min(100, ((value - minimum) / range) * 100));
  return <div className="level-ruler" role="img" aria-label={`${system.label}. Nivel ${system.currentMetres === null ? 'no disponible' : `${system.currentMetres.toFixed(2)} metros`}. ${thresholdDifference(system)}`}>
    <div className="level-ruler__scale" aria-hidden="true">
      <div className="level-ruler__line"/>
      {system.thresholds.map((threshold) => <span key={threshold.id} className="level-ruler__threshold" style={{ left: `${position(threshold.metres)}%` }}><i/><b>{threshold.metres.toFixed(2).replace('.', ',')} m</b><small>{threshold.label}</small></span>)}
      {system.currentMetres !== null && <span className="level-ruler__current" style={{ left: `${position(system.currentMetres)}%` }}><i/><b>{system.currentMetres.toFixed(2).replace('.', ',')} m</b><small>Última medición</small></span>}
    </div>
    <p className="level-ruler__summary">{thresholdDifference(system)}</p>
  </div>;
}
