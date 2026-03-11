import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { TagList } from './TagList';
import type { Tag } from '@dovetail/types';

export default async function AdminTagsPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  let tags: Tag[] = [];
  try {
    tags = await apiFetch<Tag[]>('/api/tags');
  } catch {
    // API unavailable
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
        Tag Management
      </h1>
      <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
        Create and manage tags for organizing articles.
      </p>

      <TagList initialTags={tags} />
    </div>
  );
}
