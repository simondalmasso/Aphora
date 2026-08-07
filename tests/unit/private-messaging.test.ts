import { describe, expect, it } from 'vitest';
import { MemoryMessageStore } from '../../src/domain/private-messaging/memory-store.ts';
import { MessagingService } from '../../src/domain/private-messaging/service.ts';
import { normalizeSendMessage } from '../../src/domain/private-messaging/validation.ts';
import type { SessionPrincipal } from '../../src/domain/private-messaging/types.ts';

const user: SessionPrincipal = { sessionId: 'session:user-10001', sub: 'user:10001', email: 'user10001@example.org', role: 'AUTHENTICATED_USER', expiresAt: '2026-08-03T00:00:00.000Z' };
const otherUser: SessionPrincipal = { ...user, sessionId: 'session:user-20002', sub: 'user:20002', email: 'user20002@example.org' };
const operator: SessionPrincipal = { ...user, sessionId: 'session:operator-30003', sub: 'operator:30003', email: 'operator30003@example.org', role: 'VERIFIED_OPERATOR' };

function fixture(rateLimit = 10, blockedTerms = '') {
  const store = new MemoryMessageStore();
  let sequence = 0;
  const service = new MessagingService(store, { now: () => new Date('2026-08-02T15:00:00.000Z'), id: () => `id-${++sequence}`, retentionDays: 30, rateLimit, rateWindowMinutes: 10, blockedTerms });
  return { store, service };
}

describe('private messaging service', () => {
  it('creates one user conversation and enforces ownership on every read', async () => {
    const { service } = fixture();
    const first = await service.getOrCreateConversation(user);
    expect(await service.getOrCreateConversation(user)).toEqual(first);
    await expect(service.listMessages(otherUser, first.id, null)).rejects.toThrow('FORBIDDEN_CONVERSATION');
    await expect(service.getOrCreateConversation(operator)).rejects.toThrow('OPERATOR_CANNOT_CREATE_USER_CONVERSATION');
  });

  it('makes retries idempotent and maps identity/TTL/provenance defensively', async () => {
    const { service, store } = fixture();
    const conversation = await service.getOrCreateConversation(user);
    const input = { conversationId: conversation.id, body: '  Necesito orientación estructurada.  ', idempotencyKey: 'retry:100' };
    const first = await service.send(user, input, 'network:abc');
    const retry = await service.send(user, input, 'network:abc');
    expect(first.duplicate).toBe(false);
    expect(retry).toEqual({ message: first.message, duplicate: true });
    expect(store.messages).toHaveLength(1);
    expect(first.message).toMatchObject({ body: 'Necesito orientación estructurada.', recipientId: 'sos-sf:verified-operators', status: 'DELIVERED_TO_SERVICE', provenance: 'AUTHENTICATED_USER_SESSION' });
    expect(Date.parse(first.message.expiresAt) - Date.parse(first.message.createdAt)).toBe(30 * 86_400_000);
    expect(store.sends.map((event) => event.actorId)).toEqual(['user:10001', 'network:abc']);
    expect(JSON.stringify(store.audit)).not.toContain(first.message.body);
  });

  it('lets verified operators list/reply without accepting client-side role elevation', async () => {
    const { service } = fixture();
    const conversation = await service.getOrCreateConversation(user);
    expect(await service.listConversations(operator)).toContainEqual(conversation);
    const reply = await service.send(operator, { conversationId: conversation.id, body: 'Recibido por operador.', idempotencyKey: 'reply:100' });
    expect(reply.message).toMatchObject({ verifiedOperator: true, recipientId: user.sub, provenance: 'VERIFIED_OPERATOR_SESSION' });
    expect(() => normalizeSendMessage({ conversationId: conversation.id, body: 'texto', idempotencyKey: 'bad:role', role: 'ADMIN' })).toThrow('UNSUPPORTED_MESSAGE_FIELD');
  });

  it('rate-limits by authenticated identity and hashed network actor', async () => {
    const { service, store } = fixture(1);
    const conversation = await service.getOrCreateConversation(user);
    store.sends.push({ actorId: 'network:limited', at: '2026-08-02T14:59:00.000Z' });
    await expect(service.send(user, { conversationId: conversation.id, body: 'Uno', idempotencyKey: 'send:100' }, 'network:limited')).rejects.toThrow('RATE_LIMITED');
    expect(store.messages).toHaveLength(0);
  });

  it('rejects overlong, emoji, invisible, malformed and extra fields', () => {
    expect(() => normalizeSendMessage({ conversationId: 'conv:100', body: 'x'.repeat(281), idempotencyKey: 'key:100' })).toThrow('INVALID_MESSAGE_LENGTH');
    expect(() => normalizeSendMessage({ conversationId: 'conv:100', body: 'hola😀', idempotencyKey: 'key:100' })).toThrow('INVALID_MESSAGE_CHARACTERS');
    expect(() => normalizeSendMessage({ conversationId: 'conv:100', body: 'hola\u200b', idempotencyKey: 'key:100' })).toThrow('INVALID_MESSAGE_CHARACTERS');
    expect(() => normalizeSendMessage({ conversationId: '../wrong', body: 'hola', idempotencyKey: 'key:100' })).toThrow('INVALID_CONVERSATION_ID');
  });

  it('applies configurable moderation before persistence with a generic service error', async () => {
    const { service, store } = fixture(10, 'frase bloqueada');
    const conversation = await service.getOrCreateConversation(user);
    await expect(service.send(user, { conversationId: conversation.id, body: 'Incluye FRASE BLOQUEADA en contexto.', idempotencyKey: 'moderation:100' })).rejects.toThrow('CONTENT_REJECTED');
    expect(store.messages).toHaveLength(0);
  });
});
