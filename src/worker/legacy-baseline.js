var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker/auth.ts
var GOOGLE_ISSUERS = /* @__PURE__ */ new Set(["accounts.google.com", "https://accounts.google.com"]);
var SESSION_COOKIE = "__Host-sos_sf_session";
var CSRF_COOKIE = "__Host-sos_sf_csrf";
var SESSION_MS = 8 * 60 * 60 * 1e3;
var GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
var GOOGLE_JWKS_TIMEOUT_MS = 5e3;
var GOOGLE_JWKS_CACHE_MS = 5 * 6e4;
var googleJwksCache = null;
var googleJwksInFlight = null;
function base64UrlToBytes(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
__name(base64UrlToBytes, "base64UrlToBytes");
function bytesToBase64Url(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
__name(bytesToBase64Url, "bytesToBase64Url");
function parsePart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}
__name(parsePart, "parsePart");
function validateGoogleClaims(value, clientId, nowMs) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("GOOGLE_CLAIMS_INVALID");
  const claims = value;
  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.has(claims.iss)) throw new Error("GOOGLE_ISSUER_INVALID");
  const audiences = typeof claims.aud === "string" ? [claims.aud] : Array.isArray(claims.aud) && claims.aud.every((item) => typeof item === "string") ? claims.aud : [];
  if (!audiences.includes(clientId)) throw new Error("GOOGLE_AUDIENCE_INVALID");
  if ((audiences.length > 1 || claims.azp !== void 0) && claims.azp !== clientId) throw new Error("GOOGLE_AUTHORIZED_PARTY_INVALID");
  if (!Number.isSafeInteger(claims.exp) || claims.exp * 1e3 <= nowMs) throw new Error("GOOGLE_TOKEN_EXPIRED");
  if (claims.iat !== void 0 && (!Number.isSafeInteger(claims.iat) || claims.iat * 1e3 > nowMs + 12e4)) throw new Error("GOOGLE_ISSUED_AT_INVALID");
  if (typeof claims.sub !== "string" || !/^[0-9]{5,64}$/.test(claims.sub)) throw new Error("GOOGLE_SUB_INVALID");
  if (claims.email_verified !== true) throw new Error("GOOGLE_EMAIL_UNVERIFIED");
  if (typeof claims.email !== "string" || claims.email.length > 320 || !claims.email.includes("@")) throw new Error("GOOGLE_EMAIL_INVALID");
  return claims;
}
__name(validateGoogleClaims, "validateGoogleClaims");
async function googleSigningKeys(nowMs) {
  if (googleJwksCache && googleJwksCache.expiresAt > nowMs) return googleJwksCache.keys;
  if (googleJwksInFlight) return googleJwksInFlight;
  const operation = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("GOOGLE_JWKS_TIMEOUT")), GOOGLE_JWKS_TIMEOUT_MS);
    try {
      const response = await fetch(GOOGLE_JWKS_URL, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("GOOGLE_JWKS_UNAVAILABLE");
      const payload = await response.json();
      if (!Array.isArray(payload.keys)) throw new Error("GOOGLE_JWKS_INVALID");
      const keys = Object.freeze(payload.keys.filter((key) => typeof key === "object" && key !== null));
      if (!keys.length) throw new Error("GOOGLE_JWKS_INVALID");
      googleJwksCache = Object.freeze({ expiresAt: nowMs + GOOGLE_JWKS_CACHE_MS, keys });
      return keys;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("GOOGLE_JWKS_TIMEOUT", { cause: error });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  })().finally(() => {
    googleJwksInFlight = null;
  });
  googleJwksInFlight = operation;
  return operation;
}
__name(googleSigningKeys, "googleSigningKeys");
async function verifyGoogleIdToken(token, clientId, nowMs = Date.now()) {
  if (token.length > 16e3) throw new Error("GOOGLE_TOKEN_TOO_LARGE");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("GOOGLE_TOKEN_INVALID");
  const header = parsePart(parts[0]);
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("GOOGLE_TOKEN_ALGORITHM_INVALID");
  const jwks = await googleSigningKeys(nowMs);
  const jwk = jwks.find((key2) => key2.kid === header.kid && key2.kty === "RSA" && key2.use === "sig");
  if (!jwk) throw new Error("GOOGLE_SIGNING_KEY_UNKNOWN");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error("GOOGLE_SIGNATURE_INVALID");
  return validateGoogleClaims(parsePart(parts[1]), clientId, nowMs);
}
__name(verifyGoogleIdToken, "verifyGoogleIdToken");
async function hmacKey(secret) {
  if (secret.length < 32) throw new Error("SESSION_KEY_INVALID");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
__name(hmacKey, "hmacKey");
function operatorAllowlist(value) {
  return new Set(value.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}
__name(operatorAllowlist, "operatorAllowlist");
function roleForEmail(email, operatorEmails) {
  return operatorAllowlist(operatorEmails).has(email.toLowerCase()) ? "VERIFIED_OPERATOR" : "AUTHENTICATED_USER";
}
__name(roleForEmail, "roleForEmail");
function createSessionPrincipal(claims, operatorEmails, nowMs = Date.now(), sessionId = crypto.randomUUID()) {
  return Object.freeze({ sessionId: `session:${sessionId}`, sub: claims.sub, email: claims.email.toLowerCase(), role: roleForEmail(claims.email, operatorEmails), expiresAt: new Date(nowMs + SESSION_MS).toISOString() });
}
__name(createSessionPrincipal, "createSessionPrincipal");
async function createSessionCookieForPrincipal(principal, secret, nowMs = Date.now()) {
  if (Date.parse(principal.expiresAt) <= nowMs) throw new Error("SESSION_EXPIRED");
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(principal)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(encoded)));
  const maxAge = Math.max(0, Math.floor((Date.parse(principal.expiresAt) - nowMs) / 1e3));
  return `${SESSION_COOKIE}=${encoded}.${bytesToBase64Url(signature)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
__name(createSessionCookieForPrincipal, "createSessionCookieForPrincipal");
async function readSession(request, secret, nowMs = Date.now()) {
  const cookies = request.headers.get("Cookie") ?? "";
  const raw = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return null;
  const [payload, signature, extra] = raw.split(".");
  if (!payload || !signature || extra) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), base64UrlToBytes(signature), new TextEncoder().encode(payload));
  if (!valid) return null;
  let session;
  try {
    session = parsePart(payload);
  } catch {
    return null;
  }
  if (typeof session.sessionId !== "string" || !/^session:[a-zA-Z0-9-]{8,128}$/.test(session.sessionId)) return null;
  if (typeof session.sub !== "string" || typeof session.email !== "string" || !session.email.includes("@")) return null;
  if (!["AUTHENTICATED_USER", "VERIFIED_OPERATOR", "ADMIN"].includes(session.role) || !Number.isFinite(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) <= nowMs) return null;
  return Object.freeze(session);
}
__name(readSession, "readSession");
function randomSecurityToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return bytesToBase64Url(value);
}
__name(randomSecurityToken, "randomSecurityToken");
async function securityTokenHash(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return bytesToBase64Url(digest);
}
__name(securityTokenHash, "securityTokenHash");
function createCsrfCookie(token, expiresAt, nowMs = Date.now()) {
  const maxAge = Math.max(0, Math.floor((Date.parse(expiresAt) - nowMs) / 1e3));
  return `${CSRF_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Strict`;
}
__name(createCsrfCookie, "createCsrfCookie");
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
__name(clearSessionCookie, "clearSessionCookie");
function clearCsrfCookie() {
  return `${CSRF_COOKIE}=; Path=/; Max-Age=0; Secure; SameSite=Strict`;
}
__name(clearCsrfCookie, "clearCsrfCookie");

// src/worker/reports.ts
var REPORT_STATUSES = /* @__PURE__ */ new Set(["NEW", "UNDER_REVIEW", "REJECTED", "ESCALATION_READY", "FORWARDED", "CLOSED"]);
var PHOTO_REVIEW_STATUSES = /* @__PURE__ */ new Set(["PENDING", "APPROVED", "REDACTED", "REJECTED"]);
var MODERATION_FLAGS = /* @__PURE__ */ new Set(["PERSONAL_DATA", "DUPLICATE", "UNVERIFIED", "ABUSIVE", "OUT_OF_SCOPE", "SAFETY_SENSITIVE"]);
var CATEGORIES = /* @__PURE__ */ new Set(["ANEGAMIENTO", "RIO", "LLUVIA", "SERVICIO", "OTRO"]);
var MAX_PHOTOS = 2;
var MAX_PHOTO_BYTES = 4 * 1024 * 1024;
var MAX_MULTIPART_BYTES = 9 * 1024 * 1024;
var ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
var ACCESS_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{32,160}$/;
var REPORT_WINDOW_MS = 15 * 6e4;
var REPORT_ACCOUNT_LIMIT = 5;
var REPORT_NETWORK_LIMIT = 12;
var PHOTO_ACCESS_MS = 2 * 6e4;
var PURGE_BATCH_SIZE = 100;
var PURGE_MAX_BATCHES = 20;
function plain(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("INVALID_REPORT");
  return value;
}
__name(plain, "plain");
function finiteOrNull(value) {
  if (value === null || value === void 0 || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
__name(finiteOrNull, "finiteOrNull");
function normalizeInput(value) {
  const record3 = plain(value);
  const category = typeof record3.category === "string" ? record3.category.trim().toUpperCase() : "";
  const description = typeof record3.description === "string" ? record3.description.trim() : "";
  const idempotencyKey = typeof record3.idempotencyKey === "string" ? record3.idempotencyKey : "";
  if (!CATEGORIES.has(category) || description.length < 1 || description.length > 500 || !ID_PATTERN.test(idempotencyKey)) throw new Error("INVALID_REPORT");
  const locationLabel = typeof record3.locationLabel === "string" && record3.locationLabel.trim() ? record3.locationLabel.trim().slice(0, 160) : null;
  const exactLocationConsent = record3.exactLocationConsent === true;
  const latitude = exactLocationConsent ? finiteOrNull(record3.latitude) : null;
  const longitude = exactLocationConsent ? finiteOrNull(record3.longitude) : null;
  const accuracyM = exactLocationConsent ? finiteOrNull(record3.accuracyM) : null;
  const locationCapturedAt = exactLocationConsent && typeof record3.locationCapturedAt === "string" && Number.isFinite(Date.parse(record3.locationCapturedAt)) ? new Date(record3.locationCapturedAt).toISOString() : null;
  if (latitude !== null && (latitude < -90 || latitude > 90) || longitude !== null && (longitude < -180 || longitude > 180) || accuracyM !== null && (accuracyM < 0 || accuracyM > 1e5)) throw new Error("INVALID_LOCATION");
  if (exactLocationConsent && (latitude === null || longitude === null || accuracyM === null || locationCapturedAt === null)) throw new Error("INVALID_LOCATION");
  return Object.freeze({ category, description, idempotencyKey, locationLabel, latitude, longitude, accuracyM, locationCapturedAt, exactLocationConsent });
}
__name(normalizeInput, "normalizeInput");
function signatureMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index])) return "image/png";
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
__name(signatureMime, "signatureMime");
function stripJpegMetadata(bytes) {
  if (signatureMime(bytes) !== "image/jpeg") return bytes;
  const chunks = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    if (marker === 218) {
      chunks.push(bytes.slice(offset));
      offset = bytes.length;
      break;
    }
    if (marker === 217) {
      chunks.push(bytes.slice(offset, offset + 2));
      offset += 2;
      break;
    }
    const length = bytes[offset + 2] << 8 | bytes[offset + 3];
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (![225, 237, 254].includes(marker)) chunks.push(bytes.slice(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (offset < bytes.length) chunks.push(bytes.slice(offset));
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  return output;
}
__name(stripJpegMetadata, "stripJpegMetadata");
async function preparePhoto(file) {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) throw new Error("INVALID_PHOTO_SIZE");
  const input = new Uint8Array(await file.arrayBuffer());
  const mime = signatureMime(input);
  if (!mime || mime !== file.type) throw new Error("INVALID_PHOTO_TYPE");
  if (mime !== "image/jpeg") throw new Error("PHOTO_REENCODING_REQUIRED");
  const sanitized = stripJpegMetadata(input);
  if (sanitized.length > MAX_PHOTO_BYTES) throw new Error("INVALID_PHOTO_SIZE");
  return { bytes: sanitized, mime };
}
__name(preparePhoto, "preparePhoto");
function operator(principal) {
  return principal.role === "VERIFIED_OPERATOR" || principal.role === "ADMIN";
}
__name(operator, "operator");
function retentionDays(env) {
  const value = Number(env.REPORT_RETENTION_DAYS ?? "30");
  return Number.isFinite(value) ? Math.min(90, Math.max(1, Math.round(value))) : 30;
}
__name(retentionDays, "retentionDays");
function retentionTtl(env) {
  return retentionDays(env) * 86400;
}
__name(retentionTtl, "retentionTtl");
function exactArrayBuffer(bytes) {
  const output = new Uint8Array(bytes.byteLength);
  output.set(bytes);
  return output.buffer;
}
__name(exactArrayBuffer, "exactArrayBuffer");
function storageError() {
  return new Error("REPORT_STORAGE_UNAVAILABLE");
}
__name(storageError, "storageError");
async function boundedFormData(request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;") || !contentType.toLowerCase().includes("boundary=")) throw new Error("CONTENT_TYPE_REQUIRED");
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_MULTIPART_BYTES) throw new Error("BODY_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_REPORT");
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_MULTIPART_BYTES) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return new Response(bytes, { headers: { "Content-Type": contentType } }).formData();
}
__name(boundedFormData, "boundedFormData");
async function consumeRateLimit(db, actorId, scope, limit, now) {
  const windowStart = new Date(Math.floor(now.getTime() / REPORT_WINDOW_MS) * REPORT_WINDOW_MS).toISOString();
  const row = await db.prepare("INSERT INTO rate_windows (actor_id,scope,window_start,count,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(actor_id,scope,window_start) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at RETURNING count").bind(actorId, scope, windowStart, 1, now.toISOString()).first();
  return Boolean(row && row.count <= limit);
}
__name(consumeRateLimit, "consumeRateLimit");
async function purgeExpiredReports(env, now = /* @__PURE__ */ new Date()) {
  if (!env.MESSAGES_DB || !env.REPORTS_KV) return { deletedPhotos: 0, pendingPhotos: 0 };
  const nowIso = now.toISOString();
  let deletedPhotos = 0;
  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
    const expired = (await env.MESSAGES_DB.prepare("SELECT id,object_key FROM report_photos WHERE expires_at <= ? ORDER BY expires_at LIMIT ?").bind(nowIso, PURGE_BATCH_SIZE).all()).results ?? [];
    if (!expired.length) break;
    for (const item of expired) {
      try {
        await env.REPORTS_KV.delete(item.object_key);
        await env.MESSAGES_DB.prepare("DELETE FROM report_photos WHERE id = ? AND expires_at <= ?").bind(item.id, nowIso).run();
        deletedPhotos += 1;
      } catch {
      }
    }
    if (expired.length < PURGE_BATCH_SIZE) break;
  }
  await env.MESSAGES_DB.prepare("DELETE FROM reports WHERE expires_at <= ? AND NOT EXISTS (SELECT 1 FROM report_photos WHERE report_photos.report_id = reports.id)").bind(nowIso).run();
  await env.MESSAGES_DB.prepare("DELETE FROM report_photo_access_grants WHERE expires_at <= ? OR used_at IS NOT NULL").bind(nowIso).run();
  await env.MESSAGES_DB.prepare("DELETE FROM rate_windows WHERE updated_at < ?").bind(new Date(now.getTime() - 7 * 864e5).toISOString()).run();
  const pending = await env.MESSAGES_DB.prepare("SELECT COUNT(*) AS count FROM report_photos WHERE expires_at <= ?").bind(nowIso).first();
  return { deletedPhotos, pendingPhotos: pending?.count ?? 0 };
}
__name(purgeExpiredReports, "purgeExpiredReports");
async function createReport(request, env, principal, networkActorId2) {
  if (!env.MESSAGES_DB || !env.REPORTS_KV) throw new Error("REPORTING_DISABLED");
  await purgeExpiredReports(env);
  const form = await boundedFormData(request);
  const metadata = form.get("metadata");
  if (typeof metadata !== "string" || metadata.length > 4096) throw new Error("INVALID_REPORT");
  let parsed;
  try {
    parsed = JSON.parse(metadata);
  } catch {
    throw new Error("INVALID_REPORT");
  }
  const input = normalizeInput(parsed);
  const existing = await env.MESSAGES_DB.prepare("SELECT id,status,created_at FROM reports WHERE reporter_sub = ? AND idempotency_key = ? LIMIT 1").bind(principal.sub, input.idempotencyKey).first();
  if (existing) return { report: existing, duplicate: true };
  const files = form.getAll("photos").filter((item) => item instanceof File && item.size > 0);
  if (files.length > MAX_PHOTOS) throw new Error("TOO_MANY_PHOTOS");
  const prepared = await Promise.all(files.map(preparePhoto));
  const now = /* @__PURE__ */ new Date();
  if (!await consumeRateLimit(env.MESSAGES_DB, principal.sub, "REPORT_ACCOUNT", REPORT_ACCOUNT_LIMIT, now)) throw new Error("RATE_LIMITED");
  if (!await consumeRateLimit(env.MESSAGES_DB, networkActorId2, "REPORT_NETWORK", REPORT_NETWORK_LIMIT, now)) throw new Error("RATE_LIMITED");
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + retentionDays(env) * 864e5).toISOString();
  const id = `report:${crypto.randomUUID()}`;
  try {
    await env.MESSAGES_DB.prepare("INSERT INTO reports (id,reporter_sub,category,description,location_label,latitude,longitude,accuracy_m,location_captured_at,exact_location_consent,status,idempotency_key,created_at,updated_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id, principal.sub, input.category, input.description, input.locationLabel, input.latitude, input.longitude, input.accuracyM, input.locationCapturedAt, input.exactLocationConsent ? 1 : 0, "NEW", input.idempotencyKey, createdAt, createdAt, expiresAt).run();
  } catch (error) {
    const concurrent = await env.MESSAGES_DB.prepare("SELECT id,status,created_at FROM reports WHERE reporter_sub = ? AND idempotency_key = ? LIMIT 1").bind(principal.sub, input.idempotencyKey).first();
    if (concurrent) return { report: concurrent, duplicate: true };
    throw error;
  }
  const uploaded = [];
  try {
    for (const item of prepared) {
      const photoId = `photo:${crypto.randomUUID()}`;
      const key = `reports/${id}/${photoId}`;
      try {
        await env.REPORTS_KV.put(key, exactArrayBuffer(item.bytes), {
          expirationTtl: retentionTtl(env),
          metadata: { mime: item.mime, reportId: id, expiresAt }
        });
      } catch {
        throw storageError();
      }
      uploaded.push({ id: photoId, key, mime: item.mime, bytes: item.bytes.length });
      await env.MESSAGES_DB.prepare("INSERT INTO report_photos (id,report_id,object_key,mime_type,bytes,created_at,expires_at,review_status,storage_backend) VALUES (?,?,?,?,?,?,?,?,?)").bind(photoId, id, key, item.mime, item.bytes.length, createdAt, expiresAt, "PENDING", "KV").run();
    }
    await env.MESSAGES_DB.prepare("INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(`event:${crypto.randomUUID()}`, id, principal.sub, null, "NEW", "Reporte recibido por el servicio; no implica despacho ni validaci\xF3n.", createdAt).run();
    return { report: { id, category: input.category, status: "NEW", createdAt, photoCount: uploaded.length }, duplicate: false };
  } catch (error) {
    await Promise.all(uploaded.map((item) => env.REPORTS_KV.delete(item.key).catch(() => void 0)));
    await env.MESSAGES_DB.prepare("DELETE FROM reports WHERE id = ?").bind(id).run().catch(() => void 0);
    throw error;
  }
}
__name(createReport, "createReport");
async function listReports(env, principal, status) {
  if (!env.MESSAGES_DB) throw new Error("REPORTING_DISABLED");
  await purgeExpiredReports(env);
  const isOperator = operator(principal);
  const normalizedStatus = status && REPORT_STATUSES.has(status) ? status : null;
  const statement = isOperator ? normalizedStatus ? env.MESSAGES_DB.prepare("SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 40").bind(normalizedStatus) : env.MESSAGES_DB.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 40") : env.MESSAGES_DB.prepare("SELECT * FROM reports WHERE reporter_sub = ? ORDER BY created_at DESC LIMIT 40").bind(principal.sub);
  const reports = (await statement.all()).results ?? [];
  if (!reports.length) return { reports: [], limit: 40 };
  const placeholders = reports.map(() => "?").join(",");
  const photos = (await env.MESSAGES_DB.prepare(`SELECT id,report_id,mime_type,bytes,review_status,review_note FROM report_photos WHERE report_id IN (${placeholders}) AND expires_at > ? ORDER BY created_at`).bind(...reports.map((item) => item.id), (/* @__PURE__ */ new Date()).toISOString()).all()).results ?? [];
  const byReport = /* @__PURE__ */ new Map();
  for (const item of photos) byReport.set(item.report_id, [...byReport.get(item.report_id) ?? [], item]);
  return { reports: reports.map((report) => ({ ...report, photos: byReport.get(report.id) ?? [] })), limit: 40 };
}
__name(listReports, "listReports");
var TRANSITIONS = {
  NEW: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["REJECTED", "ESCALATION_READY"],
  REJECTED: ["CLOSED"],
  ESCALATION_READY: ["FORWARDED", "REJECTED"],
  FORWARDED: ["CLOSED"],
  CLOSED: []
};
function moderation(value) {
  if (!Array.isArray(value) || value.length > 8) return Object.freeze([]);
  return Object.freeze([...new Set(value.filter((item) => typeof item === "string" && MODERATION_FLAGS.has(item)))].sort());
}
__name(moderation, "moderation");
async function updateReport(inputValue, env, principal, id) {
  if (!env.MESSAGES_DB || !operator(principal)) throw new Error("OPERATOR_FORBIDDEN");
  const input = plain(inputValue);
  const toStatus = typeof input.status === "string" && REPORT_STATUSES.has(input.status) ? input.status : null;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : null;
  if (!toStatus) throw new Error("INVALID_REPORT_STATUS");
  const report = await env.MESSAGES_DB.prepare("SELECT * FROM reports WHERE id = ? LIMIT 1").bind(id).first();
  if (!report) throw new Error("REPORT_NOT_FOUND");
  const fromStatus = report.status;
  if (!TRANSITIONS[fromStatus]?.includes(toStatus)) throw new Error("INVALID_REPORT_TRANSITION");
  const destination = typeof input.forwardedDestination === "string" ? input.forwardedDestination.trim().slice(0, 160) : null;
  const reference = typeof input.forwardedReference === "string" ? input.forwardedReference.trim().slice(0, 160) : null;
  if (toStatus === "FORWARDED" && (!destination || !reference)) throw new Error("FORWARDING_EVIDENCE_REQUIRED");
  const flags = moderation(input.moderationFlags);
  const operatorNote = typeof input.operatorNote === "string" ? input.operatorNote.trim().slice(0, 1e3) : null;
  const redactedDescription = typeof input.redactedDescription === "string" && input.redactedDescription.trim() ? input.redactedDescription.trim().slice(0, 500) : null;
  const at = (/* @__PURE__ */ new Date()).toISOString();
  await env.MESSAGES_DB.prepare("UPDATE reports SET status = ?,updated_at = ?,moderation_flags_json = ?,operator_note = ?,redacted_description = ?,last_reviewed_by = ?,last_reviewed_at = ?,forwarded_destination = COALESCE(?,forwarded_destination),forwarded_reference = COALESCE(?,forwarded_reference),forwarded_at = CASE WHEN ? = 'FORWARDED' THEN ? ELSE forwarded_at END,forwarded_by = CASE WHEN ? = 'FORWARDED' THEN ? ELSE forwarded_by END WHERE id = ?").bind(toStatus, at, JSON.stringify(flags), operatorNote, redactedDescription, principal.sub, at, destination, reference, toStatus, at, toStatus, principal.sub, id).run();
  if (redactedDescription && redactedDescription !== report.description) await env.MESSAGES_DB.prepare("INSERT INTO report_redactions (id,report_id,actor_sub,field,reason,created_at) VALUES (?,?,?,?,?,?)").bind(`redaction:${crypto.randomUUID()}`, id, principal.sub, "description", operatorNote || "Redacci\xF3n manual del operador.", at).run();
  await env.MESSAGES_DB.prepare("INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(`event:${crypto.randomUUID()}`, id, principal.sub, fromStatus, toStatus, note, at).run();
  return { report: { id, fromStatus, status: toStatus, updatedAt: at, moderationFlags: flags, forwarded: toStatus === "FORWARDED" } };
}
__name(updateReport, "updateReport");
async function updatePhotoReview(inputValue, env, principal, reportId, photoId) {
  if (!env.MESSAGES_DB || !operator(principal)) throw new Error("OPERATOR_FORBIDDEN");
  const input = plain(inputValue);
  const status = typeof input.status === "string" && PHOTO_REVIEW_STATUSES.has(input.status) ? input.status : null;
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 500) : null;
  if (!status) throw new Error("INVALID_PHOTO_REVIEW");
  const existing = await env.MESSAGES_DB.prepare("SELECT id FROM report_photos WHERE id = ? AND report_id = ? LIMIT 1").bind(photoId, reportId).first();
  if (!existing) throw new Error("PHOTO_NOT_FOUND");
  const at = (/* @__PURE__ */ new Date()).toISOString();
  await env.MESSAGES_DB.prepare("UPDATE report_photos SET review_status = ?,review_note = ?,reviewed_by = ?,reviewed_at = ? WHERE id = ? AND report_id = ?").bind(status, note, principal.sub, at, photoId, reportId).run();
  await env.MESSAGES_DB.prepare("INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(`event:${crypto.randomUUID()}`, reportId, principal.sub, null, `PHOTO_${status}`, note, at).run();
  return { photo: { id: photoId, reportId, status, reviewedAt: at } };
}
__name(updatePhotoReview, "updatePhotoReview");
async function createReportPhotoAccess(env, principal, reportId, photoId) {
  if (!env.MESSAGES_DB || !env.REPORTS_KV || !operator(principal)) throw new Error("OPERATOR_FORBIDDEN");
  const exists = await env.MESSAGES_DB.prepare("SELECT id FROM report_photos WHERE id = ? AND report_id = ? AND expires_at > ? LIMIT 1").bind(photoId, reportId, (/* @__PURE__ */ new Date()).toISOString()).first();
  if (!exists) throw new Error("PHOTO_NOT_FOUND");
  const token = randomSecurityToken();
  const tokenHash = await securityTokenHash(token);
  const createdAt = /* @__PURE__ */ new Date();
  const expiresAt = new Date(createdAt.getTime() + PHOTO_ACCESS_MS).toISOString();
  await env.MESSAGES_DB.prepare("INSERT INTO report_photo_access_grants (token_hash,report_id,photo_id,operator_sub,created_at,expires_at,used_at) VALUES (?,?,?,?,?,?,NULL)").bind(tokenHash, reportId, photoId, principal.sub, createdAt.toISOString(), expiresAt).run();
  await env.MESSAGES_DB.prepare("INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(`event:${crypto.randomUUID()}`, reportId, principal.sub, null, "PHOTO_ACCESS_GRANTED", "Acceso privado de vida corta creado por acci\xF3n expl\xEDcita.", createdAt.toISOString()).run();
  return { access: { url: `/api/private/operator/photo-access/${token}`, expiresAt, singleUse: true } };
}
__name(createReportPhotoAccess, "createReportPhotoAccess");
async function consumeReportPhotoAccess(env, principal, token) {
  if (!env.MESSAGES_DB || !env.REPORTS_KV || !operator(principal)) throw new Error("OPERATOR_FORBIDDEN");
  if (!ACCESS_TOKEN_PATTERN.test(token)) throw new Error("PHOTO_ACCESS_INVALID");
  const tokenHash = await securityTokenHash(token);
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const grant = await env.MESSAGES_DB.prepare("UPDATE report_photo_access_grants SET used_at = ? WHERE token_hash = ? AND operator_sub = ? AND used_at IS NULL AND expires_at > ? RETURNING report_id,photo_id").bind(at, tokenHash, principal.sub, at).first();
  if (!grant) throw new Error("PHOTO_ACCESS_INVALID");
  const row = await env.MESSAGES_DB.prepare("SELECT object_key,mime_type,bytes,expires_at,storage_backend FROM report_photos WHERE id = ? AND report_id = ? AND expires_at > ? AND storage_backend = 'KV' LIMIT 1").bind(grant.photo_id, grant.report_id, at).first();
  if (!row) throw new Error("PHOTO_NOT_FOUND");
  let stored;
  try {
    stored = await env.REPORTS_KV.getWithMetadata(row.object_key, "arrayBuffer");
  } catch {
    throw storageError();
  }
  if (!stored.value) throw new Error("PHOTO_NOT_FOUND");
  const metadata = stored.metadata;
  if (!metadata || metadata.reportId !== grant.report_id || metadata.mime !== row.mime_type || metadata.expiresAt !== row.expires_at || stored.value.byteLength !== row.bytes) throw new Error("PHOTO_STORAGE_METADATA_INVALID");
  await env.MESSAGES_DB.prepare("INSERT INTO report_events (id,report_id,actor_sub,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)").bind(`event:${crypto.randomUUID()}`, grant.report_id, principal.sub, null, "PHOTO_ACCESSED", "Foto privada consultada mediante acceso de vida corta y uso \xFAnico.", at).run();
  return new Response(stored.value, { headers: { "Content-Type": row.mime_type, "Cache-Control": "private, no-store, max-age=0", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
}
__name(consumeReportPhotoAccess, "consumeReportPhotoAccess");

// src/worker/retention.ts
async function purgeExpiredPrivateData(env, now = /* @__PURE__ */ new Date()) {
  const reportResult = await purgeExpiredReports(env, now);
  if (env.MESSAGES_DB) {
    const nowIso = now.toISOString();
    const historyBefore = new Date(now.getTime() - 90 * 864e5).toISOString();
    const revokedBefore = new Date(now.getTime() - 7 * 864e5).toISOString();
    await env.MESSAGES_DB.prepare("DELETE FROM messages WHERE expires_at <= ?").bind(nowIso).run();
    await env.MESSAGES_DB.prepare("DELETE FROM conversations WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id)").bind(historyBefore).run();
    await env.MESSAGES_DB.prepare("DELETE FROM audit_events WHERE at < ?").bind(historyBefore).run();
    await env.MESSAGES_DB.prepare("DELETE FROM rate_events WHERE at < ?").bind(historyBefore).run();
    await env.MESSAGES_DB.prepare("DELETE FROM rate_windows WHERE updated_at < ?").bind(new Date(now.getTime() - 7 * 864e5).toISOString()).run();
    await env.MESSAGES_DB.prepare("DELETE FROM report_photo_access_grants WHERE expires_at <= ? OR used_at IS NOT NULL").bind(nowIso).run();
    await env.MESSAGES_DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)").bind(nowIso, revokedBefore).run();
  }
  return Object.freeze({ deletedPhotos: reportResult.deletedPhotos, pendingPhotos: reportResult.pendingPhotos, completedAt: now.toISOString() });
}
__name(purgeExpiredPrivateData, "purgeExpiredPrivateData");

// src/domain/private-messaging/validation.ts
var PRIVATE_MESSAGE_MAX_LENGTH = 280;
var PRIVATE_PAGE_LIMIT = 40;
var ID_PATTERN2 = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;
var PICTOGRAPHIC = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]/u;
function unsafeInvisible(value) {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code >= 127 && code <= 159 || code >= 8203 && code <= 8207 || code >= 8234 && code <= 8238 || code >= 8288 && code <= 8303 || code === 65279) return true;
  }
  return false;
}
__name(unsafeInvisible, "unsafeInvisible");
function normalizeSendMessage(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError("INVALID_MESSAGE_BODY");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = /* @__PURE__ */ new Set(["conversationId", "body", "idempotencyKey"]);
  const record3 = /* @__PURE__ */ Object.create(null);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string" || !allowed.has(key)) throw new TypeError("UNSUPPORTED_MESSAGE_FIELD");
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) throw new TypeError("UNSAFE_MESSAGE_FIELD");
    record3[key] = descriptor.value;
  }
  if (typeof record3.conversationId !== "string" || !ID_PATTERN2.test(record3.conversationId)) throw new TypeError("INVALID_CONVERSATION_ID");
  if (typeof record3.idempotencyKey !== "string" || !ID_PATTERN2.test(record3.idempotencyKey)) throw new TypeError("INVALID_IDEMPOTENCY_KEY");
  if (typeof record3.body !== "string") throw new TypeError("INVALID_MESSAGE_TEXT");
  const body = record3.body.trim();
  if (body.length < 1 || body.length > PRIVATE_MESSAGE_MAX_LENGTH) throw new TypeError("INVALID_MESSAGE_LENGTH");
  if (unsafeInvisible(body) || PICTOGRAPHIC.test(body)) throw new TypeError("INVALID_MESSAGE_CHARACTERS");
  return Object.freeze({ conversationId: record3.conversationId, body, idempotencyKey: record3.idempotencyKey });
}
__name(normalizeSendMessage, "normalizeSendMessage");
function messagePassesModeration(body, configuredTerms) {
  const normalized = body.normalize("NFKC").toLocaleLowerCase("es");
  const terms = configuredTerms.split(",").map((term) => term.trim().normalize("NFKC").toLocaleLowerCase("es")).filter((term) => term.length >= 2).slice(0, 100);
  return !terms.some((term) => normalized.includes(term));
}
__name(messagePassesModeration, "messagePassesModeration");

// src/domain/private-messaging/service.ts
var MessagingService = class {
  constructor(store, options) {
    this.store = store;
    this.options = options;
  }
  store;
  options;
  static {
    __name(this, "MessagingService");
  }
  async getOrCreateConversation(principal) {
    await this.maintenance();
    if (principal.role === "VERIFIED_OPERATOR" || principal.role === "ADMIN") throw new Error("OPERATOR_CANNOT_CREATE_USER_CONVERSATION");
    const existing = await this.store.findConversationForUser(principal.sub);
    if (existing) return existing;
    const at = this.options.now().toISOString();
    const conversation2 = Object.freeze({ id: `conv:${this.options.id()}`, userSub: principal.sub, createdAt: at, updatedAt: at, status: "OPEN", unreadByUser: 0, unreadByOperator: 0 });
    await this.store.createConversation(conversation2);
    await this.audit(principal, "CONVERSATION_CREATED", conversation2.id);
    return conversation2;
  }
  async listConversations(principal) {
    await this.maintenance();
    const operator2 = principal.role === "VERIFIED_OPERATOR" || principal.role === "ADMIN";
    return this.store.listConversations(operator2 ? null : principal.sub, PRIVATE_PAGE_LIMIT);
  }
  async listMessages(principal, conversationId, before) {
    const conversation2 = await this.authorizeConversation(principal, conversationId);
    const page = await this.store.listMessages(conversation2.id, PRIVATE_PAGE_LIMIT, before);
    await this.store.markRead(conversation2.id, principal.role === "AUTHENTICATED_USER" ? "USER" : "OPERATOR", this.options.now().toISOString());
    await this.audit(principal, "MESSAGES_READ", conversation2.id);
    return page;
  }
  async send(principal, rawInput, networkActorId2) {
    const input = normalizeSendMessage(rawInput);
    if (!messagePassesModeration(input.body, this.options.blockedTerms ?? "")) throw new Error("CONTENT_REJECTED");
    await this.maintenance();
    const conversation2 = await this.authorizeConversation(principal, input.conversationId);
    const duplicate = await this.store.findByIdempotency(conversation2.id, input.idempotencyKey);
    if (duplicate) return { message: duplicate, duplicate: true };
    const now = this.options.now();
    const windowMs = this.options.rateWindowMinutes * 6e4;
    const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
    const since = new Date(now.getTime() - windowMs).toISOString();
    const rateActors = [principal.sub, ...networkActorId2 && networkActorId2 !== principal.sub ? [networkActorId2] : []];
    for (const actorId of rateActors) {
      const allowed = this.store.consumeRateLimit ? await this.store.consumeRateLimit(actorId, "PRIVATE_MESSAGE", windowStart, this.options.rateLimit, now.toISOString()) : await this.store.countRecentSends(actorId, since) < this.options.rateLimit;
      if (!allowed) throw new Error("RATE_LIMITED");
    }
    const operator2 = principal.role === "VERIFIED_OPERATOR" || principal.role === "ADMIN";
    if (operator2 && conversation2.userSub === principal.sub) throw new Error("ROLE_CONFLICT");
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.options.retentionDays * 864e5).toISOString();
    const message2 = Object.freeze({
      id: `pmsg:${this.options.id()}`,
      conversationId: conversation2.id,
      senderId: principal.sub,
      recipientId: operator2 ? conversation2.userSub : "sos-sf:verified-operators",
      body: input.body,
      createdAt,
      expiresAt,
      priority: 1,
      status: "DELIVERED_TO_SERVICE",
      idempotencyKey: input.idempotencyKey,
      commitment: null,
      provenance: operator2 ? "VERIFIED_OPERATOR_SESSION" : "AUTHENTICATED_USER_SESSION",
      failureReason: null,
      verifiedOperator: operator2
    });
    try {
      await this.store.insertMessage(message2);
    } catch (error) {
      const concurrent = await this.store.findByIdempotency(conversation2.id, input.idempotencyKey);
      if (concurrent) return { message: concurrent, duplicate: true };
      throw error;
    }
    if (!this.store.consumeRateLimit) for (const actorId of rateActors) await this.store.recordSend(actorId, createdAt);
    await this.audit(principal, "MESSAGE_ACCEPTED", message2.id);
    return { message: message2, duplicate: false };
  }
  async authorizeConversation(principal, conversationId) {
    const conversation2 = await this.store.findConversation(conversationId);
    if (!conversation2) throw new Error("CONVERSATION_NOT_FOUND");
    const operator2 = principal.role === "VERIFIED_OPERATOR" || principal.role === "ADMIN";
    if (!operator2 && conversation2.userSub !== principal.sub) throw new Error("FORBIDDEN_CONVERSATION");
    return conversation2;
  }
  async audit(principal, action, targetId) {
    await this.store.recordAudit({ id: `audit:${this.options.id()}`, actorId: principal.sub, action, targetId, at: this.options.now().toISOString() });
  }
  async maintenance() {
    const now = this.options.now();
    const historyBefore = new Date(now.getTime() - this.options.retentionDays * 864e5).toISOString();
    await this.store.purgeExpired(now.toISOString(), historyBefore);
  }
};

// src/worker/d1-message-store.ts
var conversation = /* @__PURE__ */ __name((row) => ({ id: row.id, userSub: row.user_sub, createdAt: row.created_at, updatedAt: row.updated_at, status: row.status, unreadByUser: row.unread_user, unreadByOperator: row.unread_operator }), "conversation");
var message = /* @__PURE__ */ __name((row) => ({ id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, recipientId: row.recipient_id, body: row.body, createdAt: row.created_at, expiresAt: row.expires_at, priority: row.priority, status: row.status, idempotencyKey: row.idempotency_key, commitment: row.commitment, provenance: row.provenance, failureReason: row.failure_reason, verifiedOperator: row.verified_operator === 1 }), "message");
var D1MessageStore = class {
  constructor(db) {
    this.db = db;
  }
  db;
  static {
    __name(this, "D1MessageStore");
  }
  async findConversation(id) {
    const row = await this.db.prepare("SELECT * FROM conversations WHERE id = ? LIMIT 1").bind(id).first();
    return row ? conversation(row) : null;
  }
  async findConversationForUser(userSub) {
    const row = await this.db.prepare("SELECT * FROM conversations WHERE user_sub = ? AND status != 'CLOSED' ORDER BY updated_at DESC LIMIT 1").bind(userSub).first();
    return row ? conversation(row) : null;
  }
  async createConversation(item) {
    await this.db.prepare("INSERT INTO conversations (id,user_sub,created_at,updated_at,status,unread_user,unread_operator) VALUES (?,?,?,?,?,?,?)").bind(item.id, item.userSub, item.createdAt, item.updatedAt, item.status, item.unreadByUser, item.unreadByOperator).run();
  }
  async listConversations(userSub, limit) {
    const statement = userSub === null ? this.db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?").bind(limit) : this.db.prepare("SELECT * FROM conversations WHERE user_sub = ? ORDER BY updated_at DESC LIMIT ?").bind(userSub, limit);
    return (await statement.all()).results?.map(conversation) ?? [];
  }
  async listMessages(conversationId, limit, before) {
    const statement = before === null ? this.db.prepare("SELECT * FROM messages WHERE conversation_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?").bind(conversationId, (/* @__PURE__ */ new Date()).toISOString(), limit) : this.db.prepare("SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?").bind(conversationId, before, (/* @__PURE__ */ new Date()).toISOString(), limit);
    const messages = (await statement.all()).results?.map(message) ?? [];
    return { messages, nextCursor: messages.length === limit ? messages.at(-1)?.createdAt ?? null : null, limit };
  }
  async findByIdempotency(conversationId, idempotencyKey) {
    const row = await this.db.prepare("SELECT * FROM messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1").bind(conversationId, idempotencyKey).first();
    return row ? message(row) : null;
  }
  async insertMessage(item) {
    await this.db.prepare("INSERT INTO messages (id,conversation_id,sender_id,recipient_id,body,created_at,expires_at,priority,status,idempotency_key,commitment,provenance,failure_reason,verified_operator) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(item.id, item.conversationId, item.senderId, item.recipientId, item.body, item.createdAt, item.expiresAt, item.priority, item.status, item.idempotencyKey, item.commitment, item.provenance, item.failureReason, item.verifiedOperator ? 1 : 0).run();
    const counter = item.verifiedOperator ? "unread_user" : "unread_operator";
    await this.db.prepare(`UPDATE conversations SET ${counter} = ${counter} + 1, updated_at = ? WHERE id = ?`).bind(item.createdAt, item.conversationId).run();
  }
  async markRead(conversationId, reader, at) {
    const counter = reader === "USER" ? "unread_user" : "unread_operator";
    await this.db.prepare(`UPDATE conversations SET ${counter} = 0, updated_at = ? WHERE id = ?`).bind(at, conversationId).run();
    if (reader === "OPERATOR") await this.db.prepare("UPDATE messages SET status = 'READ_BY_OPERATOR' WHERE conversation_id = ? AND verified_operator = 0 AND status = 'DELIVERED_TO_SERVICE'").bind(conversationId).run();
  }
  async consumeRateLimit(actorId, scope, windowStart, limit, at) {
    const row = await this.db.prepare("INSERT INTO rate_windows (actor_id,scope,window_start,count,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(actor_id,scope,window_start) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at RETURNING count").bind(actorId, scope, windowStart, 1, at).first();
    return Boolean(row && row.count <= limit);
  }
  async countRecentSends(actorId, since) {
    const row = await this.db.prepare("SELECT COUNT(*) AS count FROM rate_events WHERE actor_id = ? AND at >= ?").bind(actorId, since).first();
    return row?.count ?? 0;
  }
  async recordSend(actorId, at) {
    await this.db.prepare("INSERT INTO rate_events (actor_id,at) VALUES (?,?)").bind(actorId, at).run();
  }
  async purgeExpired(messageExpiresAt, historyBefore) {
    await this.db.prepare("DELETE FROM messages WHERE expires_at <= ?").bind(messageExpiresAt).run();
    await this.db.prepare("DELETE FROM rate_events WHERE at < ?").bind(historyBefore).run();
    await this.db.prepare("DELETE FROM rate_windows WHERE updated_at < ?").bind(historyBefore).run();
    await this.db.prepare("DELETE FROM audit_events WHERE at < ?").bind(historyBefore).run();
    await this.db.prepare("DELETE FROM conversations WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id)").bind(historyBefore).run();
  }
  async recordAudit(event) {
    await this.db.prepare("INSERT INTO audit_events (id,actor_id,action,target_id,at) VALUES (?,?,?,?,?)").bind(event.id, event.actorId, event.action, event.targetId, event.at).run();
  }
};

// src/data/unavailable-snapshot.ts
var REFERENCE_AT = "1970-01-01T00:00:00.000Z";
function unavailableSystem(id, label, watercourse, stationName, stationCode) {
  return Object.freeze({
    id,
    label,
    watercourse,
    stationName,
    stationCode,
    available: false,
    dataStatus: "UNAVAILABLE",
    freshness: "NO_DISPONIBLE",
    currentMetres: null,
    observedAt: null,
    fetchedAt: null,
    validUntil: null,
    sourceId: `ina-rest-${stationCode}`,
    sourceName: "Instituto Nacional del Agua",
    points: Object.freeze([]),
    thresholds: Object.freeze([]),
    trend: "UNKNOWN",
    delta1h: null,
    delta6h: null,
    delta24h: null,
    delta72h: null,
    delta7d: null
  });
}
__name(unavailableSystem, "unavailableSystem");
var unavailableSnapshot = Object.freeze({
  schemaVersion: "1.0",
  id: "unavailable-public-safety-snapshot",
  mode: "UNAVAILABLE",
  dataStatus: "UNAVAILABLE",
  freshness: "NO_DISPONIBLE",
  generatedAt: REFERENCE_AT,
  previousSnapshotAt: REFERENCE_AT,
  state: "UNKNOWN",
  stateLabel: "No hay una medici\xF3n vigente suficiente para clasificar el nivel",
  summary: "No hay una lectura hidrom\xE9trica publicada disponible en este momento.",
  dominantSourceId: "live-data-unavailable",
  validUntil: REFERENCE_AT,
  recommendedAction: "Verific\xE1 directamente los canales oficiales y llam\xE1 a emergencias si existe peligro inmediato.",
  emergencyDisclaimer: "SOS Santa Fe es un servicio independiente que organiza fuentes p\xFAblicas. No reemplaza al 911, 103 ni a los organismos oficiales.",
  alertStatus: "FUENTES_DE_ALERTAS_NO_DISPONIBLES",
  alerts: Object.freeze([]),
  timeline: Object.freeze([]),
  sourceOrganizations: Object.freeze([]),
  serviceStatus: Object.freeze({ worker: "OPERATIONAL", api: "OPERATIONAL", checkedAt: REFERENCE_AT, note: "El servicio t\xE9cnico puede responder aunque las fuentes de datos no est\xE9n disponibles." }),
  changes: Object.freeze([]),
  systems: Object.freeze([
    unavailableSystem("parana-santa-fe", "R\xEDo Paran\xE1 \u2014 Santa Fe", "R\xEDo Paran\xE1", "Santa Fe", "30"),
    unavailableSystem("salado-santo-tome", "R\xEDo Salado \u2014 Santo Tom\xE9", "R\xEDo Salado", "Santo Tom\xE9", "3044")
  ]),
  river: Object.freeze({
    systemId: "parana-santa-fe",
    available: false,
    dataStatus: "UNAVAILABLE",
    stationName: "Santa Fe",
    currentMetres: null,
    delta1h: null,
    delta6h: null,
    delta24h: null,
    trend: "UNKNOWN",
    observedAt: REFERENCE_AT,
    fetchedAt: REFERENCE_AT,
    validUntil: REFERENCE_AT,
    sourceId: "ina-rest-30",
    sourceName: "Instituto Nacional del Agua",
    points: Object.freeze([]),
    forecastPoints: Object.freeze([]),
    thresholds: Object.freeze([])
  }),
  rain: Object.freeze({
    available: false,
    dataStatus: "UNAVAILABLE",
    accumulated1hMm: null,
    accumulated24hMm: null,
    forecast: "Sin estimaci\xF3n suplementaria utilizable.",
    observedAt: REFERENCE_AT,
    fetchedAt: REFERENCE_AT,
    validUntil: REFERENCE_AT,
    sourceId: "rain-unavailable",
    points: Object.freeze([])
  }),
  sources: Object.freeze([]),
  contradictions: Object.freeze([]),
  shelters: Object.freeze([]),
  actions: Object.freeze(["Llam\xE1 a emergencias si existe peligro inmediato.", "Consult\xE1 informaci\xF3n oficial antes de tomar decisiones."]),
  messages: Object.freeze([])
});

// src/domain/temporal-series.ts
var CLOCK_SKEW_TOLERANCE_MS = 5 * 6e4;
var EARLIEST_PUBLIC_TIMESTAMP = Date.UTC(2e3, 0, 1);
var HOUR_MS = 36e5;
function parseObservationTime(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= EARLIEST_PUBLIC_TIMESTAMP ? parsed : null;
}
__name(parseObservationTime, "parseObservationTime");
function isObservationTimestampUsable(value, now) {
  const parsed = parseObservationTime(value);
  const anchor = typeof now === "string" ? Date.parse(now) : now.getTime();
  return parsed !== null && Number.isFinite(anchor) && parsed <= anchor + CLOCK_SKEW_TOLERANCE_MS;
}
__name(isObservationTimestampUsable, "isObservationTimestampUsable");
function hasSignificantFutureTimestamp(value, now) {
  const parsed = parseObservationTime(value);
  const anchor = typeof now === "string" ? Date.parse(now) : now.getTime();
  return parsed !== null && Number.isFinite(anchor) && parsed > anchor + CLOCK_SKEW_TOLERANCE_MS;
}
__name(hasSignificantFutureTimestamp, "hasSignificantFutureTimestamp");
function sanitizeMeasuredRiverPoints(points, now) {
  const anchor = typeof now === "string" ? Date.parse(now) : now.getTime();
  if (!Number.isFinite(anchor)) return Object.freeze([]);
  const ordered = points.filter((point) => point.measured === true && Number.isFinite(point.metres) && isObservationTimestampUsable(point.at, anchorToDate(anchor))).slice().sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const deduped = [];
  for (const point of ordered) {
    if (deduped.length && deduped.at(-1).at === point.at) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return Object.freeze(deduped);
}
__name(sanitizeMeasuredRiverPoints, "sanitizeMeasuredRiverPoints");
function anchorToDate(anchor) {
  return new Date(anchor);
}
__name(anchorToDate, "anchorToDate");
function medianIntervalMs(points) {
  const intervals = points.slice(1).map((point, index) => Date.parse(point.at) - Date.parse(points[index].at)).filter((value) => Number.isFinite(value) && value > 0);
  if (!intervals.length) return null;
  const ordered = intervals.sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}
__name(medianIntervalMs, "medianIntervalMs");
function horizonToleranceMs(hours, typicalIntervalMs) {
  const capHours = hours <= 1 ? 0.6 : hours <= 6 ? 1.5 : hours <= 24 ? 3 : hours <= 72 ? 6 : 12;
  const typical = typicalIntervalMs ?? Math.min(HOUR_MS, hours * HOUR_MS);
  return Math.min(capHours * HOUR_MS, Math.max(10 * 6e4, typical * 1.75));
}
__name(horizonToleranceMs, "horizonToleranceMs");
function internalCoverageIsPlausible(points, typicalIntervalMs, toleranceMs, horizonMs) {
  if (points.length < 2) return false;
  const typical = typicalIntervalMs ?? HOUR_MS;
  const gapLimit = Math.max(typical * 4, toleranceMs * 2, 2 * HOUR_MS);
  const materialHorizonGap = Math.max(gapLimit, horizonMs * 0.45);
  for (let index = 1; index < points.length; index += 1) {
    const gap = Date.parse(points[index].at) - Date.parse(points[index - 1].at);
    if (gap > materialHorizonGap) return false;
  }
  return true;
}
__name(internalCoverageIsPlausible, "internalCoverageIsPlausible");
function temporalDelta(points, hours, now) {
  const futureRejected = points.some((point) => point.measured === true && hasSignificantFutureTimestamp(point.at, now));
  const usable = sanitizeMeasuredRiverPoints(points, now);
  const latest = usable.at(-1);
  if (!latest || hours <= 0) return Object.freeze({ value: null, status: futureRejected ? "FUTURE_DATA_REJECTED" : "NOT_ENOUGH_DATA", latestAt: latest?.at ?? null, referenceAt: null, typicalIntervalMs: null });
  const typicalIntervalMs = medianIntervalMs(usable);
  const horizonMs = hours * HOUR_MS;
  const target = Date.parse(latest.at) - horizonMs;
  const candidates = usable.slice(0, -1);
  let reference = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const point of candidates) {
    const currentDistance = Math.abs(Date.parse(point.at) - target);
    if (currentDistance < distance) {
      reference = point;
      distance = currentDistance;
    }
  }
  const toleranceMs = horizonToleranceMs(hours, typicalIntervalMs);
  if (!reference || distance > toleranceMs) return Object.freeze({ value: null, status: futureRejected ? "FUTURE_DATA_REJECTED" : "NOT_ENOUGH_DATA", latestAt: latest.at, referenceAt: reference?.at ?? null, typicalIntervalMs });
  const segment = usable.filter((point) => Date.parse(point.at) >= Date.parse(reference.at) && Date.parse(point.at) <= Date.parse(latest.at));
  if (!internalCoverageIsPlausible(segment, typicalIntervalMs, toleranceMs, horizonMs)) return Object.freeze({ value: null, status: futureRejected ? "FUTURE_DATA_REJECTED" : "NOT_ENOUGH_DATA", latestAt: latest.at, referenceAt: reference.at, typicalIntervalMs });
  return Object.freeze({ value: latest.metres - reference.metres, status: futureRejected ? "FUTURE_DATA_REJECTED" : "OK", latestAt: latest.at, referenceAt: reference.at, typicalIntervalMs });
}
__name(temporalDelta, "temporalDelta");
function deriveHydrometricTrend(points, now) {
  const delta = temporalDelta(points, 6, now).value;
  if (delta === null) return "UNKNOWN";
  if (delta >= 0.12) return "RISING";
  if (delta >= 0.02) return "RISING_SLOWLY";
  if (delta <= -0.02) return "FALLING";
  return "STABLE";
}
__name(deriveHydrometricTrend, "deriveHydrometricTrend");

// src/domain/public-safety.ts
var LOCAL_TIME_ZONE = "America/Argentina/Cordoba";
var EARLIEST_PUBLIC_TIMESTAMP2 = Date.UTC(2e3, 0, 1);
function isPublicTimestamp(value) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= EARLIEST_PUBLIC_TIMESTAMP2;
}
__name(isPublicTimestamp, "isPublicTimestamp");
function freshnessFor(observedAt, now, delayedMs, staleMs) {
  if (!observedAt || !Number.isFinite(Date.parse(observedAt)) || !isObservationTimestampUsable(observedAt, now)) return "NO_DISPONIBLE";
  const age = Math.max(0, now.getTime() - Date.parse(observedAt));
  if (age <= delayedMs) return "ACTUALIZADO";
  if (age <= staleMs) return "ACTUALIZACION_DEMORADA";
  return "DESACTUALIZADO";
}
__name(freshnessFor, "freshnessFor");
function dataStatusForFreshness(value) {
  if (value === "ACTUALIZADO") return "LIVE";
  if (value === "ACTUALIZACION_DEMORADA" || value === "DESACTUALIZADO") return "STALE";
  return "UNAVAILABLE";
}
__name(dataStatusForFreshness, "dataStatusForFreshness");
function classificationForSource(source, blocked) {
  if (blocked) return blocked;
  if (!source.connected || source.status === "UNAVAILABLE") return "DEGRADED";
  if (source.kind === "SATELLITE_OBSERVATION" || source.kind === "FORECAST_MODEL") return "SUPPLEMENTARY";
  return source.status === "FRESH" ? "OPERATIONAL_FRESH" : "OPERATIONAL_STALE";
}
__name(classificationForSource, "classificationForSource");
function alertVerificationState(alertSource, alerts) {
  if (!alertSource || alertSource.classification === "BLOCKED_CREDENTIAL" || alertSource.classification === "BLOCKED_NO_MACHINE_ENDPOINT" || alertSource.status === "UNAVAILABLE") {
    return "FUENTES_DE_ALERTAS_NO_DISPONIBLES";
  }
  if (alerts.some((alert) => alert.appliesToSantaFe && (alert.lifecycle === "ACTIVE" || alert.lifecycle === "UPDATED"))) return "ALERTA_OFICIAL_ACTIVA";
  if (alertSource.status === "STALE" || alertSource.freshness === "ACTUALIZACION_DEMORADA" || alertSource.freshness === "DESACTUALIZADO") return "VERIFICACION_DE_ALERTAS_DEGRADADA";
  return "SIN_ALERTAS_OFICIALES_DETECTADAS";
}
__name(alertVerificationState, "alertVerificationState");
function highestFreshness(systems) {
  const available = systems.filter((system) => system.available);
  if (!available.length) return "NO_DISPONIBLE";
  const rank = { ACTUALIZADO: 0, ACTUALIZACION_DEMORADA: 1, DESACTUALIZADO: 2, NO_DISPONIBLE: 3 };
  return available.reduce((worst, system) => {
    const value = system.freshness ?? "NO_DISPONIBLE";
    return rank[value] > rank[worst] ? value : worst;
  }, "ACTUALIZADO");
}
__name(highestFreshness, "highestFreshness");
function timelineFor(systems, alerts, sources, now) {
  const horizon = now.getTime() - 72 * 60 * 6e4;
  const events = [];
  for (const alert of alerts) {
    if (Date.parse(alert.sent) < horizon) continue;
    const type = alert.lifecycle === "CANCELLED" ? "ALERT_CANCELLED" : alert.lifecycle === "UPDATED" ? "ALERT_UPDATED" : "ALERT_ISSUED";
    events.push(Object.freeze({ id: `alert:${alert.identifier}`, at: alert.sent, type, title: alert.headline, detail: `${alert.sender} \xB7 ${alert.area}`, sourceId: "smn-alerts", official: true }));
  }
  for (const system of systems) {
    if (!system.observedAt || Date.parse(system.observedAt) < horizon) continue;
    events.push(Object.freeze({ id: `measurement:${system.id}:${system.observedAt}`, at: system.observedAt, type: "MEASUREMENT", title: `Nueva medici\xF3n: ${system.watercourse} \u2014 ${system.stationName}`, detail: system.currentMetres === null ? "Medici\xF3n sin valor utilizable." : `${system.currentMetres.toFixed(2)} m \xB7 ${system.sourceName}`, sourceId: system.sourceId, official: true }));
  }
  for (const source of sources) {
    if (source.classification !== "DEGRADED" && source.classification !== "BLOCKED_CREDENTIAL" && source.classification !== "BLOCKED_NO_MACHINE_ENDPOINT") continue;
    events.push(Object.freeze({
      id: `source:${source.id}:${source.classification}`,
      at: source.lastCheckedAt ?? now.toISOString(),
      type: "SOURCE_DEGRADED",
      title: `Fuente con disponibilidad limitada: ${source.feedName ?? source.name}`,
      detail: source.limitations ?? source.contribution,
      sourceId: source.id,
      ...source.url ? { url: source.url } : {},
      official: false
    }));
  }
  return Object.freeze(events.sort((left, right) => Date.parse(right.at) - Date.parse(left.at)).slice(0, 30));
}
__name(timelineFor, "timelineFor");
function formatLocalDateTime(value) {
  if (!isPublicTimestamp(value)) return "Sin fecha disponible";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: LOCAL_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
    hour12: false
  }).format(new Date(value));
}
__name(formatLocalDateTime, "formatLocalDateTime");

// src/worker/providers/core.ts
var DEFAULT_TIMEOUT_MS = 5e3;
var DEFAULT_MAX_BYTES = 1e6;
var DEFAULT_FRESH_MS = 15 * 6e4;
var DEFAULT_STALE_MS = 48 * 60 * 6e4;
var CIRCUIT_FAILURES = 3;
var CIRCUIT_OPEN_MS = 5 * 6e4;
var FUTURE_TOLERANCE_MS = 5 * 6e4;
var health = /* @__PURE__ */ new Map();
function defaultCircuit() {
  return { failures: 0, lastSuccessAt: null, lastObservedAt: null, errorClass: null, openUntil: null };
}
__name(defaultCircuit, "defaultCircuit");
function cacheApi() {
  if (typeof caches === "undefined") return null;
  return caches.default ?? null;
}
__name(cacheApi, "cacheApi");
function classify(error) {
  const message2 = error instanceof Error ? error.message : "";
  if (message2.includes("ALLOWLIST")) return "ALLOWLIST";
  if (message2.includes("REDIRECT")) return "REDIRECT";
  if (message2.includes("FUTURE_TIMESTAMP")) return "FUTURE_TIMESTAMP";
  if (message2.includes("TIMEOUT") || message2.includes("AbortError")) return "TIMEOUT";
  if (message2.includes("HTTP_")) return "HTTP";
  if (message2.includes("CONTENT_TYPE")) return "CONTENT_TYPE";
  if (message2.includes("BODY_TOO_LARGE")) return "BODY_TOO_LARGE";
  if (message2.includes("PARSE")) return "PARSE";
  if (message2.includes("CIRCUIT_OPEN")) return "CIRCUIT_OPEN";
  if (message2.includes("OFFICIAL_MACHINE_ENDPOINT_NOT_AVAILABLE")) return "OFFICIAL_MACHINE_ENDPOINT_NOT_AVAILABLE";
  if (message2.includes("CREDENTIAL_REQUIRED")) return "CREDENTIAL_REQUIRED";
  return "NETWORK";
}
__name(classify, "classify");
function allowedUrl(raw, policy) {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !policy.hosts.includes(url.hostname) || !policy.paths.some((path) => path.test(url.pathname))) throw new Error("PROVIDER_ALLOWLIST_REJECTED");
  return url;
}
__name(allowedUrl, "allowedUrl");
async function fingerprint(policy, url) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${policy.id}
${url.toString()}`)));
  return Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(fingerprint, "fingerprint");
