'use client';

import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { KnowledgeBase } from '@dovetail/types';
import { apiClientFetch } from '../../lib/api-client';

interface AdminContextSwitcherProps {
  isGlobalAdmin: boolean;
  currentKbSlug: string | null;
  currentKbName?: string;
}

export function AdminContextSwitcher({
  isGlobalAdmin,
  currentKbSlug,
  currentKbName,
}: AdminContextSwitcherProps) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const kbs = await apiClientFetch<KnowledgeBase[]>('/api/knowledge-bases');
      setKnowledgeBases([...kbs].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      // Keep the current list if the API is unavailable.
    }
  }, []);

  useEffect(() => {
    void loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  useEffect(() => {
    if (!open) return;
    void loadKnowledgeBases();
  }, [loadKnowledgeBases, open]);

  useEffect(() => {
    function handleKnowledgeBasesChanged() {
      void loadKnowledgeBases();
    }

    window.addEventListener('dovetail:knowledge-bases-changed', handleKnowledgeBasesChanged);
    return () => {
      window.removeEventListener('dovetail:knowledge-bases-changed', handleKnowledgeBasesChanged);
    };
  }, [loadKnowledgeBases]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  function handleSelect(target: 'global' | string) {
    setOpen(false);
    if (target === 'global' && !currentKbSlug) return;
    if (target !== 'global' && target === currentKbSlug) return;

    startTransition(() => {
      router.push(target === 'global' ? '/admin' : `/kb/${target}/admin`);
    });
  }

  const currentLabel = currentKbSlug
    ? currentKbName ?? knowledgeBases.find((kb) => kb.slug === currentKbSlug)?.name ?? 'Loading...'
    : 'Global Admin';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="w-full rounded-xl border border-white/15 bg-[color:var(--color-admin-rail-muted)]/60 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] shadow-sm transition-colors hover:bg-[color:var(--color-admin-rail-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-white/60">
          Admin Context
        </span>
        <span className="mt-1 flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-white">
              {currentLabel}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/70" />
        </span>
      </button>

      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-white/15 bg-[color:var(--color-admin-rail)] shadow-xl ring-1 ring-black/10">
          <div role="listbox" aria-label="Admin context" className="py-1">
            {isGlobalAdmin ? (
              <button
                type="button"
                role="option"
                aria-selected={!currentKbSlug}
                onClick={() => handleSelect('global')}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] transition-colors ${
                  !currentKbSlug
                    ? 'bg-[color:var(--color-admin-rail-muted)] text-white'
                    : 'text-white/90 hover:bg-[color:var(--color-admin-rail-muted)]/80 hover:text-white'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                    !currentKbSlug
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-white/20 text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">Global Admin</span>
                </span>
              </button>
            ) : null}

            {knowledgeBases.map((kb) => {
              const isSelected = kb.slug === currentKbSlug;

              return (
                <button
                  key={kb.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(kb.slug)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] transition-colors ${
                    isSelected
                      ? 'bg-[color:var(--color-admin-rail-muted)] text-white'
                      : 'text-white/90 hover:bg-[color:var(--color-admin-rail-muted)]/80 hover:text-white'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-white/20 text-transparent'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{kb.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
