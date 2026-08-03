import type { MessagePage, PrivateConversation, PrivateMessage, SendMessageInput, SessionPrincipal } from './types';
import { PRIVATE_PAGE_LIMIT, messagePassesModeration, normalizeSendMessage } from './validation';

export interface MessageStore {
  findConversation(id: string): Promise<PrivateConversation | null>;
  findConversationForUser(userSub: string): Promise<PrivateConversation | null>;
  createConversation(conversation: PrivateConversation): Promise<void>;
  listConversations(userSub: string | null, limit: number): Promise<readonly PrivateConversation[]>;
  listMessages(conversationId: string, limit: number, before: string | null): Promise<MessagePage>;
  findByIdempotency(conversationId: string, idempotencyKey: string): Promise<PrivateMessage | null>;
  insertMessage(message: PrivateMessage): Promise<void>;
  markRead(conversationId: string, reader: 'USER' | 'OPERATOR', at: string): Promise<void>;
  countRecentSends(actorId: string, since: string): Promise<number>;
  recordSend(actorId: string, at: string): Promise<void>;
  purgeExpired(messageExpiresAt: string, historyBefore: string): Promise<void>;
  recordAudit(event: { readonly id: string; readonly actorId: string; readonly action: string; readonly targetId: string; readonly at: string }): Promise<void>;
}

export interface MessageServiceOptions {
  readonly now: () => Date;
  readonly id: () => string;
  readonly retentionDays: number;
  readonly rateLimit: number;
  readonly rateWindowMinutes: number;
  readonly blockedTerms?: string;
}

export class MessagingService {
  constructor(private readonly store: MessageStore, private readonly options: MessageServiceOptions) {}

  async getOrCreateConversation(principal: SessionPrincipal): Promise<PrivateConversation> {
    await this.maintenance();
    if (principal.role === 'VERIFIED_OPERATOR' || principal.role === 'ADMIN') throw new Error('OPERATOR_CANNOT_CREATE_USER_CONVERSATION');
    const existing = await this.store.findConversationForUser(principal.sub);
    if (existing) return existing;
    const at = this.options.now().toISOString();
    const conversation: PrivateConversation = Object.freeze({ id: `conv:${this.options.id()}`, userSub: principal.sub, createdAt: at, updatedAt: at, status: 'OPEN', unreadByUser: 0, unreadByOperator: 0 });
    await this.store.createConversation(conversation);
    await this.audit(principal, 'CONVERSATION_CREATED', conversation.id);
    return conversation;
  }

  async listConversations(principal: SessionPrincipal): Promise<readonly PrivateConversation[]> {
    await this.maintenance();
    const operator = principal.role === 'VERIFIED_OPERATOR' || principal.role === 'ADMIN';
    return this.store.listConversations(operator ? null : principal.sub, PRIVATE_PAGE_LIMIT);
  }

  async listMessages(principal: SessionPrincipal, conversationId: string, before: string | null): Promise<MessagePage> {
    const conversation = await this.authorizeConversation(principal, conversationId);
    const page = await this.store.listMessages(conversation.id, PRIVATE_PAGE_LIMIT, before);
    await this.store.markRead(conversation.id, principal.role === 'AUTHENTICATED_USER' ? 'USER' : 'OPERATOR', this.options.now().toISOString());
    await this.audit(principal, 'MESSAGES_READ', conversation.id);
    return page;
  }

  async send(principal: SessionPrincipal, rawInput: SendMessageInput | unknown, networkActorId?: string): Promise<{ readonly message: PrivateMessage; readonly duplicate: boolean }> {
    const input = normalizeSendMessage(rawInput);
    if (!messagePassesModeration(input.body, this.options.blockedTerms ?? '')) throw new Error('CONTENT_REJECTED');
    await this.maintenance();
    const conversation = await this.authorizeConversation(principal, input.conversationId);
    const duplicate = await this.store.findByIdempotency(conversation.id, input.idempotencyKey);
    if (duplicate) return { message: duplicate, duplicate: true };
    const now = this.options.now();
    const since = new Date(now.getTime() - this.options.rateWindowMinutes * 60_000).toISOString();
    const rateActors = [principal.sub, ...(networkActorId && networkActorId !== principal.sub ? [networkActorId] : [])];
    for (const actorId of rateActors) if (await this.store.countRecentSends(actorId, since) >= this.options.rateLimit) throw new Error('RATE_LIMITED');
    const operator = principal.role === 'VERIFIED_OPERATOR' || principal.role === 'ADMIN';
    if (operator && conversation.userSub === principal.sub) throw new Error('ROLE_CONFLICT');
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.options.retentionDays * 86_400_000).toISOString();
    const message: PrivateMessage = Object.freeze({
      id: `pmsg:${this.options.id()}`,
      conversationId: conversation.id,
      senderId: principal.sub,
      recipientId: operator ? conversation.userSub : 'sos-sf:verified-operators',
      body: input.body,
      createdAt,
      expiresAt,
      priority: 1,
      status: 'DELIVERED_TO_SERVICE',
      idempotencyKey: input.idempotencyKey,
      commitment: null,
      provenance: operator ? 'VERIFIED_OPERATOR_SESSION' : 'AUTHENTICATED_USER_SESSION',
      failureReason: null,
      verifiedOperator: operator,
    });
    await this.store.insertMessage(message);
    for (const actorId of rateActors) await this.store.recordSend(actorId, createdAt);
    await this.audit(principal, 'MESSAGE_ACCEPTED', message.id);
    return { message, duplicate: false };
  }

  private async authorizeConversation(principal: SessionPrincipal, conversationId: string): Promise<PrivateConversation> {
    const conversation = await this.store.findConversation(conversationId);
    if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
    const operator = principal.role === 'VERIFIED_OPERATOR' || principal.role === 'ADMIN';
    if (!operator && conversation.userSub !== principal.sub) throw new Error('FORBIDDEN_CONVERSATION');
    return conversation;
  }

  private async audit(principal: SessionPrincipal, action: string, targetId: string): Promise<void> {
    await this.store.recordAudit({ id: `audit:${this.options.id()}`, actorId: principal.sub, action, targetId, at: this.options.now().toISOString() });
  }

  private async maintenance(): Promise<void> {
    const now = this.options.now();
    const historyBefore = new Date(now.getTime() - this.options.retentionDays * 86_400_000).toISOString();
    await this.store.purgeExpired(now.toISOString(), historyBefore);
  }
}
