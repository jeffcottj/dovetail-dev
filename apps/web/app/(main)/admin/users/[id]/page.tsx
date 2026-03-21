import Link from 'next/link';
import { auth } from '../../../../../auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '../../../../../lib/api';
import { Badge } from '../../../../../components/ui/Badge';
import { CategoryRoleManager } from './CategoryRoleManager';
import type { UserCategoryRole } from '@dovetail/types';

interface UserData {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  provider: string;
  createdAt: string;
}

interface PaginatedUsers {
  data: UserData[];
  total: number;
  page: number;
  limit: number;
}

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const { id } = await params;

  // Fetch user data — use the list endpoint and find the user
  let user: UserData | null = null;
  try {
    const result = await apiFetch<PaginatedUsers>('/api/admin/users?limit=100');
    user = result.data.find((u) => u.id === id) ?? null;
  } catch {
    // API unavailable
  }

  if (!user) {
    redirect('/admin/users');
  }

  // Fetch category role overrides
  let categoryRoles: UserCategoryRole[] = [];
  try {
    const result = await apiFetch<{ categoryRoles: UserCategoryRole[] }>(
      `/api/admin/users/${id}/category-roles`,
    );
    categoryRoles = result.categoryRoles;
  } catch {
    // API unavailable
  }

  const roleBadgeVariant =
    user.role === 'admin' ? 'archived' : user.role === 'editor' ? 'info' : 'draft';

  return (
    <div>
      <nav className="mb-6">
        <Link
          href="/admin/users"
          className="text-sm text-accent hover:underline font-[family-name:var(--font-ui)]"
        >
          &larr; Back to Users
        </Link>
      </nav>

      <div className="flex items-start gap-4 mb-8">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.name}
            className="w-16 h-16 rounded-full border border-border-light"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-parchment-warm border border-border-light flex items-center justify-center text-xl font-[family-name:var(--font-display)] text-ink-muted">
            {user.name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
        )}
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink tracking-tight">
            {user.name}
          </h1>
          <p className="text-ink-light text-sm mt-1">{user.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={roleBadgeVariant}>{user.role}</Badge>
            <span className="text-xs text-ink-muted capitalize font-[family-name:var(--font-ui)]">
              via {user.provider}
            </span>
          </div>
        </div>
      </div>

      <section>
        <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-4">
          Category Role Overrides
        </h2>
        <p className="text-ink-light text-sm mb-4 font-[family-name:var(--font-ui)]">
          Override this user&apos;s global role for specific categories. The most specific role wins when accessing content in a category.
        </p>
        <CategoryRoleManager userId={id} initialCategoryRoles={categoryRoles} />
      </section>
    </div>
  );
}
