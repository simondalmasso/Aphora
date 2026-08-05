import type { RefObject } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { OfficialAlertPanel } from '../features/alerts/OfficialAlertPanel';
import { SituationSummary } from '../features/situation/SituationSummary';
import { HydrometricMonitoring } from '../features/hydro/HydrometricMonitoring';
import { SafetyActions } from '../features/actions/SafetyActions';
import { SourceTransparency } from '../features/sources/SourceTransparency';

interface Props {
  readonly snapshot: Snapshot;
  readonly refreshing: boolean;
  readonly refreshError: string | null;
  readonly sourcesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly reportButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onSources: (opener?: HTMLButtonElement | null) => void;
  readonly onReport: (opener?: HTMLButtonElement | null) => void;
}

export function DashboardPage(props: Props) {
  return <main id="main" className="dashboard">
    {(props.refreshing || props.refreshError) && <div className={`refresh-status ${props.refreshError ? 'refresh-status--error' : ''}`} role="status">{props.refreshing ? 'Actualizando fuentes públicas…' : props.refreshError}</div>}
    <OfficialAlertPanel snapshot={props.snapshot}/>
    <SituationSummary snapshot={props.snapshot}/>
    <HydrometricMonitoring snapshot={props.snapshot}/>
    <SafetyActions snapshot={props.snapshot} reportButtonRef={props.reportButtonRef} onReport={props.onReport}/>
    <SourceTransparency snapshot={props.snapshot} sourcesButtonRef={props.sourcesButtonRef} onSources={props.onSources}/>
  </main>;
}
