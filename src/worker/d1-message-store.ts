import type { MessagePage, PrivateConversation, PrivateMessage } from '../domain/private-messaging/types.ts';
import type { MessageStore } from '../domain/private-messaging/service.ts';

export interface D1Result<T = unknown> { readonly results?: T[]; readonly success?: boolean }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1DatabaseLike { prepare(query: string): D1Statement }

interface ConversationRow {
  id: string; user_sub: string; created_at: string; updated_at: string; status: PrivateConversation['status']; unread_user: number; unread_operator: number;
}
interface MessageRow {
  id: string; conversation_id: string; sender_id: string; recipient_id: string; body: string; created_at: string; expires_at: string; priority: 0 | 1 | 2 | 3; status: PrivateMessage['status']; idempotency_key: string; commitment: string | null; provenance: string; failure_reason: string | null; verified_operator: number;
}

const conversation = (row: ConversationRow): PrivateConversation => ({ id: row.id, userSub: row.user_sub, createdAt: row.created_at, updatedAt: row.updated_at, status: row.status, unreadByUser: row.unread_user, unreadByOperator: row.unread_operator });
const message = (row: MessageRow): PrivateMessage => ({ id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, recipientId: row.recipient_id, body: row.body, createdAt: row.created_at, expiresAt: row.expires_at, priority: row.priority, status: row.status, idempotencyKey: row.idempotency_key, commitment: row.commitment, provenance: row.provenance, failureReason: row.failure_reason, verifiedOperator: row.verified_operator === 1 });

export class D1MessageStore implements MessageStore {
  constructor(private readonly db: D1DatabaseLike) {}
  async findConversation(id: string) { const row = await this.db.prepare('SELECT * FROM conversations WHERE id = ? LIMIT 1').bind(id).first<ConversationRow>(); return row ? conversation(row) : null; }
  async findConversationForUser(userSub: string) { const row = await this.db.prepare("SELECT * FROM conversations WHERE user_sub = ? AND status != 'CLOSED' ORDER BY updated_at DESC LIMIT 1").bind(userSub).first<ConversationRow>(); return row ? conversation(row) : null; }
  async createConversation(item: PrivateConversation) { await this.db.prepare('INSERT INTO conversations (id,user_sub,created_at,updated_at,status,unread_user,unread_operator) VALUES (?,?,?,?,?,?,?)').bind(item.id, item.userSub, item.createdAt, item.updatedAt, item.status, item.unreadByUser, item.unreadByOperator).run(); }
  async listConversations(userSub: string | null, limit: number) {
    const statement = userSub === null ? this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?').bind(limit) : this.db.prepare('SELECT * FROM conversations WHERE user_sub = ? ORDER BY updated_at DESC LIMIT ?').bind(userSub, limit);
    return (await statement.all<ConversationRow>()).results?.map(conversation) ?? [];
  }
  async listMessages(conversationId: string, limit: number, before: string | null): Promise<MessagePage> {
    const statement = before === null ? this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?').bind(conversationId, new Date().toISOString(), limit) : this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? AND expires_at > ? ORDER BY created_at DESC LIMIT ?').bind(conversationId, before, new Date().toISOString(), limit);
    const messages = (await statement.all<MessageRow>()).results?.map(message) ?? [];
    return { messages, nextCursor: messages.length === limit ? messages.at(-1)?.createdAt ?? null : null, limit };
  }
  async findByIdempotency(conversationId: string, idempotencyKey: string) { const row = await this.db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND idempotency_key = ? LIMIT 1').bind(conversationId, idempotencyKey).first<MessageRow>(); return row ? message(row) : null; }
  async insertMessage(item: PrivateMessage) {
    await this.db.prepare('INSERT INTO messages (id,conversation_id,sender_id,recipient_id,body,created_at,expires_at,priority,status,idempotency_key,commitment,provenance,failure_reason,verified_operator) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(item.id, item.conversationId, item.senderId, item.recipientId, item.body, item.createdAt, item.expiresAt, item.priority, item.status, item.idempotencyKey, item.commitment, item.provenance, item.failureReason, item.verifiedOperator ? 1 : 0).run();
    const counter = item.verifiedOperator ? 'unread_user' : 'unread_operator';
    await this.db.prepare(`UPDATE conversations SET ${counter} = ${counter} + 1, updated_at = ? WHERE id = ?`).bind(item.createdAt, item.conversationId).run();
  }
  async markRead(conversationId: string, reader: 'USER' | 'OPERATOR', at: string) {
    const counter = reader === 'USER' ? 'unread_user' : 'unread_operator';
    await this.db.prepare(`UPDATE conversations SET ${counter} = 0, updated_at = ? WHERE id = ?`).bind(at, conversationId).run();
    if (reader === 'OPERATOR') await this.db.prepare("UPDATE messages SET status = 'READ_BY_OPERATOR' WHERE conversation_id = ? AND verified_operator = 0 AND status = 'DELIVERED_TO_SERVICE'").bind(conversationId).run();
  }
  async consumeRateLimit(actorId: string, scope: string, windowStart: string, limit: number, at: string): Promise<boolean> {
    const row = await this.db.prepare('INSERT INTO rate_windows (actor_id,scope,window_start,count,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(actor_id,scope,window_start) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at RETURNING count').bind(actorId, scope, windowStart, 1, at).first<{ count: number }>();
    return Boolean(row && row.count <= limit);
  }
  async countRecentSends(actorId: string, since: string) { const row = await this.db.prepare('SELECT COUNT(*) AS count FROM rate_events WHERE actor_id = ? AND at >= ?').bind(actorId, since).first<{ count: number }>(); return row?.count ?? 0; }
  async recordSend(actorId: string, at: string) { await this.db.prepare('INSERT INTO rate_events (actor_id,at) VALUES (?,?)').bind(actorId, at).run(); }
  async purgeExpired(messageExpiresAt: string, historyBefore: string) {
    await this.db.prepare('DELETE FROM messages WHERE expires_at <= ?').bind(messageExpiresAt).run();
    await this.db.prepare('DELETE FROM rate_events WHERE at < ?').bind(historyBefore).run();
    await this.db.prepare('DELETE FROM rate_windows WHERE updated_at < ?').bind(historyBefore).run();
    await this.db.prepare('DELETE FROM audit_events WHERE at < ?').bind(historyBefore).run();
    await this.db.prepare('DELETE FROM conversations WHERE updated_at < ? AND NOT EXISTS (SELECT 1 FROM messages WHERE messages.conversation_id = conversations.id)').bind(historyBefore).run();
  }
  async recordAudit(event: { id: string; actorId: string; action: string; targetId: string; at: string }) { await this.db.prepare('INSERT INTO audit_events (id,actor_id,action,target_id,at) VALUES (?,?,?,?,?)').bind(event.id, event.actorId, event.action, event.targetId, event.at).run(); }
}
