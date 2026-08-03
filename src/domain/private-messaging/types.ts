export type UserRole = 'PUBLIC_ANONYMOUS' | 'AUTHENTICATED_USER' | 'VERIFIED_OPERATOR' | 'ADMIN';
export type PrivateMessageStatus = 'SENT' | 'DELIVERED_TO_SERVICE' | 'READ_BY_OPERATOR' | 'FAILED' | 'UNKNOWN';

export interface SessionPrincipal {
  readonly sub: string;
  readonly role: Exclude<UserRole, 'PUBLIC_ANONYMOUS'>;
  readonly expiresAt: string;
}

export interface PrivateConversation {
  readonly id: string;
  readonly userSub: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  readonly unreadByUser: number;
  readonly unreadByOperator: number;
}

export interface PrivateMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly recipientId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly priority: 0 | 1 | 2 | 3;
  readonly status: PrivateMessageStatus;
  readonly idempotencyKey: string;
  readonly commitment: string | null;
  readonly provenance: string;
  readonly failureReason: string | null;
  readonly verifiedOperator: boolean;
}

export interface MessagePage {
  readonly messages: readonly PrivateMessage[];
  readonly nextCursor: string | null;
  readonly limit: number;
}

export interface SendMessageInput {
  readonly conversationId: string;
  readonly body: string;
  readonly idempotencyKey: string;
}