async function cacheRead(key) {
  const cache = cacheApi();
  if (!cache) return null;
  const response = await cache.match(new Request(key));
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}
__name(cacheRead, "cacheRead");
async function cacheWrite(key, value, maxAgeSeconds) {
  const cache = cacheApi();
  if (!cache) return;
  await cache.put(new Request(key), new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${maxAgeSeconds}` } }));
}
__name(cacheWrite, "cacheWrite");
async function boundedText(response, maximum) {
  const declared = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maximum) throw new Error("PROVIDER_BODY_TOO_LARGE");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("PROVIDER_BODY_TOO_LARGE");
    }
    chunks.push(part.value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
__name(boundedText, "boundedText");
function publishHealth(policy, result, circuit) {
  health.set(policy.id, Object.freeze({ id: policy.id, status: result.status, lastSuccessAt: circuit.lastSuccessAt, lastObservedAt: circuit.lastObservedAt, errorClass: result.errorClass, circuitOpenUntil: circuit.openUntil }));
}
__name(publishHealth, "publishHealth");
function providerHealth() {
  return Object.freeze([...health.values()].sort((a, b) => a.id.localeCompare(b.id)));
}
__name(providerHealth, "providerHealth");
function restoreProviderHealth(entries) {
  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string") continue;
    health.set(entry.id, Object.freeze({ ...entry }));
  }
}
__name(restoreProviderHealth, "restoreProviderHealth");
function publishProviderBlock(id, errorClass) {
  health.set(id, Object.freeze({ id, status: "UNAVAILABLE", lastSuccessAt: null, lastObservedAt: null, errorClass, circuitOpenUntil: null }));
}
__name(publishProviderBlock, "publishProviderBlock");
async function fetchProvider(rawUrl, policy, parse) {
  const now = /* @__PURE__ */ new Date();
  let url;
  try {
    url = allowedUrl(rawUrl, policy);
  } catch (error) {
    const result = { value: null, status: "UNAVAILABLE", fetchedAt: now.toISOString(), observedAt: null, errorClass: classify(error), fromCache: false };
    publishHealth(policy, result, defaultCircuit());
    return result;
  }
  const key = await fingerprint(policy, url);
  const payloadKey = new URL(`https://cache.sos-sf.invalid/provider/${key}`);
  const circuitKey = new URL(`https://cache.sos-sf.invalid/circuit/${key}`);
  const cached = await cacheRead(payloadKey);
  let circuit = await cacheRead(circuitKey) ?? defaultCircuit();
  const cachedAge = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const freshMs = policy.freshMs ?? DEFAULT_FRESH_MS;
  const refreshMs = policy.refreshMs ?? freshMs;
  const staleMs = policy.staleMs ?? DEFAULT_STALE_MS;
  if (cached && Date.parse(cached.observedAt) > now.getTime() + FUTURE_TOLERANCE_MS) {
    await cacheWrite(payloadKey, { value: cached.value, fetchedAt: cached.fetchedAt, observedAt: (/* @__PURE__ */ new Date(0)).toISOString() }, 1);
  } else if (cached && cachedAge <= refreshMs) {
    const observationStatus = now.getTime() - Date.parse(cached.observedAt) <= freshMs ? "FRESH" : "STALE";
    const result = { value: cached.value, status: observationStatus, fetchedAt: cached.fetchedAt, observedAt: cached.observedAt, errorClass: null, fromCache: true };
    publishHealth(policy, result, circuit);
    return result;
  }
  if (circuit.openUntil && Date.parse(circuit.openUntil) > now.getTime()) {
    const result = cached && cachedAge <= staleMs ? { value: cached.value, status: "STALE", fetchedAt: cached.fetchedAt, observedAt: cached.observedAt, errorClass: "CIRCUIT_OPEN", fromCache: true } : { value: null, status: "UNAVAILABLE", fetchedAt: now.toISOString(), observedAt: null, errorClass: "CIRCUIT_OPEN", fromCache: false };
    publishHealth(policy, result, circuit);
    return result;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("PROVIDER_TIMEOUT")), policy.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const requestInit = { signal: controller.signal, redirect: "manual", headers: { Accept: policy.contentTypes.join(", ") } };
    let response = await fetch(url, requestInit);
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location");
      if (!location) throw new Error("PROVIDER_REDIRECT_MISSING_LOCATION");
      const redirected = allowedUrl(new URL(location, url).toString(), policy);
      response = await fetch(redirected, requestInit);
      if ([301, 302, 303, 307, 308].includes(response.status)) throw new Error("PROVIDER_REDIRECT_CHAIN_REJECTED");
    }
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const contentType = (response.headers.get("Content-Type") ?? "").toLowerCase();
    if (!policy.contentTypes.some((item) => contentType.includes(item.toLowerCase().split(";")[0]))) throw new Error("PROVIDER_CONTENT_TYPE_REJECTED");
    const body = await boundedText(response, policy.maxBytes ?? DEFAULT_MAX_BYTES);
    let parsed;
    try {
      parsed = parse(body, contentType);
    } catch {
      throw new Error("PROVIDER_PARSE_FAILED");
    }
    if (!Number.isFinite(Date.parse(parsed.observedAt))) throw new Error("PROVIDER_PARSE_FAILED");
    if (Date.parse(parsed.observedAt) > now.getTime() + FUTURE_TOLERANCE_MS) throw new Error("PROVIDER_FUTURE_TIMESTAMP");
    const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
    const stored = { value: parsed.value, fetchedAt, observedAt: new Date(parsed.observedAt).toISOString() };
    await cacheWrite(payloadKey, stored, Math.ceil(staleMs / 1e3));
    circuit = { failures: 0, lastSuccessAt: fetchedAt, lastObservedAt: stored.observedAt, errorClass: null, openUntil: null };
    await cacheWrite(circuitKey, circuit, Math.ceil(staleMs / 1e3));
    const observationStatus = now.getTime() - Date.parse(stored.observedAt) <= freshMs ? "FRESH" : "STALE";
    const result = { value: stored.value, status: observationStatus, fetchedAt, observedAt: stored.observedAt, errorClass: null, fromCache: false };
    publishHealth(policy, result, circuit);
    return result;
  } catch (error) {
    const errorClass = classify(error);
    const failures = circuit.failures + 1;
    circuit = { failures, lastSuccessAt: circuit.lastSuccessAt, lastObservedAt: circuit.lastObservedAt, errorClass, openUntil: failures >= CIRCUIT_FAILURES ? new Date(now.getTime() + CIRCUIT_OPEN_MS).toISOString() : null };
    await cacheWrite(circuitKey, circuit, Math.ceil(staleMs / 1e3));
    const result = cached && cachedAge <= staleMs ? { value: cached.value, status: "STALE", fetchedAt: cached.fetchedAt, observedAt: cached.observedAt, errorClass, fromCache: true } : { value: null, status: "UNAVAILABLE", fetchedAt: now.toISOString(), observedAt: null, errorClass, fromCache: false };
    publishHealth(policy, result, circuit);
    return result;
  } finally {
    clearTimeout(timer);
  }
}
__name(fetchProvider, "fetchProvider");

