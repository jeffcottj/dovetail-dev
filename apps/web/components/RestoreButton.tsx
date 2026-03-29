'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClientFetch } from '../lib/api-client';
import { useToast } from '../lib/hooks/useToast';
import { useOptionalKb } from '../lib/hooks/useKb';

export function RestoreButton({
  articleId,
  versionId,
}: {
  articleId: string;
  versionId: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const kb = useOptionalKb();
  const apiBase = kb ? `/api/knowledge-bases/${kb.id}` : '/api';
  const [restoring, setRestoring] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!confirmed) {
    return (
      <button
        onClick={() => setConfirmed(true)}
        className="shrink-0 font-[family-name:var(--font-ui)] text-xs px-3 py-1.5 border border-border rounded hover:border-accent hover:text-accent transition-colors"
      >
        Restore
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-xs text-warning font-[family-name:var(--font-ui)]">Sure?</span>
      <button
        onClick={async () => {
          setRestoring(true);
          try {
            await apiClientFetch(
              `${apiBase}/articles/${articleId}/versions/${versionId}/restore`,
              { method: 'POST' },
            );
            router.refresh();
            toast.success('Version restored');
          } catch {
            toast.error('Failed to restore version');
            setRestoring(false);
            setConfirmed(false);
          }
        }}
        disabled={restoring}
        className="font-[family-name:var(--font-ui)] text-xs px-3 py-1.5 bg-accent text-parchment rounded hover:bg-accent-hover transition-colors disabled:opacity-50"
      >
        {restoring ? 'Restoring...' : 'Yes'}
      </button>
      <button
        onClick={() => setConfirmed(false)}
        className="font-[family-name:var(--font-ui)] text-xs px-2 py-1.5 text-ink-muted hover:text-ink transition-colors"
      >
        No
      </button>
    </div>
  );
}
