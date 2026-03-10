import { redirect } from 'next/navigation';
import { auth } from '../../../../auth';
import { apiFetch } from '../../../../lib/api';
import { hasMinimumRole } from '../../../../lib/roles';
import { NewArticleForm } from '../../../../components/NewArticleForm';
import { Breadcrumbs } from '../../../../components/Breadcrumbs';
import type { Category, Role } from '@dovetail/types';

export default async function NewArticlePage() {
  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';

  if (!hasMinimumRole(userRole, 'editor')) {
    redirect('/');
  }

  let categories: Category[] = [];
  try {
    categories = await apiFetch<Category[]>('/api/categories');
  } catch {
    // API unavailable
  }

  return (
    <div>
      <Breadcrumbs segments={[{ label: 'New Article' }]} />
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-6 tracking-tight">
        New Article
      </h1>
      <NewArticleForm categories={categories} />
    </div>
  );
}
