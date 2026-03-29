'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClientFetch } from '../../../../lib/api-client';
import { useToast } from '../../../../lib/hooks/useToast';
import { runAdminMutation } from '../../../../lib/admin/mutation';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import type { KnowledgeBase } from '@dovetail/types';

export function KbManager({ initialKbs }: { initialKbs: KnowledgeBase[] }) {
  const router = useRouter();
  const [kbs, setKbs] = useState(initialKbs);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const { success, error } = useToast();

  async function handleCreate() {
    setLoading(true);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<KnowledgeBase>('/api/knowledge-bases', {
          method: 'POST',
          body: JSON.stringify({ name, description: description || undefined }),
        }),
      onSuccess: async (created) => {
        setKbs([...kbs, created]);
        setShowCreate(false);
        setName('');
        setDescription('');
        success('Knowledge base created');
      },
      onError: (err) => {
        error(err instanceof Error ? err.message : 'Failed to create knowledge base');
      },
      refresh: router.refresh,
    });
    setLoading(false);
  }

  async function handleDelete(id: string) {
    await runAdminMutation({
      execute: () => apiClientFetch(`/api/knowledge-bases/${id}`, { method: 'DELETE' }),
      onSuccess: async () => {
      setKbs(kbs.filter(kb => kb.id !== id));
      success('Knowledge base deleted');
      },
      onError: (err) => {
        error(err instanceof Error ? err.message : 'Failed to delete knowledge base');
      },
      refresh: router.refresh,
    });
  }

  return (
    <>
      <Button onClick={() => setShowCreate(true)} className="mb-6">Create Knowledge Base</Button>

      <div className="space-y-3">
        {kbs.map((kb) => (
          <Card key={kb.id}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-ink">{kb.name}</h3>
                <p className="text-ink-muted text-sm">/{kb.slug}</p>
                {kb.description && <p className="text-ink-muted text-sm mt-1">{kb.description}</p>}
              </div>
              <Button variant="danger" size="sm" onClick={() => handleDelete(kb.id)}>Delete</Button>
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
          <Button onClick={handleCreate} loading={loading} disabled={!name.trim()}>Create</Button>
        </div>
      </Modal>
    </>
  );
}
