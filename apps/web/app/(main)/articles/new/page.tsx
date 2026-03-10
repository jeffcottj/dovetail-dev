import { redirect } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { auth } from '../../../../auth';
import { ArticleCreateForm } from '../../../../components/ArticleCreateForm';
import type { Category } from '@dovetail/types';

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ categoryId?: string }>;
}) {
  const session = await auth();
  const userRole = session?.user?.role ?? 'viewer';

  if (userRole === 'viewer') {
    redirect('/');
  }

  const { categoryId } = await searchParams;

  let categories: Category[] = [];
  try {
    categories = await apiFetch<Category[]>('/api/categories');
  } catch {
    // If categories fail to load, we still render the form (selector will be empty)
  }

  return (
    <div>
      <div className="mb-4">
        <span className="text-xs font-[family-name:var(--font-ui)] text-ink-muted uppercase tracking-widest">
          New Article
        </span>
      </div>
      <ArticleCreateForm categories={categories} defaultCategoryId={categoryId} />
    </div>
  );
}
