import { notFound, redirect } from 'next/navigation';
import { apiFetch } from '../../../../../lib/api';
import { auth } from '../../../../../auth';
import { ArticleEditor } from '../../../../../components/ArticleEditor';
import type { Article } from '@dovetail/types';

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ slugPath: string[] }>;
}) {
  const { slugPath } = await params;
  const session = await auth();
  const userRole = session?.user?.role ?? 'viewer';

  if (userRole === 'viewer') {
    redirect(`/articles/${slugPath.join('/')}`);
  }

  let article: Article;
  try {
    article = await apiFetch<Article>(`/api/articles/by-path/${slugPath.join('/')}`);
  } catch {
    notFound();
  }

  return (
    <div>
      <div className="mb-4">
        <span className="text-xs font-[family-name:var(--font-ui)] text-ink-muted uppercase tracking-widest">
          Editing
        </span>
      </div>
      <ArticleEditor article={article} />
    </div>
  );
}
