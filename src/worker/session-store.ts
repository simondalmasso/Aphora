import type { SessionPrincipal } from '../domain/private-messaging/types.ts';
import type { D1DatabaseLike } from './d1-message-store.ts';

export async function rotateSession(db: D1DatabaseLike, principal: SessionPrincipal, csrfHash: string, now: Date): Promise<string | null> {
  const previous = await db.prepare('SELECT id FROM auth_sessions WHERE sub = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(principal.sub).first<{ id: string }>();
  await db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE sub = ? AND revoked_at IS NULL').bind(now.toISOString(), principal.sub).run();
  await db.prepare('INSERT INTO auth_sessions (id,sub,email,role,created_at,expires_at,revoked_at,rotated_from,csrf_hash,last_seen_at) VALUES (?,?,?,?,?,?,NULL,?,?,?)').bind(principal.sessionId, principal.sub, principal.email, principal.role, now.toISOString(), principal.expiresAt, previous?.id ?? null, csrfHash, now.toISOString()).run();
  return previous?.id ?? null;
}
