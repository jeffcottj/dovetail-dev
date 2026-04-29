'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { apiClientFetch } from '../lib/api-client';
import { useOptionalKb } from '../lib/hooks/useKb';
import { buildTree, flattenTree, type FlatOption } from '../lib/categories';
import { Button } from './ui/Button';
import type { Category, KnowledgeBase, SearchOptions, SearchOptionCategory, SearchOptionTag, Tag } from '@dovetail/types';

type SearchMode = 'fulltext' | 'semantic' | 'hybrid';

const MODE_LABELS: Record<SearchMode, string> = {
  fulltext: 'Full-text',
  semantic: 'AI-powered',
  hybrid: 'Hybrid',
};

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last year', days: 365 },
];

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

export function SearchFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const kb = useOptionalKb();
  const apiBase = kb ? `/api/knowledge-bases/${kb.id}` : '/api';
  const searchPath = kb ? `/kb/${kb.slug}/search` : '/search';

  const [expanded, setExpanded] = useState(() => {
    // Auto-expand if any filter is active
    return !!(
      searchParams.get('mode') ||
      searchParams.get('categoryId') ||
      searchParams.get('from') ||
      searchParams.get('to') ||
      searchParams.get('tags') ||
      searchParams.get('knowledgeBaseIds') ||
      searchParams.get('onlyEditable')
    );
  });

  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [categories, setCategories] = useState<Array<FlatOption & { knowledgeBaseName?: string }>>([]);
  const [tags, setTags] = useState<Array<Tag | SearchOptionTag>>([]);

  // Current filter values from URL
  const mode = (searchParams.get('mode') as SearchMode) || 'fulltext';
  const categoryId = searchParams.get('categoryId') || '';
  const dateFrom = searchParams.get('from') || '';
  const dateTo = searchParams.get('to') || '';
  const selectedTagIds = searchParams.get('tags')?.split(',').filter(Boolean) || [];
  const selectedKbIds = searchParams.get('knowledgeBaseIds')?.split(',').filter(Boolean) || [];
  const onlyEditable = searchParams.get('onlyEditable') === 'true';

  const hasActiveFilters = !!(
    searchParams.get('mode') ||
    searchParams.get('categoryId') ||
    searchParams.get('from') ||
    searchParams.get('to') ||
    searchParams.get('tags') ||
    searchParams.get('knowledgeBaseIds') ||
    searchParams.get('onlyEditable')
  );

  // Fetch categories and tags on mount
  useEffect(() => {
    if (kb) {
      apiClientFetch<Category[]>(`${apiBase}/categories`)
        .then((cats) => {
          const tree = buildTree(cats);
          setCategories(flattenTree(tree));
        })
        .catch(() => {});

      apiClientFetch<Tag[]>(`${apiBase}/tags`)
        .then(setTags)
        .catch(() => {});
      return;
    }

    apiClientFetch<KnowledgeBase[]>('/api/knowledge-bases')
      .then(setKnowledgeBases)
      .catch(() => {});
  }, [apiBase, kb]);

  useEffect(() => {
    if (kb) return;

    const params = new URLSearchParams();
    if (selectedKbIds.length > 0) {
      params.set('knowledgeBaseIds', selectedKbIds.join(','));
    }

    apiClientFetch<SearchOptions>(`/api/workspace/search/options?${params.toString()}`)
      .then((options) => {
        const categoriesByKb = new Map<string, SearchOptionCategory[]>();
        for (const category of options.categories) {
          const current = categoriesByKb.get(category.knowledgeBaseId) ?? [];
          current.push(category);
          categoriesByKb.set(category.knowledgeBaseId, current);
        }

        const flattened = [...categoriesByKb.values()].flatMap((cats) => {
        const tree = buildTree(cats);
          return flattenTree(tree).map((cat) => ({
            ...cat,
            knowledgeBaseName: cats[0]?.knowledgeBaseName,
          }));
        });

        setCategories(flattened);
        setTags(options.tags);
      })
      .catch(() => {});
  }, [kb, selectedKbIds.join(',')]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      // Reset to page 1 when filters change
      params.delete('page');
      router.push(`${searchPath}?${params.toString()}`);
    },
    [router, searchParams, searchPath],
  );

  const clearFilters = useCallback(() => {
    const q = searchParams.get('q') || '';
    router.push(q ? `${searchPath}?q=${encodeURIComponent(q)}` : searchPath);
  }, [router, searchParams, searchPath]);

  const toggleKb = useCallback(
    (knowledgeBaseId: string) => {
      const current = new Set(selectedKbIds);
      if (current.has(knowledgeBaseId)) {
        current.delete(knowledgeBaseId);
      } else {
        current.add(knowledgeBaseId);
      }
      updateParams({
        knowledgeBaseIds: current.size > 0 ? [...current].join(',') : null,
        categoryId: null,
        tags: null,
      });
    },
    [selectedKbIds, updateParams],
  );

  const toggleTag = useCallback(
    (tagId: string) => {
      const current = new Set(selectedTagIds);
      if (current.has(tagId)) {
        current.delete(tagId);
      } else {
        current.add(tagId);
      }
      const newTags = [...current].join(',');
      updateParams({ tags: newTags || null });
    },
    [selectedTagIds, updateParams],
  );

  return (
    <div className="mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 text-sm font-[family-name:var(--font-ui)] text-ink-muted hover:text-ink transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filters
        {hasActiveFilters && (
          <span className="inline-flex items-center justify-center w-5 h-5 text-xs bg-accent/10 text-accent rounded-full">
            !
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 p-4 bg-parchment-warm border border-border-light rounded-lg space-y-4">
          {/* Search Mode */}
          <div>
            <label className="block text-xs font-[family-name:var(--font-ui)] font-medium text-ink-muted mb-1.5">
              Search mode
            </label>
            <div className="inline-flex rounded-lg border border-border-light overflow-hidden">
              {(Object.keys(MODE_LABELS) as SearchMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => updateParams({ mode: m === 'fulltext' ? null : m })}
                  className={`px-3 py-1.5 text-xs font-[family-name:var(--font-ui)] font-medium transition-colors ${
                    mode === m
                      ? 'bg-accent text-parchment'
                      : 'bg-parchment text-ink-muted hover:text-ink hover:bg-parchment-warm'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {!kb && knowledgeBases.length > 0 && (
            <div>
              <label className="block text-xs font-[family-name:var(--font-ui)] font-medium text-ink-muted mb-1.5">
                Knowledge bases
              </label>
              <div className="flex flex-wrap gap-1.5">
                {knowledgeBases.map((knowledgeBase) => {
                  const isSelected = selectedKbIds.includes(knowledgeBase.id);
                  return (
                    <button
                      key={knowledgeBase.id}
                      onClick={() => toggleKb(knowledgeBase.id)}
                      className={`inline-flex items-center px-2.5 py-1 text-xs font-[family-name:var(--font-ui)] font-medium rounded-full transition-colors ${
                        isSelected
                          ? 'bg-accent text-parchment'
                          : 'bg-parchment text-ink-muted border border-border-light hover:text-ink'
                      }`}
                    >
                      {knowledgeBase.name}
                      {isSelected && <X className="w-3 h-3 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category Filter */}
          <div>
            <label
              htmlFor="filter-category"
              className="block text-xs font-[family-name:var(--font-ui)] font-medium text-ink-muted mb-1.5"
            >
              Category
            </label>
            <select
              id="filter-category"
              value={categoryId}
              onChange={(e) => updateParams({ categoryId: e.target.value || null })}
              className="w-full max-w-xs px-3 py-1.5 text-sm font-[family-name:var(--font-ui)] bg-parchment border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 text-ink"
            >
              <option value="">All categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.knowledgeBaseName ? `${cat.knowledgeBaseName} / ` : ''}{'  '.repeat(cat.depth)}{cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-xs font-[family-name:var(--font-ui)] font-medium text-ink-muted mb-1.5">
              Date range
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateFrom ? dateFrom.split('T')[0] : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateParams({ from: val ? `${val}T00:00:00.000Z` : null });
                }}
                className="px-3 py-1.5 text-sm font-[family-name:var(--font-ui)] bg-parchment border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 text-ink"
                aria-label="From date"
              />
              <span className="text-xs text-ink-muted">to</span>
              <input
                type="date"
                value={dateTo ? dateTo.split('T')[0] : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateParams({ to: val ? `${val}T23:59:59.999Z` : null });
                }}
                className="px-3 py-1.5 text-sm font-[family-name:var(--font-ui)] bg-parchment border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 text-ink"
                aria-label="To date"
              />
            </div>
            <div className="flex gap-2 mt-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  onClick={() =>
                    updateParams({
                      from: `${daysAgo(preset.days)}T00:00:00.000Z`,
                      to: null,
                    })
                  }
                  className="px-2 py-1 text-xs font-[family-name:var(--font-ui)] text-ink-muted hover:text-accent border border-border-light rounded hover:border-accent transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <label className="block text-xs font-[family-name:var(--font-ui)] font-medium text-ink-muted mb-1.5">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center px-2.5 py-1 text-xs font-[family-name:var(--font-ui)] font-medium rounded-full transition-colors ${
                        isSelected
                          ? 'bg-accent text-parchment'
                          : 'bg-accent/10 text-accent hover:bg-accent/20'
                      }`}
                    >
                      {'knowledgeBaseName' in tag ? `${tag.knowledgeBaseName} / ${tag.name}` : tag.name}
                      {isSelected && <X className="w-3 h-3 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="inline-flex items-center gap-2 text-sm font-[family-name:var(--font-ui)] text-ink">
            <input
              type="checkbox"
              checked={onlyEditable}
              onChange={(e) => updateParams({ onlyEditable: e.target.checked ? 'true' : null })}
              className="h-4 w-4 rounded border-border-light text-accent focus:ring-accent/20"
            />
            Only articles I can edit
          </label>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <div className="pt-2 border-t border-border-light">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="w-3.5 h-3.5" />
                Clear all filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
