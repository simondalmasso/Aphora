export interface StoredReportPhoto {
  readonly blob: Blob;
  readonly name: string;
  readonly type: string;
  readonly lastModified: number;
}

export interface StoredLocationReading {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number;
  readonly capturedAt: string;
}

export interface StoredReportDraft {
  readonly version: 3;
  readonly id: string;
  readonly idempotencyKey: string;
  readonly category: string;
  readonly description: string;
  readonly locationLabel: string;
  readonly trustedContact: string;
  readonly location: StoredLocationReading | null;
  readonly exactConsent: boolean;
  readonly photos: readonly StoredReportPhoto[];
  readonly queueState: 'SAVED_LOCAL' | 'PENDING_SEND' | 'ACKNOWLEDGED';
  readonly updatedAt: string;
}

const DB_NAME = 'sos-sf-offline';
const DB_VERSION = 3;
const STORE = 'report-drafts';
const ACTIVE_KEY = 'active';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('INDEXED_DB_OPEN_FAILED'));
    request.onblocked = () => reject(new Error('INDEXED_DB_BLOCKED'));
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = operation(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('INDEXED_DB_REQUEST_FAILED'));
      tx.onabort = () => reject(tx.error ?? new Error('INDEXED_DB_TRANSACTION_ABORTED'));
    });
  } finally { db.close(); }
}

export async function loadReportDraft(): Promise<StoredReportDraft | null> {
  try {
    const value = await transaction<StoredReportDraft | undefined>('readonly', (store) => store.get(ACTIVE_KEY));
    if (!value || value.version !== 3 || typeof value.id !== 'string' || typeof value.idempotencyKey !== 'string' || !Array.isArray(value.photos)) return null;
    return value;
  } catch { return null; }
}

export async function saveReportDraft(value: StoredReportDraft): Promise<void> {
  await transaction<IDBValidKey>('readwrite', (store) => store.put(value, ACTIVE_KEY));
}

export async function clearReportDraft(): Promise<void> {
  await transaction<undefined>('readwrite', (store) => store.delete(ACTIVE_KEY) as IDBRequest<undefined>);
}

export function restoredFiles(value: StoredReportDraft): File[] {
  return value.photos.map((item) => new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified }));
}

export function storedPhotos(files: readonly File[]): StoredReportPhoto[] {
  return files.map((file) => Object.freeze({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified }));
}
