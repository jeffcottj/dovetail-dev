import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminActivityFeed } from './AdminActivityFeed';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

vi.mock('../ui/Card', () => ({
  Card: function Card({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  },
}));

vi.mock('../../lib/admin/format', () => ({
  formatAdminActivityLine: vi.fn(() => 'Activity line'),
}));

function collectText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (React.isValidElement(node)) return collectText((node.props as Record<string, unknown>).children as React.ReactNode);
  return '';
}

describe('AdminActivityFeed', () => {
  it('shows an unavailable message instead of an empty-state message', () => {
    const tree = AdminActivityFeed({
      items: [],
      unavailableMessage: 'Recent activity is temporarily unavailable.',
    } as any);

    const text = collectText(tree);

    expect(text).toContain('Recent activity is temporarily unavailable.');
    expect(text).not.toContain('No recent activity yet.');
  });
});
