import { describe, expect, it } from 'vitest';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types.ts';
import type { D1DatabaseLike, D1Statement } from '../../src/worker/d1-message-store.ts';
import { rotateSession } from '../../src/worker/session-store.ts';

class Statement implements D1Statement {
  values: unknown[] = [];
  constructor(private readonly db: Db, private readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    if (this.query.startsWith('SELECT id FROM auth_sessions')) {
      const active = [...this.db.sessions.values()].filter((row) => row.sub === this.values[0] && !row.revoked_at).at(-1);
      return active ? { id: active.id } as T : null;
    }
    return null;
  }
  async all<T>() { return { results: [] as T[] }; }
  async run() {
    if (this.query.startsWith('UPDATE auth_sessions SET revoked_at')) for (const [id, row] of this.db.sessions) if (row.sub === this.values[1] && !row.revoked_at) this.db.sessions.set(id, { ...row, revoked_at: this.values[0] });
    if (this.query.startsWith('INSERT INTO auth_sessions')) {
      const [id, sub, email, role, created_at, expires_at, rotated_from, csrf_hash, last_seen_at] = this.values;
      this.db.sessions.set(String(id), { id, sub, email, role, created_at, expires_at, revoked_at: null, rotated_from, csrf_hash, last_seen_at });
    }
    return { success: true };
  }
}
class Db implements D1DatabaseLike {
  sessions = new Map<string, Record<string, unknown>>();
  prepare(query: string) { return new Statement(this, query); }
}

const next: SessionPrincipal = { sessionId: 'session:next-one', sub: '1234567890', email: 'owner@example.org', role: 'VERIFIED_OPERATOR', expiresAt: '2099-01-01T00:00:00.000Z' };

describe('server-side session rotation', () => {
  it('revokes the predecessor and records rotated_from with CSRF hash', async () => {
    const db = new Db();
    db.sessions.set('session:previous', { id: 'session:previous', sub: next.sub, email: next.email, role: next.role, revoked_at: null });
    await expect(rotateSession(db, next, 'csrf-hash', new Date('2026-08-05T00:00:00.000Z'))).resolves.toBe('session:previous');
    expect(db.sessions.get('session:previous')?.revoked_at).toBe('2026-08-05T00:00:00.000Z');
    expect(db.sessions.get(next.sessionId)).toMatchObject({ rotated_from: 'session:previous', csrf_hash: 'csrf-hash', revoked_at: null });
  });
});
