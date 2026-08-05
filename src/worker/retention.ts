import type { WorkerEnv } from './router';
import { purgeExpiredReports } from './reports';

export interface RetentionResult {
  readonly deletedPhotos: number;
  readonly pendingPhotos: number;
  readonly completedAt: string;
}

export async function purgeExpiredPrivateData(env: WorkerEnv, now = new Date()): Promise<RetentionResult> {
  const reportResult = await purgeExpiredReports(env, now);
  if (env.MESSAGES_DB) {
    const nowIso = now.toISOString();
    const historyBefore = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    const revokedBefore = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    await env.MESSAGES_DB.prepare('DELETE FROM messages WHERE expires_at <= ?').bind(nowIso).run();
    await env.MESSAGES_DB.prepare('DELETE FROM conversations WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id)').bind(historyBefore).run();
    await env.MESSAGES_DB.prepare('DELETE FROM audit_events WHERE at < ?').bind(historyBefore).run();
    await env.MESSAGES_DB.prepare('DELETE FROM rate_events WHERE at < ?').bind(historyBefore).run();
    await env.MESSAGES_DB.prepare('DELETE FROM rate_windows WHERE updated_at < ?').bind(new Date(now.getTime() - 7 * 86_400_000).toISOString()).run();
    await env.MESSAGES_DB.prepare('DELETE FROM report_photo_access_grants WHERE expires_at <= ? OR used_at IS NOT NULL').bind(nowIso).run();
    await env.MESSAGES_DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)').bind(nowIso, revokedBefore).run();
  }
  return Object.freeze({ deletedPhotos: reportResult.deletedPhotos, pendingPhotos: reportResult.pendingPhotos, completedAt: now.toISOString() });
}
