import Link from 'next/link';
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import { Card } from '../../../components/ui/Card';

interface PaginatedResponse {
  data: unknown[];
  total: number;
}

interface UserData {
  role: string;
}

interface ArticleData {
  status: string;
}

async function fetchStats() {
  const stats = {
    users: { total: 0, viewers: 0, editors: 0, admins: 0 },
    articles: { total: 0, published: 0, draft: 0, archived: 0 },
    categories: 0,
    tags: 0,
  };

  try {
    const [usersRes, publishedRes, draftRes, archivedRes, categories, tags] = await Promise.all([
      apiFetch<PaginatedResponse & { data: UserData[] }>('/api/admin/users?limit=100'),
      apiFetch<PaginatedResponse & { data: ArticleData[] }>('/api/articles?status=published&limit=1'),
      apiFetch<PaginatedResponse & { data: ArticleData[] }>('/api/articles?status=draft&limit=1'),
      apiFetch<PaginatedResponse & { data: ArticleData[] }>('/api/articles?status=archived&limit=1'),
      apiFetch<{ id: string }[]>('/api/categories'),
      apiFetch<{ id: string }[]>('/api/tags'),
    ]);

    stats.users.total = usersRes.total;
    for (const user of usersRes.data) {
      if (user.role === 'viewer') stats.users.viewers++;
      else if (user.role === 'editor') stats.users.editors++;
      else if (user.role === 'admin') stats.users.admins++;
    }

    stats.articles.published = publishedRes.total;
    stats.articles.draft = draftRes.total;
    stats.articles.archived = archivedRes.total;
    stats.articles.total = publishedRes.total + draftRes.total + archivedRes.total;

    stats.categories = categories.length;
    stats.tags = tags.length;
  } catch {
    // API unavailable — show zeros
  }

  return stats;
}

export default async function AdminPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const stats = await fetchStats();

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
        Admin Dashboard
      </h1>
      <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
        Manage users, roles, API keys, and tags.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 max-w-3xl">
        <Card>
          <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">
            {stats.users.total}
          </p>
          <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">Users</p>
          <p className="text-xs text-ink-light font-[family-name:var(--font-ui)] mt-0.5">
            {stats.users.admins}a / {stats.users.editors}e / {stats.users.viewers}v
          </p>
        </Card>

        <Card>
          <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">
            {stats.articles.total}
          </p>
          <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">Articles</p>
          <p className="text-xs text-ink-light font-[family-name:var(--font-ui)] mt-0.5">
            {stats.articles.published} pub / {stats.articles.draft} draft
          </p>
        </Card>

        <Card>
          <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">
            {stats.categories}
          </p>
          <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
            Categories
          </p>
        </Card>

        <Card>
          <p className="text-2xl font-bold text-ink font-[family-name:var(--font-display)]">
            {stats.tags}
          </p>
          <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">Tags</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-3xl">
        <Link
          href="/admin/users"
          className="block p-6 bg-parchment-warm border border-border-light rounded-lg hover:border-accent transition-colors"
        >
          <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-2">
            Users
          </h2>
          <p className="text-ink-light text-sm">
            View all users, change global roles, and assign category-level permissions.
          </p>
        </Link>

        <Link
          href="/admin/api-keys"
          className="block p-6 bg-parchment-warm border border-border-light rounded-lg hover:border-accent transition-colors"
        >
          <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-2">
            API Keys
          </h2>
          <p className="text-ink-light text-sm">
            Create, view, and revoke API keys for RAG integrations.
          </p>
        </Link>

        <Link
          href="/admin/tags"
          className="block p-6 bg-parchment-warm border border-border-light rounded-lg hover:border-accent transition-colors"
        >
          <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-2">
            Tags
          </h2>
          <p className="text-ink-light text-sm">
            Create and manage tags for organizing and discovering articles.
          </p>
        </Link>

        <Link
          href="/admin/import"
          className="block p-6 bg-parchment-warm border border-border-light rounded-lg hover:border-accent transition-colors"
        >
          <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-2">
            Import
          </h2>
          <p className="text-ink-light text-sm">
            Import content from external knowledge bases.
          </p>
        </Link>
      </div>
    </div>
  );
}
