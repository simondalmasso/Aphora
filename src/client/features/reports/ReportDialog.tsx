import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot';

const DRAFT_KEY = 'sos-sf:report-draft:v1';
const CONTACTS = Object.freeze([
  { number: '911', label: 'Central de Emergencias', href: 'tel:911' },
  { number: '103', label: 'COBEM', href: 'tel:103' },
  { number: '107', label: 'Emergencias médicas', href: 'tel:107' },
  { number: '100', label: 'Bomberos', href: 'tel:100' },
  { number: '106', label: 'Prefectura / emergencia náutica', href: 'tel:106' },
  { number: '0800-777-5000', label: 'Atención Ciudadana municipal', href: 'tel:08007775000' },
]);

interface Draft { category: string; description: string; locationLabel: string; trustedContact: string }
interface LocationReading { latitude: number; longitude: number; accuracy: number; capturedAt: string }
interface Props { readonly open: boolean; readonly online: boolean; readonly snapshot: Snapshot; readonly openerRef: RefObject<HTMLButtonElement | null>; readonly onClose: () => void }

function loadDraft(): Draft {
  try { return { category: 'ANEGAMIENTO', description: '', locationLabel: '', trustedContact: '', ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<Draft> }; }
  catch { return { category: 'ANEGAMIENTO', description: '', locationLabel: '', trustedContact: '' }; }
}

function trustedNumber(value: string): string | null {
  const digits = value.replace(/[^0-9+]/g, '');
  if (['911', '103', '107', '100', '106'].includes(digits)) return null;
  return digits.length >= 7 && digits.length <= 18 ? digits : null;
}

