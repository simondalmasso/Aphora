import { useId } from 'react';
import type { RiverThreshold } from '../../../domain/snapshot';

interface LevelGaugeProps {
  readonly currentMetres: number;
  readonly thresholds: readonly RiverThreshold[];
  readonly stateLabel: string;
}

export function LevelGauge({ currentMetres, thresholds, stateLabel }: LevelGaugeProps) {
  const titleId = useId();
  const descriptionId = useId();
  const minimum = thresholds[0]?.metres ?? 0;
  const maximum = thresholds.at(-1)?.metres ?? minimum + 1;
  const progress = Math.min(1, Math.max(0, (currentMetres - minimum) / Math.max(maximum - minimum, .01)));
  const nextThreshold = thresholds.find((threshold) => threshold.metres > currentMetres) ?? thresholds.at(-1);
  const remainingCm = nextThreshold ? Math.max(0, Math.round((nextThreshold.metres - currentMetres) * 100)) : 0;
  return <div className="level-gauge" role="img" aria-labelledby={`${titleId} ${descriptionId}`}><svg viewBox="0 0 160 96" aria-hidden="true"><path className="level-gauge__track" d="M20 82 A60 60 0 0 1 140 82" pathLength="126" /><path className="level-gauge__value" d="M20 82 A60 60 0 0 1 140 82" pathLength="126" strokeDasharray={`${126 * progress} 126`} /><line className="level-gauge__marker" x1="80" y1="22" x2="80" y2="31" /></svg><div className="level-gauge__reading"><strong>{currentMetres.toFixed(2)} <small>m</small></strong><span id={titleId}>{stateLabel.replace(' demostrativa', '')}</span></div><p id={descriptionId}>{nextThreshold ? `Faltan ${remainingCm} cm para ${nextThreshold.label}` : 'Nivel sobre el último umbral demo'}</p></div>;
}
