import type { SessionPrincipal } from '../domain/private-messaging/types';
import type { D1DatabaseLike } from './d1-message-store';

export interface R2ObjectLike { readonly body: ReadableStream; readonly size: number; readonly httpMetadata?: { readonly contentType?: string } }
export interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<R2ObjectLike | null>;
  delete(key: string): Promise<void>;
}

export interface ReportEnv {
  readonly MESSAGES_DB?: D1DatabaseLike;
  readonly REPORTS_BUCKET?: R2BucketLike;
  readonly REPORT_RETENTION_DAYS?: string;
}

type ReportStatus = 'NEW' | 'UNDER_REVIEW' | 'REJECTED' | 'ESCALATION_READY' | 'FORWARDED' | 'CLOSED';
const REPORT_STATUSES = new Set<ReportStatus>(['NEW', 'UNDER_REVIEW', 'REJECTED', 'ESCALATION_READY', 'FORWARDED', 'CLOSED']);
const CATEGORIES = new Set(['ANEGAMIENTO', 'RIO', 'LLUVIA', 'SERVICIO', 'OTRO']);
const MAX_PHOTOS = 2;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;

interface ReportInput {
  readonly category: string;
  readonly description: string;
  readonly idempotencyKey: string;
  readonly locationLabel: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracyM: number | null;
  readonly locationCapturedAt: string | null;
  readonly exactLocationConsent: boolean;
}

function plain(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_REPORT');
  return value as Record<string, unknown>;
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeInput(value: unknown): ReportInput {
  const record = plain(value);
  const category = typeof record.category === 'string' ? record.category.trim().toUpperCase() : '';
  const description = typeof record.description === 'string' ? record.description.trim() : '';
  const idempotencyKey = typeof record.idempotencyKey === 'string' ? record.idempotencyKey : '';
  if (!CATEGORIES.has(category) || description.length < 1 || description.length > 500 || !ID_PATTERN.test(idempotencyKey)) throw new Error('INVALID_REPORT');
  const locationLabel = typeof record.locationLabel === 'string' && record.locationLabel.trim() ? record.locationLabel.trim().slice(0, 160) : null;
  const exactLocationConsent = record.exactLocationConsent === true;
  const latitude = exactLocationConsent ? finiteOrNull(record.latitude) : null;
  const longitude = exactLocationConsent ? finiteOrNull(record.longitude) : null;
  const accuracyM = exactLocationConsent ? finiteOrNull(record.accuracyM) : null;
  const locationCapturedAt = exactLocationConsent && typeof record.locationCapturedAt === 'string' && Number.isFinite(Date.parse(record.locationCapturedAt)) ? new Date(record.locationCapturedAt).toISOString() : null;
  if ((latitude !== null && (latitude < -90 || latitude > 90)) || (longitude !== null && (longitude < -180 || longitude > 180)) || (accuracyM !== null && (accuracyM < 0 || accuracyM > 100_000))) throw new Error('INVALID_LOCATION');
  return Object.freeze({ category, description, idempotencyKey, locationLabel, latitude, longitude, accuracyM, locationCapturedAt, exactLocationConsent });
}

function signatureMime(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return 'image/png';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (signatureMime(bytes) !== 'image/jpeg') return bytes;
  const chunks: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda) { chunks.push(bytes.slice(offset)); offset = bytes.length; break; }
    if (marker === 0xd9) { chunks.push(bytes.slice(offset, offset + 2)); offset += 2; break; }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (![0xe1, 0xed, 0xfe].includes(marker)) chunks.push(bytes.slice(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (offset < bytes.length) chunks.push(bytes.slice(offset));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.length; }
  return output;
}

async function photo(file: File): Promise<{ bytes: Uint8Array; mime: string }> {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) throw new Error('INVALID_PHOTO_SIZE');
  const input = new Uint8Array(await file.arrayBuffer());
  const mime = signatureMime(input);
  if (!mime || mime !== file.type) throw new Error('INVALID_PHOTO_TYPE');
  const sanitized = mime === 'image/jpeg' ? stripJpegMetadata(input) : input;
  if (sanitized.length > MAX_PHOTO_BYTES) throw new Error('INVALID_PHOTO_SIZE');
  return { bytes: sanitized, mime };
}

