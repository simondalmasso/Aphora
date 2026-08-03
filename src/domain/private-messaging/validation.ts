import type { SendMessageInput } from './types';

export const PRIVATE_MESSAGE_MAX_LENGTH = 800;
export const PRIVATE_PAGE_LIMIT = 40;
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/;

export function normalizeSendMessage(value: unknown): SendMessageInput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('INVALID_MESSAGE_BODY');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const allowed = new Set(['conversationId', 'body', 'idempotencyKey']);
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError('UNSUPPORTED_MESSAGE_FIELD');
    const descriptor = descriptors[key]!;
    if (!descriptor.enumerable || !('value' in descriptor) || 'get' in descriptor || 'set' in descriptor) throw new TypeError('UNSAFE_MESSAGE_FIELD');
    record[key] = descriptor.value;
  }
  if (typeof record.conversationId !== 'string' || !ID_PATTERN.test(record.conversationId)) throw new TypeError('INVALID_CONVERSATION_ID');
  if (typeof record.idempotencyKey !== 'string' || !ID_PATTERN.test(record.idempotencyKey)) throw new TypeError('INVALID_IDEMPOTENCY_KEY');
  if (typeof record.body !== 'string') throw new TypeError('INVALID_MESSAGE_TEXT');
  const body = record.body.trim();
  if (body.length < 1 || body.length > PRIVATE_MESSAGE_MAX_LENGTH) throw new TypeError('INVALID_MESSAGE_LENGTH');
  if (/\p{C}/u.test(body.replaceAll('\n', ''))) throw new TypeError('INVALID_MESSAGE_CHARACTERS');
  return Object.freeze({ conversationId: record.conversationId, body, idempotencyKey: record.idempotencyKey });
}
