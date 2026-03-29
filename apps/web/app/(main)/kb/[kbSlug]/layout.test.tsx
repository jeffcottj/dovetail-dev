import React from 'react';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Suspense } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { KbProvider } from '../../../../components/KbProvider';
import { getKbBySlug } from '../../../../lib/kb';
import KbLayout from './layout';

const { mockSidebarWrapper } = vi.hoisted(() => ({
  mockSidebarWrapper: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
}));

vi.mock('../../../../lib/kb', () => ({
  getKbBySlug: vi.fn(),
}));

vi.mock('../../../../components/SearchBar', () => ({
  SearchBar: function SearchBar() {
    return <div data-testid="search-bar" />;
  },
}));

vi.mock('../../../../components/HeaderUserArea', () => ({
  HeaderUserArea: function HeaderUserArea() {
    return <div data-testid="header-user-area" />;
  },
}));

vi.mock('../../../../components/RoleGate', () => ({
  RoleGate: function RoleGate({ children }: { children: ReactNode }) {
    return <>{children}</>;
  },
}));

vi.mock('../../../../components/ui/Button', () => ({
  Button: function Button({ children }: { children: ReactNode }) {
    return <button>{children}</button>;
  },
}));

vi.mock('../../../../components/SidebarWrapper', () => ({
  SidebarWrapper: mockSidebarWrapper,
}));

vi.mock('../../../../components/KbSidebar', () => ({
  KbSidebar: function KbSidebar() {
    return null;
  },
}));

vi.mock('lucide-react', () => ({
  FilePlus: function FilePlus() {
    return <svg data-testid="file-plus" />;
  },
}));

vi.mock('next/link', () => ({
  default: function Link({
    children,
    href,
  }: {
    children: ReactNode;
    href: string;
  }) {
    return <a href={href}>{children}</a>;
  },
}));

function collectElements(node: ReactNode, elements: ReactElement[] = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, elements));
    return elements;
  }

  if (!isValidElement(node)) return elements;

  elements.push(node);
  collectElements(node.props?.children, elements);
  return elements;
}

describe('KbLayout', () => {
  test('renders the KB header shell with the scoped header pieces', async () => {
    vi.mocked(getKbBySlug).mockResolvedValue({
      id: 'kb-1',
      slug: 'default',
    } as never);

    const element = await KbLayout({
      children: <div data-testid="page-body" />,
      params: Promise.resolve({ kbSlug: 'default' }),
    });

    expect(element.type).toBe(KbProvider);

    const topLevelChildren = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    const sidebarColumn = topLevelChildren.find(
      (node) => node.type === mockSidebarWrapper,
    );
    const contentColumn = topLevelChildren.find(
      (node) =>
        node.type === 'div' &&
        typeof node.props.className === 'string' &&
        node.props.className.includes('flex-1 flex flex-col'),
    );

    expect(sidebarColumn?.props.toggleClassName).toBe('top-15 -right-4 -translate-y-1/2');
    expect(contentColumn).toBeDefined();

    const contentColumnChildren = Array.isArray(contentColumn?.props.children)
      ? contentColumn?.props.children
      : [contentColumn?.props.children];
    const [header, mainContent] = contentColumnChildren ?? [];

    expect(header?.type).toBe('header');
    expect(mainContent?.type).toBe('main');
    expect(mainContent?.props?.id).toBe('main-content');
    expect(mainContent?.props?.className).toContain('p-8');
    expect(mainContent?.props?.children?.props?.['data-testid']).toBe('page-body');

    const headerElements = collectElements(header?.props.children);
    const roleGate = headerElements.find((node) => node.type.name === 'RoleGate');
    const searchBar = headerElements.find((node) => node.type.name === 'SearchBar');
    const headerUserArea = headerElements.find((node) => node.type.name === 'HeaderUserArea');
    const newArticleLink = headerElements.find(
      (node) => node.props?.href === '/kb/default/articles/new',
    );

    expect(roleGate).toBeDefined();
    expect(roleGate?.props.minimumRole).toBe('editor');
    expect(searchBar).toBeDefined();
    expect(headerUserArea).toBeDefined();
    expect(newArticleLink).toBeDefined();

    const headerChildren = Array.isArray(header?.props.children)
      ? header?.props.children
      : [header?.props.children];
    const leftSide = headerChildren?.[0];
    const rightSide = headerChildren?.[1];
    expect(leftSide?.props.className).toContain('flex-1');
    const leftSideChildren = Array.isArray(leftSide?.props.children)
      ? leftSide?.props.children
      : [leftSide?.props.children];
    const searchBarWrapper = leftSideChildren?.[1];

    expect(searchBarWrapper?.type).toBe(Suspense);
    expect(searchBarWrapper?.props.children?.type.name).toBe('SearchBar');
    expect(rightSide?.type.name).toBe('HeaderUserArea');

    const linkChildren = collectElements(newArticleLink?.props.children);
    const button = linkChildren.find((node) => node.type.name === 'Button');

    expect(button).toBeDefined();
    expect(button?.props.children).toEqual(
      expect.arrayContaining([expect.any(Object), expect.stringContaining('New Article')]),
    );
  });
});