function operator(principal: SessionPrincipal): boolean { return principal.role === 'VERIFIED_OPERATOR' || principal.role === 'ADMIN'; }
function retentionDays(env: ReportEnv): number { const value = Number(env.REPORT_RETENTION_DAYS ?? '30'); return Number.isFinite(value) ? Math.min(90, Math.max(1, Math.round(value))) : 30; }

export async function createReport(request: Request, env: ReportEnv, principal: SessionPrincipal): Promise<Record<string, unknown>> {
  if (!env.MESSAGES_DB || !env.REPORTS_BUCKET) throw new Error('REPORTING_DISABLED');
  const form = await request.formData();
  const metadata = form.get('metadata');
  if (typeof metadata !== 'string' || metadata.length > 4096) throw new Error('INVALID_REPORT');
  const input = normalizeInput(JSON.parse(metadata) as unknown);
  const existing = await env.MESSAGES_DB.prepare('SELECT id,status,created_at FROM reports WHERE reporter_sub = ? AND idempotency_key = ? LIMIT 1').bind(principal.sub, input.idempotencyKey).first<Record<string, unknown>>();
  if (existing) return { report: existing, duplicate: true };
  const files = form.getAll('photos').filter((item): item is File => item instanceof File && item.size > 0);
  if (files.length > MAX_PHOTOS) throw new Error('TOO_MANY_PHOTOS');
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + retentionDays(env) * 86_400_000).toISOString();
  const id = `report:${crypto.randomUUID()}`;
  const uploaded: { id: string; key: string; mime: string; bytes: number }[] = [];
  try {
    for (const file of files) {
      const sanitized = await photo(file);
      const photoId = `photo:${crypto.randomUUID()}`;
      const key = `reports/${id}/${photoId}`;
      await env.REPORTS_BUCKET.put(key, sanitized.bytes, { httpMetadata: { contentType: sanitized.mime }, customMetadata: { reportId: id, expiresAt } });
      uploaded.push({ id: photoId, key, mime: sanitized.mime, bytes: sanitized.bytes.length });
    }
    await env.MESSAGES_DB.prepare('INSERT INTO reports (id,reporter_sub,category,description,location_label,latitude,longitude,accuracy_m,location_captured_at,exact_location_consent,status,idempotency_key,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, principal.sub, input.category, input.description, input.locationLabel, input.latitude, input.longitude, input.accuracyM, input.locationCapturedAt, input.exactLocationConsent ? 1 : 0, 'NEW', input.idempotencyKey, createdAt, createdAt, expiresAt).run();
    for (const item of uploaded) await env.MESSAGES_DB.prepare('INSERT INTO report_photos (id,report_id,object_key,mime_type,bytes,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(item.id, id, item.key, item.mime, item.bytes, createdAt, expiresAt).run();
    await env.MESSAGES_DB.prepare('INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)').bind(`event:${crypto.randomUUID()}`, id, principal.sub, null, 'NEW', 'Reporte recibido por el servicio; no implica despacho ni validación.', createdAt).run();
    return { report: { id, category: input.category, status: 'NEW', createdAt, photoCount: uploaded.length }, duplicate: false };
  } catch (error) {
    await Promise.all(uploaded.map((item) => env.REPORTS_BUCKET!.delete(item.key).catch(() => undefined)));
    throw error;
  }
}

export async function listReports(env: ReportEnv, principal: SessionPrincipal, status: string | null): Promise<Record<string, unknown>> {
  if (!env.MESSAGES_DB) throw new Error('REPORTING_DISABLED');
  const isOperator = operator(principal);
  const normalizedStatus = status && REPORT_STATUSES.has(status as ReportStatus) ? status : null;
  const statement = isOperator
    ? normalizedStatus ? env.MESSAGES_DB.prepare('SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 40').bind(normalizedStatus) : env.MESSAGES_DB.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 40')
    : env.MESSAGES_DB.prepare('SELECT * FROM reports WHERE reporter_sub = ? ORDER BY created_at DESC LIMIT 40').bind(principal.sub);
  return { reports: (await statement.all<Record<string, unknown>>()).results ?? [], limit: 40 };
}

const TRANSITIONS: Record<ReportStatus, readonly ReportStatus[]> = {
  NEW: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['REJECTED', 'ESCALATION_READY'],
  REJECTED: ['CLOSED'],
  ESCALATION_READY: ['FORWARDED', 'REJECTED'],
  FORWARDED: ['CLOSED'],
  CLOSED: [],
};

export async function updateReport(request: Request, env: ReportEnv, principal: SessionPrincipal, id: string): Promise<Record<string, unknown>> {
  if (!env.MESSAGES_DB || !operator(principal)) throw new Error('OPERATOR_FORBIDDEN');
  const input = plain(await request.json());
  const toStatus = typeof input.status === 'string' && REPORT_STATUSES.has(input.status as ReportStatus) ? input.status as ReportStatus : null;
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : null;
  if (!toStatus) throw new Error('INVALID_REPORT_STATUS');
  const report = await env.MESSAGES_DB.prepare('SELECT * FROM reports WHERE id = ? LIMIT 1').bind(id).first<Record<string, unknown>>();
  if (!report) throw new Error('REPORT_NOT_FOUND');
  const fromStatus = report.status as ReportStatus;
  if (!TRANSITIONS[fromStatus]?.includes(toStatus)) throw new Error('INVALID_REPORT_TRANSITION');
  const destination = typeof input.forwardedDestination === 'string' ? input.forwardedDestination.trim().slice(0, 160) : null;
  const reference = typeof input.forwardedReference === 'string' ? input.forwardedReference.trim().slice(0, 160) : null;
  if (toStatus === 'FORWARDED' && (!destination || !reference)) throw new Error('FORWARDING_EVIDENCE_REQUIRED');
  const at = new Date().toISOString();
  await env.MESSAGES_DB.prepare('UPDATE reports SET status = ?,updated_at = ?,forwarded_destination = COALESCE(?,forwarded_destination),forwarded_reference = COALESCE(?,forwarded_reference),forwarded_at = CASE WHEN ? = \'FORWARDED\' THEN ? ELSE forwarded_at END,forwarded_by = CASE WHEN ? = \'FORWARDED\' THEN ? ELSE forwarded_by END WHERE id = ?').bind(toStatus, at, destination, reference, toStatus, at, toStatus, principal.sub, id).run();
  await env.MESSAGES_DB.prepare('INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)').bind(`event:${crypto.randomUUID()}`, id, principal.sub, fromStatus, toStatus, note, at).run();
  return { report: { id, fromStatus, status: toStatus, updatedAt: at } };
}

export async function reportPhoto(env: ReportEnv, principal: SessionPrincipal, reportId: string, photoId: string): Promise<Response> {
  if (!env.MESSAGES_DB || !env.REPORTS_BUCKET || !operator(principal)) throw new Error('OPERATOR_FORBIDDEN');
  const row = await env.MESSAGES_DB.prepare('SELECT object_key,mime_type FROM report_photos WHERE id = ? AND report_id = ? AND expires_at > ? LIMIT 1').bind(photoId, reportId, new Date().toISOString()).first<{ object_key: string; mime_type: string }>();
  if (!row) throw new Error('PHOTO_NOT_FOUND');
  const object = await env.REPORTS_BUCKET.get(row.object_key);
  if (!object) throw new Error('PHOTO_NOT_FOUND');
  return new Response(object.body, { headers: { 'Content-Type': row.mime_type, 'Cache-Control': 'private, no-store, max-age=0', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } });
}
