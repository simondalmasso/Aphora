import { useMemo, useRef, useState } from 'react';
import { visibleMessages } from '../domain/messages';
import { AppShell } from './app/AppShell';
import { DashboardPage } from './app/DashboardPage';
import { DetailsDialog } from './components/DetailsDialog';
import { MessagesPanel } from './components/MessagesPanel';
import { useSnapshot } from './pwa/useSnapshot';
import './styles/app.css';
import './styles/visual-v3.css';

export default function App() {
  const { snapshot, online, savedAt, refresh, refreshing, lastSuccessAt, refreshError } = useSnapshot();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [messagesSeen, setMessagesSeen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const detailsButtonRef = useRef<HTMLButtonElement>(null);
  const messagesButtonRef = useRef<HTMLButtonElement>(null);
  const messages = useMemo(() => visibleMessages(snapshot.messages, new Date(snapshot.generatedAt)), [snapshot]);
  const unread = messagesSeen ? 0 : messages.length;

  function openMessages() {
    setMessagesSeen(true);
    setMessagesOpen(true);
  }

  function closeDetails() {
    setDetailsOpen(false);
    requestAnimationFrame(() => detailsButtonRef.current?.focus());
  }

  async function shareStatusSnapshot() {
    const deltaCentimetres = Math.round(snapshot.river.delta24h * 100);
    const text = `${snapshot.stateLabel}: ${snapshot.river.currentMetres.toFixed(2)} m, ${deltaCentimetres >= 0 ? '+' : ''}${deltaCentimetres} cm en 24 h. DEMO / NO OFICIAL.`;
    try {
      if (navigator.share) await navigator.share({ title: 'Pulso del Paraná · SOS Santa Fe', text, url: window.location.href });
      else {
        await navigator.clipboard.writeText(`${text} ${window.location.href}`);
        setShareStatus('Enlace copiado');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setShareStatus('No se pudo compartir');
    }
  }

  return (
    <AppShell online={online} refreshing={refreshing} unread={unread} messagesButtonRef={messagesButtonRef} onRefresh={() => void refresh()} onMessages={openMessages} disclaimer={snapshot.emergencyDisclaimer}>
      <DashboardPage snapshot={snapshot} online={online} savedAt={savedAt} refreshing={refreshing} lastSuccessAt={lastSuccessAt} refreshError={refreshError} evidenceButtonRef={detailsButtonRef} onEvidence={() => setDetailsOpen(true)} onShare={() => void shareStatusSnapshot()} shareStatus={shareStatus} />
      <DetailsDialog snapshot={snapshot} open={detailsOpen} onClose={closeDetails} />
      <MessagesPanel publicMessages={messages} open={messagesOpen} onClose={() => setMessagesOpen(false)} openerRef={messagesButtonRef} />
    </AppShell>
  );
}
