import type { RefObject } from 'react';
import type { Snapshot } from '../../domain/snapshot';
import { SafetyActions } from '../features/actions/SafetyActions';
import { VerifiedAlertBanner } from '../features/alerts/OfficialAlertPanel';
import { HydrometricMonitoring } from '../features/hydro/HydrometricMonitoring';
import { SituationSummary } from '../features/situation/SituationSummary';
import { SourceTransparency } from '../features/sources/SourceTransparency';

interface Props {
  readonly snapshot: Snapshot;
  readonly sourcesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly reportButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onSources: (opener?: HTMLButtonElement | null) => void;
  readonly onAlerts: (opener?: HTMLButtonElement | null) => void;
  readonly onReport: (opener?: HTMLButtonElement | null) => void;
}

export function DashboardPage(props: Props) {
  return <main id="main" className="dashboard" data-snapshot-id={props.snapshot.id}>
    <VerifiedAlertBanner snapshot={props.snapshot} onOpen={props.onAlerts}/>
    <HydrometricMonitoring
      snapshot={props.snapshot}
      sourcesButtonRef={props.sourcesButtonRef}
      onSources={props.onSources}
    />
    <SituationSummary snapshot={props.snapshot}/>
    <SafetyActions
      snapshot={props.snapshot}
      reportButtonRef={props.reportButtonRef}
      onAlerts={props.onAlerts}
      onReport={props.onReport}
    />
    <SourceTransparency
      snapshot={props.snapshot}
      sourcesButtonRef={props.sourcesButtonRef}
      onSources={props.onSources}
    />
  </main>;
}
