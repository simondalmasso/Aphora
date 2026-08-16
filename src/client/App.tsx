import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages.ts';
import { AppShell } from './app/AppShell.tsx';
import { DashboardPage } from './app/DashboardPage.tsx';
import { DetailsDialog } from './components/DetailsDialog.tsx';
import { RiskHub } from './components/civic/CivicSystem.tsx';
import { ElNinoLanding } from './components/civic/MuniPages.tsx';
import { AlertDetailsDialog } from './features/alerts/OfficialAlertPanel.tsx';
import { SecureMessagesPanel } from './features/messages/SecureMessagesPanel.tsx';
import { ReportDialog } from './features/reports/ReportDialog.tsx';
import { useSnapshot } from './pwa/useSnapshot.ts';
import './styles/app.css';
import './styles/final-product-023.css';
import './styles/final-product-023-terminal.css';
import './styles/smooth-civic-027.css';
import './styles/flood-intelligence-028.css';

function canonicalPath(): string {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path || '/';
}

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
  const currentPath = canonicalPath();

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
  const openMessages = (opener?: HTMLButtonElement | null) => {
    if (opener) messagesButtonRef.current = opener;
    setMessagesSeen(true);
    setMessagesOpen(true);
  };

  const page = currentPath === '/gestion-de-riesgo/fenomeno-el-nino'
    ? <ElNinoLanding/>
    : currentPath === '/gestion-de-riesgo'
      ? <RiskHub/>
      : <DashboardPage
        snapshot={snapshot}
        refreshing={refreshing}
        sourcesButtonRef={sourcesOpenerRef}
        reportButtonRef={reportOpenerRef}
        onRefresh={() => void refresh()}
        onSources={openSources}
        onAlerts={openAlerts}
        onReport={openReport}
      />;

  return <AppShell
    currentPath={currentPath}
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
    {page}
    <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={closeSources}/>
    <AlertDetailsDialog snapshot={snapshot} open={alertsOpen} onClose={closeAlerts}/>
    <ReportDialog snapshot={snapshot} online={online} open={reportOpen} openerRef={reportOpenerRef} onClose={() => setReportOpen(false)}/>
    <SecureMessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef}/>
  </AppShell>;
}
