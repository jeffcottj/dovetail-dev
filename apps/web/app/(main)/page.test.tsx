import React from 'react';
import { renderToReadableStream } from 'react-dom/server';
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

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('../../components/KbSwitcher', () => ({
  KbSwitcher: ({
    knowledgeBases,
    currentSlug,
  }: {
    knowledgeBases: Array<{ id: string }>;
    currentSlug: string | null;
  }) => <div>KB Switcher:{knowledgeBases.length}:{currentSlug ?? 'none'}</div>,
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

async function renderText(node: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let html = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }

  html += decoder.decode();

  return html.replace(/<[^>]+>/g, '');
}

describe('HomePage', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('renders the workspace shell with recent activity and the admin helper action', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'admin' } });
    mockHasMinimumRole.mockReturnValue(true);
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/workspace/activity') {
        return [
          {
            id: 'activity-1',
            createdAt: '2026-04-08T12:00:00.000Z',
            kind: 'article.created',
            actor: { name: 'Alice Admin', email: 'alice@example.com' },
            subject: { label: 'Welcome Article' },
            metadata: {},
            knowledgeBase: { id: 'kb-1', name: 'Housing', slug: 'housing' },
          },
        ];
      }

      if (path === '/api/knowledge-bases') {
        return [{ id: 'kb-1', name: 'Housing', slug: 'housing', description: null }];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: HomePage } = await import('./page');
    const tree = await HomePage();
    const text = await renderText(tree);

    expect(text).toContain('KB Switcher:1:none');
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
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/workspace/activity') {
        throw new Error('activity unavailable');
      }

      if (path === '/api/knowledge-bases') {
        return [{ id: 'kb-1', name: 'Housing', slug: 'housing', description: null }];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: HomePage } = await import('./page');
    const tree = await HomePage();
    const text = await renderText(tree);

    expect(text).toContain('Workspace Activity Feed:0:Recent activity is unavailable right now.');
    expect(text).toContain('Choose a knowledge base');
    expect(text).not.toContain('Manage Knowledge Bases');
  });

  test('shows a knowledge-base unavailable fallback instead of leaving the user at the switcher', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'viewer' } });
    mockHasMinimumRole.mockReturnValue(false);
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/workspace/activity') {
        return [];
      }

      if (path === '/api/knowledge-bases') {
        throw new Error('kb unavailable');
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: HomePage } = await import('./page');
    const tree = await HomePage();
    const text = await renderText(tree);

    expect(text).toContain('KB Switcher:0:none');
    expect(text).toContain('Knowledge bases are unavailable right now.');
    expect(text).toContain('Please try again later or contact an admin if the problem continues.');
  });

  test('shows the explicit no-knowledge-bases-yet branch and fetches kb state once', async () => {
    mockAuth.mockResolvedValue({ user: { role: 'viewer' } });
    mockHasMinimumRole.mockReturnValue(false);
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/workspace/activity') {
        return [];
      }

      if (path === '/api/knowledge-bases') {
        return [];
      }

      throw new Error(`Unexpected path: ${path}`);
    });

    const { default: HomePage } = await import('./page');
    const tree = await HomePage();
    const text = await renderText(tree);

    expect(text).toContain('KB Switcher:0:none');
    expect(text).toContain('No knowledge bases are available yet.');
    expect(text).toContain('Contact an admin to get access or have one created.');
    expect(mockApiFetch.mock.calls.filter(([path]) => path === '/api/knowledge-bases')).toHaveLength(1);
  });
});
