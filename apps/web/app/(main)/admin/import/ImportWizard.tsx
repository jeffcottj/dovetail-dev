'use client';

import { useState, useRef, useEffect } from 'react';
import { apiClientFetch } from '../../../../lib/api-client';
import { FileDropzone } from '../../../../components/FileDropzone';
import { CategoryTreePreview } from '../../../../components/CategoryTreePreview';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { useToast } from '../../../../lib/hooks/useToast';

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

export default function ImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [defaultStatus, setDefaultStatus] = useState<'draft' | 'published'>('draft');
  const [progress, setProgress] = useState<{ imported: number; total: number; current: string }>({ imported: 0, total: 0, current: '' });
  const [errors, setErrors] = useState<{ article: string; message: string }[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const toast = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleFileSelected = async (file: File) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Use raw fetch for multipart — apiClientFetch sets Content-Type: application/json
      const res = await fetch('/api/admin/import/preview', {
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
      const res = await apiClientFetch<{ jobId: string }>('/api/admin/import/execute', {
        method: 'POST',
        body: JSON.stringify({
          tempId: preview.tempId,
          options: { defaultStatus },
        }),
      });
      setJobId(res.jobId);
      setStep('importing');
      setProgress({ imported: 0, total: preview.summary.articleCount, current: '' });

      // Connect SSE
      const es = new EventSource(`/api/admin/import/${res.jobId}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data: ProgressEvent = JSON.parse(event.data);
        if (data.type === 'progress') {
          setProgress({ imported: data.imported!, total: data.total!, current: data.current! });
        } else if (data.type === 'error') {
          setErrors((prev) => [...prev, { article: data.article!, message: data.message! }]);
        } else if (data.type === 'complete') {
          setProgress((prev) => ({ ...prev, imported: data.imported! }));
          setStep('complete');
          es.close();
        }
      };

      es.onerror = () => {
        es.close();
        toast.error('Lost connection to import progress stream');
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
      const res = await apiClientFetch<{ published: number }>('/api/admin/articles/bulk-publish', {
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
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-4">Import Complete</h2>
          <p className="text-sm text-ink font-[family-name:var(--font-ui)] mb-2">
            Successfully imported {progress.imported} articles.
          </p>
          {errors.length > 0 && (
            <p className="text-sm text-danger font-[family-name:var(--font-ui)] mb-4">
              {errors.length} articles had errors.
            </p>
          )}
          <div className="flex gap-3">
            {defaultStatus === 'draft' && (
              <Button onClick={handleBulkPublish} loading={loading}>
                Publish All
              </Button>
            )}
            <Button variant="secondary" onClick={() => { setStep('upload'); setPreview(null); setErrors([]); }}>
              Import Another
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
