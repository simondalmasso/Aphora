import { useCallback, useEffect, useRef, useState } from 'react';
import { unavailableSnapshot } from '../../data/unavailable-snapshot';
import type { Snapshot } from '../../domain/snapshot';
import { validateSnapshot } from '../../domain/validation';

const STORAGE_KEY = 'sos-sf:last-public-safety-snapshot:v4';

interface StoredSnapshot { readonly snapshot: Snapshot; readonly savedAt: string }
interface ApiEnvelope { readonly data?: unknown }

class OfflineResponseError extends Error {
  constructor(path: string) {
    super(`Sin conexión al actualizar ${path}`);
    this.name = 'OfflineResponseError';
  }
}

function loadStored(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot;
    validateSnapshot(parsed.snapshot);
    if (!Number.isFinite(Date.parse(parsed.savedAt)) || parsed.snapshot.mode === 'DEMO') return null;
    return parsed;
  } catch { return null; }
}

function noStoredOfflineSnapshot(): Snapshot {
  return { ...unavailableSnapshot, mode: 'OFFLINE', dataStatus: 'OFFLINE', freshness: 'NO_DISPONIBLE', alertStatus: 'FUENTES_DE_ALERTAS_NO_DISPONIBLES', stateLabel: 'Sin conexión', summary: 'No existe un snapshot previo guardado. No se puede confirmar la situación ni la ausencia de alertas.' };
}

function offlineSnapshot(stored: StoredSnapshot): Snapshot {
  return {
    ...stored.snapshot,
    mode: 'OFFLINE',
    dataStatus: 'OFFLINE',
    freshness: 'NO_DISPONIBLE',
    alertStatus: 'FUENTES_DE_ALERTAS_NO_DISPONIBLES',
    stateLabel: 'Sin conexión',
    summary: `${stored.snapshot.summary} No es información actual.`,
    systems: stored.snapshot.systems?.map((system) => ({ ...system, dataStatus: 'OFFLINE', freshness: 'NO_DISPONIBLE' })),
    river: { ...stored.snapshot.river, dataStatus: 'OFFLINE' },
    rain: { ...stored.snapshot.rain, dataStatus: 'OFFLINE' },
  };
}

function backendFailureSnapshot(stored: StoredSnapshot): Snapshot {
  return {
    ...stored.snapshot,
    mode: 'LIVE',
    dataStatus: 'STALE',
    freshness: 'DESACTUALIZADO',
    alertStatus: 'VERIFICACION_DE_ALERTAS_DEGRADADA',
    stateLabel: 'Última información disponible',
    summary: `${stored.snapshot.summary} El servicio no pudo actualizarse; no es información actual.`,
    systems: stored.snapshot.systems?.map((system) => ({ ...system, dataStatus: system.available ? 'STALE' : 'UNAVAILABLE', freshness: system.available ? 'DESACTUALIZADO' : 'NO_DISPONIBLE' })),
    river: { ...stored.snapshot.river, dataStatus: stored.snapshot.river.available ? 'STALE' : 'UNAVAILABLE' },
    rain: { ...stored.snapshot.rain, dataStatus: stored.snapshot.rain.available ? 'STALE' : 'UNAVAILABLE' },
  };
}

function isOfflineEnvelope(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = (value as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  const error = (data as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && !Array.isArray(error) && (error as { code?: unknown }).code === 'OFFLINE';
}

async function fetchEnvelope(path: string): Promise<unknown> {
  const response = await fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  const payload = await response.json().catch(() => null) as ApiEnvelope | null;
  if (!response.ok) {
    if (response.status === 503 && isOfflineEnvelope(payload)) throw new OfflineResponseError(path);
    throw new Error(`No se pudo actualizar ${path}`);
  }
  return payload?.data;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Respuesta API inválida');
  return value as Record<string, unknown>;
}

export function useSnapshot() {
  const [initialStored] = useState<StoredSnapshot | null>(loadStored);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => navigator.onLine ? unavailableSnapshot : initialStored ? offlineSnapshot(initialStored) : noStoredOfflineSnapshot());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(() => initialStored?.savedAt ?? null);
  const [source, setSource] = useState<'NETWORK' | 'OFFLINE_CACHE' | 'STALE_CACHE' | 'UNAVAILABLE'>(() => navigator.onLine ? 'UNAVAILABLE' : initialStored ? 'OFFLINE_CACHE' : 'UNAVAILABLE');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(() => initialStored?.savedAt ?? null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);

  const enterOfflineState = useCallback(() => {
    const stored = loadStored();
    if (!mounted.current) return;
    setOnline(false);
    setBackendAvailable(null);
    setSource(stored ? 'OFFLINE_CACHE' : 'UNAVAILABLE');
    setSnapshot(stored ? offlineSnapshot(stored) : noStoredOfflineSnapshot());
    setRefreshError('Modo sin conexión. No es información actual.');
    setRefreshing(false);
  }, []);

  const refresh = useCallback((): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const operation = (async () => {
      if (!navigator.onLine) {
        enterOfflineState();
        return false;
      }
      if (mounted.current) { setOnline(true); setRefreshing(true); setRefreshError(null); }
      try {
        const [snapshotData, sourcesData, messagesData] = await Promise.all([fetchEnvelope('/api/snapshot'), fetchEnvelope('/api/sources'), fetchEnvelope('/api/messages')]);
        const sources = objectValue(sourcesData).sources;
        const systems = objectValue(sourcesData).systems;
        const messages = objectValue(messagesData).messages;
        const base = objectValue(snapshotData);
        const validated = validateSnapshot({ ...base, sources, systems, messages });
        const now = new Date().toISOString();
        if (validated.mode !== 'DEMO' && validated.dataStatus !== 'UNAVAILABLE') localStorage.setItem(STORAGE_KEY, JSON.stringify({ snapshot: validated, savedAt: now } satisfies StoredSnapshot));
        if (mounted.current) {
          setOnline(true);
          setBackendAvailable(true);
          setSnapshot(validated);
          setSavedAt(validated.dataStatus === 'UNAVAILABLE' ? initialStored?.savedAt ?? null : now);
          setLastSuccessAt(now);
          setSource(validated.dataStatus === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'NETWORK');
          setRefreshError(validated.dataStatus === 'UNAVAILABLE' ? 'El servicio responde, pero no hay datos públicos disponibles.' : null);
        }
        return true;
      } catch (error) {
        if (error instanceof OfflineResponseError || !navigator.onLine) {
          enterOfflineState();
          return false;
        }
        const stored = loadStored();
        if (mounted.current) {
          setOnline(true);
          setBackendAvailable(false);
          setSource(stored ? 'STALE_CACHE' : 'UNAVAILABLE');
          setSnapshot(stored ? backendFailureSnapshot(stored) : unavailableSnapshot);
          setRefreshError(stored ? 'Servicio temporalmente no disponible. Se conserva una lectura anterior; no es información actual.' : 'Servicio temporalmente no disponible y sin lectura anterior.');
        }
        return false;
      } finally {
        if (mounted.current) setRefreshing(false);
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = operation;
    return operation;
  }, [enterOfflineState, initialStored]);

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => { enterOfflineState(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refresh();
    return () => { mounted.current = false; window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [enterOfflineState, refresh]);

  return { snapshot, online, backendAvailable, savedAt, source, refresh, refreshing, lastSuccessAt, refreshError } as const;
}
