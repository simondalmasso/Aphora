import { useId } from 'react';
import type { RiverThreshold } from '../../../domain/snapshot';

interface Props { readonly currentMetres: number | null; readonly thresholds: readonly RiverThreshold[]; readonly stateLabel: string; readonly available?: boolean }

export function SafeLevelGauge({ currentMetres, thresholds, stateLabel, available = true }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const ordered = [...thresholds].filter((item) => Number.isFinite(item.metres)).sort((a, b) => a.metres - b.metres);
  const hasReading = available && currentMetres !== null && Number.isFinite(currentMetres);
  const minimum = ordered[0]?.metres ?? 0;
  const maximum = ordered.at(-1)?.metres ?? minimum + 1;
  const value = currentMetres ?? 0;
  const progress = hasReading ? Math.min(1, Math.max(0, (value - minimum) / Math.max(maximum - minimum, .01))) : 0;
  const next = hasReading ? ordered.find((threshold) => threshold.metres > value) : undefined;
  const final = ordered.at(-1);
  const text = !hasReading ? 'No hay una lectura validada para ubicar en la escala.' : next ? `Faltan ${Math.max(0, Math.round((next.metres - value) * 100))} cm para ${next.label}.` : final && value >= final.metres ? `La lectura está en o por encima de ${final.label}.` : 'No hay un umbral siguiente configurado para esta estación.';
  return <div className={`level-gauge${hasReading ? '' : ' level-gauge--empty'}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`}><svg viewBox="0 0 160 96" aria-hidden="true"><path className="level-gauge__track" d="M20 82 A60 60 0 0 1 140 82" pathLength="126"/><path className="level-gauge__value" d="M20 82 A60 60 0 0 1 140 82" pathLength="126" strokeDasharray={`${126 * progress} 126`}/></svg><div className="level-gauge__reading"><strong>{hasReading ? value.toFixed(2) : '—'} <small>m</small></strong><span id={titleId}>{hasReading ? stateLabel : 'Sin datos en vivo'}</span></div><p id={descriptionId}>{text}</p></div>;
}
