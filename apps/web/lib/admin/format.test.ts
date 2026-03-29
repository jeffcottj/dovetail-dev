import { describe, expect, it } from 'vitest';
import type { AdminActivityItem } from '@dovetail/types';
import { formatAdminActivityLine } from './format';

describe('formatAdminActivityLine', () => {
  it('formats role change activity with actor and subject labels', () => {
    const activity = {
      id: 'evt-1',
      kind: 'user.role_changed',
      actor: { id: 'u1', name: 'Jane Smith', email: 'jane@example.com' },
      subject: { id: 'u2', label: 'Alex Lee' },
      createdAt: '2026-03-28T12:00:00.000Z',
      metadata: { role: 'admin' },
    } satisfies AdminActivityItem;

    const line = formatAdminActivityLine(activity);

    expect(line).toContain('Jane Smith');
    expect(line).toContain('Alex Lee');
    expect(line).toContain('admin');
  });
});
