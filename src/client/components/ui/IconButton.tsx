import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly icon: ReactNode;
  readonly badge?: number;
  readonly loading?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, icon, badge = 0, loading = false, className = '', disabled, ...props }, ref) {
  return <button {...props} ref={ref} type="button" className={`ui-icon-button ${className}`.trim()} aria-label={label} title={label} disabled={disabled || loading} aria-busy={loading || undefined}><span className={loading ? 'ui-icon-button__glyph is-spinning' : 'ui-icon-button__glyph'} aria-hidden="true">{icon}</span>{badge > 0 && <span className="ui-icon-button__badge" aria-hidden="true">{Math.min(badge, 9)}</span>}{badge > 0 && <span className="sr-only">{badge} mensajes sin leer</span>}</button>;
});
