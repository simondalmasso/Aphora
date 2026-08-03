import { useId, useMemo } from 'react';

interface Props { readonly values: readonly number[]; readonly label: string; readonly description: string; readonly tone?: 'river' | 'rain' | 'forecast' }

export function SafeSparkline({ values, label, description, tone = 'river' }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const clean = useMemo(() => values.filter(Number.isFinite), [values]);
  const points = useMemo(() => {
    if (clean.length === 0) return [];
    const minimum = Math.min(...clean);
    const maximum = Math.max(...clean);
    const range = maximum - minimum || 1;
    return clean.map((value, index) => ({ x: clean.length === 1 ? 50 : 4 + (index / (clean.length - 1)) * 92, y: clean.length === 1 ? 25 : 42 - ((value - minimum) / range) * 34 }));
  }, [clean]);
  const path = points.length === 1 ? `M ${points[0]!.x - 2} ${points[0]!.y} L ${points[0]!.x + 2} ${points[0]!.y}` : points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const end = points.at(-1);
  return <svg className={`sparkline sparkline--${tone}${points.length === 0 ? ' sparkline--empty' : ''}`} viewBox="0 0 100 48" role="img" aria-labelledby={`${titleId} ${descriptionId}`} preserveAspectRatio="none"><title id={titleId}>{label}</title><desc id={descriptionId}>{description}</desc><path className="sparkline__baseline" d="M4 42 H96"/>{points.length ? <><path className="sparkline__line" d={path}/>{end && <circle className="sparkline__endpoint" cx={end.x} cy={end.y} r="3"/>}</> : <text x="50" y="27" textAnchor="middle" className="sparkline__empty-label">Sin datos</text>}</svg>;
}
