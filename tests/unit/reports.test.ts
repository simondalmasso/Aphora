import { describe, expect, it } from 'vitest';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types.ts';
import { consumeReportPhotoAccess, createReport, createReportPhotoAccess, listReports, purgeExpiredReports, updatePhotoReview, updateReport, type KVNamespaceLike, type ReportPhotoMetadata } from '../../src/worker/reports.ts';
import type { D1DatabaseLike, D1Statement } from '../../src/worker/d1-message-store.ts';

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
    if (this.query.startsWith('SELECT COUNT(*) AS count FROM report_photos')) {
      const cutoff = String(this.values[0]);
      return { count: [...this.db.photos.values()].filter((row) => String(row.expires_at) <= cutoff).length } as T;
    }
    if (this.query.startsWith('SELECT * FROM reports WHERE id')) return this.db.reports.get(String(this.values[0])) as T ?? null;
    if (this.query.startsWith('SELECT id FROM report_photos')) {
      const row = this.db.photos.get(String(this.values[0]));
      return row && row.report_id === this.values[1] ? row as T : null;
    }
    if (this.query.startsWith('UPDATE report_photo_access_grants SET used_at')) {
      const [usedAt, tokenHash, operatorSub, now] = this.values;
      const grant = this.db.grants.get(String(tokenHash));
      if (!grant || grant.operator_sub !== operatorSub || grant.used_at || String(grant.expires_at) <= String(now)) return null;
      this.db.grants.set(String(tokenHash), { ...grant, used_at: usedAt });
      return { report_id: grant.report_id, photo_id: grant.photo_id } as T;
    }
    if (this.query.startsWith('SELECT object_key,mime_type')) {
      const row = this.db.photos.get(String(this.values[0]));
      return row && row.report_id === this.values[1] && String(row.expires_at) > String(this.values[2]) ? row as T : null;
    }
    return null;
  }
  async all<T>() {
    if (this.query.startsWith('SELECT id,object_key FROM report_photos')) {
      const cutoff = String(this.values[0]);
      const limit = Number(this.values[1]);
      return { results: [...this.db.photos.values()].filter((row) => String(row.expires_at) <= cutoff).slice(0, limit).map((row) => ({ id: row.id, object_key: row.object_key })) as T[] };
    }
    if (this.query.startsWith('SELECT id,report_id,mime_type')) {
      const ids = new Set(this.values.slice(0, -1).map(String));
      const cutoff = String(this.values.at(-1));
      return { results: [...this.db.photos.values()].filter((row) => ids.has(String(row.report_id)) && String(row.expires_at) > cutoff) as T[] };
    }
    let rows = [...this.db.reports.values()];
    if (this.query.includes('WHERE status =')) rows = rows.filter((row) => row.status === this.values[0]);
    if (this.query.includes('WHERE reporter_sub =')) rows = rows.filter((row) => row.reporter_sub === this.values[0]);
    return { results: rows as T[] };
  }
  async run() {
    if (this.query.startsWith('INSERT INTO reports ')) {
      const [id, reporter_sub, category, description, location_label, latitude, longitude, accuracy_m, location_captured_at, exact_location_consent, status, idempotency_key, created_at, updated_at, expires_at] = this.values;
      if ([...this.db.reports.values()].some((row) => row.reporter_sub === reporter_sub && row.idempotency_key === idempotency_key)) throw new Error('UNIQUE_CONSTRAINT');
      this.db.reports.set(String(id), { id, reporter_sub, category, description, location_label, latitude, longitude, accuracy_m, location_captured_at, exact_location_consent, status, idempotency_key, created_at, updated_at, expires_at, moderation_flags_json: '[]' });
    }
    if (this.query.startsWith('DELETE FROM reports WHERE id =')) {
      const id = String(this.values[0]);
      this.db.reports.delete(id);
      for (const [photoId, row] of this.db.photos) if (row.report_id === id) this.db.photos.delete(photoId);
    }
    if (this.query.startsWith('UPDATE reports SET status')) {
      const [status, updated_at, flags, operator_note, redacted_description, last_reviewed_by, last_reviewed_at, forwarded_destination, forwarded_reference, , forwarded_at, , forwarded_by, id] = this.values;
      const row = this.db.reports.get(String(id));
      if (row) this.db.reports.set(String(id), { ...row, status, updated_at, moderation_flags_json: flags === '[]' && row.moderation_flags_json !== '[]' ? row.moderation_flags_json : flags, operator_note: operator_note ?? row.operator_note, redacted_description: redacted_description ?? row.redacted_description, last_reviewed_by, last_reviewed_at, forwarded_destination: forwarded_destination ?? row.forwarded_destination, forwarded_reference: forwarded_reference ?? row.forwarded_reference, forwarded_at, forwarded_by });
    }
    if (this.query.startsWith('INSERT INTO report_photos')) {
      const [id, report_id, object_key, mime_type, bytes, created_at, expires_at, review_status, storage_backend] = this.values;
      this.db.photos.set(String(id), { id, report_id, object_key, mime_type, bytes, created_at, expires_at, review_status, storage_backend });
    }
    if (this.query.startsWith('DELETE FROM report_photos WHERE id')) this.db.photos.delete(String(this.values[0]));
    if (this.query.startsWith('UPDATE report_photos SET review_status')) {
      const [review_status, review_note, reviewed_by, reviewed_at, id, report_id] = this.values;
      const row = this.db.photos.get(String(id));
      if (row && row.report_id === report_id) this.db.photos.set(String(id), { ...row, review_status, review_note, reviewed_by, reviewed_at });
    }
    if (this.query.startsWith('DELETE FROM reports WHERE expires_at')) {
      const cutoff = String(this.values[0]);
      for (const [id, row] of this.db.reports) if (String(row.expires_at) <= cutoff && ![...this.db.photos.values()].some((photo) => photo.report_id === id)) this.db.reports.delete(id);
    }
    if (this.query.startsWith('INSERT INTO report_photo_access_grants')) {
      const [token_hash, report_id, photo_id, operator_sub, created_at, expires_at] = this.values;
      this.db.grants.set(String(token_hash), { token_hash, report_id, photo_id, operator_sub, created_at, expires_at, used_at: null });
    }
    if (this.query.startsWith('DELETE FROM report_photo_access_grants')) {
      const cutoff = String(this.values[0]);
      for (const [key, row] of this.db.grants) if (String(row.expires_at) <= cutoff || row.used_at) this.db.grants.delete(key);
    }
    if (this.query.startsWith('INSERT INTO report_events')) this.db.eventCount += 1;
    if (this.query.startsWith('INSERT INTO report_redactions')) this.db.redactionCount += 1;
    return { success: true };
  }
}
class FakeDb implements D1DatabaseLike {
  reports = new Map<string, Record<string, unknown>>();
  photos = new Map<string, Record<string, unknown>>();
  grants = new Map<string, Record<string, unknown>>();
  rateWindows = new Map<string, number>();
  eventCount = 0;
  redactionCount = 0;
  prepare(query: string) { return new FakeStatement(this, query); }
}
class FakeKV implements KVNamespaceLike {
  objects = new Map<string, { value: ArrayBuffer; metadata: ReportPhotoMetadata; expirationTtl: number }>();
  failDelete = false;
  failPut = false;
  failRead = false;
  async put(key: string, value: ArrayBuffer, options: { expirationTtl: number; metadata: ReportPhotoMetadata }) {
    if (this.failPut) throw new Error('KV_QUOTA_EXCEEDED');
    this.objects.set(key, { value: value.slice(0), metadata: { ...options.metadata }, expirationTtl: options.expirationTtl });
  }
  async getWithMetadata<Metadata>(key: string, type: 'arrayBuffer') {
    if (type !== 'arrayBuffer') throw new Error('UNSUPPORTED_TYPE');
    if (this.failRead) throw new Error('KV_READ_LIMIT');
    const item = this.objects.get(key);
    return item
      ? { value: item.value.slice(0), metadata: item.metadata as Metadata }
      : { value: null, metadata: null };
  }
  async delete(key: string) { if (this.failDelete) throw new Error('KV_DELETE_LIMIT'); this.objects.delete(key); }
}
const user: SessionPrincipal = { sessionId: 'session:user-one', sub: 'user:one', email: 'one@example.org', role: 'AUTHENTICATED_USER', expiresAt: '2099-08-04T00:00:00.000Z' };
const other: SessionPrincipal = { ...user, sessionId: 'session:user-two', sub: 'user:two', email: 'two@example.org' };
const operator: SessionPrincipal = { sessionId: 'session:operator-one', sub: 'operator:one', email: 'operator@example.org', role: 'VERIFIED_OPERATOR', expiresAt: user.expiresAt };
const jpegBytes = () => Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0xff, 0xd9]).buffer;
const pngBytes = () => Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]).buffer;
const invalidBytes = () => Uint8Array.from([1, 2, 3]).buffer;

