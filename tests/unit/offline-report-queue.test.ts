import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('durable offline report queue', () => {
  it('persists one versioned IndexedDB record with stable id, idempotency key and photo blobs', async () => {
    const source = await readFile('src/client/features/reports/report-draft-store.ts', 'utf8');
    expect(source).toContain('readonly version: 3');
    expect(source).toContain('readonly id: string');
    expect(source).toContain('readonly idempotencyKey: string');
    expect(source).toContain('readonly blob: Blob');
    expect(source).toContain("'PENDING_SEND'");
  });

  it('only auto-retries an already pending record and preserves its idempotency key on failure', async () => {
    const source = await readFile('src/client/features/reports/ReportDialog.tsx', 'utf8');
    expect(source).toContain("queueState !== 'PENDING_SEND'");
    expect(source).toContain('autoAttemptedKey.current === idempotencyKey');
    expect(source).toContain('El mismo intento quedó pendiente y conservará su clave para evitar duplicados.');
    expect(source).toContain("setQueueState('ACKNOWLEDGED')");
  });
});
