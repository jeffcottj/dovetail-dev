'use client';

import { useState } from 'react';
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

const ROLES = ['viewer', 'editor', 'admin'] as const;

export function UserList({ users: initialUsers }: { users: User[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [updating, setUpdating] = useState<string | null>(null);
  const toast = useToast();

  async function handleRoleChange(userId: string, newRole: string) {
    setUpdating(userId);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<User>(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        }),
      onSuccess: async (updated) => {
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)));
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
    <div className="border border-border-light rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-parchment-warm border-b border-border-light">
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
              Name
            </th>
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
              Email
            </th>
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
              Provider
            </th>
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
              Role
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr
              key={user.id}
              className="border-b border-border-light last:border-0 cursor-pointer hover:bg-parchment-warm/50 transition-colors"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('select')) return;
                router.push(`/admin/users/${user.id}`);
              }}
            >
              <td className="px-4 py-3 text-sm text-ink">{user.name}</td>
              <td className="px-4 py-3 text-sm text-ink-light">{user.email}</td>
              <td className="px-4 py-3 text-sm text-ink-muted capitalize">{user.provider}</td>
              <td className="px-4 py-3">
                <select
                  value={user.role}
                  disabled={updating === user.id}
                  onChange={(e) => handleRoleChange(user.id, e.target.value)}
                  className="text-sm bg-parchment border border-border rounded px-2 py-1 font-[family-name:var(--font-ui)] disabled:opacity-50"
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
          {users.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-ink-muted text-sm">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
