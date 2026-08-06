import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './app/DashboardPage';
import { DetailsDialog } from './components/DetailsDialog';
import { AlertDetailsDialog } from './features/alerts/OfficialAlertPanel';
import { SecureMessagesPanel } from './features/messages/SecureMessagesPanel';
import { ReportDialog } from './features/reports/ReportDialog';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';
import './styles/roast-019-density.css';

export default function App() {
  const { snapshot, online, refresh, refreshing } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [messagesSeen, setMessagesSeen] = useState(false);
  const sourcesOpenerRef = useRef<HTMLButtonElement | null>(null);
  const alertsOpenerRef = useRef<HTMLButtonElement | null>(null);
  const reportOpenerRef = useRef<HTMLButtonElement | null>(null);
  const messagesButtonRef = useRef<HTMLButtonElement | null>(null);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);
  const unread = messagesSeen ? 0 : messages.length;

  const openSources = (opener?: HTMLButtonElement | null) => {
    if (opener) sourcesOpenerRef.current = opener;
    setDetailsOpen(true);
  };
  const closeSources = () => {
    setDetailsOpen(false);
    requestAnimationFrame(() => sourcesOpenerRef.current?.focus());
  };
  const openAlerts = (opener?: HTMLButtonElement | null) => {
    if (opener) alertsOpenerRef.current = opener;
    setAlertsOpen(true);
  };
  const closeAlerts = () => {
    setAlertsOpen(false);
    requestAnimationFrame(() => alertsOpenerRef.current?.focus());
  };
  const openReport = (opener?: HTMLButtonElement | null) => {
    if (opener) reportOpenerRef.current = opener;
    setReportOpen(true);
  };
  const openMessages = () => {
    setMessagesSeen(true);
    setMessagesOpen(true);
  };

  return <AppShell
    online={online}
    refreshing={refreshing}
    unread={unread}
    alertStatus={snapshot.alertStatus}
    messagesButtonRef={messagesButtonRef}
    alertsButtonRef={alertsOpenerRef}
    onRefresh={() => void refresh()}
    onAlerts={openAlerts}
    onMessages={openMessages}
    disclaimer={snapshot.emergencyDisclaimer}
  >
    <DashboardPage
      snapshot={snapshot}
      sourcesButtonRef={sourcesOpenerRef}
      reportButtonRef={reportOpenerRef}
      onSources={openSources}
      onAlerts={openAlerts}
      onReport={openReport}
    />
    <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={closeSources}/>
    <AlertDetailsDialog snapshot={snapshot} open={alertsOpen} onClose={closeAlerts}/>
    <ReportDialog snapshot={snapshot} online={online} open={reportOpen} openerRef={reportOpenerRef} onClose={() => setReportOpen(false)}/>
    <SecureMessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef}/>
  </AppShell>;
}
