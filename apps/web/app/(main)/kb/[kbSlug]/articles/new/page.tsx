import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '../../../../../../lib/api';
import { auth } from '../../../../../../auth';
import { ArticleCreateForm } from '../../../../../../components/ArticleCreateForm';
import type { Category, KnowledgeBase } from '@dovetail/types';

async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch { return null; }
}

export default async function KbNewArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ kbSlug: string }>;
  searchParams: Promise<{ categoryId?: string }>;
}) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  const session = await auth();
  const userRole = session?.user?.role ?? 'viewer';

  if (userRole === 'viewer') {
    redirect('/');
  }

  const { categoryId } = await searchParams;

  let categories: Category[] = [];
  try {
    categories = await apiFetch<Category[]>(
      `/api/knowledge-bases/${kb.id}/categories`,
    );
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
