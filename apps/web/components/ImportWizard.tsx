'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiClientFetch } from '../lib/api-client';
import { FileDropzone } from './FileDropzone';
import { CategoryTreePreview } from './CategoryTreePreview';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { useToast } from '../lib/hooks/useToast';

type Step = 'upload' | 'preview' | 'importing' | 'complete';

interface PreviewData {
  tempId: string;
  summary: {
    articleCount: number;
    categoryCount: number;
    attachmentCount: number;
    categoryTree: any[];
  };
  warnings: { article: string; message: string }[];
}

interface ProgressEvent {
  type: 'progress' | 'error' | 'complete';
  imported?: number;
  total?: number;
  current?: string;
  article?: string;
  message?: string;
  errors?: number;
}

interface ImportJob {
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalArticles: number;
  importedCount: number;
  errorLog: { article_title?: string; error_message?: string }[];
}

export default function ImportWizard({ kbId, onImportComplete }: { kbId?: string; onImportComplete?: () => void }) {
  const apiPrefix = kbId ? `/api/knowledge-bases/${kbId}` : '/api';
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<'draft' | 'published'>('draft');
  const [progress, setProgress] = useState<{ imported: number; total: number; current: string }>({ imported: 0, total: 0, current: '' });
  const [errors, setErrors] = useState<{ article: string; message: string }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [importFailed, setImportFailed] = useState(false);
  const toast = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const completionHandledRef = useRef(false);

  const finishImport = useCallback((next: {
    imported: number;
    total?: number;
    errors?: { article: string; message: string }[];
    failed?: boolean;
  }) => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    setImportFailed(Boolean(next.failed));
    setProgress((prev) => ({
      ...prev,
      imported: next.imported,
      total: next.total ?? prev.total,
      current: '',
    }));
    if (next.errors) {
      setErrors(next.errors);
    }
    setStep('complete');
    onImportComplete?.();
    eventSourceRef.current?.close();
  }, [onImportComplete]);

  const handleFileSelected = async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use raw fetch for multipart — apiClientFetch sets Content-Type: application/json
      const res = await fetch(`${apiPrefix}/admin/import/preview`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Upload failed');
      }

      const data: PreviewData = await res.json();
      setPreview(data);
      setStep('preview');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      const res = await apiClientFetch<{ jobId: string }>(`${apiPrefix}/admin/import/execute`, {
        method: 'POST',
        body: JSON.stringify({
          tempId: preview.tempId,
          options: { defaultStatus },
        }),
      });
      completionHandledRef.current = false;
      setImportFailed(false);
      setErrors([]);
      setJobId(res.jobId);
      setStep('importing');
      setProgress({ imported: 0, total: preview.summary.articleCount, current: '' });

      // Connect SSE
      const es = new EventSource(`${apiPrefix}/admin/import/${res.jobId}/progress`, { withCredentials: true });
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data);
        if (data.type === 'progress') {
          setProgress({ imported: data.imported!, total: data.total!, current: data.current! });
        } else if (data.type === 'error') {
          setErrors((prev) => [...prev, { article: data.article!, message: data.message! }]);
        } else if (data.type === 'complete') {
          finishImport({ imported: data.imported! });
        }
      };

      es.onerror = () => {
        es.close();
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to start import');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPublish = async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const res = await apiClientFetch<{ published: number }>(`${apiPrefix}/admin/articles/bulk-publish`, {
        method: 'POST',
        body: JSON.stringify({ importJobId: jobId }),
      });
      toast.success(`Published ${res.published} articles`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (step !== 'importing' || !jobId) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function pollJob() {
      try {
        const job = await apiClientFetch<ImportJob>(`${apiPrefix}/admin/import/${jobId}`);
        if (cancelled) return;

        setProgress((prev) => ({
          ...prev,
          imported: job.importedCount,
          total: job.totalArticles || prev.total,
        }));

        if (job.status === 'completed' || job.status === 'failed') {
          const jobErrors = Array.isArray(job.errorLog)
            ? job.errorLog.map((entry) => ({
              article: entry.article_title ?? 'Import',
              message: entry.error_message ?? 'Unknown error',
            }))
            : [];
          finishImport({
            imported: job.importedCount,
            total: job.totalArticles || undefined,
            errors: jobErrors,
            failed: job.status === 'failed',
          });
          if (interval) clearInterval(interval);
        }
      } catch {
        // SSE may still be active; keep polling on the next tick.
      }
    }

    void pollJob();
    interval = setInterval(() => void pollJob(), 1500);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [apiPrefix, finishImport, jobId, step]);

  return (
    <div className="space-y-6">
      {/* Step 1: Upload */}
      {step === 'upload' && (
        <Card>
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Upload Export</h2>
          <p className="text-sm text-ink-muted mb-4 font-[family-name:var(--font-ui)]">
            Upload a ZIP file exported from Flowlu Knowledge Base.
          </p>
          <FileDropzone onFileSelected={handleFileSelected} disabled={loading} />
          {loading && (
            <p className="text-sm text-ink-muted mt-3 font-[family-name:var(--font-ui)]">Parsing export...</p>
          )}
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && preview && (
        <>
          <Card>
            <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Import Preview</h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">{preview.summary.articleCount}</p>
                <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] uppercase tracking-wider">Articles</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">{preview.summary.categoryCount}</p>
                <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] uppercase tracking-wider">Categories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">{preview.summary.attachmentCount}</p>
                <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] uppercase tracking-wider">Attachments</p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted mb-3">Category Structure</h3>
            <CategoryTreePreview tree={preview.summary.categoryTree} />
          </Card>

          {preview.warnings.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold font-[family-name:var(--font-ui)] uppercase tracking-wider text-danger mb-3">Warnings ({preview.warnings.length})</h3>
              <ul className="text-sm space-y-1">
                {preview.warnings.map((w, i) => (
                  <li key={i} className="text-ink-muted">
                    <span className="font-medium text-ink">{w.article}:</span> {w.message}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold font-[family-name:var(--font-ui)] uppercase tracking-wider text-ink-muted mb-3">Import Options</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm font-[family-name:var(--font-ui)] text-ink">Default status:</span>
              <select
                value={defaultStatus}
                onChange={(e) => setDefaultStatus(e.target.value as 'draft' | 'published')}
                className="border border-border rounded px-3 py-1.5 text-sm bg-parchment font-[family-name:var(--font-ui)]"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <div className="mt-4 flex gap-3">
              <Button onClick={handleStartImport} loading={loading}>
                Start Import
              </Button>
              <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); }}>
                Cancel
              </Button>
            </div>
          </Card>
        </>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <Card>
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Importing...</h2>
          <div className="w-full bg-border-light rounded-full h-3 mb-3">
            <div
              className="bg-accent h-3 rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.imported / progress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-sm text-ink font-[family-name:var(--font-ui)]">
            {progress.imported} / {progress.total} articles
          </p>
          {progress.current && (
            <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
              Current: {progress.current}
            </p>
          )}
          {errors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-danger font-[family-name:var(--font-ui)] uppercase tracking-wider mb-2">{errors.length} Errors</p>
              <ul className="text-xs text-ink-muted max-h-32 overflow-y-auto space-y-1">
                {errors.map((e, i) => (
                  <li key={i}><span className="font-medium text-ink">{e.article}:</span> {e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && (
        <Card>
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">
            {importFailed ? 'Import Failed' : 'Import Complete'}
          </h2>
          <p className="text-sm text-ink font-[family-name:var(--font-ui)] mb-2">
            Imported {progress.imported} / {progress.total} articles.
          </p>
          {errors.length > 0 && (
            <div className="mb-4">
              <p className="text-sm text-danger font-[family-name:var(--font-ui)] mb-2">
                {errors.length} {errors.length === 1 ? 'article had' : 'articles had'} errors.
              </p>
              <ul className="max-h-36 space-y-1 overflow-y-auto text-xs text-ink-muted">
                {errors.map((e, i) => (
                  <li key={i}><span className="font-medium text-ink">{e.article}:</span> {e.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-3">
            {!importFailed && defaultStatus === 'draft' && (
              <Button onClick={handleBulkPublish} loading={loading}>
                Publish All
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); setErrors([]); setImportFailed(false); }}>
              Import Another
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
