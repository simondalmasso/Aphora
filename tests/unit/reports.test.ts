import { File } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types';
import { createReport, listReports, updateReport, type R2BucketLike } from '../../src/worker/reports';
import type { D1DatabaseLike, D1Statement } from '../../src/worker/d1-message-store';

class FakeStatement implements D1Statement {
  values: unknown[] = [];
  constructor(private readonly db: FakeDb, private readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.query.startsWith('SELECT id,status,created_at FROM reports')) return [...this.db.reports.values()].find((row) => row.reporter_sub === this.values[0] && row.idempotency_key === this.values[1]) as T ?? null;
    if (this.query.startsWith('SELECT * FROM reports WHERE id')) return this.db.reports.get(String(this.values[0])) as T ?? null;
    return null;
  }
  async all<T>() {
    let rows = [...this.db.reports.values()];
    if (this.query.includes('WHERE status =')) rows = rows.filter((row) => row.status === this.values[0]);
    if (this.query.includes('WHERE reporter_sub =')) rows = rows.filter((row) => row.reporter_sub === this.values[0]);
    return { results: rows as T[] };
  }
  async run() {
    if (this.query.startsWith('INSERT INTO reports ')) {
      const [id, reporter_sub, category, description, location_label, latitude, longitude, accuracy_m, location_captured_at, exact_location_consent, status, idempotency_key, created_at, updated_at, expires_at] = this.values;
      this.db.reports.set(String(id), { id, reporter_sub, category, description, location_label, latitude, longitude, accuracy_m, location_captured_at, exact_location_consent, status, idempotency_key, created_at, updated_at, expires_at });
    }
    if (this.query.startsWith('UPDATE reports SET status')) {
      const [status, updated_at, forwarded_destination, forwarded_reference, , forwarded_at, , forwarded_by, id] = this.values;
      const row = this.db.reports.get(String(id));
      if (row) this.db.reports.set(String(id), { ...row, status, updated_at, forwarded_destination: forwarded_destination ?? row.forwarded_destination, forwarded_reference: forwarded_reference ?? row.forwarded_reference, forwarded_at, forwarded_by });
    }
    if (this.query.startsWith('INSERT INTO report_photos')) this.db.photoCount += 1;
    if (this.query.startsWith('INSERT INTO report_events')) this.db.eventCount += 1;
    return { success: true };
  }
}
class FakeDb implements D1DatabaseLike {
  reports = new Map<string, Record<string, unknown>>();
  photoCount = 0;
  eventCount = 0;
  prepare(query: string) { return new FakeStatement(this, query); }
}
class FakeBucket implements R2BucketLike {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: ArrayBuffer | Uint8Array) { this.objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value)); }
  async get() { return null; }
  async delete(key: string) { this.objects.delete(key); }
}
const user: SessionPrincipal = { sub: 'user:one', role: 'AUTHENTICATED_USER', expiresAt: '2026-08-04T00:00:00.000Z' };
const other: SessionPrincipal = { ...user, sub: 'user:two' };
const operator: SessionPrincipal = { sub: 'operator:one', role: 'VERIFIED_OPERATOR', expiresAt: user.expiresAt };

function request(idempotencyKey = 'report:key-1', files: File[] = []) {
  const form = new FormData();
  form.set('metadata', JSON.stringify({ category: 'ANEGAMIENTO', description: 'Agua acumulada en la esquina desde hace una hora.', locationLabel: 'Barrio Centro', exactLocationConsent: false, idempotencyKey }));
  files.forEach((file) => form.append('photos', file));
  return new Request('https://sos-sf.test/api/private/reports', { method: 'POST', body: form });
}

describe('report workflow', () => {
  it('stores one private report and makes retries idempotent', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9])], 'evidence.jpg', { type: 'image/jpeg' });
    const first = await createReport(request('report:key-1', [jpeg]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user);
    const duplicate = await createReport(request('report:key-1'), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user);
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(db.reports.size).toBe(1);
    expect(db.photoCount).toBe(1);
    expect(bucket.objects.size).toBe(1);
  });

  it('isolates user listings and permits only valid operator transitions', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const created = await createReport(request(), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user);
    expect((await listReports({ MESSAGES_DB: db }, other, null)).reports).toHaveLength(0);
    expect((await listReports({ MESSAGES_DB: db }, operator, null)).reports).toHaveLength(1);
    const id = (created.report as { id: string }).id;
    await updateReport(new Request('https://sos-sf.test', { method: 'PATCH', body: JSON.stringify({ status: 'UNDER_REVIEW' }), headers: { 'Content-Type': 'application/json' } }), { MESSAGES_DB: db }, operator, id);
    await updateReport(new Request('https://sos-sf.test', { method: 'PATCH', body: JSON.stringify({ status: 'ESCALATION_READY' }), headers: { 'Content-Type': 'application/json' } }), { MESSAGES_DB: db }, operator, id);
    await expect(updateReport(new Request('https://sos-sf.test', { method: 'PATCH', body: JSON.stringify({ status: 'FORWARDED' }), headers: { 'Content-Type': 'application/json' } }), { MESSAGES_DB: db }, operator, id)).rejects.toThrow('FORWARDING_EVIDENCE_REQUIRED');
    await updateReport(new Request('https://sos-sf.test', { method: 'PATCH', body: JSON.stringify({ status: 'FORWARDED', forwardedDestination: 'COBEM', forwardedReference: 'exp-123' }), headers: { 'Content-Type': 'application/json' } }), { MESSAGES_DB: db }, operator, id);
    expect(db.reports.get(id)?.status).toBe('FORWARDED');
    expect(db.eventCount).toBeGreaterThanOrEqual(4);
  });

  it('rejects too many photos and signature/MIME mismatches', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const invalid = new File([new Uint8Array([1, 2, 3])], 'fake.jpg', { type: 'image/jpeg' });
    await expect(createReport(request('report:bad', [invalid]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user)).rejects.toThrow('INVALID_PHOTO_TYPE');
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9])], 'ok.jpg', { type: 'image/jpeg' });
    await expect(createReport(request('report:many', [jpeg, jpeg, jpeg]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user)).rejects.toThrow('TOO_MANY_PHOTOS');
  });
});
