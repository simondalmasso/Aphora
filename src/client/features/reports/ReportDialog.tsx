import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Snapshot } from '../../../domain/snapshot';
import { prepareReportPhoto } from './image-processing';
import {
  clearReportDraft,
  loadReportDraft,
  restoredFiles,
  saveReportDraft,
  storedPhotos,
  type StoredLocationReading,
  type StoredReportDraft,
} from './report-draft-store';

const CONTACTS = Object.freeze([
  { number: '911', label: 'Central de Emergencias', href: 'tel:911' },
  { number: '103', label: 'COBEM', href: 'tel:103' },
  { number: '107', label: 'Emergencias médicas', href: 'tel:107' },
  { number: '100', label: 'Bomberos', href: 'tel:100' },
  { number: '106', label: 'Prefectura / emergencia náutica', href: 'tel:106' },
  { number: '0800-777-5000', label: 'Atención Ciudadana municipal', href: 'tel:08007775000' },
]);

interface Draft {
  category: string;
  description: string;
  locationLabel: string;
  trustedContact: string;
}

interface Props {
  readonly open: boolean;
  readonly online: boolean;
  readonly snapshot: Snapshot;
  readonly openerRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
}

function emptyDraft(trustedContact = ''): Draft {
  return { category: 'ANEGAMIENTO', description: '', locationLabel: '', trustedContact };
}

function newIdempotencyKey(): string {
  return `report-${crypto.randomUUID()}`;
}

function trustedNumber(value: string): string | null {
  const digits = value.replace(/[^0-9+]/g, '');
  if (['911', '103', '107', '100', '106'].includes(digits)) return null;
  return digits.length >= 7 && digits.length <= 18 ? digits : null;
}

