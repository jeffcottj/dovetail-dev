import React from 'react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminNav } from '../../components/admin/AdminNav';
import { AdminWorkspaceLayout } from '../../components/admin/AdminWorkspaceLayout';
import { getAdminNavSections } from './nav';

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

vi.mock('../../components/admin/AdminContextSwitcher', () => ({
  AdminContextSwitcher: function AdminContextSwitcher() {
    return React.createElement('div', { 'data-testid': 'context-switcher' });
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
  if (typeof element.type === 'function') {
    collectElements((element.type as Function)(element.props), elements);
  }
  collectElements(element.props?.children, elements);
  return elements;
}

function collectText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join('');
  if (!isValidElement(node)) return '';
  return collectText((node.props as Record<string, unknown>)?.children as ReactNode);
}

describe('getAdminNavSections', () => {
  it('returns a single KB section when a KB context is present', () => {
    const sections = getAdminNavSections({
      pathname: '/kb/housing/admin/users',
      kb: { slug: 'housing', name: 'Housing' },
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe('Housing');
    expect(sections[0].items).toMatchObject([
      { label: 'KB Overview', href: '/kb/housing/admin', active: false },
      { label: 'Users & Roles', href: '/kb/housing/admin/users', active: true },
      { label: 'Tags', href: '/kb/housing/admin/tags', active: false },
      { label: 'Import', href: '/kb/housing/admin/import', active: false },
      { label: 'Recent Activity', href: '/kb/housing/admin/activity', active: false },
    ]);
  });
});


describe('Admin nav shell', () => {
  it('marks the current route and uses a stacked shell on narrow screens', () => {
    const sections = getAdminNavSections({
      pathname: '/admin/users',
    });

    const nav = AdminNav({ sections, isGlobalAdmin: true, currentKbSlug: null });
    const navElements = collectElements(nav);
    const activeLinks = navElements.filter(
      (node) => node.type === 'a' && node.props.href === '/admin/users' && node.props['aria-current'] === 'page',
    );
    const desktopRail = navElements.find((node) => node.type === 'aside');

    expect(activeLinks).toHaveLength(2);
    expect(desktopRail?.props.className).toContain('w-full');
    expect(desktopRail?.props.className).toContain('lg:w-96');

    const workspace = AdminWorkspaceLayout({
      nav: { sections, isGlobalAdmin: true, currentKbSlug: null },
      header: {
        title: 'Admin Overview',
      },
      metrics: [],
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

    const nav = AdminNav({ sections, isGlobalAdmin: true, currentKbSlug: 'housing', currentKbName: 'Housing' });
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
