import type { RefObject } from 'react';
import type { Snapshot } from '../../domain/snapshot.ts';
import { SafetyActions } from '../features/actions/SafetyActions.tsx';
import { VerifiedAlertBanner } from '../features/alerts/OfficialAlertPanel.tsx';
import { ContextDiscovery } from '../features/discovery/ContextDiscovery.tsx';
import { HydrometricMonitoring } from '../features/hydro/HydrometricMonitoring.tsx';
import { FloodSituationPanel } from '../features/situation/FloodSituationPanel.tsx';
import { SourceTransparency } from '../features/sources/SourceTransparency.tsx';

interface Props {
  readonly snapshot: Snapshot;
  readonly refreshing?: boolean;
  readonly sourcesButtonRef: RefObject<HTMLButtonElement | null>;
  readonly reportButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onRefresh?: () => void;
  readonly onSources: (opener?: HTMLButtonElement | null) => void;
  readonly onAlerts: (opener?: HTMLButtonElement | null) => void;
  readonly onReport: (opener?: HTMLButtonElement | null) => void;
}

export function DashboardPage(props: Props) {
  return <main id="main" className="dashboard" data-snapshot-id={props.snapshot.id}>
    <VerifiedAlertBanner snapshot={props.snapshot} onOpen={props.onAlerts}/>
    <HydrometricMonitoring
      snapshot={props.snapshot}
      refreshing={props.refreshing ?? false}
      sourcesButtonRef={props.sourcesButtonRef}
      onRefresh={props.onRefresh ?? (() => undefined)}
      onSources={props.onSources}
    />
    <FloodSituationPanel snapshot={props.snapshot}/>
    <ContextDiscovery/>
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
