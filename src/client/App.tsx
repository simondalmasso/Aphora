import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './app/DashboardPage';
import { DetailsDialog } from './components/DetailsDialog';
import { SecureMessagesPanel } from './features/messages/SecureMessagesPanel';
import { ReportDialog } from './features/reports/ReportDialog';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';

export default function App() {
  const { snapshot, online, refresh, refreshing, refreshError } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [messagesSeen, setMessagesSeen] = useState(false);
  const sourcesOpenerRef = useRef<HTMLButtonElement | null>(null);
  const reportOpenerRef = useRef<HTMLButtonElement | null>(null);
  const messagesButtonRef = useRef<HTMLButtonElement | null>(null);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);
  const unread = messagesSeen ? 0 : messages.length;
  const openSources = (opener?: HTMLButtonElement | null) => { if (opener) sourcesOpenerRef.current = opener; setDetailsOpen(true); };
  const closeSources = () => { setDetailsOpen(false); requestAnimationFrame(() => sourcesOpenerRef.current?.focus()); };
  const openReport = (opener?: HTMLButtonElement | null) => { if (opener) reportOpenerRef.current = opener; setReportOpen(true); };
  const openMessages = () => { setMessagesSeen(true); setMessagesOpen(true); };

  return <AppShell online={online} refreshing={refreshing} unread={unread} messagesButtonRef={messagesButtonRef} onRefresh={() => void refresh()} onMessages={openMessages} disclaimer={snapshot.emergencyDisclaimer}>
    <DashboardPage snapshot={snapshot} refreshing={refreshing} refreshError={refreshError} sourcesButtonRef={sourcesOpenerRef} reportButtonRef={reportOpenerRef} onSources={openSources} onReport={openReport}/>
    <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={closeSources}/>
    <ReportDialog snapshot={snapshot} online={online} open={reportOpen} openerRef={reportOpenerRef} onClose={() => setReportOpen(false)}/>
    <SecureMessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef}/>
  </AppShell>;
}