// src/worker/providers/ina.ts
var A5 = Object.freeze({ id: "ina-a5", hosts: Object.freeze(["alerta.ina.gob.ar"]), paths: Object.freeze([/^\/a5\/getObservaciones$/]), contentTypes: Object.freeze(["application/json"]), maxBytes: 15e5, refreshMs: 5 * 6e4, freshMs: 36 * 60 * 6e4, staleMs: 365 * 24 * 60 * 6e4 });
var WML = Object.freeze({ id: "ina-waterml", hosts: Object.freeze(["alerta.ina.gob.ar"]), paths: Object.freeze([/^\/a5\/obs\/puntual\/series\/\d+$/]), contentTypes: Object.freeze(["application/xml", "text/xml"]), maxBytes: 15e5, refreshMs: 5 * 6e4, freshMs: 36 * 60 * 6e4, staleMs: 365 * 24 * 60 * 6e4 });
function record(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
__name(record, "record");
function quality(r) {
  const x = String(r.quality ?? r.calidad ?? r.qualifier ?? "").toLowerCase();
  return x.includes("valid") || x === "1" || x === "approved" ? "PROVIDER_VALIDATED" : "PUBLISHED_OPERATIONAL";
}
__name(quality, "quality");
function rest(body, id) {
  const a = JSON.parse(body);
  if (!Array.isArray(a)) throw Error("INA_PARSE");
  const n = Number(id), o = [];
  for (const x of a) {
    if (!record(x) || x.tipo !== "puntual" || Number(x.series_id) !== n || typeof x.valor !== "number" || typeof x.timestart !== "string" || !Number.isFinite(Date.parse(x.timestart))) throw Error("INA_PARSE");
    o.push(Object.freeze({ at: new Date(x.timestart).toISOString(), metres: x.valor, measured: true, quality: quality(x) }));
  }
  return Object.freeze([...new Map(o.map((x) => [x.at, x])).values()].sort((a2, b) => Date.parse(a2.at) - Date.parse(b.at)).slice(-512));
}
__name(rest, "rest");
function waterml(body) {
  const o = [];
  for (const m of body.matchAll(/<(?:\w+:)?MeasurementTVP\b[^>]*>[\s\S]*?<(?:\w+:)?time>([^<]+)<\/(?:\w+:)?time>[\s\S]*?<(?:\w+:)?value>([-+]?\d+(?:[.,]\d+)?)<\/(?:\w+:)?value>[\s\S]*?<\/(?:\w+:)?MeasurementTVP>/gi)) {
    const at = m[1], metres2 = Number(m[2].replace(",", "."));
    if (Number.isFinite(Date.parse(at)) && Number.isFinite(metres2)) o.push(Object.freeze({ at: new Date(at).toISOString(), metres: metres2, measured: true, quality: "PUBLISHED_OPERATIONAL" }));
  }
  if (!o.length) throw Error("INA_WATERML_PARSE");
  return Object.freeze(o.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-512));
}
__name(waterml, "waterml");
function fetchInaSeries(url, providerId, id) {
  return fetchProvider(url, { ...A5, id: providerId }, (body) => {
    const value = rest(body, id), observedAt = value.at(-1)?.at;
    if (!observedAt) throw Error("INA_EMPTY");
    return { value, observedAt };
  });
}
__name(fetchInaSeries, "fetchInaSeries");
function fetchInaWaterMl(url, providerId) {
  return fetchProvider(url, { ...WML, id: providerId }, (body) => {
    const value = waterml(body), observedAt = value.at(-1)?.at;
    if (!observedAt) throw Error("INA_WATERML_EMPTY");
    return { value, observedAt };
  });
}
__name(fetchInaWaterMl, "fetchInaWaterMl");

