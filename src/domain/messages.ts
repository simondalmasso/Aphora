import type { CriticalMessage } from './zungun-compat/types.ts';

export function messageIsActive(message: CriticalMessage, now: Date): boolean {
  if (message.status !== 'ACTIVE') return false;
  const createdAt = Date.parse(message.createdAt);
  const expiresAt = Date.parse(message.expiresAt);
  return Number.isFinite(createdAt) && Number.isFinite(expiresAt) && createdAt <= now.getTime() && now.getTime() < expiresAt;
}

export function visibleMessages(messages: readonly CriticalMessage[], now: Date, limit = 5): readonly CriticalMessage[] {
  return messages
    .filter((message) => messageIsActive(message, now))
    .sort((left, right) => right.priority - left.priority || Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
    .slice(0, limit);
}
