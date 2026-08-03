import { useCallback, useEffect, useRef, useState } from 'react';
import { unavailableSnapshot } from '../../data/unavailable-snapshot';
import type { Snapshot } from '../../domain/snapshot';
import { validateSnapshot } from '../../domain/validation';

const STORAGE_KEY = 'sos-sf:last-live-snapshot:v3';

interface StoredSnapshot { readonly snapshot: Snapshot; readonly savedAt: string }
interface ApiEnvelope { readonly data?: unknown }

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

function offlineSnapshot(stored: StoredSnapshot): Snapshot {
  return {
    ...stored.snapshot,
    mode: 'OFFLINE',
    dataStatus: 'OFFLINE',
    stateLabel: 'Modo sin conexión',
    summary: `${stored.snapshot.summary} No es información actual.`,
    systems: stored.snapshot.systems?.map((system) => ({ ...system, dataStatus: 'OFFLINE' })),
    river: { ...stored.snapshot.river, dataStatus: 'OFFLINE' },
    rain: { ...stored.snapshot.rain, dataStatus: 'OFFLINE' },
  };
}

function backendFailureSnapshot(stored: StoredSnapshot): Snapshot {
  return {
    ...stored.snapshot,
    mode: 'LIVE',
    dataStatus: 'STALE',
    stateLabel: 'Datos desactualizados',
    summary: `${stored.snapshot.summary} El servicio no pudo actualizarse; no es información actual.`,
    systems: stored.snapshot.systems?.map((system) => ({ ...system, dataStatus: system.available ? 'STALE' : 'UNAVAILABLE' })),
    river: { ...stored.snapshot.river, dataStatus: stored.snapshot.river.available ? 'STALE' : 'UNAVAILABLE' },
    rain: { ...stored.snapshot.rain, dataStatus: stored.snapshot.rain.available ? 'STALE' : 'UNAVAILABLE' },
  };
}

async function fetchEnvelope(path: string): Promise<unknown> {
  const response = await fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo actualizar ${path}`);
  return (await response.json() as ApiEnvelope).data;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Respuesta API inválida');
  return value as Record<string, unknown>;
}

export function useSnapshot() {
  const [initialStored] = useState<StoredSnapshot | null>(loadStored);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => navigator.onLine ? unavailableSnapshot : initialStored ? offlineSnapshot(initialStored) : { ...unavailableSnapshot, mode: 'OFFLINE', dataStatus: 'OFFLINE', stateLabel: 'Modo sin conexión', summary: 'No existe un snapshot previo guardado. No es información actual.' });
  const [online, setOnline] = useState(() => navigator.onLine);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(() => initialStored?.savedAt ?? null);
  const [source, setSource] = useState<'NETWORK' | 'OFFLINE_CACHE' | 'STALE_CACHE' | 'UNAVAILABLE'>(() => navigator.onLine ? 'UNAVAILABLE' : initialStored ? 'OFFLINE_CACHE' : 'UNAVAILABLE');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(() => initialStored?.savedAt ?? null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback((): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const operation = (async () => {
      const browserOnline = navigator.onLine;
      if (!browserOnline) {
        const stored = loadStored();
        if (mounted.current) {
          setOnline(false);
          setBackendAvailable(null);
          setSource(stored ? 'OFFLINE_CACHE' : 'UNAVAILABLE');
          setSnapshot(stored ? offlineSnapshot(stored) : { ...unavailableSnapshot, mode: 'OFFLINE', dataStatus: 'OFFLINE', stateLabel: 'Modo sin conexión', summary: 'No existe un snapshot previo guardado. No es información actual.' });
          setRefreshError('Modo sin conexión. No es información actual.');
        }
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
          setRefreshError(validated.dataStatus === 'UNAVAILABLE' ? 'El servicio responde, pero no hay datos en vivo disponibles.' : null);
        }
        return true;
      } catch {
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
  }, [initialStored]);

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => { setOnline(true); void refresh(); };
    const onOffline = () => { setOnline(false); setBackendAvailable(null); void refresh(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refresh();
    return () => { mounted.current = false; window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [refresh]);

  return { snapshot, online, backendAvailable, savedAt, source, refresh, refreshing, lastSuccessAt, refreshError } as const;
}
