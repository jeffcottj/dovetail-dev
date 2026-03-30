'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClientFetch } from '../../../../lib/api-client';
import { useToast } from '../../../../lib/hooks/useToast';
import { runAdminMutation } from '../../../../lib/admin/mutation';

interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  provider: string;
  createdAt: string;
}

interface PaginatedUsers {
  data: User[];
  total: number;
  page: number;
  limit: number;
}

const ROLES = ['viewer', 'editor', 'admin'] as const;

export function UserList({ users: serverUsers }: { users: User[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(serverUsers);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const toast = useToast();
  const displayedUsers = searchResults ?? users;

  useEffect(() => {
    const trimmedSearch = search.trim();
    if (!trimmedSearch) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      apiClientFetch<PaginatedUsers>(
        `/api/admin/users?search=${encodeURIComponent(trimmedSearch)}&limit=100`,
      )
        .then((result) => {
          if (!cancelled) {
            setSearchResults(result.data);
          }
        })
        .catch(() => {});
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdating(userId);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<User>(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        }),
      onSuccess: async (updated) => {
        const applyRoleUpdate = (user: User) =>
          user.id === userId ? { ...user, role: updated.role } : user;

        setUsers((prev) => prev.map(applyRoleUpdate));
        setSearchResults((prev) => prev?.map(applyRoleUpdate) ?? null);
        toast.success('Role updated');
      },
      onError: () => {
        toast.error('Failed to update role');
      },
      refresh: router.refresh,
    });
    setUpdating(null);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-full rounded-lg border border-border-light bg-parchment px-4 py-2 pr-8 text-sm font-[family-name:var(--font-ui)] text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted transition-colors hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border-light">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-light bg-parchment-warm">
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Name
              </th>
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Email
              </th>
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Provider
              </th>
              <th className="px-4 py-3 text-left font-[family-name:var(--font-ui)] text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Role
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedUsers.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer border-b border-border-light transition-colors last:border-0 hover:bg-parchment-warm/50"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('select')) return;
                  router.push(`/admin/users/${user.id}`);
                }}
              >
                <td className="px-4 py-3 text-sm text-ink">{user.name}</td>
                <td className="px-4 py-3 text-sm text-ink-light">{user.email}</td>
                <td className="px-4 py-3 text-sm capitalize text-ink-muted">{user.provider}</td>
                <td className="px-4 py-3">
                  <select
                    value={user.role}
                    disabled={updating === user.id}
                    onChange={(event) => handleRoleChange(user.id, event.target.value)}
                    className="rounded border border-border bg-parchment px-2 py-1 font-[family-name:var(--font-ui)] text-sm disabled:opacity-50"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {displayedUsers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink-muted">
                  {search.trim() ? `No users matching '${search.trim()}'` : 'No users found.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
