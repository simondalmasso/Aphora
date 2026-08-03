import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PrivateConversation, PrivateMessage, SessionPrincipal } from '../../domain/private-messaging/types';
import type { CriticalMessage } from '../../domain/zungun-compat/types';

interface AuthConfig {
  readonly enabled: boolean;
  readonly googleClientId: string | null;
  readonly activationState: string;
}

interface PrivateEnvelope<T> { readonly ok: boolean; readonly data: T }

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (response: { credential: string }) => void; auto_select: boolean }): void;
          renderButton(element: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}

function displayTime(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso));
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...init?.headers }, ...init });
  const envelope = await response.json() as PrivateEnvelope<T & { error?: { message?: string } }>;
  if (!response.ok) throw new Error(envelope.data?.error?.message ?? 'La operación no está disponible.');
  return envelope.data;
}

export function MessagesPanel({ publicMessages, open, onClose, openerRef }: {
  readonly publicMessages: readonly CriticalMessage[];
  readonly open: boolean;
  readonly onClose: () => void;
  readonly openerRef: RefObject<HTMLButtonElement | null>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [principal, setPrincipal] = useState<SessionPrincipal | null>(null);
  const [conversation, setConversation] = useState<PrivateConversation | null>(null);
  const [conversations, setConversations] = useState<readonly PrivateConversation[]>([]);
  const [privateMessages, setPrivateMessages] = useState<readonly PrivateMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const close = useCallback(() => {
    onClose();
    requestAnimationFrame(() => openerRef.current?.focus());
  }, [onClose, openerRef]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const page = await api<{ messages: readonly PrivateMessage[] }>(`/api/private/messages?conversationId=${encodeURIComponent(conversationId)}`);
    setPrivateMessages(page.messages);
  }, []);

  const loadInbox = useCallback(async (session: SessionPrincipal) => {
    const listed = await api<{ conversations: readonly PrivateConversation[] }>('/api/private/conversations');
    let selected = listed.conversations[0] ?? null;
    if (!selected && session.role === 'AUTHENTICATED_USER') {
      const created = await api<{ conversation: PrivateConversation }>('/api/private/conversations', { method: 'POST' });
      selected = created.conversation;
    }
    setConversations(listed.conversations);
    setConversation(selected);
    if (selected) await loadMessages(selected.id);
  }, [loadMessages]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([
      api<AuthConfig>('/api/auth/config'),
      api<{ authenticated: boolean; principal: SessionPrincipal | null }>('/api/session'),
    ]).then(async ([nextConfig, session]) => {
      if (!live) return;
      setConfig(nextConfig);
      setPrincipal(session.principal);
      if (session.authenticated && session.principal) await loadInbox(session.principal);
    }).catch(() => live && setStatus('La bandeja privada no pudo consultarse. Las comunicaciones públicas siguen disponibles.'));
    return () => { live = false; };
  }, [loadInbox, open]);

  useEffect(() => {
    if (!open || !config?.enabled || !config.googleClientId || principal) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.google || !googleButtonRef.current || !config.googleClientId) return;
      googleButtonRef.current.replaceChildren();
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        auto_select: false,
        callback: ({ credential }) => {
          setBusy(true);
          void api<{ authenticated: boolean; principal: SessionPrincipal }>('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          }).then(async (session) => {
            setPrincipal(session.principal);
            await loadInbox(session.principal);
            setStatus('Sesión privada iniciada.');
          }).catch(() => setStatus('Google no pudo validar la sesión.')).finally(() => setBusy(false));
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 260 });
    };
    if (window.google) render();
    else {
      const existing = document.querySelector<HTMLScriptElement>('script[data-sos-gis]');
      const script = existing ?? document.createElement('script');
      if (!existing) {
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.sosGis = 'true';
        document.head.append(script);
      }
      script.addEventListener('load', render, { once: true });
    }
    return () => { cancelled = true; };
  }, [config, loadInbox, open, principal]);

  useEffect(() => {
    if (!open || !principal || !conversation) return;
    const timer = window.setInterval(() => void loadMessages(conversation.id).catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [conversation, loadMessages, open, principal]);

  async function sendMessage() {
    if (!conversation || !draft.trim() || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await api('/api/private/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conversation.id, body: draft.trim(), idempotencyKey: crypto.randomUUID() }),
      });
      setDraft('');
      await loadMessages(conversation.id);
      setStatus('Mensaje recibido por el servicio. Esto no garantiza lectura ni respuesta.');
    } catch {
      setStatus('El mensaje no pudo enviarse. El texto se conserva para reintentar.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api('/api/logout', { method: 'POST' });
      setPrincipal(null);
      setConversation(null);
      setConversations([]);
      setPrivateMessages([]);
      setStatus('Sesión cerrada.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="messages-panel" aria-labelledby="messages-panel-title" onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="messages-surface">
        <header className="messages-head">
          <div><span className="eyebrow">Centro de mensajes</span><h2 id="messages-panel-title">Comunicaciones</h2></div>
          <button className="icon-button" type="button" onClick={close} aria-label="Cerrar comunicaciones">×</button>
        </header>

        <section className="public-inbox" aria-labelledby="public-inbox-title">
          <div className="inbox-title"><div><span className="eyebrow">Siempre abierto · sólo lectura</span><h3 id="public-inbox-title">Comunicaciones públicas</h3></div><span className="count-badge">{Math.min(publicMessages.length, 5)}</span></div>
          <div className="panel-message-list">
            {publicMessages.slice(0, 5).map((message) => (
              <article className="panel-message" key={message.id}>
                <span className={`priority priority--${message.priority}`} aria-label={`Prioridad ${message.priority}`} />
                <div><div className="message-title"><strong>{message.title}</strong><time dateTime={message.createdAt}>{displayTime(message.createdAt)}</time></div><p>{message.body}</p><small>{message.type.replaceAll('_', ' ')} · {message.geographicScope.join(', ')} · {message.sourceId}<br />TTL hasta {displayTime(message.expiresAt)}</small></div>
              </article>
            ))}
          </div>
        </section>

        <section className="private-inbox" aria-labelledby="private-inbox-title">
          <div className="inbox-title"><div><span className="eyebrow">Optativa · asincrónica</span><h3 id="private-inbox-title">Bandeja privada</h3></div>{principal && <button type="button" className="text-button" onClick={() => void logout()} disabled={busy}>Cerrar sesión</button>}</div>
          <p className="private-warning">No reemplaza al 911 ni a canales oficiales. No garantiza entrega, lectura, respuesta ni atención en tiempo real.</p>
          {!config && !status && <p className="inbox-state" role="status">Consultando disponibilidad…</p>}
          {config && !config.enabled && <p className="inbox-state"><strong>Disponible cuando se configure.</strong><br />El acceso privado con Google y almacenamiento D1 está implementado, pero no está activado en este deployment.</p>}
          {config?.enabled && !principal && <div className="google-login"><p>Google se usa sólo para identificar tu bandeja. Alcance: nombre básico, email y perfil; no guardamos tokens de Google.</p><div ref={googleButtonRef} aria-label="Acceso con Google" />{busy && <span>Validando…</span>}</div>}
          {principal && (
            <div className="private-session">
              <p className="session-label">Sesión protegida · {principal.role === 'AUTHENTICATED_USER' ? 'usuario' : 'operador verificado'}</p>
              {principal.role !== 'AUTHENTICATED_USER' && conversations.length > 0 && <label className="conversation-picker">Conversación<select value={conversation?.id ?? ''} onChange={(event) => { const next = conversations.find((item) => item.id === event.target.value) ?? null; setConversation(next); if (next) void loadMessages(next.id); }}>{conversations.map((item) => <option value={item.id} key={item.id}>{item.id}</option>)}</select></label>}
              {conversation ? <>
                <div className="private-message-list" aria-live="polite">{privateMessages.length === 0 && <p>Sin mensajes todavía.</p>}{privateMessages.map((message) => <article className={message.verifiedOperator ? 'operator-message' : 'user-message'} key={message.id}><div><strong>{message.verifiedOperator ? 'Operador SOS verificado' : 'Vos'}</strong><time dateTime={message.createdAt}>{displayTime(message.createdAt)}</time></div><p>{message.body}</p><small>{message.status.replaceAll('_', ' ')} · vence {displayTime(message.expiresAt)}</small></article>)}</div>
                <label className="message-composer"><span>Mensaje privado</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={800} rows={3} placeholder="Escribí información concreta (máx. 800 caracteres)" /><small>{draft.length}/800</small></label>
                <button className="primary-button send-button" type="button" disabled={busy || !draft.trim()} onClick={() => void sendMessage()}>{busy ? 'Enviando…' : 'Enviar al equipo SOS'}</button>
              </> : <p className="inbox-state">No hay conversaciones asignadas.</p>}
            </div>
          )}
          {status && <p className="inbox-status" role="status">{status}</p>}
        </section>
      </div>
    </dialog>
  );
}
