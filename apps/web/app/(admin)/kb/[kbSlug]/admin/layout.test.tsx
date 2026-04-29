import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { KbProvider } from '../../../../../components/KbProvider';
import { auth } from '../../../../../auth';
import { apiFetch } from '../../../../../lib/api';
import { getKbBySlug } from '../../../../../lib/kb';
import KbAdminLayout from './layout';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

const { mockRedirect, mockNotFound } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  mockNotFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

vi.mock('../../../../../auth', () => ({
  auth: vi.fn(),
}));

vi.mock('../../../../../lib/kb', () => ({
  getKbBySlug: vi.fn(),
}));

vi.mock('../../../../../lib/api', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

describe('KbAdminLayout', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('allows admins through and provides KB context', async () => {
    const kb = {
      id: 'kb-1',
      name: 'Housing',
      slug: 'housing',
      description: null,
      defaultAccess: 'org_viewer',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
    };

    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never);
    vi.mocked(getKbBySlug).mockResolvedValue(kb as never);
    vi.mocked(apiFetch).mockResolvedValue({} as never);

    const element = await KbAdminLayout({
      children: <div data-testid="page-body" />,
      params: Promise.resolve({ kbSlug: 'housing' }),
    });

    expect(element.type).toBe(KbProvider);
    expect(element.props.kb).toBe(kb);
    expect(element.props.children.props['data-testid']).toBe('page-body');
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockNotFound).not.toHaveBeenCalled();
  });

  test('redirects users without KB admin API access away from the KB admin workspace', async () => {
    const kb = {
      id: 'kb-1',
      name: 'Housing',
      slug: 'housing',
      description: null,
      defaultAccess: 'org_viewer',
      createdAt: new Date('2026-03-28T12:00:00.000Z'),
    };

    vi.mocked(auth).mockResolvedValue({ user: { role: 'viewer' } } as never);
    vi.mocked(getKbBySlug).mockResolvedValue(kb as never);
    vi.mocked(apiFetch).mockRejectedValue(new Error('API error: 403 Forbidden') as never);

    await expect(
      KbAdminLayout({
        children: <div />,
        params: Promise.resolve({ kbSlug: 'housing' }),
      }),
    ).rejects.toThrow('redirect:/');

    expect(mockRedirect).toHaveBeenCalledWith('/');
  });

  test('raises notFound when the KB slug does not resolve', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: 'admin' } } as never);
    vi.mocked(getKbBySlug).mockResolvedValue(null);

    await expect(
      KbAdminLayout({
        children: <div />,
        params: Promise.resolve({ kbSlug: 'missing-kb' }),
      }),
    ).rejects.toThrow('notFound');

    expect(mockNotFound).toHaveBeenCalled();
  });
});
