import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { UserList } from './UserList';

interface PaginatedUsers {
  data: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
    role: string;
    provider: string;
    createdAt: string;
  }[];
  total: number;
  page: number;
  limit: number;
}

export default async function AdminUsersPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  let users: PaginatedUsers = { data: [], total: 0, page: 1, limit: 20 };
  let error: string | null = null;
  try {
    users = await apiFetch<PaginatedUsers>('/api/admin/users?limit=100');
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to load users';
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
        User Management
      </h1>
      {error ? (
        <div className="mb-8 p-4 bg-danger/10 border border-danger/30 rounded-lg text-sm text-danger font-[family-name:var(--font-ui)]">
          {error}
        </div>
      ) : (
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
          {users.total} user{users.total !== 1 ? 's' : ''} total
        </p>
      )}

      <UserList users={users.data} />
    </div>
  );
}
