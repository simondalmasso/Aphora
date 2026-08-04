import type { RefObject } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { HydroHero } from '../features/hydro/HydroHero';
import { LiveOverview } from '../features/overview/LiveOverview';
import { OperationalRecommendations } from '../features/actions/OperationalRecommendations';
import { LiveOutlook } from '../features/outlook/LiveOutlook';

interface Props {
  readonly snapshot: Snapshot;
  readonly refreshing: boolean;
  readonly refreshError: string | null;
  readonly evidenceButtonRef: RefObject<HTMLButtonElement | null>;
  readonly informButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onEvidence: (opener?: HTMLButtonElement | null) => void;
  readonly onInform: (opener?: HTMLButtonElement | null) => void;
}

export function DashboardPage(props: Props) {
  return <main id="main" className="dashboard--v3"><div className="dashboard-grid"><div className="dashboard-hero"><HydroHero snapshot={props.snapshot} refreshing={props.refreshing} refreshError={props.refreshError} evidenceButtonRef={props.evidenceButtonRef} informButtonRef={props.informButtonRef} onEvidence={props.onEvidence} onInform={props.onInform}/></div><aside className="dashboard-rail" aria-label="Resumen operativo"><LiveOverview snapshot={props.snapshot}/><OperationalRecommendations snapshot={props.snapshot} informButtonRef={props.informButtonRef} onInform={props.onInform}/></aside><div className="dashboard-outlook"><LiveOutlook snapshot={props.snapshot}/></div></div><div className="mobile-action-dock" aria-label="Acciones rápidas"><a href="#operational-recommendations">Recomendaciones</a><button type="button" onClick={(event) => props.onEvidence(event.currentTarget)}>Evidencia</button><button type="button" onClick={(event) => props.onInform(event.currentTarget)}>Informar</button></div></main>;
}
