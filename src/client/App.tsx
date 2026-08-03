import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './app/DashboardPage';
import { DetailsDialog } from './components/DetailsDialog';
import { MessagesPanel } from './components/MessagesPanel';
import { ReportDialog } from './features/reports/ReportDialog';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';
import './styles/visual-v3.css';

export default function App() {
  const { snapshot, online, refresh, refreshing, refreshError } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [messagesSeen, setMessagesSeen] = useState(false);
  const evidenceOpenerRef = useRef<HTMLButtonElement>(null);
  const reportOpenerRef = useRef<HTMLButtonElement>(null);
  const messagesButtonRef = useRef<HTMLButtonElement>(null);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);
  const unread = messagesSeen ? 0 : messages.length;

  const openEvidence = (opener?: HTMLButtonElement | null) => { if (opener) evidenceOpenerRef.current = opener; setDetailsOpen(true); };
  const closeEvidence = () => { setDetailsOpen(false); requestAnimationFrame(() => evidenceOpenerRef.current?.focus()); };
  const openReport = (opener?: HTMLButtonElement | null) => { if (opener) reportOpenerRef.current = opener; setReportOpen(true); };
  const openMessages = () => { setMessagesSeen(true); setMessagesOpen(true); };

  return <AppShell online={online} refreshing={refreshing} unread={unread} messagesButtonRef={messagesButtonRef} informButtonRef={reportOpenerRef} onRefresh={() => void refresh()} onMessages={openMessages} onInform={openReport} disclaimer={snapshot.emergencyDisclaimer}><DashboardPage snapshot={snapshot} refreshing={refreshing} refreshError={refreshError} evidenceButtonRef={evidenceOpenerRef} informButtonRef={reportOpenerRef} onEvidence={openEvidence} onInform={openReport}/><DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={closeEvidence}/><ReportDialog snapshot={snapshot} online={online} open={reportOpen} openerRef={reportOpenerRef} onClose={() => setReportOpen(false)}/><MessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef}/></AppShell>;
}
