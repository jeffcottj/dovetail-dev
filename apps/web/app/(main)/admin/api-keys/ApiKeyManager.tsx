'use client';

import { useState } from 'react';
import { apiClientFetch } from '../../../../lib/api-client';
import { useToast } from '../../../../lib/hooks/useToast';
import { Button } from '../../../../components/ui/Button';

interface ApiKey {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function ApiKeyManager({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const toast = useToast();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const result = await apiClientFetch<{ id: string; name: string; key: string; createdAt: string }>(
        '/api/admin/api-keys',
        { method: 'POST', body: JSON.stringify({ name: newKeyName }) },
      );
      setCreatedKey(result.key);
      setKeys((prev) => [
        ...prev,
        { id: result.id, name: result.name, createdBy: '', createdAt: result.createdAt, lastUsedAt: null, revokedAt: null },
      ]);
      setNewKeyName('');
      toast.success('API key created');
    } catch {
      toast.error('Failed to create API key');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      await apiClientFetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' });
      setKeys((prev) =>
        prev.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
      );
      toast.success('API key revoked');
    } catch {
      toast.error('Failed to revoke API key');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleCreate} className="flex gap-3 items-end">
        <div className="flex-1">
          <label htmlFor="api-key-name" className="block text-xs font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted font-semibold mb-1">
            Key name
          </label>
          <input
            id="api-key-name"
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="e.g., LibreChat production"
            className="w-full border border-border rounded px-3 py-2 text-sm bg-parchment font-[family-name:var(--font-ui)]"
          />
        </div>
        <Button type="submit" loading={creating} disabled={!newKeyName.trim()}>
          Create Key
        </Button>
      </form>

      {createdKey && (
        <div className="bg-success/10 border border-success/30 rounded-lg p-4">
          <p className="text-sm font-semibold text-success font-[family-name:var(--font-ui)] mb-2">
            Key created. Copy it now — it won't be shown again.
          </p>
          <code className="block bg-parchment-warm border border-border-light rounded px-3 py-2 text-sm font-[family-name:var(--font-mono)] break-all select-all">
            {createdKey}
          </code>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-2 text-xs text-ink-muted hover:text-ink font-[family-name:var(--font-ui)]"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="border border-border-light rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-parchment-warm border-b border-border-light">
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Name
              </th>
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Created
              </th>
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Last Used
              </th>
              <th className="text-left px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Status
              </th>
              <th className="text-right px-4 py-3 font-[family-name:var(--font-ui)] text-xs uppercase tracking-wider text-ink-muted font-semibold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key.id} className="border-b border-border-light last:border-0">
                <td className="px-4 py-3 text-sm text-ink">{key.name}</td>
                <td className="px-4 py-3 text-sm text-ink-light">
                  {new Date(key.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-sm text-ink-muted">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3">
                  {key.revokedAt ? (
                    <span className="text-xs px-2 py-0.5 rounded bg-danger/10 text-danger font-[family-name:var(--font-ui)] font-medium">
                      Revoked
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success font-[family-name:var(--font-ui)] font-medium">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!key.revokedAt && (
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={revoking === key.id}
                      className="text-xs text-danger hover:text-danger/80 font-[family-name:var(--font-ui)] font-medium disabled:opacity-50"
                    >
                      {revoking === key.id ? 'Revoking...' : 'Revoke'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {keys.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-ink-muted text-sm">
                  No API keys created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