// src/worker/providers/nasa.ts
var HOST = "gis.earthdata.nasa.gov";
var QUERY_PATH = /^\/image\/rest\/services\/GESDISC\/GPM_3IMERGHHE\/ImageServer\/query$/;
var SAMPLE_PATH = /^\/image\/rest\/services\/GESDISC\/GPM_3IMERGHHE\/ImageServer\/getSamples$/;
var QUERY_POLICY = Object.freeze({
  id: "nasa-gpm-imerg-early",
  hosts: Object.freeze([HOST]),
  paths: Object.freeze([QUERY_PATH]),
  contentTypes: Object.freeze(["application/json"]),
  timeoutMs: 16e3,
  maxBytes: 5e5,
  refreshMs: 5 * 6e4,
  freshMs: 15 * 6e4,
  staleMs: 0
});
var SAMPLE_POLICY = Object.freeze({
  id: "nasa-gpm-imerg-early",
  hosts: Object.freeze([HOST]),
  paths: Object.freeze([SAMPLE_PATH]),
  contentTypes: Object.freeze(["application/json"]),
  timeoutMs: 12e3,
  maxBytes: 5e5,
  refreshMs: 5 * 6e4,
  freshMs: 15 * 6e4,
  staleMs: 0
});
function record2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
__name(record2, "record");
function finite(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!normalized || /^(?:nodata|null|nan)$/i.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
__name(finite, "finite");
function unavailableFrom(result) {
  return Object.freeze({
    value: null,
    status: result.status,
    fetchedAt: result.fetchedAt,
    observedAt: result.observedAt,
    errorClass: result.errorClass,
    fromCache: result.fromCache
  });
}
__name(unavailableFrom, "unavailableFrom");
async function fetchNasaGpm(baseUrl) {
  const queryUrl = new URL(`${baseUrl.replace(/\/$/, "")}/query`);
  queryUrl.searchParams.set("where", "1=1");
  queryUrl.searchParams.set("outFields", "OBJECTID,StdTime");
  queryUrl.searchParams.set("orderByFields", "StdTime DESC");
  queryUrl.searchParams.set("resultRecordCount", "1");
  queryUrl.searchParams.set("returnGeometry", "false");
  queryUrl.searchParams.set("f", "json");
  const latest = await fetchProvider(queryUrl.toString(), QUERY_POLICY, (body) => {
    const payload = JSON.parse(body);
    if (!record2(payload) || record2(payload.error)) throw new Error("NASA_QUERY_ERROR");
    const feature = Array.isArray(payload.features) ? payload.features[0] : null;
    const attributes = record2(feature) && record2(feature.attributes) ? feature.attributes : null;
    const objectId = finite(attributes?.objectid ?? attributes?.OBJECTID);
    const stdTime = finite(attributes?.stdtime ?? attributes?.StdTime);
    if (objectId === null || !Number.isInteger(objectId) || objectId <= 0 || stdTime === null || stdTime < 1e12) {
      throw new Error("NASA_QUERY_SCHEMA");
    }
    const observedAt = new Date(stdTime).toISOString();
    return { value: Object.freeze({ objectId, observedAt }), observedAt };
  });
  if (!latest.value) return unavailableFrom(latest);
  const sampleUrl = new URL(`${baseUrl.replace(/\/$/, "")}/getSamples`);
  sampleUrl.searchParams.set("geometry", JSON.stringify({ x: -60.7, y: -31.63, spatialReference: { wkid: 4326 } }));
  sampleUrl.searchParams.set("geometryType", "esriGeometryPoint");
  sampleUrl.searchParams.set("returnFirstValueOnly", "true");
  sampleUrl.searchParams.set("outFields", "OBJECTID,StdTime");
  sampleUrl.searchParams.set("mosaicRule", JSON.stringify({
    mosaicMethod: "esriMosaicLockRaster",
    lockRasterIds: [latest.value.objectId]
  }));
  sampleUrl.searchParams.set("f", "json");
  const raster = latest.value;
  return fetchProvider(sampleUrl.toString(), SAMPLE_POLICY, (body) => {
    const payload = JSON.parse(body);
    if (!record2(payload) || record2(payload.error) || !Array.isArray(payload.samples) || payload.samples.length === 0) {
      throw new Error("NASA_SAMPLE_MISSING");
    }
    const sample = payload.samples.find(record2);
    if (!sample) throw new Error("NASA_SAMPLE_SCHEMA");
    const rasterId = finite(sample.rasterId ?? sample.rasterID ?? (record2(sample.attributes) ? sample.attributes.objectid ?? sample.attributes.OBJECTID : null));
    if (rasterId !== null && rasterId !== raster.objectId) throw new Error("NASA_SAMPLE_RASTER_MISMATCH");
    const value = finite(sample.value ?? sample.pixelValue ?? sample.values);
    if (value === null) throw new Error("NASA_SAMPLE_VALUE_MISSING");
    const latencyMinutes = Math.max(0, Math.round((Date.now() - Date.parse(raster.observedAt)) / 6e4));
    return {
      value: Object.freeze({
        observedAt: raster.observedAt,
        value,
        latencyMinutes,
        resolution: "0,1\xB0 / 30 minutos",
        uncertainty: "IMERG Early V07 es una estimaci\xF3n satelital suplementaria; no reemplaza pluvi\xF3metros ni niveles hidrom\xE9tricos locales.",
        sourceUrl: sampleUrl.toString(),
        objectId: raster.objectId
      }),
      observedAt: raster.observedAt
    };
  });
}
__name(fetchNasaGpm, "fetchNasaGpm");

// src/worker/providers/ports.ts
var POLICY = Object.freeze({
  id: "ports-hydrometers",
  hosts: Object.freeze(["www.argentina.gob.ar", "argentina.gob.ar", "api.argentina.gob.ar"]),
  paths: Object.freeze([/^\/.*(?:hidrometr|hydrometr|puertos).*\.(?:json|geojson)$/i, /^\/api\/.*(?:hidrometr|puertos).*$/i]),
  contentTypes: Object.freeze(["application/json", "application/geo+json"]),
  maxBytes: 15e5
});
function records(value) {
  const output = [];
  const visit = /* @__PURE__ */ __name((node, depth) => {
    if (depth > 7 || output.length >= 1e3) return;
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof node !== "object" || node === null) return;
    const record3 = node;
    if (["altura", "nivel", "value", "metres"].some((key) => key in record3)) output.push(record3);
    Object.values(record3).forEach((item) => visit(item, depth + 1));
  }, "visit");
  visit(value, 0);
  return output;
}
__name(records, "records");
function metres(record3) {
  for (const key of ["altura", "nivel", "value", "metres"]) {
    const raw = record3[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(",", ".")) : Number.NaN;
    if (Number.isFinite(value) && Math.abs(value) < 100) return value;
  }
  return null;
}
__name(metres, "metres");
function observed(record3) {
  for (const key of ["fecha", "timestamp", "observed_at", "date"]) {
    const raw = record3[key];
    if (typeof raw === "string" && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  }
  return null;
}
__name(observed, "observed");
function fetchPortsHydrometers(url) {
  return fetchProvider(url, POLICY, (body) => {
    const readings = records(JSON.parse(body)).map((record3) => {
      const value = metres(record3);
      const observedAt2 = observed(record3);
      const station = typeof record3.estacion === "string" ? record3.estacion : typeof record3.station === "string" ? record3.station : typeof record3.nombre === "string" ? record3.nombre : null;
      if (value === null || !observedAt2 || !station) return null;
      return Object.freeze({ station: station.slice(0, 160), observedAt: observedAt2, metres: value });
    }).filter((item) => item !== null);
    const observedAt = readings.map((item) => item.observedAt).sort().at(-1);
    if (!observedAt) throw new Error("PORTS_SCHEMA_MISMATCH");
    return { value: Object.freeze(readings.slice(-200)), observedAt };
  });
}
__name(fetchPortsHydrometers, "fetchPortsHydrometers");

// src/worker/providers/smn.ts
var CAP = Object.freeze({
  id: "smn-alerts",
  hosts: Object.freeze(["ssl.smn.gob.ar"]),
  paths: Object.freeze([/^\/feeds\/CAP\/rss_alertaCAP_nuevo_\d{4}\.xml$/]),
  contentTypes: Object.freeze(["application/xml", "text/xml", "application/rss+xml"]),
  maxBytes: 15e5,
  refreshMs: 5 * 6e4,
  freshMs: 30 * 6e4,
  staleMs: 12 * 60 * 6e4
});
function decode(value) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
__name(decode, "decode");
function tag(xml, name) {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`, "i"));
  return match?.[1] ? decode(match[1]) : null;
}
__name(tag, "tag");
function firstDate(...values) {
  for (const value of values) {
    if (value && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return null;
}
__name(firstDate, "firstDate");
function lifecycle(title, messageType, expires, sent, now) {
  if (/cancel|cancelad|cesad|sin efecto|finaliz/i.test(`${title} ${messageType}`)) return "CANCELLED";
  if (expires && Date.parse(expires) <= now.getTime()) return "EXPIRED";
  if (!expires && now.getTime() - Date.parse(sent) > 12 * 60 * 6e4) return "EXPIRED";
  if (/update|actualiz/i.test(messageType)) return "UPDATED";
  if (expires || /alerta|advertencia|aviso/i.test(title)) return "ACTIVE";
  return "UNKNOWN";
}
__name(lifecycle, "lifecycle");
function santaFeScope(...values) {
  const combined = values.join(" ");
  return /(?:^|\b)(?:santa\s*fe|centro de santa fe|sur de santa fe|norte de santa fe|litoral)(?:\b|$)/i.test(combined);
}
__name(santaFeScope, "santaFeScope");
function fetchSmnAlerts(url) {
  return fetchProvider(url, CAP, (body) => {
    if (!/<rss\b|<feed\b/i.test(body)) throw new Error("SMN_CAP_PARSE");
    const now = /* @__PURE__ */ new Date();
    const output = [];
    const entries = [...body.matchAll(/<item\b[\s\S]*?<\/item>/gi), ...body.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)];
    for (const match of entries) {
      const xml = match[0];
      const headline = tag(xml, "headline") ?? tag(xml, "title");
      const sent = firstDate(tag(xml, "sent"), tag(xml, "pubDate"), tag(xml, "updated"), tag(xml, "published"));
      if (!headline || !sent) continue;
      const identifier = tag(xml, "identifier") ?? tag(xml, "guid") ?? `smn:${sent}:${headline.slice(0, 80)}`;
      const description = tag(xml, "description") ?? tag(xml, "summary") ?? "";
      const area = tag(xml, "areaDesc") ?? tag(xml, "area") ?? headline;
      const candidateUrl = tag(xml, "link");
      const sourceUrl = candidateUrl && (() => {
        try {
          return new URL(candidateUrl).protocol === "https:";
        } catch {
          return false;
        }
      })() ? candidateUrl : url;
      const messageType = tag(xml, "msgType") ?? tag(xml, "messageType") ?? "Alert";
      const expires = firstDate(tag(xml, "expires"));
      const alertLifecycle = lifecycle(headline, messageType, expires, sent, now);
      output.push(Object.freeze({
        identifier: identifier.slice(0, 240),
        sender: (tag(xml, "senderName") ?? tag(xml, "sender") ?? "Servicio Meteorol\xF3gico Nacional").slice(0, 180),
        sent,
        status: (tag(xml, "status") ?? "Actual").slice(0, 80),
        messageType: messageType.slice(0, 80),
        scope: (tag(xml, "scope") ?? "Public").slice(0, 80),
        category: (tag(xml, "category") ?? "Met").slice(0, 80),
        event: (tag(xml, "event") ?? headline).slice(0, 240),
        urgency: (tag(xml, "urgency") ?? "Unknown").slice(0, 80),
        severity: (tag(xml, "severity") ?? "Unknown").slice(0, 80),
        certainty: (tag(xml, "certainty") ?? "Unknown").slice(0, 80),
        effective: firstDate(tag(xml, "effective")),
        onset: firstDate(tag(xml, "onset")),
        expires,
        headline: headline.slice(0, 320),
        description: description.slice(0, 1600),
        instruction: (tag(xml, "instruction") ?? "").slice(0, 1200),
        area: area.slice(0, 500),
        sourceUrl: sourceUrl.slice(0, 1e3),
        lifecycle: alertLifecycle,
        appliesToSantaFe: santaFeScope(headline, description, area)
      }));
    }
    const channel = firstDate(tag(body, "lastBuildDate"), tag(body, "updated"));
    const observedAt = output.map((alert) => alert.sent).sort().at(-1) ?? channel;
    if (!observedAt) throw new Error("SMN_CAP_TIMESTAMP_MISSING");
    return { value: Object.freeze(output.slice(0, 100)), observedAt };
  });
}
__name(fetchSmnAlerts, "fetchSmnAlerts");
function fetchSmnObservations(url) {
  void url;
  return Promise.reject(new Error("SMN_OBSERVATIONS_CREDENTIAL_REQUIRED"));
}
__name(fetchSmnObservations, "fetchSmnObservations");

// src/worker/live-data.ts
var INA_BASE = "https://alerta.ina.gob.ar/a5/getObservaciones";
var LIVE_DATA_CACHE_VERSION = "public-safety-015-v1";
function defaultSmnCapUrl(now) {
  return `https://ssl.smn.gob.ar/feeds/CAP/rss_alertaCAP_nuevo_${now.getUTCFullYear()}.xml`;
}
__name(defaultSmnCapUrl, "defaultSmnCapUrl");
var NASA_GPM_URL = "https://gis.earthdata.nasa.gov/image/rest/services/GESDISC/GPM_3IMERGHHE/ImageServer";
var PROVINCE_WARNING_URL = "https://www.santafe.gov.ar/proteccioncivil/alertatemprana";
var COBEM_URL = "https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/cobem/";
var FRESH_MEASUREMENT_MS = 6 * 60 * 6e4;
var DELAYED_MEASUREMENT_MS = 24 * 60 * 6e4;
var SNAPSHOT_CACHE_MS = 6e4;
var STATIONS = Object.freeze([
  Object.freeze({
    id: "parana-santa-fe",
    label: "R\xEDo Paran\xE1 \u2014 Santa Fe",
    watercourse: "R\xEDo Paran\xE1",
    stationName: "Santa Fe",
    stationSubtitle: "Estaci\xF3n hidrom\xE9trica Santa Fe",
    stationCode: "30",
    seriesId: "30",
    low: 2,
    alert: 5.3,
    evacuation: 5.7
  }),
  Object.freeze({
    id: "salado-santo-tome",
    label: "R\xEDo Salado \u2014 Santo Tom\xE9",
    watercourse: "R\xEDo Salado",
    stationName: "Santo Tom\xE9",
    stationSubtitle: "Estaci\xF3n hidrom\xE9trica Santo Tom\xE9",
    stationCode: "1679",
    seriesId: "3044",
    low: null,
    alert: 4.7,
    evacuation: null
  })
]);
var ORGANIZATIONS = Object.freeze([
  Object.freeze({ id: "ina", name: "Instituto Nacional del Agua", official: true, url: "https://www.argentina.gob.ar/ina" }),
  Object.freeze({ id: "smn", name: "Servicio Meteorol\xF3gico Nacional", official: true, url: "https://www.smn.gob.ar/" }),
  Object.freeze({ id: "santa-fe-province", name: "Gobierno de la Provincia de Santa Fe \xB7 Protecci\xF3n Civil", official: true, url: PROVINCE_WARNING_URL }),
  Object.freeze({ id: "santa-fe-city", name: "Municipalidad de Santa Fe \xB7 COBEM", official: true, url: COBEM_URL }),
  Object.freeze({ id: "ports-agency", name: "Agencia Nacional de Puertos y Navegaci\xF3n", official: true, url: "https://www.argentina.gob.ar/economia/agencia-nacional-de-puertos-y-navegacion/hidrometros" }),
  Object.freeze({ id: "nasa", name: "NASA", official: true, url: "https://gpm.nasa.gov/data/imerg" })
]);
var inFlight = /* @__PURE__ */ new Map();
function cacheApi2() {
  if (typeof caches === "undefined") return null;
  return caches.default ?? null;
}
__name(cacheApi2, "cacheApi");
function optionalHttpsConfigUrl(value, label) {
  const normalized = value?.trim();
  if (!normalized) return void 0;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new TypeError(`${label} debe ser una URL HTTPS v\xE1lida`);
  }
  if (parsed.protocol !== "https:") throw new TypeError(`${label} debe usar HTTPS`);
  return normalized;
}
__name(optionalHttpsConfigUrl, "optionalHttpsConfigUrl");
async function configKey(env) {
  const config = JSON.stringify({
    version: LIVE_DATA_CACHE_VERSION,
    waterMlParana: optionalHttpsConfigUrl(env.INA_WATERML_PARANA_URL, "INA_WATERML_PARANA_URL") ?? null,
    waterMlSalado: optionalHttpsConfigUrl(env.INA_WATERML_SALADO_URL, "INA_WATERML_SALADO_URL") ?? null,
    ports: optionalHttpsConfigUrl(env.PORTS_HYDROMETER_JSON_URL, "PORTS_HYDROMETER_JSON_URL") ?? null,
    smnObservations: optionalHttpsConfigUrl(env.SMN_OBSERVATIONS_JSON_URL, "SMN_OBSERVATIONS_JSON_URL") ?? null,
    smnAlerts: optionalHttpsConfigUrl(env.SMN_ALERTS_JSON_URL, "SMN_ALERTS_JSON_URL") ?? null
  });
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config)));
  return Array.from(bytes.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(configKey, "configKey");
async function readSnapshotCache(key, now) {
  const cache = cacheApi2();
  if (!cache) return null;
  const response = await cache.match(new Request(`https://cache.sos-sf.invalid/snapshot/${key}`));
  if (!response) return null;
  try {
    const item = await response.json();
    if (now.getTime() - Date.parse(item.cachedAt) > SNAPSHOT_CACHE_MS) return null;
    if (Array.isArray(item.providerHealth)) restoreProviderHealth(item.providerHealth);
    return item.snapshot;
  } catch {
    return null;
  }
}
__name(readSnapshotCache, "readSnapshotCache");
async function writeSnapshotCache(key, snapshot) {
  const cache = cacheApi2();
  if (!cache) return;
  const item = { cachedAt: (/* @__PURE__ */ new Date()).toISOString(), snapshot, providerHealth: providerHealth() };
  await cache.put(
    new Request(`https://cache.sos-sf.invalid/snapshot/${key}`),
    new Response(JSON.stringify(item), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=60" } })
  );
}
__name(writeSnapshotCache, "writeSnapshotCache");
function thresholds(station) {
  const items = [];
  if (station.low !== null) items.push(Object.freeze({ id: "NORMAL", label: "Referencia inferior", metres: station.low }));
  items.push(Object.freeze({ id: "ALERTA", label: "Nivel de alerta de referencia", metres: station.alert }));
  if (station.evacuation !== null) items.push(Object.freeze({ id: "EVACUACION", label: "Nivel de evacuaci\xF3n de referencia", metres: station.evacuation }));
  return Object.freeze(items.sort((left, right) => left.metres - right.metres));
}
__name(thresholds, "thresholds");
function systemState(system) {
  if (!system.available || system.currentMetres === null || system.freshness === "DESACTUALIZADO" || system.freshness === "NO_DISPONIBLE") return "UNKNOWN";
  const evacuation = system.thresholds.find((item) => item.id === "EVACUACION");
  const alert = system.thresholds.find((item) => item.id === "ALERTA");
  const watch = system.thresholds.find((item) => item.id === "VIGILANCIA");
  if (evacuation && system.currentMetres >= evacuation.metres) return "UMBRAL_EVACUACION_ALCANZADO";
  if (alert && system.currentMetres >= alert.metres) return "ALERTA";
  if (watch && system.currentMetres >= watch.metres) return "VIGILANCIA";
  return "NORMAL";
}
__name(systemState, "systemState");
function stateLabel(state) {
  if (state === "EVACUACION_OFICIAL") return "Existe una orden oficial vigente";
  if (state === "UMBRAL_EVACUACION_ALCANZADO") return "Nivel por encima del umbral de evacuaci\xF3n de referencia; no equivale a una orden oficial";
  if (state === "ALERTA") return "Nivel por encima del umbral de alerta de referencia";
  if (state === "VIGILANCIA") return "Nivel por encima del umbral de vigilancia de referencia";
  if (state === "NORMAL") return "Nivel por debajo del umbral de alerta";
  return "No hay una medici\xF3n vigente suficiente para clasificar el nivel";
}
__name(stateLabel, "stateLabel");
function sourceStatus(result) {
  return result.status === "FRESH" ? "FRESH" : result.status === "STALE" ? "STALE" : "UNAVAILABLE";
}
__name(sourceStatus, "sourceStatus");
function sourceBase(input) {
  const preliminary = {
    id: input.id,
    name: input.name,
    kind: input.kind,
    status: input.status,
    observedAt: input.observedAt,
    fetchedAt: input.fetchedAt,
    lastCheckedAt: input.fetchedAt,
    validUntil: input.validUntil,
    contribution: input.contribution,
    official: input.official ?? true,
    ...input.url?.trim() ? { url: input.url.trim() } : {},
    connected: input.connected,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    feedId: input.id,
    feedName: input.feedName,
    classification: input.classification,
    freshness: input.freshness,
    limitations: input.limitations,
    determinesPrimaryState: input.determinesPrimaryState,
    qualityNote: input.qualityNote,
    latencyMinutes: input.latencyMinutes,
    resolution: input.resolution,
    uncertainty: input.uncertainty,
    instantRateMmPerHour: input.instantRateMmPerHour
  };
  return Object.freeze({ ...preliminary, classification: preliminary.classification ?? classificationForSource(preliminary) });
}
__name(sourceBase, "sourceBase");
async function stationSystem(station, now) {
  const start = new Date(now.getTime() - 180 * 24 * 36e5).toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 24 * 36e5).toISOString().slice(0, 10);
  const endpoint = new URL(INA_BASE);
  endpoint.searchParams.set("tipo", "puntual");
  endpoint.searchParams.set("series_id", station.seriesId);
  endpoint.searchParams.set("timestart", start);
  endpoint.searchParams.set("timeend", end);
  const sourceUrl = endpoint.toString();
  const result = await fetchInaSeries(sourceUrl, `ina-rest-${station.seriesId}`, station.seriesId);
  const points = sanitizeMeasuredRiverPoints(result.value ?? Object.freeze([]), now);
  const latest = points.at(-1);
  const freshness2 = freshnessFor(latest?.at, now, FRESH_MEASUREMENT_MS, DELAYED_MEASUREMENT_MS);
  const status = dataStatusForFreshness(freshness2);
  const validUntil = latest ? new Date(Date.parse(latest.at) + DELAYED_MEASUREMENT_MS).toISOString() : result.fetchedAt;
  const system = Object.freeze({
    id: station.id,
    label: station.label,
    watercourse: station.watercourse,
    stationName: station.stationName,
    stationCode: station.stationCode,
    available: Boolean(latest),
    dataStatus: status,
    freshness: freshness2,
    currentMetres: latest?.metres ?? null,
    observedAt: latest?.at ?? null,
    fetchedAt: result.fetchedAt,
    validUntil,
    sourceId: `ina-rest-${station.seriesId}`,
    sourceName: "Instituto Nacional del Agua \xB7 INA REST",
    points,
    thresholds: thresholds(station),
    trend: deriveHydrometricTrend(points, now),
    delta1h: temporalDelta(points, 1, now).value,
    delta6h: temporalDelta(points, 6, now).value,
    delta24h: temporalDelta(points, 24, now).value,
    delta72h: temporalDelta(points, 72, now).value,
    delta7d: temporalDelta(points, 168, now).value
  });
  const validated = latest?.quality === "PROVIDER_VALIDATED";
  const source = sourceBase({
    id: system.sourceId,
    name: `INA REST \xB7 ${station.label}`,
    organizationId: "ina",
    organizationName: "Instituto Nacional del Agua",
    feedName: `INA REST \xB7 ${station.watercourse}, estaci\xF3n ${station.stationName}`,
    kind: "OFFICIAL_OBSERVATION",
    status: status === "LIVE" ? "FRESH" : status === "STALE" ? "STALE" : "UNAVAILABLE",
    observedAt: latest?.at ?? result.fetchedAt,
    fetchedAt: result.fetchedAt,
    validUntil,
    contribution: `${station.stationSubtitle}; serie ${station.seriesId}.`,
    url: sourceUrl,
    connected: Boolean(latest),
    freshness: freshness2,
    determinesPrimaryState: true,
    limitations: "INA REST e INA WaterML son dos transportes del mismo organismo y no cuentan como corroboraciones independientes.",
    qualityNote: validated ? "La fuente marc\xF3 la lectura como validada." : "Lectura operativa publicada; puede estar sujeta a revisi\xF3n del organismo."
  });
  return { system, source };
}
__name(stationSystem, "stationSystem");
function blockedSource(input) {
  return sourceBase({
    id: input.id,
    name: input.name,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    feedName: input.feedName,
    kind: input.kind,
    status: "UNAVAILABLE",
    observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
    fetchedAt: input.now.toISOString(),
    validUntil: (/* @__PURE__ */ new Date(0)).toISOString(),
    contribution: input.contribution,
    url: input.url,
    connected: false,
    classification: input.classification,
    freshness: "NO_DISPONIBLE",
    limitations: input.contribution,
    determinesPrimaryState: false
  });
}
__name(blockedSource, "blockedSource");
async function waterMlSource(url, id, feedName, now) {
  const result = await fetchInaWaterMl(url, id);
  const freshness2 = freshnessFor(result.observedAt, now, FRESH_MEASUREMENT_MS, DELAYED_MEASUREMENT_MS);
  const observedAt = result.observedAt ?? result.fetchedAt;
  return sourceBase({
    id,
    name: feedName,
    organizationId: "ina",
    organizationName: "Instituto Nacional del Agua",
    feedName,
    kind: "OFFICIAL_OBSERVATION",
    status: sourceStatus(result),
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + DELAYED_MEASUREMENT_MS).toISOString(),
    contribution: result.value ? `${result.value.length} lecturas WaterML interpretadas.` : "WaterML no disponible o incompatible.",
    url,
    connected: result.value !== null,
    freshness: freshness2,
    determinesPrimaryState: false,
    limitations: "Transporte alternativo del INA. No se cuenta como corroboraci\xF3n independiente del feed REST del mismo organismo.",
    qualityNote: "La interpretaci\xF3n respeta timestamps del proveedor y no reemplaza estaciones de forma silenciosa."
  });
}
__name(waterMlSource, "waterMlSource");
async function portsSource(url, now) {
  if (!url) return blockedSource({
    id: "ports-hydrometers",
    name: "Hidr\xF3metros portuarios",
    organizationId: "ports-agency",
    organizationName: "Agencia Nacional de Puertos y Navegaci\xF3n",
    feedName: "Hidr\xF3metros portuarios",
    kind: "OFFICIAL_OBSERVATION",
    classification: "BLOCKED_NO_MACHINE_ENDPOINT",
    contribution: "No se confirm\xF3 un endpoint oficial estable legible por m\xE1quina; se conserva el enlace humano de verificaci\xF3n.",
    url: "https://www.argentina.gob.ar/economia/agencia-nacional-de-puertos-y-navegacion/hidrometros",
    now
  });
  const result = await fetchPortsHydrometers(url);
  const observedAt = result.observedAt ?? result.fetchedAt;
  const freshness2 = freshnessFor(result.observedAt, now, FRESH_MEASUREMENT_MS, DELAYED_MEASUREMENT_MS);
  return sourceBase({
    id: "ports-hydrometers",
    name: "Hidr\xF3metros portuarios",
    organizationId: "ports-agency",
    organizationName: "Agencia Nacional de Puertos y Navegaci\xF3n",
    feedName: "Hidr\xF3metros portuarios",
    kind: "OFFICIAL_OBSERVATION",
    status: sourceStatus(result),
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + DELAYED_MEASUREMENT_MS).toISOString(),
    contribution: result.value ? `${result.value.length} lecturas interpretadas.` : "Fuente no disponible o esquema incompatible.",
    url,
    connected: result.value !== null,
    freshness: freshness2,
    determinesPrimaryState: false,
    limitations: "S\xF3lo se utiliza cuando existe estaci\xF3n, nivel y timestamp verificables.",
    qualityNote: "No se sustituyen estaciones de forma silenciosa."
  });
}
__name(portsSource, "portsSource");
async function smnObservationSource(url, now) {
  if (!url) return blockedSource({
    id: "smn-observations",
    name: "Observaciones meteorol\xF3gicas SMN",
    organizationId: "smn",
    organizationName: "Servicio Meteorol\xF3gico Nacional",
    feedName: "Observaciones meteorol\xF3gicas SMN",
    kind: "OFFICIAL_OBSERVATION",
    classification: "BLOCKED_CREDENTIAL",
    contribution: "La integraci\xF3n requiere una credencial oficial no disponible. No se extraen tokens desde HTML ni se elude autenticaci\xF3n.",
    url: "https://www.smn.gob.ar/descarga-de-datos",
    now
  });
  try {
    const result = await fetchSmnObservations(url);
    const observedAt = result.observedAt ?? result.fetchedAt;
    const freshness2 = freshnessFor(result.observedAt, now, 60 * 6e4, 6 * 60 * 6e4);
    return sourceBase({
      id: "smn-observations",
      name: "Observaciones meteorol\xF3gicas SMN",
      organizationId: "smn",
      organizationName: "Servicio Meteorol\xF3gico Nacional",
      feedName: "Observaciones meteorol\xF3gicas SMN",
      kind: "OFFICIAL_OBSERVATION",
      status: sourceStatus(result),
      observedAt,
      fetchedAt: result.fetchedAt,
      validUntil: new Date(Date.parse(observedAt) + 6 * 60 * 6e4).toISOString(),
      contribution: result.value ? "Observaci\xF3n meteorol\xF3gica interpretada." : "Fuente no disponible.",
      url,
      connected: Boolean(result.value),
      freshness: freshness2,
      determinesPrimaryState: false,
      limitations: "No determina por s\xED sola el estado principal de alertas o hidrometr\xEDa."
    });
  } catch {
    return blockedSource({
      id: "smn-observations",
      name: "Observaciones meteorol\xF3gicas SMN",
      organizationId: "smn",
      organizationName: "Servicio Meteorol\xF3gico Nacional",
      feedName: "Observaciones meteorol\xF3gicas SMN",
      kind: "OFFICIAL_OBSERVATION",
      classification: "BLOCKED_CREDENTIAL",
      contribution: "La credencial configurada no permiti\xF3 obtener un contrato de datos utilizable.",
      url,
      now
    });
  }
}
__name(smnObservationSource, "smnObservationSource");
async function smnAlertFeed(url, now) {
  const result = await fetchSmnAlerts(url);
  const observedAt = result.observedAt ?? result.fetchedAt;
  const freshness2 = freshnessFor(result.observedAt, now, 30 * 6e4, 12 * 60 * 6e4);
  const source = sourceBase({
    id: "smn-alerts",
    name: "Alertas oficiales SMN \xB7 CAP",
    organizationId: "smn",
    organizationName: "Servicio Meteorol\xF3gico Nacional",
    feedName: "Alertas oficiales SMN \xB7 CAP",
    kind: "OFFICIAL_ALERT",
    status: sourceStatus(result),
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + 12 * 60 * 6e4).toISOString(),
    contribution: result.value ? `${result.value.length} avisos o alertas normalizados con sem\xE1ntica CAP.` : "El canal de alertas no respondi\xF3 con un contenido utilizable.",
    url,
    connected: result.value !== null,
    freshness: freshness2,
    determinesPrimaryState: true,
    limitations: "La ausencia de alertas s\xF3lo se comunica cuando este feed est\xE1 vigente y utilizable."
  });
  return { source, alerts: Object.freeze((result.value ?? []).map((alert) => Object.freeze({ ...alert }))) };
}
__name(smnAlertFeed, "smnAlertFeed");
async function nasaSource(now) {
  const result = await fetchNasaGpm(NASA_GPM_URL);
  const connected = result.value !== null && Number.isFinite(result.value.value) && result.value.value >= 0 && Number.isFinite(Date.parse(result.value.observedAt));
  const observedAt = connected ? result.value.observedAt : result.fetchedAt;
  const freshness2 = connected ? freshnessFor(observedAt, now, 3 * 60 * 6e4, 12 * 60 * 6e4) : "NO_DISPONIBLE";
  return sourceBase({
    id: "nasa-gpm-imerg-early",
    name: "NASA GPM IMERG Early",
    organizationId: "nasa",
    organizationName: "NASA",
    feedName: "GPM IMERG Early",
    kind: "SATELLITE_OBSERVATION",
    status: connected ? sourceStatus(result) : "UNAVAILABLE",
    observedAt,
    fetchedAt: result.fetchedAt,
    validUntil: new Date(Date.parse(observedAt) + 12 * 60 * 6e4).toISOString(),
    contribution: connected ? `Muestra satelital v\xE1lida en Santa Fe: ${result.value.value.toFixed(2)} mm/h.` : `No se obtuvo una muestra local num\xE9rica v\xE1lida (${result.errorClass ?? "SIN_MUESTRA"}).`,
    url: connected ? result.value.sourceUrl : `${NASA_GPM_URL}/query`,
    connected,
    classification: "SUPPLEMENTARY",
    freshness: freshness2,
    determinesPrimaryState: false,
    limitations: "Estimaci\xF3n satelital suplementaria; no reemplaza observaciones oficiales locales ni determina el estado principal.",
    latencyMinutes: connected ? result.value.latencyMinutes : void 0,
    resolution: connected ? result.value.resolution : "0,1\xB0 / 30 minutos",
    uncertainty: connected ? result.value.uncertainty : "Sin muestra v\xE1lida; no aporta un dato local.",
    instantRateMmPerHour: connected ? result.value.value : void 0,
    official: false
  });
}
__name(nasaSource, "nasaSource");
function humanVerificationSources(now) {
  return Object.freeze([
    blockedSource({
      id: "province-early-warning-page",
      name: "Sistema de Alerta Temprana provincial",
      organizationId: "santa-fe-province",
      organizationName: "Gobierno de la Provincia de Santa Fe \xB7 Protecci\xF3n Civil",
      feedName: "Canal humano de verificaci\xF3n provincial",
      kind: "OFFICIAL_ALERT",
      classification: "BLOCKED_NO_MACHINE_ENDPOINT",
      contribution: "P\xE1gina oficial de consulta humana. No se encontr\xF3 un feed p\xFAblico estable para automatizar sin scraping fr\xE1gil.",
      url: PROVINCE_WARNING_URL,
      now
    }),
    blockedSource({
      id: "cobem-public-page",
      name: "COBEM \xB7 Gesti\xF3n de Riesgo",
      organizationId: "santa-fe-city",
      organizationName: "Municipalidad de Santa Fe \xB7 COBEM",
      feedName: "Canal humano de verificaci\xF3n municipal",
      kind: "OFFICIAL_ALERT",
      classification: "BLOCKED_NO_MACHINE_ENDPOINT",
      contribution: "P\xE1gina oficial y tel\xE9fonos de emergencia. No se presenta como feed autom\xE1tico.",
      url: COBEM_URL,
      now
    })
  ]);
}
__name(humanVerificationSources, "humanVerificationSources");
function highestState(systems) {
  const states = systems.map(systemState);
  for (const confirmed of ["EVACUACION_OFICIAL", "UMBRAL_EVACUACION_ALCANZADO", "ALERTA", "VIGILANCIA"]) {
    if (states.includes(confirmed)) return confirmed;
  }
  if (states.includes("UNKNOWN")) return "UNKNOWN";
  return states.includes("NORMAL") ? "NORMAL" : "UNKNOWN";
}
__name(highestState, "highestState");
function alertAction(status, alerts) {
  if (status === "ALERTA_OFICIAL_ACTIVA") {
    const active = alerts.find((alert) => alert.appliesToSantaFe && (alert.lifecycle === "ACTIVE" || alert.lifecycle === "UPDATED"));
    return active?.instruction || "Consult\xE1 el aviso oficial vigente y segu\xED las indicaciones del organismo emisor.";
  }
  if (status === "SIN_ALERTAS_OFICIALES_DETECTADAS") return "Revis\xE1 la vigencia y la fuente antes de tomar decisiones; la situaci\xF3n puede cambiar.";
  if (status === "VERIFICACION_DE_ALERTAS_DEGRADADA") return "Verific\xE1 directamente en el Servicio Meteorol\xF3gico Nacional y en Protecci\xF3n Civil.";
  return "Las fuentes autom\xE1ticas de alertas no est\xE1n disponibles; verific\xE1 los canales oficiales.";
}
__name(alertAction, "alertAction");
async function buildUncached(env, now) {
  if (!env.PORTS_HYDROMETER_JSON_URL) publishProviderBlock("ports-hydrometers", "OFFICIAL_MACHINE_ENDPOINT_NOT_AVAILABLE");
  if (!env.SMN_OBSERVATIONS_JSON_URL) publishProviderBlock("smn-observations", "CREDENTIAL_REQUIRED");
  const from = new Date(now.getTime() - 180 * 24 * 36e5).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 24 * 36e5).toISOString().slice(0, 10);
  const defaultWaterMl = /* @__PURE__ */ __name((series) => `https://alerta.ina.gob.ar/a5/obs/puntual/series/${series}?timestart=${from}&timeend=${to}&format=waterml2`, "defaultWaterMl");
  const waterMlParanaUrl = optionalHttpsConfigUrl(env.INA_WATERML_PARANA_URL, "INA_WATERML_PARANA_URL");
  const waterMlSaladoUrl = optionalHttpsConfigUrl(env.INA_WATERML_SALADO_URL, "INA_WATERML_SALADO_URL");
  const portsUrl = optionalHttpsConfigUrl(env.PORTS_HYDROMETER_JSON_URL, "PORTS_HYDROMETER_JSON_URL");
  const smnObservationsUrl = optionalHttpsConfigUrl(env.SMN_OBSERVATIONS_JSON_URL, "SMN_OBSERVATIONS_JSON_URL");
  const smnAlertsUrl = optionalHttpsConfigUrl(env.SMN_ALERTS_JSON_URL, "SMN_ALERTS_JSON_URL");
  const stationPromise = Promise.all(STATIONS.map((station) => stationSystem(station, now)));
  const smnAlertPromise = smnAlertFeed(smnAlertsUrl ?? defaultSmnCapUrl(now), now);
  const optionalPromise = Promise.all([
    waterMlSource(waterMlParanaUrl ?? defaultWaterMl("30"), "ina-waterml-parana", "INA WaterML \xB7 R\xEDo Paran\xE1, Santa Fe", now),
    waterMlSource(waterMlSaladoUrl ?? defaultWaterMl("3044"), "ina-waterml-salado", "INA WaterML \xB7 R\xEDo Salado, Santo Tom\xE9", now),
    portsSource(portsUrl, now),
    smnObservationSource(smnObservationsUrl, now),
    nasaSource(now)
  ]);
  const [stationResults, smnAlerts, optionalSources] = await Promise.all([stationPromise, smnAlertPromise, optionalPromise]);
  const systems = Object.freeze(stationResults.map((item) => item.system));
  const sources = Object.freeze([
    ...stationResults.map((item) => item.source),
    ...optionalSources,
    smnAlerts.source,
    ...humanVerificationSources(now)
  ]);
  const alerts = Object.freeze(smnAlerts.alerts.filter((alert) => alert.appliesToSantaFe));
  const alertStatus = alertVerificationState(smnAlerts.source, alerts);
  const primary = systems.find((item) => item.id === "parana-santa-fe" && item.available) ?? systems.find((item) => item.available);
  if (!primary) {
    return Object.freeze({
      ...unavailableSnapshot,
      id: `unavailable-${now.toISOString()}`,
      generatedAt: now.toISOString(),
      previousSnapshotAt: now.toISOString(),
      validUntil: new Date(now.getTime() + 15 * 6e4).toISOString(),
      alertStatus,
      alerts,
      sourceOrganizations: ORGANIZATIONS,
      sources,
      timeline: timelineFor(systems, alerts, sources, now),
      serviceStatus: { worker: "OPERATIONAL", api: "OPERATIONAL", checkedAt: now.toISOString(), note: "El servicio t\xE9cnico responde; esto no prueba vigencia ni ausencia de peligro." },
      systems,
      recommendedAction: alertAction(alertStatus, alerts)
    });
  }
  const freshness2 = highestFreshness(systems);
  const status = dataStatusForFreshness(freshness2);
  const state = highestState(systems);
  const delta24h = primary.delta24h;
  const direction = delta24h === null ? "UNKNOWN" : delta24h > 0.01 ? "UP" : delta24h < -0.01 ? "DOWN" : "SAME";
  const action = alertAction(alertStatus, alerts);
  const nasa = sources.find((source) => source.id === "nasa-gpm-imerg-early");
  const contradictions = Object.freeze(systems.filter((system) => system.available && system.dataStatus === "STALE").map((system) => Object.freeze({
    id: `freshness:${system.id}`,
    title: `Medici\xF3n con vigencia limitada: ${system.label}`,
    signals: Object.freeze([`Observado: ${system.observedAt ?? "sin fecha"}`, `Estado: ${system.freshness ?? "NO_DISPONIBLE"}`]),
    result: "UNKNOWN",
    explanation: "La medici\xF3n se conserva como \xFAltimo dato disponible, pero no permite inferir ausencia de riesgo."
  })));
  return Object.freeze({
    schemaVersion: "1.0",
    id: `public-safety-${now.toISOString()}`,
    mode: "LIVE",
    dataStatus: status,
    freshness: freshness2,
    generatedAt: now.toISOString(),
    previousSnapshotAt: new Date(now.getTime() - 15 * 6e4).toISOString(),
    state,
    stateLabel: stateLabel(state),
    summary: `${primary.label}: ${primary.currentMetres?.toFixed(2)} m. Se muestran por separado la observaci\xF3n, su recepci\xF3n, la vigencia y el estado de las fuentes.`,
    dominantSourceId: primary.sourceId,
    validUntil: new Date(now.getTime() + 15 * 6e4).toISOString(),
    recommendedAction: action,
    emergencyDisclaimer: "SOS Santa Fe es un servicio independiente que organiza fuentes p\xFAblicas oficiales. No reemplaza al 911, 103 ni a los organismos competentes. Un umbral num\xE9rico no constituye una orden de evacuaci\xF3n.",
    alertStatus,
    alerts,
    timeline: timelineFor(systems, alerts, sources, now),
    sourceOrganizations: ORGANIZATIONS,
    serviceStatus: Object.freeze({ worker: "OPERATIONAL", api: "OPERATIONAL", checkedAt: now.toISOString(), note: "La API est\xE1 operativa; este estado t\xE9cnico no garantiza vigencia, cobertura ni ausencia de alertas." }),
    changes: Object.freeze([{ id: "primary-24h", label: primary.label, direction, detail: delta24h === null ? "Sin comparaci\xF3n de 24 horas" : `${delta24h >= 0 ? "+" : ""}${delta24h.toFixed(2)} m en 24 horas` }]),
    systems,
    river: Object.freeze({
      systemId: primary.id,
      available: true,
      dataStatus: primary.dataStatus,
      stationName: primary.stationName,
      currentMetres: primary.currentMetres,
      delta1h: primary.delta1h,
      delta6h: primary.delta6h,
      delta24h,
      trend: primary.trend,
      observedAt: primary.observedAt ?? now.toISOString(),
      fetchedAt: primary.fetchedAt ?? now.toISOString(),
      validUntil: primary.validUntil ?? now.toISOString(),
      sourceId: primary.sourceId,
      sourceName: primary.sourceName,
      points: primary.points,
      forecastPoints: Object.freeze([]),
      thresholds: primary.thresholds
    }),
    rain: Object.freeze({
      available: false,
      dataStatus: nasa?.freshness ? dataStatusForFreshness(nasa.freshness) : "UNAVAILABLE",
      accumulated1hMm: null,
      accumulated24hMm: null,
      forecast: nasa?.connected ? "Estimaci\xF3n satelital suplementaria disponible; no se presenta como acumulado local ni pron\xF3stico." : "No hay una muestra satelital local v\xE1lida disponible.",
      observedAt: nasa?.connected ? nasa.observedAt : unavailableSnapshot.rain.observedAt,
      fetchedAt: nasa?.connected ? nasa.fetchedAt ?? nasa.lastCheckedAt ?? now.toISOString() : unavailableSnapshot.rain.fetchedAt,
      validUntil: nasa?.connected ? nasa.validUntil : unavailableSnapshot.rain.validUntil,
      sourceId: "nasa-gpm-imerg-early",
      points: Object.freeze([])
    }),
    sources,
    contradictions,
    shelters: Object.freeze([]),
    actions: Object.freeze(["Consult\xE1 la alerta oficial y su vigencia.", "Llam\xE1 al servicio de emergencias correspondiente ante peligro inmediato."]),
    messages: Object.freeze([])
  });
}
__name(buildUncached, "buildUncached");
async function buildLiveSnapshot(env, now = /* @__PURE__ */ new Date()) {
  const key = await configKey(env);
  const cached = await readSnapshotCache(key, now);
  if (cached) return cached;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const operation = buildUncached(env, now).then(async (snapshot) => {
    await writeSnapshotCache(key, snapshot);
    return snapshot;
  }).finally(() => inFlight.delete(key));
  inFlight.set(key, operation);
  return operation;
}
__name(buildLiveSnapshot, "buildLiveSnapshot");
function liveProviderHealth() {
  return providerHealth();
}
__name(liveProviderHealth, "liveProviderHealth");

