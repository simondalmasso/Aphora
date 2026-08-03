import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { PrivateConversation, PrivateMessage, SessionPrincipal } from '../../../domain/private-messaging/types';
import type { CriticalMessage } from '../../../domain/zungun-compat/types';

interface AuthConfig { readonly enabled: boolean; readonly reportingEnabled: boolean; readonly googleClientId: string | null }
interface Envelope<T> { readonly ok: boolean; readonly data: T; readonly error?: { readonly message?: string } }
interface ReportPhoto { readonly id: string; readonly report_id: string; readonly mime_type: string; readonly bytes: number; readonly review_status: string; readonly review_note?: string | null }
interface ReportRow { readonly id: string; readonly category: string; readonly description: string; readonly redacted_description?: string | null; readonly location_label?: string | null; readonly status: string; readonly created_at: string; readonly reporter_sub: string; readonly forwarded_destination?: string | null; readonly forwarded_reference?: string | null; readonly moderation_flags_json?: string; readonly operator_note?: string | null; readonly photos?: readonly ReportPhoto[] }

declare global { interface Window { google?: { accounts: { id: { initialize(options: { client_id: string; callback: (response: { credential: string }) => void; auto_select: boolean }): void; renderButton(element: HTMLElement, options: Record<string, string | number>): void } } } } }

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...init?.headers }, ...init });
  const envelope = await response.json() as Envelope<T>;
  if (!response.ok) throw new Error(envelope.error?.message ?? 'La operación no está disponible.');
  return envelope.data;
}

