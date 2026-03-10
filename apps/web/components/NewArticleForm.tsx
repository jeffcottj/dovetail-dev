'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClientFetch } from '../lib/api-client';
import { Button } from './ui/Button';
import type { Article, Category } from '@dovetail/types';

interface NewArticleFormProps {
  categories: Category[];
}

export function NewArticleForm({ categories }: NewArticleFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = title.trim();
      if (!trimmed || !categoryId) return;

      setCreating(true);
      setError(null);
      try {
        const article = await apiClientFetch<Article>('/api/articles', {
          method: 'POST',
          body: JSON.stringify({ title: trimmed, categoryId }),
        });
        router.push(`/articles/${article.slug}/edit`);
      } catch {
        setError('Failed to create article. Please try again.');
      } finally {
        setCreating(false);
      }
    },
    [title, categoryId, router],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div>
        <label
          htmlFor="title"
          className="block text-sm font-[family-name:var(--font-ui)] font-medium text-ink mb-1.5"
        >
          Title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Article title"
          required
          className="w-full px-3 py-2 text-sm font-[family-name:var(--font-ui)] bg-parchment-warm border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 placeholder:text-ink-muted/60 text-ink transition-colors"
        />
      </div>

      <div>
        <label
          htmlFor="category"
          className="block text-sm font-[family-name:var(--font-ui)] font-medium text-ink mb-1.5"
        >
          Category
        </label>
        {categories.length === 0 ? (
          <p className="text-sm text-ink-muted font-[family-name:var(--font-ui)]">
            No categories available. An admin must create a category first.
          </p>
        ) : (
          <select
            id="category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm font-[family-name:var(--font-ui)] bg-parchment-warm border border-border-light rounded-lg focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 text-ink transition-colors"
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger font-[family-name:var(--font-ui)]">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={creating || !title.trim() || !categoryId}>
          {creating ? 'Creating...' : 'Create Draft'}
        </Button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-[family-name:var(--font-ui)] text-ink-muted hover:text-ink transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
