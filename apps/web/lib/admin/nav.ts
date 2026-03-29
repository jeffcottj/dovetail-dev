export interface AdminNavItem {
  label: string;
  href: string;
  active?: boolean;
}

export interface AdminNavSection {
  label: string;
  items: AdminNavItem[];
}

export interface AdminNavInput {
  pathname: string;
  kb?: {
    slug: string;
    name: string;
  } | null;
}

export function getAdminNavSections(input: AdminNavInput): AdminNavSection[] {
  const pathname = input.pathname.replace(/\/+$/, '') || '/';
  const isExact = (href: string) => pathname === href;
  const isDescendant = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const globalItems: AdminNavItem[] = [
    { label: 'Overview', href: '/admin', active: isExact('/admin') },
    { label: 'Users', href: '/admin/users', active: isDescendant('/admin/users') },
    { label: 'Knowledge Bases', href: '/admin/knowledge-bases', active: isExact('/admin/knowledge-bases') },
    { label: 'API Keys', href: '/admin/api-keys', active: isExact('/admin/api-keys') },
  ];

  const kbItems = input.kb
    ? [
        {
          label: 'KB Overview',
          href: `/kb/${input.kb.slug}/admin`,
          active: isExact(`/kb/${input.kb.slug}/admin`),
        },
        {
          label: 'Users & Roles',
          href: `/kb/${input.kb.slug}/admin/users`,
          active: isDescendant(`/kb/${input.kb.slug}/admin/users`),
        },
        { label: 'Tags', href: `/kb/${input.kb.slug}/admin/tags`, active: isExact(`/kb/${input.kb.slug}/admin/tags`) },
        { label: 'Import', href: `/kb/${input.kb.slug}/admin/import`, active: isExact(`/kb/${input.kb.slug}/admin/import`) },
      ]
    : [];

  return [
    { label: 'Global Admin', items: globalItems },
    ...(kbItems.length > 0 ? [{ label: input.kb!.name, items: kbItems }] : []),
  ];
}
