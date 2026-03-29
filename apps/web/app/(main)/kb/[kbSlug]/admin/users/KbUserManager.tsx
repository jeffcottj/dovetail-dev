'use client';

import { useState, useEffect } from 'react';
import { apiClientFetch } from '../../../../../../lib/api-client';
import { useToast } from '../../../../../../lib/hooks/useToast';
import type { User, Role } from '@dovetail/types';

interface KbUserRole {
  userId: string;
  role: Role;
}

export function KbUserManager({ users, kbId }: { users: User[]; kbId: string }) {
  const toast = useToast();
  const [kbRoles, setKbRoles] = useState<Map<string, Role>>(new Map());
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    apiClientFetch<KbUserRole[]>(`/api/knowledge-bases/${kbId}/users`)
      .then(roles => {
        const map = new Map<string, Role>();
        roles.forEach(r => map.set(r.userId, r.role));
        setKbRoles(map);
      })
      .catch(() => {});
  }, [kbId]);

  async function handleSetRole(userId: string, role: Role | 'none') {
    setUpdating(userId);
    try {
      if (role === 'none') {
        await apiClientFetch(`/api/knowledge-bases/${kbId}/users/${userId}`, { method: 'DELETE' });
        setKbRoles(prev => { const m = new Map(prev); m.delete(userId); return m; });
        toast.success('KB role removed');
      } else {
        await apiClientFetch(`/api/knowledge-bases/${kbId}/users/${userId}`, {
          method: 'POST',
          body: JSON.stringify({ role }),
        });
        setKbRoles(prev => new Map(prev).set(userId, role));
        toast.success('KB role updated');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="border border-border-light rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-parchment-warm border-b border-border-light">
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">User</th>
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">Global Role</th>
            <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">KB Role Override</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="border-b border-border-light last:border-0">
              <td className="px-4 py-3">
                <div className="text-sm text-ink font-medium">{user.name}</div>
                <div className="text-xs text-ink-muted">{user.email}</div>
              </td>
              <td className="px-4 py-3 text-sm text-ink-muted">{user.role}</td>
              <td className="px-4 py-3">
                <select
                  value={kbRoles.get(user.id) ?? 'none'}
                  onChange={(e) => handleSetRole(user.id, e.target.value as Role | 'none')}
                  disabled={updating === user.id}
                  className="border border-border rounded px-2 py-1 text-sm bg-parchment font-[family-name:var(--font-ui)]"
                >
                  <option value="none">-- (use global)</option>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-8 text-center text-ink-muted text-sm">
                No users found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
