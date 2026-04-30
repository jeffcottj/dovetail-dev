'use client';

import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from './ui/Button';
import { useToast } from '../lib/hooks/useToast';
import type { DocxConversionResult } from '@dovetail/types';

interface DocxImportControlProps {
  apiBase: string;
  categoryId?: string;
  articleId?: string;
  disabled?: boolean;
  onConverted: (result: DocxConversionResult, file: File, retainOriginal: boolean) => boolean | void | Promise<boolean | void>;
}

export function DocxImportControl({
  apiBase,
  categoryId,
  articleId,
  disabled,
  onConverted,
}: DocxImportControlProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [retainOriginal, setRetainOriginal] = useState(false);
  const [converting, setConverting] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast.error('Only .docx files can be converted');
      return;
    }

    const body = new FormData();
    body.append('file', file);
    if (articleId) {
      body.append('articleId', articleId);
    } else if (categoryId) {
      body.append('categoryId', categoryId);
    }

    setConverting(true);
    try {
      const res = await fetch(`${apiBase}/document-conversions/docx`, {
        method: 'POST',
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

      const converted = await res.json() as DocxConversionResult;
      const accepted = await onConverted(converted, file, retainOriginal);
      if (accepted === false) return;
      if (converted.warnings.length > 0) {
        toast.info(`Document converted with ${converted.warnings.length} warning${converted.warnings.length === 1 ? '' : 's'}`);
      } else {
        toast.success('Document converted');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to convert document');
    } finally {
      setConverting(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 my-4">
      <input
        ref={inputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        disabled={disabled || converting}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || converting}
        loading={converting}
      >
        <FileUp className="h-4 w-4" aria-hidden="true" />
        Import DOCX
      </Button>
      <label className="inline-flex items-center gap-2 text-sm font-[family-name:var(--font-ui)] text-ink-muted">
        <input
          type="checkbox"
          checked={retainOriginal}
          onChange={(e) => setRetainOriginal(e.target.checked)}
          disabled={disabled || converting}
          className="h-4 w-4 accent-accent"
        />
        Keep original as attachment
      </label>
    </div>
  );
}
