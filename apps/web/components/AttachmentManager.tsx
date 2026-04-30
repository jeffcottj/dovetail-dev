'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { apiClientFetch } from '../lib/api-client';
import { useKb } from '../lib/hooks/useKb';
import { useToast } from '../lib/hooks/useToast';
import { Button } from './ui/Button';
import { fileTypeLabel, formatFileSize } from './AttachmentList';
import type { Attachment } from '@dovetail/types';

export function AttachmentManager({ articleId, refreshKey = 0 }: { articleId: string; refreshKey?: number }) {
  const kb = useKb();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<Attachment | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const basePath = `/api/knowledge-bases/${kb.id}/articles/${articleId}/attachments`;

  async function refresh() {
    setLoading(true);
    try {
      setAttachments(await apiClientFetch<Attachment[]>(basePath));
    } catch {
      toast.error('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [basePath, refreshKey]);

  async function sendFile(file: File, path: string, method: 'POST' | 'PATCH') {
    const body = new FormData();
    body.append('file', file);

    const res = await fetch(path, {
      method,
      credentials: 'include',
      body,
    });

    if (!res.ok) {
      let message = `API error: ${res.status}`;
      try {
        const payload = await res.json();
        if (payload.error) message = payload.error;
      } catch {
        // Non-JSON error response.
      }
      throw new Error(message);
    }
  }

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setBusy('upload');
    try {
      await sendFile(file, basePath, 'POST');
      toast.success('Attachment uploaded');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload attachment');
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function handleReplace(file: File | undefined) {
    const target = replaceTargetRef.current;
    if (!file || !target) return;
    setBusy(target.id);
    try {
      await sendFile(file, `${basePath}/${target.id}`, 'PATCH');
      toast.success('Attachment replaced');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to replace attachment');
    } finally {
      setBusy(null);
      replaceTargetRef.current = null;
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  }

  async function handleDelete(att: Attachment) {
    if (!window.confirm(`Delete ${att.filename}?`)) return;
    setBusy(att.id);
    try {
      const res = await fetch(`${basePath}/${att.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      toast.success('Attachment deleted');
      setAttachments((prev) => prev.filter((item) => item.id !== att.id));
    } catch {
      toast.error('Failed to delete attachment');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-8 border border-border-light rounded-lg bg-parchment p-4">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink">
            Attachments
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={refresh}
            loading={loading}
            aria-label="Refresh attachments"
            title="Refresh attachments"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            loading={busy === 'upload'}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
            Upload
          </Button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => void handleUpload(e.target.files?.[0])}
      />
      <input
        ref={replaceInputRef}
        type="file"
        className="hidden"
        onChange={(e) => void handleReplace(e.target.files?.[0])}
      />

      {loading ? (
        <div className="space-y-2">
          <div className="h-10 bg-parchment-warm rounded animate-pulse" />
          <div className="h-10 bg-parchment-warm rounded animate-pulse" />
        </div>
      ) : attachments.length === 0 ? (
        <div className="border border-dashed border-border-light rounded p-4 text-sm text-ink-muted font-[family-name:var(--font-ui)]">
          No attachments
        </div>
      ) : (
        <ul className="divide-y divide-border-light">
          {attachments.map((att) => (
            <li key={att.id} className="py-3 flex items-center gap-3">
              <span className="shrink-0 w-10 h-10 rounded bg-accent/10 text-accent text-[10px] font-bold font-[family-name:var(--font-ui)] flex items-center justify-center uppercase">
                {fileTypeLabel(att.mimeType)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink truncate">
                  {att.filename}
                </span>
                <span className="block text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                  {formatFileSize(att.sizeBytes)}
                </span>
              </span>
              <div className="flex items-center gap-1">
                <a
                  href={`${basePath}/${att.id}/download`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center rounded text-ink-light hover:text-ink hover:bg-parchment-warm h-8 w-8 transition-colors"
                  aria-label={`Download ${att.filename}`}
                  title={`Download ${att.filename}`}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    replaceTargetRef.current = att;
                    replaceInputRef.current?.click();
                  }}
                  loading={busy === att.id}
                  aria-label={`Replace ${att.filename}`}
                  title={`Replace ${att.filename}`}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(att)}
                  loading={busy === att.id}
                  aria-label={`Delete ${att.filename}`}
                  title={`Delete ${att.filename}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
