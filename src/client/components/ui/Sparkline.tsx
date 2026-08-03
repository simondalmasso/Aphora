import { useId, useMemo } from 'react';

interface SparklineProps {
  readonly values: readonly number[];
  readonly label: string;
  readonly description: string;
  readonly tone?: 'river' | 'rain' | 'forecast';
}

export function Sparkline({ values, label, description, tone = 'river' }: SparklineProps) {
  const titleId = useId();
  const descriptionId = useId();
  const points = useMemo(() => {
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;
    return values.map((value, index) => ({
      x: 4 + (index / Math.max(values.length - 1, 1)) * 92,
      y: 42 - ((value - minimum) / range) * 34,
    }));
  }, [values]);
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const end = points.at(-1) ?? { x: 96, y: 42 };
  return <svg className={`sparkline sparkline--${tone}`} viewBox="0 0 100 48" role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="none"><title id={titleId}>{label}</title><desc id={descriptionId}>{description}</desc><path className="sparkline__baseline" d="M4 42 H96" /><path className="sparkline__line" d={path} pathLength="1" /><circle className="sparkline__endpoint" cx={end.x} cy={end.y} r="3" /></svg>;
}
