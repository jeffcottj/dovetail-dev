import React from 'react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminNav } from '../../components/admin/AdminNav';
import { AdminWorkspaceLayout } from '../../components/admin/AdminWorkspaceLayout';
import { buildGlobalAdminActions, buildKbAdminActions, getAdminNavSections } from './nav';

// Vitest executes this route module with a classic JSX transform, so the page
// expects a global React binding at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).React = React;

vi.mock('next/link', () => ({
  default: function Link({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) {
    return React.createElement('a', { href, ...props }, children);
  },
}));

function collectElements(node: ReactNode, elements: ReactElement<any>[] = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, elements));
    return elements;
  }

  if (!isValidElement(node)) return elements;

  const element = node as ReactElement<any>;
  elements.push(element);
  collectElements(element.props?.children, elements);
  return elements;
}

function collectText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (!isValidElement(node)) return '';
  return collectText(node.props?.children);
}

describe('getAdminNavSections', () => {
  it('returns global and KB sections when a KB context is present', () => {
    const sections = getAdminNavSections({
      pathname: '/kb/housing/admin/users',
      kb: { slug: 'housing', name: 'Housing' },
    });

    expect(sections).toHaveLength(2);
    expect(sections[0].label).toBe('Global Admin');
    expect(sections[0].items).toMatchObject([
      { label: 'Overview', href: '/admin', active: false },
      { label: 'Users', href: '/admin/users', active: false },
      { label: 'Knowledge Bases', href: '/admin/knowledge-bases', active: false },
      { label: 'API Keys', href: '/admin/api-keys', active: false },
    ]);
    expect(sections[1].label).toBe('Housing');
    expect(sections[1].items).toMatchObject([
      { label: 'KB Overview', href: '/kb/housing/admin', active: false },
      { label: 'Users & Roles', href: '/kb/housing/admin/users', active: true },
      { label: 'Tags', href: '/kb/housing/admin/tags', active: false },
      { label: 'Import', href: '/kb/housing/admin/import', active: false },
    ]);
  });
});

describe('buildGlobalAdminActions', () => {
  it('returns the global admin quick actions', () => {
    expect(buildGlobalAdminActions()).toEqual([
      expect.objectContaining({ label: 'Create Knowledge Base', href: '/admin/knowledge-bases' }),
      expect.objectContaining({ label: 'Manage Users', href: '/admin/users' }),
      expect.objectContaining({ label: 'Create API Key', href: '/admin/api-keys' }),
    ]);
  });
});

describe('buildKbAdminActions', () => {
  it('returns KB-scoped admin quick actions', () => {
    expect(buildKbAdminActions({ slug: 'housing' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: '/kb/housing/admin/users' }),
        expect.objectContaining({ href: '/kb/housing/admin/import' }),
      ]),
    );
  });
});

describe('Admin nav shell', () => {
  it('marks the current route and uses a stacked shell on narrow screens', () => {
    const sections = getAdminNavSections({
      pathname: '/admin/users',
    });

    const nav = AdminNav({ sections });
    const navElements = collectElements(nav);
    const desktopRail = navElements.find((node) => node.type === 'aside');

    expect(desktopRail?.props.className).toContain('w-full');
    expect(desktopRail?.props.className).toContain('lg:w-72');

    const workspace = AdminWorkspaceLayout({
      nav: { sections },
      header: {
        title: 'Admin Overview',
        description: 'System-wide operations and access control.',
      },
      metrics: [],
      actions: [],
      activity: [],
      children: React.createElement('div'),
    });

    expect(workspace.props.className).toContain('flex-col');
    expect(workspace.props.className).toContain('lg:flex-row');
  });

  it('renders a collapsed mobile navigation control separate from the desktop rail', () => {
    const sections = getAdminNavSections({
      pathname: '/kb/housing/admin/users',
      kb: { slug: 'housing', name: 'Housing' },
    });

    const nav = AdminNav({ sections });
    const elements = collectElements(nav);
    const mobileDisclosure = elements.find((node) => node.type === 'details');
    const mobileSummary = elements.find((node) => node.type === 'summary');
    const desktopRail = elements.find((node) => node.type === 'aside');

    expect(mobileDisclosure?.props.className).toContain('lg:hidden');
    expect(collectText(mobileSummary)).toContain('Browse admin sections');
    expect(desktopRail?.props.className).toContain('hidden');
    expect(desktopRail?.props.className).toContain('lg:block');
  });
});
