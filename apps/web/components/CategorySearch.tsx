'use client';

import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useOptionalKb } from '../lib/hooks/useKb';

interface CategorySearchProps {
  categoryId: string;
  categoryName: string;
}

export function CategorySearch({ categoryId, categoryName }: CategorySearchProps) {
  const router = useRouter();
  const kb = useOptionalKb();
  const [query, setQuery] = useState('');

  const searchPath = kb ? `/kb/${kb.slug}/search` : '/search';

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (trimmed) {
        router.push(`${searchPath}?q=${encodeURIComponent(trimmed)}&categoryId=${categoryId}`);
      }
    },
    [query, router, categoryId, searchPath],
  );

  return (
    <form onSubmit={handleSubmit} className="relative mb-6">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search in ${categoryName}...`}
        className="w-full pl-10 pr-4 py-2 text-sm font-[family-name:var(--font-ui)] bg-parchment-warm border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-ink-muted/60 text-ink transition-colors"
        aria-label={`Search articles in ${categoryName}`}
      />
    </form>
  );
}
