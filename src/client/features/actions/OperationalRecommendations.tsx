import type { RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot';

interface Props { readonly snapshot: Snapshot; readonly informButtonRef: RefObject<HTMLButtonElement | null>; readonly onInform: (opener?: HTMLButtonElement | null) => void }

export function OperationalRecommendations({ snapshot, informButtonRef, onInform }: Props) {
  return <section id="operational-recommendations" className="v3-card recommended-action" aria-labelledby="operational-title" data-primary-section="true"><header className="v3-card__header"><div><span className="v3-eyebrow">Acciones concretas</span><h2 id="operational-title">Recomendaciones operativas</h2></div><span className="action-symbol" aria-hidden="true">✓</span></header><p className="recommended-action__lead">{snapshot.recommendedAction}</p><ol className="action-steps">{snapshot.actions.slice(0, 2).map((action, index) => <li key={action}><span>{index + 1}</span><p>{action}</p></li>)}</ol><div className="recommended-action__footer"><button ref={informButtonRef} type="button" className="ui-button ui-button--primary" onClick={(event) => onInform(event.currentTarget)}>Informar una situación</button><p>Para peligro inmediato llamá al 911, 103, 107, 100 o 106. Informar no inicia un despacho.</p></div></section>;
}