function request(idempotencyKey = 'report:key-1', files: File[] = [], extra?: Record<string, unknown>) {
  const form = new FormData();
  form.set('metadata', JSON.stringify({ category: 'ANEGAMIENTO', description: 'Agua acumulada en la esquina desde hace una hora.', locationLabel: 'Barrio Centro', exactLocationConsent: false, idempotencyKey, ...extra }));
  files.forEach((file) => form.append('photos', file, file.name));
  return new Request('https://sos-sf.test/api/private/reports', { method: 'POST', body: form });
}

describe('report workflow', () => {
  it('stores one private report and makes retries idempotent', async () => {
    const db = new FakeDb(); const kv = new FakeKV();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    const first = await createReport(request('report:key-1', [jpeg]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one');
    const duplicate = await createReport(request('report:key-1'), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one');
    expect(first.duplicate).toBe(false); expect(duplicate.duplicate).toBe(true);
    expect(db.reports.size).toBe(1); expect(db.photos.size).toBe(1); expect(kv.objects.size).toBe(1);
    const stored = [...kv.objects.values()][0]!;
    expect(stored.value).toBeInstanceOf(ArrayBuffer);
    expect(stored.value.byteLength).toBe(6);
    expect(stored.expirationTtl).toBe(30 * 86_400);
    expect(stored.metadata).toMatchObject({ mime: 'image/jpeg', reportId: (first.report as { id: string }).id });
    expect(Number.isFinite(Date.parse(stored.metadata.expiresAt))).toBe(true);
    expect([...db.photos.values()][0]).toMatchObject({ storage_backend: 'KV' });
  });

  it('fails closed and rolls back D1 when the free KV write quota is unavailable', async () => {
    const db = new FakeDb(); const kv = new FakeKV(); kv.failPut = true;
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    await expect(createReport(request('report:quota', [jpeg]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one')).rejects.toThrow('REPORT_STORAGE_UNAVAILABLE');
    expect(db.reports.size).toBe(0); expect(db.photos.size).toBe(0); expect(kv.objects.size).toBe(0);
  });

  it('isolates listings and requires a short-lived single-use operator photo grant', async () => {
    const db = new FakeDb(); const kv = new FakeKV();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    const created = await createReport(request('report:photo', [jpeg]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one');
    expect((await listReports({ MESSAGES_DB: db, REPORTS_KV: kv }, other, null)).reports).toHaveLength(0);
    const listed = (await listReports({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, null)).reports as Array<{ photos: Array<{ id: string }> }>;
    const reportId = (created.report as { id: string }).id; const photoId = listed[0]!.photos[0]!.id;
    const access = await createReportPhotoAccess({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, reportId, photoId) as { access: { url: string } };
    const token = access.access.url.split('/').at(-1)!;
    const response = await consumeReportPhotoAccess({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, token);
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toContain('private');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(jpegBytes()));
    await expect(consumeReportPhotoAccess({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, token)).rejects.toThrow('PHOTO_ACCESS_INVALID');
    await updatePhotoReview({ status: 'APPROVED', note: 'Revisada.' }, { MESSAGES_DB: db }, operator, reportId, photoId);
    expect(db.photos.get(photoId)?.review_status).toBe('APPROVED');
  });

  it('consumes the one-use grant and fails closed when a KV read is unavailable', async () => {
    const db = new FakeDb(); const kv = new FakeKV();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    const created = await createReport(request('report:read-quota', [jpeg]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one');
    const reportId = (created.report as { id: string }).id;
    const photoId = String([...db.photos.values()][0]!.id);
    const access = await createReportPhotoAccess({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, reportId, photoId) as { access: { url: string } };
    const token = access.access.url.split('/').at(-1)!;
    kv.failRead = true;
    await expect(consumeReportPhotoAccess({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, token)).rejects.toThrow('REPORT_STORAGE_UNAVAILABLE');
    kv.failRead = false;
    await expect(consumeReportPhotoAccess({ MESSAGES_DB: db, REPORTS_KV: kv }, operator, token)).rejects.toThrow('PHOTO_ACCESS_INVALID');
  });

  it('permits only valid audited operator transitions and preserves review data', async () => {
    const db = new FakeDb(); const kv = new FakeKV();
    const created = await createReport(request(), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one');
    const id = (created.report as { id: string }).id;
    await updateReport({ status: 'UNDER_REVIEW', moderationFlags: ['PERSONAL_DATA'], redactedDescription: 'Descripción redactada.', operatorNote: 'Se eliminó un dato personal.' }, { MESSAGES_DB: db }, operator, id);
    await updateReport({ status: 'ESCALATION_READY' }, { MESSAGES_DB: db }, operator, id);
    await expect(updateReport({ status: 'FORWARDED' }, { MESSAGES_DB: db }, operator, id)).rejects.toThrow('FORWARDING_EVIDENCE_REQUIRED');
    await updateReport({ status: 'FORWARDED', forwardedDestination: 'COBEM', forwardedReference: 'exp-123' }, { MESSAGES_DB: db }, operator, id);
    expect(db.reports.get(id)).toMatchObject({ status: 'FORWARDED', redacted_description: 'Descripción redactada.', moderation_flags_json: '["PERSONAL_DATA"]', operator_note: 'Se eliminó un dato personal.' });
    expect(db.redactionCount).toBe(1); expect(db.eventCount).toBeGreaterThanOrEqual(4);
  });

  it('rejects too many photos, MIME mismatches and oversized multipart bodies', async () => {
    const db = new FakeDb(); const kv = new FakeKV();
    await expect(createReport(request('report:bad', [new File([invalidBytes()], 'fake.jpg', { type: 'image/jpeg' })]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one')).rejects.toThrow('INVALID_PHOTO_TYPE');
    await expect(createReport(request('report:png', [new File([pngBytes()], 'raw.png', { type: 'image/png' })]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one')).rejects.toThrow('PHOTO_REENCODING_REQUIRED');
    const jpeg = new File([jpegBytes()], 'ok.jpg', { type: 'image/jpeg' });
    await expect(createReport(request('report:many', [jpeg, jpeg, jpeg]), { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one')).rejects.toThrow('TOO_MANY_PHOTOS');
    const huge = new Request('https://sos-sf.test/api/private/reports', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(10 * 1024 * 1024) }, body: '--x--' });
    await expect(createReport(huge, { MESSAGES_DB: db, REPORTS_KV: kv }, user, 'network:one')).rejects.toThrow('BODY_TOO_LARGE');
  });

  it('keeps D1 rows when a KV delete fails and removes them after a successful retry', async () => {
    const db = new FakeDb(); const kv = new FakeKV();
    const jpeg = new File([jpegBytes()], 'evidence.jpg', { type: 'image/jpeg' });
    await createReport(request('report:purge', [jpeg]), { MESSAGES_DB: db, REPORTS_KV: kv, REPORT_RETENTION_DAYS: '1' }, user, 'network:one');
    const future = new Date(Date.now() + 3 * 86_400_000);
    kv.failDelete = true;
    const first = await purgeExpiredReports({ MESSAGES_DB: db, REPORTS_KV: kv }, future);
    expect(first.pendingPhotos).toBe(1); expect(db.reports.size).toBe(1);
    kv.failDelete = false;
    const second = await purgeExpiredReports({ MESSAGES_DB: db, REPORTS_KV: kv }, future);
    expect(second.pendingPhotos).toBe(0); expect(db.reports.size).toBe(0); expect(kv.objects.size).toBe(0);
  });
});
