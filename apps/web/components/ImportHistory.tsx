'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { apiClientFetch } from '../lib/api-client';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';

type ImportStatus = 'pending' | 'running' | 'completed' | 'failed';

interface ImportJob {
  id: string;
  status: ImportStatus;
  totalArticles: number;
  importedCount: number;
  errorLog: { article_title?: string; error_message?: string }[];
  options: { defaultStatus?: 'draft' | 'published' };
  createdAt: string;
  completedAt: string | null;
}

const statusConfig: Record<ImportStatus, { label: string; icon: typeof Clock3; className: string }> = {
  pending: { label: 'Pending', icon: Clock3, className: 'bg-warning/10 text-warning' },
  running: { label: 'Running', icon: Loader2, className: 'bg-warning/10 text-warning' },
  completed: { label: 'Completed', icon: CheckCircle2, className: 'bg-success/10 text-success' },
  failed: { label: 'Failed', icon: XCircle, className: 'bg-danger/10 text-danger' },
};

function formatDate(value: string | null) {
  if (!value) return 'Not completed';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ImportHistory({ kbId, refreshKey }: { kbId: string; refreshKey: number }) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadJobs() {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClientFetch<ImportJob[]>(`/api/knowledge-bases/${kbId}/admin/import`);
        if (isMounted) {
          setJobs(data);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load import history');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadJobs();

    return () => {
      isMounted = false;
    };
  }, [kbId, refreshKey]);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Import History</h2>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-ink-muted" aria-hidden="true" /> : null}
      </div>

      {error ? (
        <div className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {!loading && !error && jobs.length === 0 ? (
        <p className="font-[family-name:var(--font-ui)] text-sm text-ink-muted">No imports have been run for this knowledge base.</p>
      ) : null}

      {jobs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left font-[family-name:var(--font-ui)] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase text-ink-muted">
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 pr-4 font-semibold">Articles</th>
                <th className="py-2 pr-4 font-semibold">Errors</th>
                <th className="py-2 pr-4 font-semibold">Default</th>
                <th className="py-2 pr-4 font-semibold">Started</th>
                <th className="py-2 font-semibold">Completed</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const config = statusConfig[job.status] ?? statusConfig.pending;
                const Icon = config.icon;
                const errorCount = Array.isArray(job.errorLog) ? job.errorLog.length : 0;
                return (
                  <tr key={job.id} className="border-b border-border-light last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${job.status === 'running' ? 'animate-spin' : ''}`} aria-hidden="true" />
                        <Badge variant="custom" className={config.className}>{config.label}</Badge>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-ink">
                      {job.importedCount} / {job.totalArticles}
                    </td>
                    <td className="py-3 pr-4 text-ink">{errorCount}</td>
                    <td className="py-3 pr-4 text-ink capitalize">{job.options?.defaultStatus ?? 'draft'}</td>
                    <td className="py-3 pr-4 text-ink-muted">{formatDate(job.createdAt)}</td>
                    <td className="py-3 text-ink-muted">{formatDate(job.completedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
