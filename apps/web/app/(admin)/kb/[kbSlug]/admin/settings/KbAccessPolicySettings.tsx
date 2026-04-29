'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { KbDefaultAccess, KnowledgeBase } from '@dovetail/types';
import { Button } from '../../../../../../components/ui/Button';
import { Card } from '../../../../../../components/ui/Card';
import { apiClientFetch } from '../../../../../../lib/api-client';
import { runAdminMutation } from '../../../../../../lib/admin/mutation';
import { useToast } from '../../../../../../lib/hooks/useToast';

const ACCESS_LABELS: Record<KbDefaultAccess, { label: string; detail: string }> = {
  org_viewer: {
    label: 'Org-visible',
    detail: 'Every authenticated staff user can view this knowledge base by default.',
  },
  private: {
    label: 'Private',
    detail: 'Only assigned users and admins can view this knowledge base.',
  },
};

export function KbAccessPolicySettings({ kb }: { kb: KnowledgeBase }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [currentKb, setCurrentKb] = useState(kb);
  const [defaultAccess, setDefaultAccess] = useState<KbDefaultAccess>(kb.defaultAccess);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    await runAdminMutation({
      execute: () =>
        apiClientFetch<KnowledgeBase>(`/api/knowledge-bases/${currentKb.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ defaultAccess }),
        }),
      onSuccess: async (updated) => {
        setCurrentKb(updated);
        setDefaultAccess(updated.defaultAccess);
        success('Access policy updated');
      },
      onError: (err) => {
        error(err instanceof Error ? err.message : 'Failed to update access policy');
      },
      refresh: router.refresh,
    });
    setLoading(false);
  }

  return (
    <Card className="!bg-[color:var(--color-admin-panel)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.18em] text-ink-muted">
            Default Access
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">Knowledge base visibility</h2>
          <p className="mt-2 text-sm leading-6 text-ink-light">
            {ACCESS_LABELS[currentKb.defaultAccess].label} is currently active for {currentKb.name}.
          </p>
        </div>
        <div className="w-full max-w-md space-y-3">
          <label className="block text-sm font-medium text-ink" htmlFor="default-access">
            Default access policy
          </label>
          <select
            id="default-access"
            value={defaultAccess}
            onChange={e => setDefaultAccess(e.target.value as KbDefaultAccess)}
            className="w-full rounded-md border border-border bg-parchment px-3 py-2 text-sm text-ink"
          >
            {Object.entries(ACCESS_LABELS).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>
          <p className="text-xs leading-5 text-ink-muted">{ACCESS_LABELS[defaultAccess].detail}</p>
          <Button onClick={handleSave} loading={loading} disabled={defaultAccess === currentKb.defaultAccess}>
            Save Policy
          </Button>
        </div>
      </div>
    </Card>
  );
}
