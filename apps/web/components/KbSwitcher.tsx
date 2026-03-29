'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { KnowledgeBase } from '@dovetail/types';

export function KbSwitcher({ knowledgeBases, currentSlug }: { knowledgeBases: KnowledgeBase[]; currentSlug: string }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const currentKb = knowledgeBases.find((kb) => kb.slug === currentSlug) ?? knowledgeBases[0];

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

  function handleSelect(slug: string) {
    setOpen(false);
    if (slug === currentSlug) return;

    startTransition(() => {
      router.push(`/kb/${slug}`);
    });
  }

  if (!currentKb) return null;

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
        className="w-full rounded-xl border border-sidebar-text/15 bg-sidebar-hover/60 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] shadow-sm transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-text/40"
      >
        <span className="block text-[10px] font-semibold uppercase tracking-[0.24em] text-sidebar-text/60">
          Knowledge Base
        </span>
        <span className="mt-1 flex items-center justify-between gap-3">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-semibold text-sidebar-text-active">
              {currentKb.name}
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-text/70" />
        </span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-sidebar-text/15 bg-sidebar shadow-xl ring-1 ring-black/10">
          <div role="listbox" aria-label="Knowledge bases" className="py-1">
            {knowledgeBases.map((kb) => {
              const isSelected = kb.slug === currentSlug;

              return (
                <button
                  key={kb.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(kb.slug)}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left font-[family-name:var(--font-ui)] transition-colors ${
                    isSelected
                      ? 'bg-sidebar-hover text-sidebar-text-active'
                      : 'text-sidebar-text hover:bg-sidebar-hover/80 hover:text-sidebar-text-active'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-sidebar-text-active/40 bg-sidebar-text-active/10 text-sidebar-text-active'
                        : 'border-sidebar-text/20 text-transparent'
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">
                      {kb.name}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
