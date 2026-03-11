'use client';

import { useState, useEffect } from 'react';
import { apiClientFetch } from '../../../../../lib/api-client';
import { buildTree, flattenTree } from '../../../../../lib/categories';
import { Button } from '../../../../../components/ui/Button';
import { Badge } from '../../../../../components/ui/Badge';
import type { Category, Role, UserCategoryRole } from '@dovetail/types';

const ROLES: Role[] = ['viewer', 'editor', 'admin'];

interface CategoryRoleManagerProps {
  userId: string;
  initialCategoryRoles: UserCategoryRole[];
}

export function CategoryRoleManager({ userId, initialCategoryRoles }: CategoryRoleManagerProps) {
  const [categoryRoles, setCategoryRoles] = useState(initialCategoryRoles);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('editor');
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClientFetch<Category[]>('/api/categories')
      .then(setCategories)
      .catch(() => {});
  }, []);

  const flatOptions = flattenTree(buildTree(categories));
  // Filter out categories that already have an override
  const assignedCategoryIds = new Set(categoryRoles.map((cr) => cr.categoryId));
  const availableOptions = flatOptions.filter((opt) => !assignedCategoryIds.has(opt.id));

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCategoryId) return;
    setAssigning(true);
    setError(null);

    try {
      await apiClientFetch(`/api/admin/users/${userId}/category-roles`, {
        method: 'POST',
        body: JSON.stringify({ categoryId: selectedCategoryId, role: selectedRole }),
      });
      const categoryName = flatOptions.find((o) => o.id === selectedCategoryId)?.name ?? '';
      setCategoryRoles((prev) => {
        // Update existing or add new
        const existing = prev.find((cr) => cr.categoryId === selectedCategoryId);
        if (existing) {
          return prev.map((cr) =>
            cr.categoryId === selectedCategoryId ? { ...cr, role: selectedRole } : cr,
          );
        }
        return [...prev, { categoryId: selectedCategoryId, categoryName, role: selectedRole }];
      });
      setSelectedCategoryId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign role');
    } finally {
      setAssigning(false);
    }
  }

  async function handleRemove(categoryId: string) {
    setRemoving(categoryId);
    setError(null);
    try {
      await apiClientFetch(`/api/admin/users/${userId}/category-roles/${categoryId}`, {
        method: 'DELETE',
      });
      setCategoryRoles((prev) => prev.filter((cr) => cr.categoryId !== categoryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove role');
    } finally {
      setRemoving(null);
    }
  }

  const roleBadgeVariant = (role: Role) => {
    if (role === 'admin') return 'archived' as const;
    if (role === 'editor') return 'info' as const;
    return 'draft' as const;
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleAssign} className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted font-semibold mb-1">
            Category
          </label>
          <select
            value={selectedCategoryId}
            onChange={(e) => setSelectedCategoryId(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 text-sm bg-parchment font-[family-name:var(--font-ui)]"
          >
            <option value="">Select a category...</option>
            {availableOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {'\u00A0\u00A0'.repeat(opt.depth)}{opt.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted font-semibold mb-1">
            Role
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
            className="border border-border rounded px-3 py-2 text-sm bg-parchment font-[family-name:var(--font-ui)]"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" disabled={assigning || !selectedCategoryId} size="md">
          {assigning ? 'Assigning...' : 'Assign'}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-danger font-[family-name:var(--font-ui)]">{error}</p>
      )}

      <div className="border border-border-light rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-parchment-warm border-b border-border-light">
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Category
              </th>
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Role
              </th>
              <th className="text-right px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {categoryRoles.map((cr) => (
              <tr key={cr.categoryId} className="border-b border-border-light last:border-0">
                <td className="px-4 py-3 text-sm text-ink">{cr.categoryName}</td>
                <td className="px-4 py-3">
                  <Badge variant={roleBadgeVariant(cr.role)}>{cr.role}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleRemove(cr.categoryId)}
                    disabled={removing === cr.categoryId}
                  >
                    {removing === cr.categoryId ? 'Removing...' : 'Remove'}
                  </Button>
                </td>
              </tr>
            ))}
            {categoryRoles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-muted text-sm">
                  No category-level role overrides assigned.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