export function ReportDialog({ open, online, snapshot, openerRef, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [location, setLocation] = useState<StoredLocationReading | null>(null);
  const [exactConsent, setExactConsent] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [queueState, setQueueState] = useState<StoredReportDraft['queueState']>('SAVED_LOCAL');
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    let active = true;
    void loadReportDraft().then((stored) => {
      if (!active) return;
      if (stored) {
        setDraft({
          category: stored.category,
          description: stored.description,
          locationLabel: stored.locationLabel,
          trustedContact: stored.trustedContact,
        });
        setIdempotencyKey(stored.idempotencyKey);
        setLocation(stored.location);
        setExactConsent(stored.exactConsent);
        setPhotos(restoredFiles(stored));
        setQueueState(stored.queueState);
        if (stored.queueState === 'PENDING_SEND') {
          setStatus('Pendiente de envío. Revisá el contenido y reintentá cuando haya conexión.');
        }
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const storedDraft = (nextQueueState: StoredReportDraft['queueState']): StoredReportDraft => ({
    version: 2,
    idempotencyKey,
    category: draft.category,
    description: draft.description,
    locationLabel: draft.locationLabel,
    trustedContact: draft.trustedContact,
    location,
    exactConsent,
    photos: storedPhotos(photos),
    queueState: nextQueueState,
    updatedAt: new Date().toISOString(),
  });

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveReportDraft(storedDraft(queueState)).catch(() => {
        setStatus('No se pudo guardar el borrador en este dispositivo.');
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [draft, exactConsent, hydrated, idempotencyKey, location, photos, queueState]);

  const close = () => {
    onClose();
    requestAnimationFrame(() => openerRef.current?.focus());
  };

  const smsHref = useMemo(() => {
    const number = trustedNumber(draft.trustedContact);
    if (!number) return null;
    const locationText = draft.locationLabel
      || (location ? `ubicación aproximada con precisión ${Math.round(location.accuracy)} m` : 'ubicación no indicada');
    const body = `SOS Santa Fe. Reporte pendiente: ${draft.category}. ${draft.description.slice(0, 220)}. ${locationText}. Estado hídrico guardado: ${snapshot.stateLabel}. Este SMS lo envía la persona de forma manual.`;
    return `sms:${number}?body=${encodeURIComponent(body)}`;
  }, [draft, location, snapshot.stateLabel]);

  const locate = () => {
    setStatus(null);
    if (!navigator.geolocation) {
      setStatus('Ubicación no disponible. Podés escribir barrio o dirección.');
      return;
    }
    setBusy(true);
    let settled = false;
    const finish = (message: string) => {
      if (settled) return;
      settled = true;
      setBusy(false);
      setStatus(message);
    };
    const timeout = window.setTimeout(
      () => finish('La ubicación demoró demasiado. Podés escribir barrio o dirección.'),
      10_500,
    );
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        window.clearTimeout(timeout);
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        });
        finish('Ubicación obtenida. Las coordenadas exactas sólo se incluirán si das consentimiento al enviar.');
      },
      (error) => {
        window.clearTimeout(timeout);
        finish(
          error.code === error.PERMISSION_DENIED
            ? 'Permiso denegado. Podés continuar con barrio o dirección.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Ubicación no disponible. Podés continuar manualmente.'
              : 'La ubicación agotó el tiempo de espera. Podés continuar manualmente.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const selectPhotos = async (files: FileList | null) => {
    const selected = Array.from(files ?? []).slice(0, 2);
    if ((files?.length ?? 0) > 2) setStatus('Se procesarán sólo las primeras dos fotos.');
    setBusy(true);
    try {
      const prepared = await Promise.all(selected.map(prepareReportPhoto));
      setPhotos(prepared);
      setQueueState('SAVED_LOCAL');
      setStatus(prepared.length ? 'Fotos optimizadas y guardadas en este dispositivo.' : null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'No se pudieron preparar las fotos.');
    } finally {
      setBusy(false);
    }
  };

  const persistPending = async () => {
    await saveReportDraft(storedDraft('PENDING_SEND'));
    setQueueState('PENDING_SEND');
  };

  const submit = async () => {
    if (!draft.description.trim() || draft.description.trim().length > 500) {
      setStatus('La descripción debe tener entre 1 y 500 caracteres.');
      return;
    }

    if (!online) {
      setBusy(true);
      setStatus(null);
      try {
        await persistPending();
        setStatus('Borrador guardado en este dispositivo. Pendiente de envío; no fue remitido a SOS-SF.');
      } catch {
        setStatus('No se pudo guardar el borrador en este dispositivo. Copiá la información antes de cerrar.');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      await persistPending();
    } catch {
      setBusy(false);
      setStatus('No se pudo preparar el reporte para envío porque falló el almacenamiento local.');
      return;
    }

    const metadata = {
      category: draft.category,
      description: draft.description.trim(),
      locationLabel: draft.locationLabel.trim() || null,
      exactLocationConsent: exactConsent && Boolean(location),
      latitude: exactConsent ? location?.latitude : null,
      longitude: exactConsent ? location?.longitude : null,
      accuracyM: exactConsent ? location?.accuracy : null,
      locationCapturedAt: exactConsent ? location?.capturedAt : null,
      idempotencyKey,
    };
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    photos.forEach((file) => form.append('photos', file));

    try {
      const response = await fetch('/api/private/reports', {
        method: 'POST',
        credentials: 'same-origin',
        body: form,
      });
      const payload = await response.json() as {
        data?: { report?: { id?: string }; duplicate?: boolean };
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Iniciá sesión desde Comunicaciones para enviar el reporte.'
            : payload.error?.message ?? 'El reporte no pudo enviarse.',
        );
      }
      setQueueState('ACKNOWLEDGED');
      await clearReportDraft();
      const trusted = draft.trustedContact;
      setDraft(emptyDraft(trusted));
      setIdempotencyKey(newIdempotencyKey());
      setPhotos([]);
      setLocation(null);
      setExactConsent(false);
      setQueueState('SAVED_LOCAL');
      setStatus(
        `Recibido para revisión${payload.data?.report?.id ? `: ${payload.data.report.id}` : ''}. No implica despacho ni atención en tiempo real.${payload.data?.duplicate ? ' Se reconoció un reintento previo sin duplicarlo.' : ''}`,
      );
    } catch (error) {
      setQueueState('PENDING_SEND');
      setStatus(
        `${error instanceof Error ? error.message : 'El reporte no pudo enviarse.'} El mismo intento quedó pendiente y conservará su clave para evitar duplicados.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="report-dialog"
      aria-labelledby="report-title"
      onClose={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="report-surface">
        <header>
          <div>
            <span className="v3-eyebrow">Canal no urgente</span>
            <h2 id="report-title">Informar una situación</h2>
          </div>
          <button type="button" className="ui-icon-button" aria-label="Cerrar formulario" onClick={close}>×</button>
        </header>
        <p className="report-warning">
          No es un canal de emergencias ni garantiza atención. Ante peligro inmediato llamá a los servicios esenciales.
        </p>
        <section aria-labelledby="essential-title">
          <h3 id="essential-title">Teléfonos esenciales</h3>
          <div className="essential-grid">
            {CONTACTS.map((contact) => (
              <a href={contact.href} key={contact.number}>
                <strong>{contact.number}</strong>
                <span>{contact.label}</span>
              </a>
            ))}
          </div>
        </section>
        <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label>
            Categoría
            <select
              value={draft.category}
              onChange={(event) => {
                setDraft({ ...draft, category: event.target.value });
                setQueueState('SAVED_LOCAL');
              }}
            >
              <option value="ANEGAMIENTO">Anegamiento</option>
              <option value="RIO">Río o costa</option>
              <option value="LLUVIA">Lluvia</option>
              <option value="SERVICIO">Servicio afectado</option>
              <option value="OTRO">Otro</option>
            </select>
          </label>
          <label>
            Descripción
            <textarea
              maxLength={500}
              rows={5}
              value={draft.description}
              onChange={(event) => {
                setDraft({ ...draft, description: event.target.value });
                setQueueState('SAVED_LOCAL');
              }}
              placeholder="Qué ocurre, desde cuándo y qué referencia permite ubicarlo"
            />
            <small>{draft.description.length}/500</small>
          </label>
          <fieldset>
            <legend>Ubicación</legend>
            <button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={locate}>
              Usar mi ubicación
            </button>
            <label>
              Barrio, calle o referencia
              <input
                value={draft.locationLabel}
                onChange={(event) => {
                  setDraft({ ...draft, locationLabel: event.target.value });
                  setQueueState('SAVED_LOCAL');
                }}
                maxLength={160}
              />
            </label>
            {location && (
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={exactConsent}
                  onChange={(event) => {
                    setExactConsent(event.target.checked);
                    setQueueState('SAVED_LOCAL');
                  }}
                />
                Incluir coordenadas exactas en este reporte ({Math.round(location.accuracy)} m de precisión)
              </label>
            )}
          </fieldset>
          <label>
            Fotos opcionales (máximo 2; se reducen antes de subir)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => void selectPhotos(event.target.files)}
            />
          </label>
          {photos.length > 0 && (
            <p>
              {photos.length} foto{photos.length === 1 ? '' : 's'} guardada{photos.length === 1 ? '' : 's'} localmente ·{' '}
              {Math.round(photos.reduce((sum, file) => sum + file.size, 0) / 1024)} KiB
            </p>
          )}
          <button className="ui-button ui-button--primary" type="submit" disabled={busy || !hydrated}>
            {busy
              ? 'Procesando…'
              : queueState === 'PENDING_SEND' && online
                ? 'Reintentar envío'
                : online
                  ? 'Enviar informe'
                  : 'Guardar borrador'}
          </button>
        </form>
        {!online && (
          <section className="sms-fallback">
            <h3>Preparar SMS</h3>
            <p>Elegí un contacto personal de confianza. La aplicación sólo abre el compositor; nunca envía automáticamente.</p>
            <label>
              Teléfono de confianza
              <input
                inputMode="tel"
                value={draft.trustedContact}
                onChange={(event) => setDraft({ ...draft, trustedContact: event.target.value })}
                placeholder="Ej. +54 342 ..."
              />
            </label>
            {smsHref
              ? <a className="ui-button ui-button--secondary" href={smsHref}>Abrir compositor de SMS</a>
              : <p>Ingresá un número personal válido. Los números 911, 103, 107, 100 y 106 no se usan como destino SMS.</p>}
          </section>
        )}
        {status && <p className="report-status" role="status">{status}</p>}
      </div>
    </dialog>
  );
}
