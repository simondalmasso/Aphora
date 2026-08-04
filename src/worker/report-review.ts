import type { SessionPrincipal } from '../domain/private-messaging/types';
import { updateReport as updateReportBase, type ReportEnv } from './reports';

interface ExistingReview {
  readonly moderation_flags_json: string;
  readonly operator_note: string | null;
  readonly redacted_description: string | null;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function updateReport(request: Request, env: ReportEnv, principal: SessionPrincipal, id: string): Promise<Record<string, unknown>> {
  if (!env.MESSAGES_DB) throw new Error('REPORTING_DISABLED');
  const existing = await env.MESSAGES_DB.prepare('SELECT moderation_flags_json,operator_note,redacted_description FROM reports WHERE id = ? LIMIT 1').bind(id).first<ExistingReview>();
  if (!existing) throw new Error('REPORT_NOT_FOUND');
  const body = record(await request.clone().json());
  const preserveFlags = !Object.hasOwn(body, 'moderationFlags');
  const preserveNote = !Object.hasOwn(body, 'operatorNote');
  const preserveRedaction = !Object.hasOwn(body, 'redactedDescription');
  const result = await updateReportBase(request, env, principal, id);
  if (preserveFlags || preserveNote || preserveRedaction) {
    await env.MESSAGES_DB.prepare('UPDATE reports SET moderation_flags_json = CASE WHEN ? THEN ? ELSE moderation_flags_json END,operator_note = CASE WHEN ? THEN ? ELSE operator_note END,redacted_description = CASE WHEN ? THEN ? ELSE redacted_description END WHERE id = ?')
      .bind(preserveFlags ? 1 : 0, existing.moderation_flags_json, preserveNote ? 1 : 0, existing.operator_note, preserveRedaction ? 1 : 0, existing.redacted_description, id).run();
  }
  return result;
}