export function ReportDialog({ open, online, snapshot, openerRef, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [location, setLocation] = useState<LocationReading | null>(null);
  const [exactConsent, setExactConsent] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft]);

  const close = () => { onClose(); requestAnimationFrame(() => openerRef.current?.focus()); };
  const smsHref = useMemo(() => {
    const number = trustedNumber(draft.trustedContact);
    if (!number) return null;
    const locationText = draft.locationLabel || (location ? `ubicación aproximada con precisión ${Math.round(location.accuracy)} m` : 'ubicación no indicada');
    const body = `SOS Santa Fe. Reporte pendiente: ${draft.category}. ${draft.description.slice(0, 220)}. ${locationText}. Estado hídrico guardado: ${snapshot.stateLabel}. Este SMS lo envía la persona de forma manual.`;
    return `sms:${number}?body=${encodeURIComponent(body)}`;
  }, [draft, location, snapshot.stateLabel]);

  const locate = () => {
    setStatus(null);
    if (!navigator.geolocation) return setStatus('Este dispositivo no ofrece ubicación. Podés escribir barrio o dirección.');
    setBusy(true);
    const timeout = window.setTimeout(() => { setBusy(false); setStatus('La ubicación demoró demasiado. Podés escribir barrio o dirección.'); }, 10_500);
    navigator.geolocation.getCurrentPosition((position) => {
      window.clearTimeout(timeout);
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date(position.timestamp).toISOString() });
      setBusy(false);
      setStatus('Ubicación obtenida. Las coordenadas exactas sólo se incluirán si das consentimiento al enviar.');
    }, (error) => {
      window.clearTimeout(timeout);
      setBusy(false);
      setStatus(error.code === error.PERMISSION_DENIED ? 'Permiso denegado. Podés continuar con barrio o dirección.' : 'No se pudo obtener la ubicación. Podés continuar manualmente.');
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 });
  };

  const submit = async () => {
    if (!online) { setStatus('Borrador guardado en este dispositivo. Reintentá al recuperar conexión o prepará un SMS para un contacto de confianza.'); return; }
    if (!draft.description.trim() || draft.description.trim().length > 500) { setStatus('La descripción debe tener entre 1 y 500 caracteres.'); return; }
    setBusy(true); setStatus(null);
    const metadata = {
      category: draft.category,
      description: draft.description.trim(),
      locationLabel: draft.locationLabel.trim() || null,
      exactLocationConsent: exactConsent && Boolean(location),
      latitude: exactConsent ? location?.latitude : null,
      longitude: exactConsent ? location?.longitude : null,
      accuracyM: exactConsent ? location?.accuracy : null,
      locationCapturedAt: exactConsent ? location?.capturedAt : null,
      idempotencyKey: `report-${crypto.randomUUID()}`,
    };
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    photos.slice(0, 2).forEach((file) => form.append('photos', file));
    try {
      const response = await fetch('/api/private/reports', { method: 'POST', credentials: 'same-origin', body: form });
      const payload = await response.json() as { data?: { report?: { id?: string } }; error?: { message?: string } };
      if (!response.ok) throw new Error(response.status === 401 ? 'Iniciá sesión desde Mensajes para enviar el reporte.' : payload.error?.message ?? 'El reporte no pudo enviarse.');
      localStorage.removeItem(DRAFT_KEY);
      setDraft({ category: 'ANEGAMIENTO', description: '', locationLabel: '', trustedContact: draft.trustedContact });
      setPhotos([]); setLocation(null); setExactConsent(false);
      setStatus(`Reporte recibido por el servicio${payload.data?.report?.id ? `: ${payload.data.report.id}` : ''}. No implica despacho ni atención en tiempo real.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'El reporte no pudo enviarse. El borrador se conserva.'); }
    finally { setBusy(false); }
  };

  return <dialog ref={dialogRef} className="report-dialog" aria-labelledby="report-title" onClose={close} onClick={(event) => { if (event.target === event.currentTarget) close(); }}><div className="report-surface"><header><div><span className="v3-eyebrow">Canal no urgente</span><h2 id="report-title">Informar una situación</h2></div><button type="button" className="ui-icon-button" aria-label="Cerrar formulario" onClick={close}>×</button></header><p className="report-warning">No es un canal de emergencias ni garantiza atención. Ante peligro inmediato llamá a los servicios esenciales.</p><section aria-labelledby="essential-title"><h3 id="essential-title">Teléfonos esenciales</h3><div className="essential-grid">{CONTACTS.map((contact) => <a href={contact.href} key={contact.number}><strong>{contact.number}</strong><span>{contact.label}</span></a>)}</div></section><form onSubmit={(event) => { event.preventDefault(); void submit(); }}><label>Categoría<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="ANEGAMIENTO">Anegamiento</option><option value="RIO">Río o costa</option><option value="LLUVIA">Lluvia</option><option value="SERVICIO">Servicio afectado</option><option value="OTRO">Otro</option></select></label><label>Descripción<textarea maxLength={500} rows={5} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Qué ocurre, desde cuándo y qué referencia permite ubicarlo"/><small>{draft.description.length}/500</small></label><fieldset><legend>Ubicación</legend><button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={locate}>Usar mi ubicación</button><label>Barrio, calle o referencia<input value={draft.locationLabel} onChange={(event) => setDraft({ ...draft, locationLabel: event.target.value })} maxLength={160}/></label>{location && <label className="consent-row"><input type="checkbox" checked={exactConsent} onChange={(event) => setExactConsent(event.target.checked)}/>Incluir coordenadas exactas en este reporte ({Math.round(location.accuracy)} m de precisión)</label>}</fieldset><label>Fotos opcionales (máximo 2, JPEG/PNG/WebP, 4 MiB cada una)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { const selected = Array.from(event.target.files ?? []).slice(0, 2); setPhotos(selected); if ((event.target.files?.length ?? 0) > 2) setStatus('Se conservaron sólo las primeras dos fotos.'); }}/></label><button className="ui-button ui-button--primary" type="submit" disabled={busy}>{busy ? 'Procesando…' : online ? 'Enviar informe' : 'Guardar borrador'}</button></form>{!online && <section className="sms-fallback"><h3>Preparar SMS</h3><p>Elegí un contacto personal de confianza. La aplicación sólo abre el compositor; nunca envía automáticamente.</p><label>Teléfono de confianza<input inputMode="tel" value={draft.trustedContact} onChange={(event) => setDraft({ ...draft, trustedContact: event.target.value })} placeholder="Ej. +54 342 ..."/></label>{smsHref ? <a className="ui-button ui-button--secondary" href={smsHref}>Abrir compositor de SMS</a> : <p>Ingresá un número personal válido. Los números 911, 103, 107, 100 y 106 no se usan como destino SMS.</p>}</section>}{status && <p className="report-status" role="status">{status}</p>}</div></dialog>;
}
