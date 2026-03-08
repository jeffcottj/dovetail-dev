import Link from 'next/link';
import { auth } from '../../../auth';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
        Admin Dashboard
      </h1>
      <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
        Manage users, roles, and API keys.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <Link
          href="/admin/users"
          className="block p-6 bg-parchment-warm border border-border-light rounded-lg hover:border-accent transition-colors"
        >
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink mb-2">
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
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink mb-2">
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
