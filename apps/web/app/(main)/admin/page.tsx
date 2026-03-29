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

async function fetchStats() {
  const stats = {
    users: { total: 0, viewers: 0, editors: 0, admins: 0 },
    knowledgeBases: 0,
  };

  try {
    const [usersRes, kbs] = await Promise.all([
      apiFetch<PaginatedResponse & { data: UserData[] }>('/api/admin/users?limit=100'),
      apiFetch<{ id: string }[]>('/api/knowledge-bases'),
    ]);

    stats.users.total = usersRes.total;
    for (const user of usersRes.data) {
      if (user.role === 'viewer') stats.users.viewers++;
      else if (user.role === 'editor') stats.users.editors++;
      else if (user.role === 'admin') stats.users.admins++;
    }

    stats.knowledgeBases = kbs.length;
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
      <h1 className="font-[family-name:var(--font-sub)] text-3xl font-bold text-ink mb-2 tracking-tight">
        Admin Dashboard
      </h1>
      <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
        Manage users, roles, API keys, and knowledge bases.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8 max-w-3xl">
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
            {stats.knowledgeBases}
          </p>
          <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
            Knowledge Bases
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-3xl">
        <Link
          href="/admin/knowledge-bases"
          className="block p-6 bg-parchment-warm border border-border-light rounded-lg hover:border-accent transition-colors"
        >
          <h2 className="font-[family-name:var(--font-sub)] text-xl font-semibold text-ink mb-2">
            Knowledge Bases
          </h2>
          <p className="text-ink-light text-sm">
            Create, manage, and configure knowledge bases.
          </p>
        </Link>

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
      </div>
    </div>
  );
}
