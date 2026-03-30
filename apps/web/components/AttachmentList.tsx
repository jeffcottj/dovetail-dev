'use client';

import { useState, useEffect } from 'react';
import { apiClientFetch } from '../lib/api-client';

interface Attachment {
  id: string;
  articleId: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICONS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/gif': 'GIF',
};

function fileTypeLabel(mimeType: string): string {
  return FILE_ICONS[mimeType] ?? mimeType.split('/')[1]?.toUpperCase() ?? 'FILE';
}

export function AttachmentList({ articleId }: { articleId: string }) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClientFetch<Attachment[]>(`/api/articles/${articleId}/attachments`)
      .then(setAttachments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [articleId]);

  if (loading || attachments.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-border-light">
      <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink mb-3">
        Attachments
      </h2>
      <ul className="space-y-2">
        {attachments.map((att) => (
          <li key={att.id}>
            <a
              href={`/api/attachments/${att.id}/download`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2 -mx-3 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
            >
              <span className="shrink-0 w-10 h-10 rounded bg-accent/10 text-accent text-[10px] font-bold font-[family-name:var(--font-ui)] flex items-center justify-center uppercase">
                {fileTypeLabel(att.mimeType)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink group-hover:text-accent transition-colors truncate">
                  {att.filename}
                </span>
                <span className="block text-xs text-ink-muted font-[family-name:var(--font-ui)]">
                  {formatFileSize(att.sizeBytes)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