// src/worker/security.ts
var SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; img-src 'self' data: blob: https://lh3.googleusercontent.com https://wms.ign.gob.ar https://aswe.santafe.gov.ar; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' https://accounts.google.com/gsi/client; connect-src 'self' https://accounts.google.com/gsi/ https://www.googleapis.com/oauth2/v3/certs; frame-src https://accounts.google.com/gsi/; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "accelerometer=(), ambient-light-sensor=(), autoplay=(), camera=(), display-capture=(), geolocation=(self), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
});
function withSecurityHeaders(response) {
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) secured.headers.set(name, value);
  return secured;
}
__name(withSecurityHeaders, "withSecurityHeaders");

// src/worker/lite.ts
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
__name(escapeHtml, "escapeHtml");
function alertHeading(snapshot) {
  if (snapshot.alertStatus === "ALERTA_OFICIAL_ACTIVA") return "Alerta oficial activa";
  if (snapshot.alertStatus === "SIN_ALERTAS_OFICIALES_DETECTADAS") return "Sin alertas oficiales detectadas";
  if (snapshot.alertStatus === "VERIFICACION_DE_ALERTAS_DEGRADADA") return "La verificaci\xF3n de alertas est\xE1 demorada";
  return "No pudimos verificar alertas ahora";
}
__name(alertHeading, "alertHeading");
function freshness(snapshot) {
  if (snapshot.mode === "OFFLINE") return "Sin conexi\xF3n";
  if (snapshot.freshness === "ACTUALIZADO") return "Al d\xEDa";
  if (snapshot.freshness === "ACTUALIZACION_DEMORADA") return "Con demora";
  if (snapshot.freshness === "DESACTUALIZADO") return "Dato desactualizado";
  return "Sin vigencia confirmada";
}
__name(freshness, "freshness");
function systemFreshness(value) {
  if (value === "ACTUALIZADO") return "Al d\xEDa";
  if (value === "ACTUALIZACION_DEMORADA") return "Con demora";
  if (value === "DESACTUALIZADO") return "Desactualizado";
  return "No disponible";
}
__name(systemFreshness, "systemFreshness");
function sourceAvailability(value) {
  if (value === "OPERATIONAL_FRESH") return "Disponible y vigente";
  if (value === "OPERATIONAL_STALE") return "Disponible con demora";
  if (value === "SUPPLEMENTARY") return "Informaci\xF3n complementaria";
  if (value === "BLOCKED_CREDENTIAL") return "Requiere acceso oficial";
  if (value === "BLOCKED_NO_MACHINE_ENDPOINT") return "Consulta manual";
  if (value === "REJECTED_UNSAFE") return "No utilizado por seguridad";
  if (value === "RETIRED") return "Retirado";
  return "Disponibilidad limitada";
}
__name(sourceAvailability, "sourceAvailability");
function liteResponse(snapshot) {
  const systems = snapshot.systems ?? [];
  const alerts = (snapshot.alerts ?? []).filter((alert) => alert.appliesToSantaFe && (alert.lifecycle === "ACTIVE" || alert.lifecycle === "UPDATED"));
  const contacts = [
    ["911", "Emergencias"],
    ["103", "COBEM"],
    ["107", "Emergencias m\xE9dicas"],
    ["100", "Bomberos"],
    ["106", "Emergencias n\xE1uticas"]
  ];
  const html = `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>SOS Santa Fe \u2014 modo liviano</title><style>
  :root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102f47;background:#f3f1eb;line-height:1.55}*{box-sizing:border-box}body{margin:0;background:linear-gradient(#f8f6f1,#f3f1eb 38rem);letter-spacing:-.006em}header,main,footer{max-width:760px;margin:auto;padding:20px}header{padding-top:30px}header strong.brand{display:inline-block;padding:7px 10px;border-radius:10px;background:#0b3049;color:#fff;font-size:.78rem;letter-spacing:.08em}h1,h2,h3{color:#08283f;line-height:1.08;letter-spacing:-.035em}h1{font-size:clamp(2.1rem,8vw,3.6rem);margin:.7rem 0 .5rem}header p{max-width:620px;color:#64747d}section{background:#fffdf8;border:1px solid rgba(16,47,71,.1);border-radius:20px;padding:18px;margin:14px 0}.alert{background:#edf3f1}.alert.critical{border-color:#d8aaaa;background:#fff1ef}.alert.attention{background:#f6efe5}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.facts div{padding:11px;border-radius:13px;background:#edf3f1}.contacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px}.contacts a{display:grid;padding:12px;border:1px solid rgba(16,47,71,.16);border-radius:13px;background:#fff;text-decoration:none;text-align:center}.contacts a:first-child{background:#edf3f1}small{color:#64747d}.warning{border-left:3px solid #b66b3d;padding:10px 12px;border-radius:0 12px 12px 0;background:#f6efe5}a{color:#08736f}table{width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border:1px solid rgba(16,47,71,.1);border-radius:12px}th,td{border-bottom:1px solid rgba(16,47,71,.1);padding:9px;text-align:left;font-size:.88rem}tr:last-child td{border-bottom:0}footer{color:#64747d;font-size:.88rem}@media(max-width:420px){header,main,footer{padding:14px}header{padding-top:22px}section{padding:15px;border-radius:17px}table{display:block;overflow:auto}}
  </style></head><body><header><strong class="brand">APHORA</strong><h1>R\xEDos y alertas, en modo liviano</h1><p>La misma informaci\xF3n p\xFAblica esencial en una versi\xF3n r\xE1pida, simple y sin JavaScript.</p><p><strong>Primero: nivel, vigencia, alertas verificadas y contactos.</strong> El detalle t\xE9cnico queda disponible sin ocupar el primer plano.</p></header><main>
  <section class="alert ${snapshot.alertStatus === "ALERTA_OFICIAL_ACTIVA" ? "critical" : snapshot.alertStatus === "SIN_ALERTAS_OFICIALES_DETECTADAS" ? "" : "attention"}"><h2>${escapeHtml(alertHeading(snapshot))}</h2><p>${escapeHtml(snapshot.recommendedAction)}</p><p><strong>\xDAltima actualizaci\xF3n:</strong> ${escapeHtml(formatLocalDateTime(snapshot.generatedAt))}</p>${alerts.map((alert) => `<article><h3>${escapeHtml(alert.headline)}</h3><p><strong>\xC1rea:</strong> ${escapeHtml(alert.area)}</p><p><strong>Emitida:</strong> ${escapeHtml(formatLocalDateTime(alert.sent))} \xB7 <strong>V\xE1lida hasta:</strong> ${escapeHtml(formatLocalDateTime(alert.expires))}</p>${alert.instruction ? `<p><strong>Indicaci\xF3n del organismo:</strong> ${escapeHtml(alert.instruction)}</p>` : ""}<p><a href="${escapeHtml(alert.sourceUrl)}">Abrir alerta oficial</a></p></article>`).join("")}</section>
  <section><h2>Paran\xE1 y Salado</h2><p><strong>Vigencia general:</strong> ${escapeHtml(freshness(snapshot))}</p>${systems.length ? systems.map((system) => `<article><h3>${escapeHtml(system.label)}</h3><div class="facts"><div><small>Nivel actual</small><br><strong>${system.available && system.currentMetres !== null ? `${system.currentMetres.toFixed(2).replace(".", ",")} m` : "No disponible"}</strong></div><div><small>Observada</small><br>${escapeHtml(formatLocalDateTime(system.observedAt))}</div><div><small>Recibida</small><br>${escapeHtml(formatLocalDateTime(system.fetchedAt))}</div><div><small>Vigencia</small><br>${escapeHtml(systemFreshness(system.freshness))}</div></div><p><small>Fuente: ${escapeHtml(system.sourceName)}</small></p></article>`).join("") : "<p>No hay estaciones con una lectura utilizable.</p>"}<p><small>Una cifra o un umbral aislado no constituye una orden oficial.</small></p></section>
  <section><h2>Si necesit\xE1s actuar</h2><p>${escapeHtml(snapshot.recommendedAction)}</p><p class="warning"><strong>Un reporte no inicia un despacho de emergencia.</strong> Ante peligro inmediato llam\xE1 al servicio correspondiente.</p><div class="contacts">${contacts.map(([number, label]) => `<a href="tel:${number}"><strong>${number}</strong><span>${escapeHtml(label)}</span></a>`).join("")}</div></section>
  <section><h2>De d\xF3nde salen los datos</h2><table><thead><tr><th>Organismo / feed</th><th>Estado</th><th>Observado</th></tr></thead><tbody>${snapshot.sources.map((source) => `<tr><td>${escapeHtml(source.organizationName ?? source.name)}<br><small>${escapeHtml(source.feedName ?? source.name)}</small></td><td>${escapeHtml(sourceAvailability(source.classification))}</td><td>${escapeHtml(formatLocalDateTime(source.observedAt))}</td></tr>`).join("")}</tbody></table></section>
  </main><footer><p>${escapeHtml(snapshot.emergencyDisclaimer)}</p><p><a href="/">Volver a la versi\xF3n completa</a> \xB7 <a href="/api/health">Estado t\xE9cnico</a></p></footer></body></html>`;
  return withSecurityHeaders(new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }));
}
__name(liteResponse, "liteResponse");