function displayTime(iso: string): string { return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Cordoba' }).format(new Date(iso)); }
function isOperator(principal: SessionPrincipal | null): boolean { return principal?.role === 'VERIFIED_OPERATOR' || principal?.role === 'ADMIN'; }
function parseFlags(value: string | undefined): string[] { try { const parsed = JSON.parse(value ?? '[]'); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }

export function IntegratedMessagesPanel({ publicMessages, open, onClose, openerRef }: { readonly publicMessages: readonly CriticalMessage[]; readonly open: boolean; readonly onClose: () => void; readonly openerRef: RefObject<HTMLButtonElement | null> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const googleRef = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [principal, setPrincipal] = useState<SessionPrincipal | null>(null);
  const [conversations, setConversations] = useState<readonly PrivateConversation[]>([]);
  const [conversation, setConversation] = useState<PrivateConversation | null>(null);
  const [messages, setMessages] = useState<readonly PrivateMessage[]>([]);
  const [reports, setReports] = useState<readonly ReportRow[]>([]);
  const [draft, setDraft] = useState('');
  const [forwardDestination, setForwardDestination] = useState('');
  const [forwardReference, setForwardReference] = useState('');
  const [operatorNote, setOperatorNote] = useState('');
  const [redactedDescription, setRedactedDescription] = useState('');
  const [moderationFlags, setModerationFlags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const close = useCallback(() => { onClose(); requestAnimationFrame(() => openerRef.current?.focus()); }, [onClose, openerRef]);
  const loadMessages = useCallback(async (id: string) => { const page = await api<{ messages: readonly PrivateMessage[] }>(`/api/private/messages?conversationId=${encodeURIComponent(id)}`); setMessages(page.messages); }, []);
  const loadReports = useCallback(async () => { setReports((await api<{ reports: readonly ReportRow[] }>('/api/private/reports')).reports); }, []);
  const loadPrivate = useCallback(async (session: SessionPrincipal) => {
    const listed = await api<{ conversations: readonly PrivateConversation[] }>('/api/private/conversations');
    let selected = listed.conversations[0] ?? null;
    if (!selected && session.role === 'AUTHENTICATED_USER') selected = (await api<{ conversation: PrivateConversation }>('/api/private/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: location.origin }, body: '{}' })).conversation;
    setConversations(listed.conversations);
    setConversation(selected);
    if (selected) await loadMessages(selected.id);
    if (isOperator(session)) await loadReports();
  }, [loadMessages, loadReports]);

  useEffect(() => { const dialog = dialogRef.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([api<AuthConfig>('/api/auth/config'), api<{ authenticated: boolean; principal: SessionPrincipal | null }>('/api/session')]).then(async ([nextConfig, session]) => { if (!live) return; setConfig(nextConfig); setPrincipal(session.principal); if (session.authenticated && session.principal) await loadPrivate(session.principal); }).catch(() => live && setStatus('No se pudo consultar la bandeja privada.'));
    return () => { live = false; };
  }, [loadPrivate, open]);

  useEffect(() => {
    if (!open || !config?.enabled || !config.googleClientId || principal) return;
    let cancelled = false;
    const render = () => {
      if (cancelled || !window.google || !googleRef.current || !config.googleClientId) return;
      googleRef.current.replaceChildren();
      window.google.accounts.id.initialize({ client_id: config.googleClientId, auto_select: false, callback: ({ credential }) => { setBusy(true); void api<{ principal: SessionPrincipal }>('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: location.origin }, body: JSON.stringify({ credential }) }).then(async (session) => { setPrincipal(session.principal); await loadPrivate(session.principal); setStatus('Sesión iniciada.'); }).catch(() => setStatus('Google no pudo validar la sesión.')).finally(() => setBusy(false)); } });
      window.google.accounts.id.renderButton(googleRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', width: 260 });
    };
    if (window.google) render(); else { const existing = document.querySelector<HTMLScriptElement>('script[data-sos-gis]'); const script = existing ?? document.createElement('script'); if (!existing) { script.src = 'https://accounts.google.com/gsi/client'; script.async = true; script.defer = true; script.dataset.sosGis = 'true'; document.head.append(script); } script.addEventListener('load', render, { once: true }); }
    return () => { cancelled = true; };
  }, [config, loadPrivate, open, principal]);

  const logout = async () => {
    setBusy(true);
    try { await api('/api/logout', { method: 'POST', headers: { Origin: location.origin } }); setPrincipal(null); setConversations([]); setConversation(null); setMessages([]); setReports([]); setStatus('Sesión cerrada y revocada.'); }
    catch { setStatus('No se pudo cerrar la sesión.'); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!conversation || !draft.trim() || draft.length > 280 || busy) return;
    setBusy(true); setStatus(null);
    try { await api('/api/private/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: location.origin }, body: JSON.stringify({ conversationId: conversation.id, body: draft.trim(), idempotencyKey: crypto.randomUUID() }) }); setDraft(''); await loadMessages(conversation.id); setStatus('Mensaje recibido por el servicio. No garantiza lectura ni respuesta inmediata.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo enviar.'); }
    finally { setBusy(false); }
  };

  const transition = async (report: ReportRow, next: string) => {
    setBusy(true); setStatus(null);
    try {
      const body: Record<string, unknown> = { status: next, note: 'Actualización manual desde el workspace operador.', operatorNote: operatorNote.trim() || null, redactedDescription: redactedDescription.trim() || null, moderationFlags };
      if (next === 'FORWARDED') { if (!forwardDestination.trim() || !forwardReference.trim()) throw new Error('Indicá destino y referencia de derivación.'); body.forwardedDestination = forwardDestination.trim(); body.forwardedReference = forwardReference.trim(); }
      await api(`/api/private/operator/reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: location.origin }, body: JSON.stringify(body) });
      await loadReports(); setStatus('Estado, moderación y auditoría del informe actualizados.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo actualizar.'); }
    finally { setBusy(false); }
  };

  const reviewPhoto = async (reportId: string, photoId: string, next: string) => {
    setBusy(true);
    try { await api(`/api/private/operator/reports/${encodeURIComponent(reportId)}/photos/${encodeURIComponent(photoId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Origin: location.origin }, body: JSON.stringify({ status: next, note: operatorNote.trim() || 'Revisión manual de la evidencia visual.' }) }); await loadReports(); setStatus('Estado de la foto actualizado y auditado.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'No se pudo revisar la foto.'); }
    finally { setBusy(false); }
  };

  const toggleFlag = (flag: string) => setModerationFlags((current) => current.includes(flag) ? current.filter((item) => item !== flag) : [...current, flag]);

  return <dialog ref={dialogRef} className="messages-panel integrated-panel" aria-labelledby="messages-title" onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="messages-surface"><header className="messages-head"><div><span className="v3-eyebrow">Acceso privado</span><h2 id="messages-title">Comunicaciones y reportes</h2></div><button type="button" className="ui-icon-button" aria-label="Cerrar comunicaciones" onClick={close}>×</button></header><section><h3>Comunicaciones públicas</h3>{publicMessages.length ? publicMessages.slice(0, 5).map((message) => <article key={message.id}><strong>{message.title}</strong><p>{message.body}</p></article>) : <p>No hay comunicaciones públicas activas.</p>}</section>{!config && <p role="status">Consultando disponibilidad…</p>}{config && !config.enabled && <p><strong>Funciones privadas no activadas.</strong> La información pública continúa disponible.</p>}{config?.enabled && !principal && <section><p>Iniciá sesión con Google sólo para la bandeja privada, Informar y el workspace operador.</p><div ref={googleRef}/>{busy && <span>Validando…</span>}</section>}{principal && <><section><div className="panel-section-head"><div><h3>Bandeja privada</h3><span>{principal.role.replaceAll('_', ' ')}</span></div><button type="button" className="ui-button ui-button--secondary" disabled={busy} onClick={() => void logout()}>Cerrar sesión</button></div>{isOperator(principal) && conversations.length > 0 && <label>Conversación<select value={conversation?.id ?? ''} onChange={(event) => { const selected = conversations.find((item) => item.id === event.target.value) ?? null; setConversation(selected); if (selected) void loadMessages(selected.id); }}>{conversations.map((item) => <option key={item.id} value={item.id}>{item.id}</option>)}</select></label>}<div className="private-message-list">{messages.map((message) => <article key={message.id} className={message.verifiedOperator ? 'operator-message' : 'user-message'}><div><strong>{message.verifiedOperator ? 'Operador verificado' : 'Usuario'}</strong><time>{displayTime(message.createdAt)}</time></div><p>{message.body}</p><small>{message.status.replaceAll('_', ' ')}</small></article>)}</div>{conversation && <><label>Mensaje<textarea rows={3} maxLength={280} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Texto sin emoji, máximo 280 caracteres"/><small>{draft.length}/280</small></label><button type="button" className="ui-button ui-button--primary" disabled={busy || !draft.trim()} onClick={() => void send()}>{busy ? 'Procesando…' : 'Enviar'}</button></>}</section>{isOperator(principal) && <section className="operator-queue"><h3>Cola de informes</h3><fieldset><legend>Moderación para la próxima actualización</legend>{['PERSONAL_DATA', 'DUPLICATE', 'UNVERIFIED', 'ABUSIVE', 'OUT_OF_SCOPE', 'SAFETY_SENSITIVE'].map((flag) => <label key={flag}><input type="checkbox" checked={moderationFlags.includes(flag)} onChange={() => toggleFlag(flag)}/>{flag.replaceAll('_', ' ')}</label>)}<label>Nota del operador<textarea rows={2} value={operatorNote} onChange={(event) => setOperatorNote(event.target.value)} maxLength={1000}/></label><label>Descripción redactada opcional<textarea rows={2} value={redactedDescription} onChange={(event) => setRedactedDescription(event.target.value)} maxLength={500}/></label></fieldset>{reports.map((report) => <article key={report.id}><div><strong>{report.category}</strong><span>{report.status}</span></div><p>{report.redacted_description || report.description}</p><small>{report.location_label || 'Sin referencia manual'} · {displayTime(report.created_at)}</small>{parseFlags(report.moderation_flags_json).length > 0 && <p><strong>Flags:</strong> {parseFlags(report.moderation_flags_json).join(', ')}</p>}{report.photos?.length ? <div className="report-photo-list">{report.photos.map((photo) => <article key={photo.id}><a href={`/api/private/operator/reports/${encodeURIComponent(report.id)}/photos/${encodeURIComponent(photo.id)}`} target="_blank" rel="noreferrer">Abrir foto privada ({Math.round(photo.bytes / 1024)} KiB)</a><span>{photo.review_status}</span><div><button type="button" onClick={() => void reviewPhoto(report.id, photo.id, 'APPROVED')}>Aprobar</button><button type="button" onClick={() => void reviewPhoto(report.id, photo.id, 'REDACTED')}>Marcar redactada</button><button type="button" onClick={() => void reviewPhoto(report.id, photo.id, 'REJECTED')}>Rechazar</button></div></article>)}</div> : <p>Sin fotos adjuntas.</p>}<div className="queue-actions">{report.status === 'NEW' && <button type="button" onClick={() => void transition(report, 'UNDER_REVIEW')}>Tomar revisión</button>}{report.status === 'UNDER_REVIEW' && <><button type="button" onClick={() => void transition(report, 'ESCALATION_READY')}>Preparar derivación</button><button type="button" onClick={() => void transition(report, 'REJECTED')}>Rechazar</button></>}{report.status === 'ESCALATION_READY' && <><input aria-label="Destino de derivación" placeholder="Destino" value={forwardDestination} onChange={(event) => setForwardDestination(event.target.value)}/><input aria-label="Referencia de derivación" placeholder="Referencia" value={forwardReference} onChange={(event) => setForwardReference(event.target.value)}/><button type="button" onClick={() => void transition(report, 'FORWARDED')}>Registrar derivación</button></>}{['REJECTED', 'FORWARDED'].includes(report.status) && <button type="button" onClick={() => void transition(report, 'CLOSED')}>Cerrar</button>}</div></article>)}{reports.length === 0 && <p>No hay informes en la cola.</p>}</section>}</>}{status && <p role="status" className="inbox-status">{status}</p>}</div></dialog>;
}
