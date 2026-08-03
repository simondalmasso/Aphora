import type { RefObject } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { ParanaPulse } from '../components/ParanaPulse';
import { NowOverview } from '../features/overview/NowOverview';
import { RecommendedAction } from '../features/actions/RecommendedAction';
import { OutlookCard } from '../features/outlook/OutlookCard';

interface DashboardPageProps {
  readonly snapshot: Snapshot;
  readonly online: boolean;
  readonly savedAt: string | null;
  readonly refreshing: boolean;
  readonly lastSuccessAt: string | null;
  readonly refreshError: string | null;
  readonly evidenceButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onEvidence: () => void;
  readonly onShare: () => void;
  readonly shareStatus: string | null;
}

export function DashboardPage(props: DashboardPageProps) {
  return (
    <main id="main" className="dashboard dashboard--v3">
      <div className="dashboard-grid">
        <div className="dashboard-hero">
          <ParanaPulse snapshot={props.snapshot} refreshToken={props.lastSuccessAt} online={props.online} savedAt={props.savedAt} refreshing={props.refreshing} refreshError={props.refreshError} evidenceButtonRef={props.evidenceButtonRef} onEvidence={props.onEvidence} onShare={props.onShare} shareStatus={props.shareStatus} />
        </div>
        <aside className="dashboard-rail" aria-label="Resumen operativo">
          <NowOverview snapshot={props.snapshot} />
          <RecommendedAction snapshot={props.snapshot} />
        </aside>
        <div className="dashboard-outlook"><OutlookCard snapshot={props.snapshot} /></div>
      </div>
      <div className="mobile-action-dock" role="navigation" aria-label="Acciones rápidas">
        <a href="#what-to-do">Qué hacer</a>
        <button type="button" onClick={props.onEvidence}>Evidencia</button>
        <button type="button" onClick={props.onShare}>Compartir</button>
      </div>
    </main>
  );
}