// src/worker/responses.ts
function jsonResponse(data, options = {}) {
  const body = JSON.stringify({
    ok: (options.status ?? 200) < 400,
    data,
    meta: {
      schemaVersion: "1.0",
      generatedAt: options.generatedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      mode: options.mode ?? "SERVICE",
      official: false
    }
  });
  return withSecurityHeaders(new Response(body, {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": options.cacheControl ?? "public, max-age=30, stale-while-revalidate=120",
      "Vary": "Accept-Encoding"
    }
  }));
}
__name(jsonResponse, "jsonResponse");
function errorResponse(code, message2, status) {
  return jsonResponse({ error: { code, message: message2 } }, { status, cacheControl: "no-store", mode: "SERVICE" });
}
__name(errorResponse, "errorResponse");
function privateJsonResponse(data, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Pragma", "no-cache");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return withSecurityHeaders(new Response(JSON.stringify({ ok: (options.status ?? 200) < 400, data }), {
    status: options.status ?? 200,
    headers
  }));
}
__name(privateJsonResponse, "privateJsonResponse");
function privateErrorResponse(code, message2, status) {
  return privateJsonResponse({ error: { code, message: message2 } }, { status });
}
__name(privateErrorResponse, "privateErrorResponse");

// src/worker/session-store.ts
async function rotateSession(db, principal, csrfHash, now) {
  const previous = await db.prepare("SELECT id FROM auth_sessions WHERE sub = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1").bind(principal.sub).first();
  await db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE sub = ? AND revoked_at IS NULL").bind(now.toISOString(), principal.sub).run();
  await db.prepare("INSERT INTO auth_sessions (id,sub,email,role,created_at,expires_at,revoked_at,rotated_from,csrf_hash,last_seen_at) VALUES (?,?,?,?,?,?,NULL,?,?,?)").bind(principal.sessionId, principal.sub, principal.email, principal.role, now.toISOString(), principal.expiresAt, previous?.id ?? null, csrfHash, now.toISOString()).run();
  return previous?.id ?? null;
}
__name(rotateSession, "rotateSession");

