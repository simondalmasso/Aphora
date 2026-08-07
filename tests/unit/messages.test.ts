import { describe, expect, it } from 'vitest';
import { messageIsActive, visibleMessages } from '../../src/domain/messages.ts';
import { demoSnapshot } from '../../src/data/demo-snapshot.ts';

describe('critical messages', () => {
  it('applies strict TTL boundaries', () => {
    const message = demoSnapshot.messages[0]!;
    expect(messageIsActive(message, new Date(message.createdAt))).toBe(true);
    expect(messageIsActive(message, new Date(message.expiresAt))).toBe(false);
  });

  it('orders by priority and caps visible messages', () => {
    const visible = visibleMessages(demoSnapshot.messages, new Date(demoSnapshot.generatedAt), 2);
    expect(visible).toHaveLength(2);
    expect(visible[0]?.priority).toBe(3);
    expect(visible[1]?.priority).toBe(2);
  });
});
