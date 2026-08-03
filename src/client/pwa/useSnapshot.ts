import { useEffect, useState } from 'react';
import { demoSnapshot } from '../../data/demo-snapshot';
import { validateSnapshot } from '../../domain/validation';
import type { Snapshot } from '../../domain/snapshot';

const STORAGE_KEY = 'sos-sf:last-snapshot:v1';

interface StoredSnapshot {
  readonly snapshot: Snapshot;
  readonly savedAt: string;
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

export function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => navigator.onLine ? demoSnapshot : loadStored()?.snapshot ?? demoSnapshot);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [savedAt, setSavedAt] = useState<string | null>(() => loadStored()?.savedAt ?? null);
  const [source, setSource] = useState<'BUNDLED' | 'NETWORK' | 'OFFLINE_CACHE'>(() => navigator.onLine ? 'BUNDLED' : loadStored() ? 'OFFLINE_CACHE' : 'BUNDLED');

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const controller = new AbortController();
    if (navigator.onLine) {
      fetch('/api/snapshot', { headers: { Accept: 'application/json' }, signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('snapshot unavailable');
          const envelope = await response.json() as { data?: unknown };
          const validated = validateSnapshot(envelope.data);
          const now = new Date().toISOString();
          const stored: StoredSnapshot = { snapshot: validated, savedAt: now };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
          setSnapshot(validated);
          setSavedAt(now);
          setSource('NETWORK');
        })
        .catch(() => {
          const stored = loadStored();
          if (stored) {
            setSnapshot(stored.snapshot);
            setSavedAt(stored.savedAt);
            setSource('OFFLINE_CACHE');
          }
        });
    }
    return () => {
      controller.abort();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  return { snapshot, online, savedAt, source } as const;
}
