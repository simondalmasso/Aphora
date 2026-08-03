import { describe, expect, it } from 'vitest';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types';
import { createReport, listReports, purgeExpiredReports, reportPhoto, updatePhotoReview, updateReport, type R2BucketLike } from '../../src/worker/reports';
import type { D1DatabaseLike, D1Statement } from '../../src/worker/d1-message-store';

class FakeStatement implements D1Statement {
  values: unknown[] = [];
  constructor(private readonly db: FakeDb, private readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.query.startsWith('SELECT id,status,created_at FROM reports')) return [...this.db.reports.values()].find((row) => row.reporter_sub === this.values[0] && row.idempotency_key === this.values[1]) as T ?? null;
    if (this.query.startsWith('INSERT INTO rate_windows')) {
      const key = `${this.values[0]}:${this.values[1]}:${this.values[2]}`;
      const count = (this.db.rateWindows.get(key) ?? 0) + 1;
      this.db.rateWindows.set(key, count);
      return { count } as T;
    }
    if (this.query.startsWith('SELECT * FROM reports WHERE id')) return this.db.reports.get(String(this.values[0])) as T ?? null;
    if (this.query.startsWith('SELECT id FROM report_photos')) return this.db.photos.get(String(this.values[0])) as T ?? null;
    if (this.query.startsWith('SELECT object_key,mime_type FROM report_photos')) {
      const row = this.db.photos.get(String(this.values[0]));
      return row && row.report_id === this.values[1] ? row as T : null;
    }
    return null;
  }
  async all<T>() {
    if (this.query.startsWith('SELECT object_key FROM report_photos')) {
      const cutoff = String(this.values[0]);
      return { results: [...this.db.photos.values()].filter((row) => String(row.expires_at) <= cutoff).map((row) => ({ object_key: row.object_key })) as T[] };
    }
    if (this.query.startsWith('SELECT id,report_id,mime_type')) {
      const ids = new Set(this.values.slice(0, -1).map(String));
      return { results: [...this.db.photos.values()].filter((row) => ids.has(String(row.report_id))) as T[] };
    }
    let rows = [...this.db.reports.values()];
    if (this.query.includes('WHERE status =')) rows = rows.filter((row) => row.status === this.values[0]);
    if (this.query.includes('WHERE reporter_sub =')) rows = rows.filter((row) => row.reporter_sub === this.values[0]);
    return { results: rows as T[] };
  }
  async run() {
    if (this.query.startsWith('INSERT INTO reports ')) {
      const [id, reporter_sub, category, description, location_label, latitude, longitude, accuracy_m, location_captured_at, exact_location_consent, status, idempotency_key, created_at, updated_at, expires_at] = this.values;
      this.db.reports.set(String(id), { id, reporter_sub, category, description, location_label, latitude, longitude, accuracy_m, location_captured_at, exact_location_consent, status, idempotency_key, created_at, updated_at, expires_at, moderation_flags_json: '[]' });
    }
    if (this.query.startsWith('UPDATE reports SET status')) {
      const [status, updated_at, flags, operator_note, redacted_description, last_reviewed_by, last_reviewed_at, forwarded_destination, forwarded_reference, , forwarded_at, , forwarded_by, id] = this.values;
      const row = this.db.reports.get(String(id));
      if (row) this.db.reports.set(String(id), { ...row, status, updated_at, moderation_flags_json: flags, operator_note, redacted_description, last_reviewed_by, last_reviewed_at, forwarded_destination: forwarded_destination ?? row.forwarded_destination, forwarded_reference: forwarded_reference ?? row.forwarded_reference, forwarded_at, forwarded_by });
    }
    if (this.query.startsWith('INSERT INTO report_photos')) {
      const [id, report_id, object_key, mime_type, bytes, created_at, expires_at, review_status] = this.values;
      this.db.photos.set(String(id), { id, report_id, object_key, mime_type, bytes, created_at, expires_at, review_status });
    }
    if (this.query.startsWith('UPDATE report_photos SET review_status')) {
      const [review_status, review_note, reviewed_by, reviewed_at, id, report_id] = this.values;
      const row = this.db.photos.get(String(id));
      if (row && row.report_id === report_id) this.db.photos.set(String(id), { ...row, review_status, review_note, reviewed_by, reviewed_at });
    }
    if (this.query.startsWith('DELETE FROM reports WHERE expires_at')) {
      const cutoff = String(this.values[0]);
      for (const [id, row] of this.db.reports) if (String(row.expires_at) <= cutoff) {
        this.db.reports.delete(id);
        for (const [photoId, photoRow] of this.db.photos) if (photoRow.report_id === id) this.db.photos.delete(photoId);
      }
    }
    if (this.query.startsWith('INSERT INTO report_events')) this.db.eventCount += 1;
    if (this.query.startsWith('INSERT INTO report_redactions')) this.db.redactionCount += 1;
    return { success: true };
  }
}
class FakeDb implements D1DatabaseLike {
  reports = new Map<string, Record<string, unknown>>();
  photos = new Map<string, Record<string, unknown>>();
  rateWindows = new Map<string, number>();
  eventCount = 0;
  redactionCount = 0;
  prepare(query: string) { return new FakeStatement(this, query); }
}
class FakeBucket implements R2BucketLike {
  objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    this.objects.set(key, { bytes: value instanceof Uint8Array ? value : new Uint8Array(value), contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream' });
  }
  async get(key: string) {
    const item = this.objects.get(key);
    if (!item) return null;
    const copy = Uint8Array.from(item.bytes).buffer;
    return { body: new Blob([copy]).stream(), size: item.bytes.length, httpMetadata: { contentType: item.contentType } };
  }
  async delete(key: string) { this.objects.delete(key); }
}
const user: SessionPrincipal = { sessionId: 'session:user-one', sub: 'user:one', email: 'one@example.org', role: 'AUTHENTICATED_USER', expiresAt: '2026-08-04T00:00:00.000Z' };
const other: SessionPrincipal = { ...user, sessionId: 'session:user-two', sub: 'user:two', email: 'two@example.org' };
const operator: SessionPrincipal = { sessionId: 'session:operator-one', sub: 'operator:one', email: 'operator@example.org', role: 'VERIFIED_OPERATOR', expiresAt: user.expiresAt };
const jpegBytes = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9]).buffer;
const invalidBytes = () => Uint8Array.from([1, 2, 3]).buffer;

