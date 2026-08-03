import { useCallback, useEffect, useRef, useState } from 'react';
import { demoSnapshot } from '../../data/demo-snapshot';
import type { Snapshot } from '../../domain/snapshot';
import { validateSnapshot } from '../../domain/validation';

const STORAGE_KEY = 'sos-sf:last-snapshot:v1';

interface StoredSnapshot {
  readonly snapshot: Snapshot;
  readonly savedAt: string;
}

interface ApiEnvelope {
  readonly data?: unknown;
}

function loadStored(): StoredSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot;
    validateSnapshot(parsed.snapshot);
    if (!Number.isFinite(Date.parse(parsed.savedAt))) return null;
    return parsed;
  } catch {
    return null;
  }
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
  const [snapshot, setSnapshot] = useState<Snapshot>(() => navigator.onLine ? demoSnapshot : initialStored?.snapshot ?? demoSnapshot);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [savedAt, setSavedAt] = useState<string | null>(() => initialStored?.savedAt ?? null);
  const [source, setSource] = useState<'BUNDLED' | 'NETWORK' | 'OFFLINE_CACHE'>(() => navigator.onLine ? 'BUNDLED' : initialStored ? 'OFFLINE_CACHE' : 'BUNDLED');
  const [refreshing, setRefreshing] = useState(false);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(() => initialStored?.savedAt ?? null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshInFlight = useRef<Promise<boolean> | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback((): Promise<boolean> => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const operation = (async () => {
      if (!navigator.onLine) {
        if (mounted.current) setRefreshError('Sin conexión: se conserva el último snapshot disponible.');
        return false;
      }
      if (mounted.current) {
        setRefreshing(true);
        setRefreshError(null);
      }
      try {
        const [snapshotData, sourcesData, messagesData] = await Promise.all([
          fetchEnvelope('/api/snapshot'),
          fetchEnvelope('/api/sources'),
          fetchEnvelope('/api/messages'),
        ]);
        const sources = objectValue(sourcesData).sources;
        const messages = objectValue(messagesData).messages;
        const base = objectValue(snapshotData);
        const validated = validateSnapshot({ ...base, sources, messages });
        const now = new Date().toISOString();
        const stored: StoredSnapshot = { snapshot: validated, savedAt: now };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        if (mounted.current) {
          setOnline(true);
          setSnapshot(validated);
          setSavedAt(now);
          setLastSuccessAt(now);
          setSource('NETWORK');
        }
        return true;
      } catch {
        if (mounted.current) {
          setOnline(false);
          setRefreshError('La actualización falló. Se conserva el snapshot anterior.');
        }
        return false;
      } finally {
        if (mounted.current) setRefreshing(false);
        refreshInFlight.current = null;
      }
    })();
    refreshInFlight.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    void refresh();
    return () => {
      mounted.current = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  return { snapshot, online, savedAt, source, refresh, refreshing, lastSuccessAt, refreshError } as const;
}
