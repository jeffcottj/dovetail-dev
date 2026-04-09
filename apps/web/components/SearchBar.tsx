'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useOptionalKb } from '../lib/hooks/useKb';

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kb = useOptionalKb();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const searchPath = kb ? `/kb/${kb.slug}/search` : '/search';
  const searchLabel = kb ? 'Search articles' : 'Search across all knowledge bases';
  const searchPlaceholder = kb
    ? `Search articles... ${isMac ? '(⌘K)' : '(Ctrl+K)'}`
    : `Search across all knowledge bases... ${isMac ? '(⌘K)' : '(Ctrl+K)'}`;
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        router.push(`${searchPath}?q=${encodeURIComponent(trimmed)}`);
      }
    },
    [query, router, searchPath],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-[56rem]">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
        className="w-full pl-10 pr-4 py-2 text-sm font-[family-name:var(--font-ui)] bg-parchment-warm border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-ink-muted/60 text-ink transition-colors"
      />
    </form>
  );
}