function request(idempotencyKey = 'report:key-1', files: File[] = [], extra?: Record<string, unknown>) {
  const form = new FormData();
  form.set('metadata', JSON.stringify({ category: 'ANEGAMIENTO', description: 'Agua acumulada en la esquina desde hace una hora.', locationLabel: 'Barrio Centro', exactLocationConsent: false, idempotencyKey, ...extra }));
  files.forEach((file) => form.append('photos', file, file.name));
  return new Request('https://sos-sf.test/api/private/reports', { method: 'POST', body: form });
}

describe('report workflow', () => {
  it('stores one private report and makes retries idempotent', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    const first = await createReport(request('report:key-1', [jpeg]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one');
    const duplicate = await createReport(request('report:key-1'), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one');
    expect(first.duplicate).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(db.reports.size).toBe(1);
    expect(db.photos.size).toBe(1);
    expect(bucket.objects.size).toBe(1);
  });

  it('isolates user listings and exposes private photos to operators', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    const created = await createReport(request('report:photo', [jpeg]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one');
    expect((await listReports({ MESSAGES_DB: db, REPORTS_BUCKET: bucket }, other, null)).reports).toHaveLength(0);
    const listed = (await listReports({ MESSAGES_DB: db, REPORTS_BUCKET: bucket }, operator, null)).reports as Array<{ photos: Array<{ id: string }> }>;
    expect(listed[0]!.photos).toHaveLength(1);
    const reportId = (created.report as { id: string }).id;
    const photoId = listed[0]!.photos[0]!.id;
    const response = await reportPhoto({ MESSAGES_DB: db, REPORTS_BUCKET: bucket }, operator, reportId, photoId);
    expect(response.headers.get('Cache-Control')).toContain('private');
    await updatePhotoReview(new Request('https://sos-sf.test', { method: 'PATCH', body: JSON.stringify({ status: 'APPROVED', note: 'Revisada.' }), headers: { 'Content-Type': 'application/json' } }), { MESSAGES_DB: db }, operator, reportId, photoId);
    expect(db.photos.get(photoId)?.review_status).toBe('APPROVED');
  });

  it('permits only valid audited operator transitions and redaction', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const created = await createReport(request(), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one');
    const id = (created.report as { id: string }).id;
    const patch = (body: unknown) => new Request('https://sos-sf.test', { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    await updateReport(patch({ status: 'UNDER_REVIEW', moderationFlags: ['PERSONAL_DATA'], redactedDescription: 'Descripción redactada.', operatorNote: 'Se eliminó un dato personal.' }), { MESSAGES_DB: db }, operator, id);
    await updateReport(patch({ status: 'ESCALATION_READY' }), { MESSAGES_DB: db }, operator, id);
    await expect(updateReport(patch({ status: 'FORWARDED' }), { MESSAGES_DB: db }, operator, id)).rejects.toThrow('FORWARDING_EVIDENCE_REQUIRED');
    await updateReport(patch({ status: 'FORWARDED', forwardedDestination: 'COBEM', forwardedReference: 'exp-123' }), { MESSAGES_DB: db }, operator, id);
    expect(db.reports.get(id)).toMatchObject({ status: 'FORWARDED', redacted_description: 'Descripción redactada.' });
    expect(db.redactionCount).toBe(1);
    expect(db.eventCount).toBeGreaterThanOrEqual(4);
  });

  it('rejects too many photos, MIME mismatches and oversized multipart bodies', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const invalid = new File([invalidBytes()], 'fake.jpg', { type: 'image/jpeg' });
    await expect(createReport(request('report:bad', [invalid]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one')).rejects.toThrow('INVALID_PHOTO_TYPE');
    const jpeg = new File([jpegBytes()], 'ok.jpg', { type: 'image/jpeg' });
    await expect(createReport(request('report:many', [jpeg, jpeg, jpeg]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one')).rejects.toThrow('TOO_MANY_PHOTOS');
    const huge = new Request('https://sos-sf.test/api/private/reports', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(10 * 1024 * 1024) }, body: '--x--' });
    await expect(createReport(huge, { MESSAGES_DB: db, REPORTS_BUCKET: bucket }, user, 'network:one')).rejects.toThrow('BODY_TOO_LARGE');
  });

  it('purges expired report rows and R2 objects', async () => {
    const db = new FakeDb(); const bucket = new FakeBucket();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    await createReport(request('report:purge', [jpeg]), { MESSAGES_DB: db, REPORTS_BUCKET: bucket, REPORT_RETENTION_DAYS: '1' }, user, 'network:one');
    expect(bucket.objects.size).toBe(1);
    await purgeExpiredReports({ MESSAGES_DB: db, REPORTS_BUCKET: bucket }, new Date(Date.now() + 3 * 86_400_000));
    expect(db.reports.size).toBe(0);
    expect(bucket.objects.size).toBe(0);
  });
});