// src/worker/router.ts
var PUBLIC_API_PATHS = /* @__PURE__ */ new Set(["/api/health", "/api/snapshot", "/api/sources", "/api/messages", "/api/essential-contacts", "/api/auth/config"]);
var PRIVATE_PREFIX = "/api/private/";
var AUTH_WINDOW_MS = 15 * 6e4;
var AUTH_NETWORK_LIMIT = 20;
var ESSENTIAL_CONTACTS = Object.freeze([
  Object.freeze({ id: "911", label: "Emergencias", number: "911", href: "tel:911" }),
  Object.freeze({ id: "103", label: "COBEM", number: "103", href: "tel:103" }),
  Object.freeze({ id: "107", label: "Emergencias m\xE9dicas", number: "107", href: "tel:107" }),
  Object.freeze({ id: "100", label: "Bomberos", number: "100", href: "tel:100" }),
  Object.freeze({ id: "106", label: "Emergencias n\xE1uticas", number: "106", href: "tel:106" }),
  Object.freeze({ id: "municipal", label: "Atenci\xF3n Ciudadana municipal", number: "0800-777-5000", href: "tel:08007775000" })
]);
function privateMessagingEnabled(env) {
  return env.PRIVATE_MESSAGING_ENABLED === "true" && Boolean(env.GOOGLE_CLIENT_ID && env.SESSION_SIGNING_KEY && env.SESSION_SIGNING_KEY.length >= 32 && env.MESSAGES_DB);
}
__name(privateMessagingEnabled, "privateMessagingEnabled");
function reportingEnabled(env) {
  return privateMessagingEnabled(env) && Boolean(env.REPORTS_KV);
}
__name(reportingEnabled, "reportingEnabled");
function publicMode(mode) {
  return mode === "DEMO" ? "UNAVAILABLE" : mode;
}
__name(publicMode, "publicMode");
async function publicApiResponse(pathname, env) {
  if (pathname === "/api/essential-contacts") return jsonResponse({ contacts: ESSENTIAL_CONTACTS, sources: ["https://santafeciudad.gov.ar/direccion-de-gestion-de-riesgo/cobem/", "https://www.santafe.gov.ar/index.php/web/guia/contactenosAccesible"] }, { cacheControl: "public, max-age=86400" });
  if (pathname === "/api/auth/config") {
    const enabled = privateMessagingEnabled(env);
    return jsonResponse({ enabled, reportingEnabled: reportingEnabled(env), provider: "GOOGLE_IDENTITY_SERVICES_DIRECT", googleClientId: enabled ? env.GOOGLE_CLIENT_ID : null, oneTap: false, scopes: "openid email profile", activationState: enabled ? "ACTIVE" : "REQUIRES_PROTECTED_GOOGLE_D1_CONFIGURATION" }, { cacheControl: "no-store" });
  }
  const snapshot = await buildLiveSnapshot(env);
  if (pathname === "/api/health") {
    const providers = liveProviderHealth();
    return jsonResponse({
      service: "sos-sf",
      status: "healthy",
      dataMode: "LIVE_AGGREGATION",
      privateMessaging: privateMessagingEnabled(env) ? "ENABLED" : "FEATURE_DISABLED",
      reporting: reportingEnabled(env) ? "ENABLED" : "FEATURE_DISABLED",
      snapshot: { id: snapshot.id, dataStatus: snapshot.dataStatus, freshness: snapshot.freshness, alertStatus: snapshot.alertStatus, generatedAt: snapshot.generatedAt },
      providers,
      connectedProviders: providers.filter((provider) => provider.status !== "UNAVAILABLE").map((provider) => provider.id)
    }, { cacheControl: "no-store" });
  }
  const mode = publicMode(snapshot.mode);
  if (pathname === "/api/snapshot") return jsonResponse(snapshot, { generatedAt: snapshot.generatedAt, cacheControl: "no-store", mode });
  if (pathname === "/api/sources") return jsonResponse({ snapshotId: snapshot.id, systems: snapshot.systems ?? [], sources: snapshot.sources, sourceOrganizations: snapshot.sourceOrganizations ?? [], alertStatus: snapshot.alertStatus, alerts: snapshot.alerts ?? [], timeline: snapshot.timeline ?? [], contradictions: snapshot.contradictions }, { generatedAt: snapshot.generatedAt, cacheControl: "no-store", mode });
  if (pathname === "/api/messages") return jsonResponse({ snapshotId: snapshot.id, messages: snapshot.messages, deliveryClaims: "NONE" }, { generatedAt: snapshot.generatedAt, cacheControl: "no-store", mode });
  return errorResponse("NOT_FOUND", "Ruta API inexistente", 404);
}
__name(publicApiResponse, "publicApiResponse");
async function parseJsonBody(request, maxBytes = 4096) {
  if (!(request.headers.get("Content-Type") ?? "").toLowerCase().startsWith("application/json")) throw new Error("CONTENT_TYPE_REQUIRED");
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("BODY_TOO_LARGE");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error("BODY_TOO_LARGE");
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("INVALID_JSON");
  }
}
__name(parseJsonBody, "parseJsonBody");
function requireSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) throw new Error("CSRF_ORIGIN_REJECTED");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") throw new Error("CSRF_FETCH_SITE_REJECTED");
}
__name(requireSameOrigin, "requireSameOrigin");
async function networkActorId(request, secret) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:${ip}`)));
  return `network:${Array.from(bytes.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
__name(networkActorId, "networkActorId");
async function consumeWindow(db, actorId, scope, limit, windowMs, now) {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs).toISOString();
  const row = await db.prepare("INSERT INTO rate_windows (actor_id,scope,window_start,count,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(actor_id,scope,window_start) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at RETURNING count").bind(actorId, scope, windowStart, 1, now.toISOString()).first();
  return Boolean(row && row.count <= limit);
}
__name(consumeWindow, "consumeWindow");
function messagingService(env) {
  if (!env.MESSAGES_DB) throw new Error("PRIVATE_MESSAGING_DISABLED");
  return new MessagingService(new D1MessageStore(env.MESSAGES_DB), { now: /* @__PURE__ */ __name(() => /* @__PURE__ */ new Date(), "now"), id: /* @__PURE__ */ __name(() => crypto.randomUUID(), "id"), retentionDays: 30, rateLimit: 10, rateWindowMinutes: 10, blockedTerms: env.MESSAGE_BLOCKLIST ?? "" });
}
__name(messagingService, "messagingService");
async function revokeSession(env, sessionId, at) {
  if (!env.MESSAGES_DB) return;
  await env.MESSAGES_DB.prepare("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?").bind(at, sessionId).run();
}
__name(revokeSession, "revokeSession");
async function sessionFor(request, env) {
  if (!env.SESSION_SIGNING_KEY || !env.MESSAGES_DB) return null;
  const signed = await readSession(request, env.SESSION_SIGNING_KEY);
  if (!signed) return null;
  const row = await env.MESSAGES_DB.prepare("SELECT id,sub,email,role,expires_at,revoked_at,csrf_hash FROM auth_sessions WHERE id = ? LIMIT 1").bind(signed.sessionId).first();
  const now = /* @__PURE__ */ new Date();
  if (!row || row.revoked_at || !row.csrf_hash || row.sub !== signed.sub || row.email.toLowerCase() !== signed.email.toLowerCase() || Date.parse(row.expires_at) <= now.getTime()) return null;
  const expectedRole = roleForEmail(row.email, env.SOS_SF_OPERATOR_EMAILS ?? "");
  if ((row.role === "VERIFIED_OPERATOR" || row.role === "ADMIN") && expectedRole === "AUTHENTICATED_USER") {
    await revokeSession(env, row.id, now.toISOString());
    return null;
  }
  if (row.role !== signed.role || row.expires_at !== signed.expiresAt) return null;
  return Object.freeze({ principal: Object.freeze({ ...signed, role: row.role }), csrfHash: row.csrf_hash });
}
__name(sessionFor, "sessionFor");
async function requireCsrf(request, session) {
  requireSameOrigin(request);
  const token = request.headers.get("X-CSRF-Token") ?? "";
  if (token.length < 32 || token.length > 160 || await securityTokenHash(token) !== session.csrfHash) throw new Error("CSRF_TOKEN_REJECTED");
}
__name(requireCsrf, "requireCsrf");
function privateFailure(error) {
  const code = error instanceof Error ? error.message : "PRIVATE_REQUEST_FAILED";
  const status = code === "RATE_LIMITED" ? 429 : code === "BODY_TOO_LARGE" ? 413 : code.includes("FORBIDDEN") || code === "ROLE_CONFLICT" ? 403 : code.includes("NOT_FOUND") ? 404 : code.includes("INVALID") || code.includes("REQUIRED") || code.includes("UNSUPPORTED") || code.includes("CSRF") || code.includes("TOO_") || code === "CONTENT_REJECTED" ? 400 : code.startsWith("GOOGLE_") || code === "AUTHENTICATION_REQUIRED" ? 401 : code.includes("DISABLED") || code.includes("STORAGE_UNAVAILABLE") ? 503 : 500;
  const publicMessage = status === 429 ? "Demasiados intentos; esper\xE1 antes de volver a enviar." : status === 413 ? "La solicitud supera el tama\xF1o permitido." : status === 401 ? "La sesi\xF3n o identidad no pudo validarse." : status === 403 ? "No ten\xE9s acceso a esta operaci\xF3n." : status === 404 ? "El recurso solicitado no existe." : status === 400 ? "El contenido no cumple las reglas de este servicio." : status === 503 && code.includes("STORAGE_UNAVAILABLE") ? "El almacenamiento privado alcanz\xF3 temporalmente su l\xEDmite gratuito." : status === 503 ? "La funci\xF3n todav\xEDa no est\xE1 habilitada." : "No se pudo completar la operaci\xF3n privada.";
  return privateErrorResponse(status === 400 ? "CONTENT_REJECTED" : code, publicMessage, status);
}
__name(privateFailure, "privateFailure");
async function handleAuth(request, env, pathname) {
  if (pathname === "/api/session" && request.method === "GET") {
    const enabled = privateMessagingEnabled(env);
    const session = enabled ? await sessionFor(request, env) : null;
    return privateJsonResponse({ enabled, authenticated: Boolean(session), principal: session?.principal ?? null, csrfRequired: Boolean(session) });
  }
  if (pathname === "/api/logout" && request.method === "POST") {
    requireSameOrigin(request);
    const session = await sessionFor(request, env);
    if (session) {
      await requireCsrf(request, session);
      await revokeSession(env, session.principal.sessionId, (/* @__PURE__ */ new Date()).toISOString());
    }
    const headers2 = new Headers();
    headers2.append("Set-Cookie", clearSessionCookie());
    headers2.append("Set-Cookie", clearCsrfCookie());
    return privateJsonResponse({ authenticated: false }, { headers: headers2 });
  }
  if (pathname !== "/api/auth/google" || request.method !== "POST") return privateErrorResponse("NOT_FOUND", "Ruta privada inexistente", 404);
  if (!privateMessagingEnabled(env) || !env.GOOGLE_CLIENT_ID || !env.SESSION_SIGNING_KEY || !env.MESSAGES_DB) return privateErrorResponse("PRIVATE_MESSAGING_DISABLED", "La bandeja privada todav\xEDa no est\xE1 activada.", 503);
  requireSameOrigin(request);
  const now = /* @__PURE__ */ new Date();
  const networkActor = await networkActorId(request, env.SESSION_SIGNING_KEY);
  if (!await consumeWindow(env.MESSAGES_DB, networkActor, "AUTH_LOGIN", AUTH_NETWORK_LIMIT, AUTH_WINDOW_MS, now)) throw new Error("RATE_LIMITED");
  const body = await parseJsonBody(request);
  if (typeof body !== "object" || body === null || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.credential !== "string") throw new Error("GOOGLE_CREDENTIAL_INVALID");
  const claims = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
  const principal = createSessionPrincipal(claims, env.SOS_SF_OPERATOR_EMAILS ?? "", now.getTime());
  const csrfToken = randomSecurityToken();
  const csrfHash = await securityTokenHash(csrfToken);
  await rotateSession(env.MESSAGES_DB, principal, csrfHash, now);
  const headers = new Headers();
  headers.append("Set-Cookie", await createSessionCookieForPrincipal(principal, env.SESSION_SIGNING_KEY, now.getTime()));
  headers.append("Set-Cookie", createCsrfCookie(csrfToken, principal.expiresAt, now.getTime()));
  return privateJsonResponse({ authenticated: true, principal }, { headers });
}
__name(handleAuth, "handleAuth");
async function handleReportRoutes(request, env, url, session) {
  const principal = session.principal;
  if (url.pathname === "/api/private/reports") {
    if (request.method === "GET") return privateJsonResponse(await listReports(env, principal, url.searchParams.get("status")));
    if (request.method === "POST") {
      await requireCsrf(request, session);
      if (!env.SESSION_SIGNING_KEY) throw new Error("PRIVATE_MESSAGING_DISABLED");
      const result = await createReport(request, env, principal, await networkActorId(request, env.SESSION_SIGNING_KEY));
      return privateJsonResponse(result, { status: result.duplicate === true ? 200 : 201 });
    }
  }
  const accessMatch = url.pathname.match(/^\/api\/private\/operator\/photo-access\/([^/]+)$/);
  if (accessMatch && request.method === "GET") return consumeReportPhotoAccess(env, principal, decodeURIComponent(accessMatch[1]));
  const photoMatch = url.pathname.match(/^\/api\/private\/operator\/reports\/([^/]+)\/photos\/([^/]+)$/);
  if (photoMatch && request.method === "POST") {
    await requireCsrf(request, session);
    return privateJsonResponse(await createReportPhotoAccess(env, principal, decodeURIComponent(photoMatch[1]), decodeURIComponent(photoMatch[2])), { status: 201 });
  }
  if (photoMatch && request.method === "PATCH") {
    await requireCsrf(request, session);
    return privateJsonResponse(await updatePhotoReview(await parseJsonBody(request, 4096), env, principal, decodeURIComponent(photoMatch[1]), decodeURIComponent(photoMatch[2])));
  }
  const reportMatch = url.pathname.match(/^\/api\/private\/operator\/reports\/([^/]+)$/);
  if (reportMatch && request.method === "PATCH") {
    await requireCsrf(request, session);
    return privateJsonResponse(await updateReport(await parseJsonBody(request, 8192), env, principal, decodeURIComponent(reportMatch[1])));
  }
  return null;
}
__name(handleReportRoutes, "handleReportRoutes");
async function handlePrivate(request, env, url) {
  if (!privateMessagingEnabled(env) || !env.SESSION_SIGNING_KEY) return privateErrorResponse("PRIVATE_MESSAGING_DISABLED", "Las funciones privadas todav\xEDa no est\xE1n activadas.", 503);
  const session = await sessionFor(request, env);
  if (!session) return privateErrorResponse("AUTHENTICATION_REQUIRED", "Inici\xE1 sesi\xF3n con Google para usar funciones privadas.", 401);
  const reportResponse = await handleReportRoutes(request, env, url, session);
  if (reportResponse) return reportResponse;
  const principal = session.principal;
  const service = messagingService(env);
  if (url.pathname === "/api/private/conversations") {
    if (request.method === "GET") return privateJsonResponse({ conversations: await service.listConversations(principal), limit: 40 });
    if (request.method === "POST") {
      await requireCsrf(request, session);
      return privateJsonResponse({ conversation: await service.getOrCreateConversation(principal) }, { status: 201 });
    }
  }
  if (url.pathname === "/api/private/messages") {
    if (request.method === "GET") {
      const conversationId = url.searchParams.get("conversationId");
      if (!conversationId) throw new Error("CONVERSATION_ID_REQUIRED");
      return privateJsonResponse(await service.listMessages(principal, conversationId, url.searchParams.get("before")));
    }
    if (request.method === "POST") {
      await requireCsrf(request, session);
      const result = await service.send(principal, await parseJsonBody(request), await networkActorId(request, env.SESSION_SIGNING_KEY));
      return privateJsonResponse(result, { status: result.duplicate ? 200 : 201 });
    }
  }
  return privateErrorResponse("NOT_FOUND", "Ruta privada inexistente", 404);
}
__name(handlePrivate, "handlePrivate");
async function routeRequest(request, env) {
  const url = new URL(request.url);
  const isHead = request.method === "HEAD";
  try {
    if (url.pathname === "/lite") {
      if (request.method !== "GET" && !isHead) return errorResponse("METHOD_NOT_ALLOWED", "S\xF3lo se admite lectura por GET o HEAD", 405);
      const response = liteResponse(await buildLiveSnapshot(env));
      return isHead ? new Response(null, response) : response;
    }
    if (PUBLIC_API_PATHS.has(url.pathname)) {
      if (request.method !== "GET" && !isHead) return errorResponse("METHOD_NOT_ALLOWED", "S\xF3lo se admite lectura por GET o HEAD", 405);
      const response = await publicApiResponse(url.pathname, env);
      return isHead ? new Response(null, response) : response;
    }
    if (url.pathname === "/api/session" || url.pathname === "/api/auth/google" || url.pathname === "/api/logout") return await handleAuth(request, env, url.pathname);
    if (url.pathname.startsWith(PRIVATE_PREFIX)) return await handlePrivate(request, env, url);
    if (url.pathname.startsWith("/api/")) return errorResponse("NOT_FOUND", "Ruta API inexistente", 404);
    if (request.method !== "GET" && !isHead) return errorResponse("METHOD_NOT_ALLOWED", "M\xE9todo no admitido", 405);
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  } catch (error) {
    if (url.pathname.startsWith(PRIVATE_PREFIX) || ["/api/session", "/api/auth/google", "/api/logout"].includes(url.pathname)) return privateFailure(error);
    return errorResponse("INVALID_REQUEST", "No se pudo interpretar la solicitud", 400);
  }
}
__name(routeRequest, "routeRequest");

// src/worker/index.ts
var index_default = {
  async fetch(request, env) {
    try {
      const response = await routeRequest(request, env);
      return withSecurityHeaders(response);
    } catch {
      console.error(JSON.stringify({ level: "error", event: "request_failed", at: (/* @__PURE__ */ new Date()).toISOString() }));
      return errorResponse("INTERNAL_ERROR", "No se pudo completar la solicitud", 500);
    }
  },
  async scheduled(controller, env, ctx) {
    const operation = purgeExpiredPrivateData(env, new Date(controller.scheduledTime)).then((result) => {
      console.info(JSON.stringify({ level: "info", event: "retention_purge_completed", cron: controller.cron, deletedPhotos: result.deletedPhotos, pendingPhotos: result.pendingPhotos, at: result.completedAt }));
    }).catch(() => {
      console.error(JSON.stringify({ level: "error", event: "retention_purge_failed", cron: controller.cron, at: new Date(controller.scheduledTime).toISOString() }));
      throw new Error("RETENTION_PURGE_FAILED");
    });
    ctx.waitUntil(operation);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
