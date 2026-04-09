import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

const mockAuth = vi.fn();
const mockApiFetch = vi.fn();
const mockHasMinimumRole = vi.fn();

vi.mock('../../auth', () => ({
  auth: mockAuth,
}));

vi.mock('../../lib/api', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('../../lib/roles', () => ({
  hasMinimumRole: mockHasMinimumRole,
}));

vi.mock('../../components/SidebarWrapper', () => ({
  SidebarWrapper: ({ children }: { children: React.ReactNode }) => <div data-slot="sidebar-wrapper">{children}</div>,
}));

vi.mock('../../components/WorkspaceSidebar', () => ({
  WorkspaceSidebar: () => <div>Workspace Sidebar</div>,
}));

vi.mock('../../components/SearchBar', () => ({
  SearchBar: () => <div>Search Bar</div>,
}));

vi.mock('../../components/HeaderUserArea', () => ({
  HeaderUserArea: () => <div>Header User Area</div>,
}));

vi.mock('../../components/WorkspaceActivityFeed', () => ({
  WorkspaceActivityFeed: ({
    items,
    unavailableMessage,
  }: {
    items: Array<{ id: string }>;
    unavailableMessage?: string | null;
  }) => (
    <div>
      Workspace Activity Feed:{items.length}:{unavailableMessage ?? 'none'}
    </div>
  ),
}));

vi.mock('../../components/ui/Button', () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock('../../components/ui/Card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

async function collectText(node: React.ReactNode): Promise<string> {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    const parts = await Promise.all(node.map((child) => collectText(child)));
    return parts.join('');
  }

  if (React.isValidElement(node)) {
    if (typeof node.type === 'function') {
      const rendered = node.type(node.props);
      return collectText(rendered instanceof Promise ? await rendered : rendered);
    }

    return collectText((node.props as Record<string, unknown>).children as React.ReactNode);
  }

  return '';
}

describe('HomePage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('renders the workspace shell with recent activity and the admin helper action', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin' } });
    mockHasMinimumRole.mockReturnValue(true);
    mockApiFetch.mockResolvedValue([
      {
        id: 'activity-1',
        createdAt: '2026-04-08T12:00:00.000Z',
        kind: 'article.created',
        actor: { name: 'Alice Admin', email: 'alice@example.com' },
        subject: { label: 'Welcome Article' },
        metadata: {},
        knowledgeBase: { id: 'kb-1', name: 'Housing', slug: 'housing' },
      },
    ]);

    const { default: HomePage } = await import('./page');
    const tree = await HomePage();
    const text = await collectText(tree);

    expect(text).toContain('Workspace Sidebar');
    expect(text).toContain('Search Bar');
    expect(text).toContain('Header User Area');
    expect(text).toContain('Workspace Activity Feed:1:none');
    expect(text).toContain('Choose a knowledge base');
    expect(text).toContain('Manage Knowledge Bases');
    expect(text).not.toContain('Signed in as');
    expect(text).not.toContain('No knowledge bases yet.');
  });

  test('shows a non-fatal unavailable message when workspace activity cannot be loaded', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'viewer' } });
    mockHasMinimumRole.mockReturnValue(false);
    mockApiFetch.mockRejectedValue(new Error('unavailable'));

    const { default: HomePage } = await import('./page');
    const tree = await HomePage();
    const text = await collectText(tree);

    expect(text).toContain('Workspace Activity Feed:0:Recent activity is unavailable right now.');
    expect(text).toContain('Choose a knowledge base');
    expect(text).not.toContain('Manage Knowledge Bases');
  });
});
