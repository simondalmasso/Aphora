import type { MessagePage, PrivateConversation, PrivateMessage } from './types.ts';
import type { MessageStore } from './service.ts';

export class MemoryMessageStore implements MessageStore {
  readonly conversations: PrivateConversation[] = [];
  readonly messages: PrivateMessage[] = [];
  readonly sends: Array<{ actorId: string; at: string }> = [];
  readonly audit: Array<{ id: string; actorId: string; action: string; targetId: string; at: string }> = [];

  async findConversation(id: string) { return this.conversations.find((item) => item.id === id) ?? null; }
  async findConversationForUser(userSub: string) { return this.conversations.find((item) => item.userSub === userSub) ?? null; }
  async createConversation(conversation: PrivateConversation) { this.conversations.push(conversation); }
  async listConversations(userSub: string | null, limit: number) { return this.conversations.filter((item) => userSub === null || item.userSub === userSub).slice(0, limit); }
  async listMessages(conversationId: string, limit: number, before: string | null): Promise<MessagePage> {
    const messages = this.messages.filter((item) => item.conversationId === conversationId && (before === null || item.createdAt < before)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    return { messages, nextCursor: messages.length === limit ? messages.at(-1)?.createdAt ?? null : null, limit };
  }
  async findByIdempotency(conversationId: string, idempotencyKey: string) { return this.messages.find((item) => item.conversationId === conversationId && item.idempotencyKey === idempotencyKey) ?? null; }
  async insertMessage(message: PrivateMessage) {
    this.messages.push(message);
    const index = this.conversations.findIndex((item) => item.id === message.conversationId);
    const item = this.conversations[index];
    if (item) this.conversations[index] = { ...item, updatedAt: message.createdAt, unreadByUser: item.unreadByUser + (message.verifiedOperator ? 1 : 0), unreadByOperator: item.unreadByOperator + (message.verifiedOperator ? 0 : 1) };
  }
  async markRead(conversationId: string, reader: 'USER' | 'OPERATOR', at: string) {
    const index = this.conversations.findIndex((item) => item.id === conversationId);
    const item = this.conversations[index];
    if (item) this.conversations[index] = { ...item, updatedAt: at, unreadByUser: reader === 'USER' ? 0 : item.unreadByUser, unreadByOperator: reader === 'OPERATOR' ? 0 : item.unreadByOperator };
    if (reader === 'OPERATOR') {
      for (let messageIndex = 0; messageIndex < this.messages.length; messageIndex += 1) {
        const message = this.messages[messageIndex]!;
        if (message.conversationId === conversationId && !message.verifiedOperator) this.messages[messageIndex] = { ...message, status: 'READ_BY_OPERATOR' };
      }
    }
  }
  async countRecentSends(actorId: string, since: string) { return this.sends.filter((item) => item.actorId === actorId && item.at >= since).length; }
  async recordSend(actorId: string, at: string) { this.sends.push({ actorId, at }); }
  async purgeExpired(messageExpiresAt: string, historyBefore: string) {
    for (let index = this.messages.length - 1; index >= 0; index -= 1) if (this.messages[index]!.expiresAt <= messageExpiresAt) this.messages.splice(index, 1);
    for (let index = this.sends.length - 1; index >= 0; index -= 1) if (this.sends[index]!.at < historyBefore) this.sends.splice(index, 1);
    for (let index = this.audit.length - 1; index >= 0; index -= 1) if (this.audit[index]!.at < historyBefore) this.audit.splice(index, 1);
    for (let index = this.conversations.length - 1; index >= 0; index -= 1) if (this.conversations[index]!.updatedAt < historyBefore && !this.messages.some((message) => message.conversationId === this.conversations[index]!.id)) this.conversations.splice(index, 1);
  }
  async recordAudit(event: { id: string; actorId: string; action: string; targetId: string; at: string }) { this.audit.push(event); }
}
