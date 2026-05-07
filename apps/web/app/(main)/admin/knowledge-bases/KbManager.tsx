'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClientFetch } from '../../../../lib/api-client';
import { useToast } from '../../../../lib/hooks/useToast';
import { runAdminMutation } from '../../../../lib/admin/mutation';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import type { KbDefaultAccess, KnowledgeBase } from '@dovetail/types';

const ACCESS_LABELS: Record<KbDefaultAccess, { label: string; detail: string }> = {
  org_viewer: {
    label: 'Org-visible',
    detail: 'Every authenticated staff user can view by default.',
  },
  private: {
    label: 'Private',
    detail: 'Only assigned users and admins can view.',
  },
};

export function KbManager({ initialKbs }: { initialKbs: KnowledgeBase[] }) {
  const router = useRouter();
  const [kbs, setKbs] = useState(initialKbs);
  const [showCreate, setShowCreate] = useState(false);
  const [editingKb, setEditingKb] = useState<KnowledgeBase | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [defaultAccess, setDefaultAccess] = useState<KbDefaultAccess>('org_viewer');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDefaultAccess, setEditDefaultAccess] = useState<KbDefaultAccess>('org_viewer');
  const [loading, setLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deletingKb, setDeletingKb] = useState<KnowledgeBase | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [forcePurge, setForcePurge] = useState(false);
  const { success, error } = useToast();

  useEffect(() => {
    setKbs(initialKbs);
  }, [initialKbs]);

  function notifyKnowledgeBasesChanged() {
    window.dispatchEvent(new Event('dovetail:knowledge-bases-changed'));
  }

  async function handleCreate() {
    setLoading(true);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<KnowledgeBase>('/api/knowledge-bases', {
          method: 'POST',
          body: JSON.stringify({ name, description: description || undefined, defaultAccess }),
        }),
      onSuccess: async (created) => {
        setKbs([...kbs, created]);
        setShowCreate(false);
        setName('');
        setDescription('');
        setDefaultAccess('org_viewer');
        notifyKnowledgeBasesChanged();
        success('Knowledge base created');
      },
      onError: (err) => {
        error(err instanceof Error ? err.message : 'Failed to create knowledge base');
      },
      refresh: router.refresh,
    });
    setLoading(false);
  }

  function openEdit(kb: KnowledgeBase) {
    setEditingKb(kb);
    setEditName(kb.name);
    setEditDescription(kb.description ?? '');
    setEditDefaultAccess(kb.defaultAccess);
  }

  async function handleUpdate() {
    if (!editingKb) return;

    setEditLoading(true);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<KnowledgeBase>(`/api/knowledge-bases/${editingKb.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: editName,
            description: editDescription || null,
            defaultAccess: editDefaultAccess,
          }),
        }),
      onSuccess: async (updated) => {
        setKbs(kbs.map(kb => (kb.id === updated.id ? updated : kb)));
        setEditingKb(null);
        notifyKnowledgeBasesChanged();
        success('Knowledge base updated');
      },
      onError: (err) => {
        error(err instanceof Error ? err.message : 'Failed to update knowledge base');
      },
      refresh: router.refresh,
    });
    setEditLoading(false);
  }

  function openDelete(kb: KnowledgeBase) {
    setDeletingKb(kb);
    setDeleteConfirmInput('');
    setForcePurge(false);
  }

  function closeDelete() {
    setDeletingKb(null);
    setDeleteConfirmInput('');
    setForcePurge(false);
  }

  const canConfirmDelete = deletingKb !== null && deleteConfirmInput === deletingKb.name;

  async function handleDeleteConfirmed() {
    if (!deletingKb || !canConfirmDelete) return;
    const target = deletingKb;
    const purge = forcePurge;
    setDeleteLoading(true);
    await runAdminMutation({
      execute: () => apiClientFetch(
        `/api/knowledge-bases/${target.id}${purge ? '?purge=true' : ''}`,
        { method: 'DELETE' },
      ),
      onSuccess: async () => {
        setKbs(kbs.filter(kb => kb.id !== target.id));
        closeDelete();
        notifyKnowledgeBasesChanged();
        success(purge ? 'Knowledge base purged' : 'Knowledge base deleted');
      },
      onError: (err) => {
        error(err instanceof Error ? err.message : 'Failed to delete knowledge base');
      },
      refresh: router.refresh,
    });
    setDeleteLoading(false);
  }

  return (
    <>
      <Button onClick={() => setShowCreate(true)} className="mb-6">Create Knowledge Base</Button>

      <div className="space-y-3">
        {kbs.map((kb) => (
          <Card key={kb.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-semibold text-ink">{kb.name}</h3>
                <p className="text-ink-muted text-sm">/{kb.slug}</p>
                {kb.description && <p className="text-ink-muted text-sm mt-1">{kb.description}</p>}
                <p className="mt-3 inline-flex rounded border border-border bg-parchment px-2 py-1 text-xs font-medium text-ink">
                  {ACCESS_LABELS[kb.defaultAccess].label}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => openEdit(kb)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => openDelete(kb)}>Delete</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Knowledge Base">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
              placeholder="e.g., Maryland Housing Law"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Description (optional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Default access</label>
            <select
              value={defaultAccess}
              onChange={e => setDefaultAccess(e.target.value as KbDefaultAccess)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-parchment"
            >
              {Object.entries(ACCESS_LABELS).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">{ACCESS_LABELS[defaultAccess].detail}</p>
          </div>
          <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>Create</Button>
        </div>
      </Modal>

      <Modal open={editingKb !== null} onClose={() => setEditingKb(null)} title="Edit Knowledge Base">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Name</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Description (optional)</label>
            <textarea
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Default access</label>
            <select
              value={editDefaultAccess}
              onChange={e => setEditDefaultAccess(e.target.value as KbDefaultAccess)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-parchment"
            >
              {Object.entries(ACCESS_LABELS).map(([value, config]) => (
                <option key={value} value={value}>{config.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">{ACCESS_LABELS[editDefaultAccess].detail}</p>
          </div>
          <Button onClick={handleUpdate} loading={editLoading} disabled={!editName.trim()}>Save Changes</Button>
        </div>
      </Modal>

      <Modal open={deletingKb !== null} onClose={closeDelete} title="Delete Knowledge Base">
        <div className="space-y-4">
          <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-ink">
            <p className="font-medium text-danger">This cannot be undone.</p>
            {forcePurge ? (
              <p className="mt-1 text-ink-light">
                <span className="font-semibold text-danger">Force purge</span> permanently deletes
                every article, category, tag, attachment, and import job in this knowledge base.
              </p>
            ) : (
              <p className="mt-1 text-ink-light">
                Deleting a knowledge base permanently removes its configuration. The knowledge base
                must already be empty (no categories, tags, or in-flight imports). Use force purge
                below to delete a non-empty knowledge base and all its contents.
              </p>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm text-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={forcePurge}
              onChange={e => setForcePurge(e.target.checked)}
              className="mt-0.5"
              disabled={deleteLoading}
            />
            <span>
              <span className="font-medium">Force purge contents</span>
              <span className="block text-xs text-ink-muted">
                Required if the knowledge base still has articles, categories, tags, or import history.
              </span>
            </span>
          </label>
          <div>
            <label className="block text-sm text-ink mb-1">
              To confirm, type <span className="font-semibold">{deletingKb?.name}</span> below.
            </label>
            <input
              value={deleteConfirmInput}
              onChange={e => setDeleteConfirmInput(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm"
              placeholder={deletingKb?.name ?? ''}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDelete} disabled={deleteLoading}>Cancel</Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirmed}
              loading={deleteLoading}
              disabled={!canConfirmDelete}
            >
              {forcePurge ? 'Purge knowledge base' : 'Delete knowledge base'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
