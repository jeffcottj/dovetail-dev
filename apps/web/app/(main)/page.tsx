import Link from 'next/link';
import { Library } from 'lucide-react';
import { auth } from '../../auth';
import { apiFetch } from '../../lib/api';
import { hasMinimumRole } from '../../lib/roles';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { KnowledgeBase, Role } from '@dovetail/types';

export default async function HomePage() {
  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';
  const isAdmin = hasMinimumRole(userRole, 'admin');

  let knowledgeBases: KnowledgeBase[] = [];
  try {
    knowledgeBases = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
  } catch {
    // API unavailable
  }

  return (
    <main id="main-content" className="flex-1 p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
          Knowledge Bases
        </h1>
        {session?.user?.name && (
          <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">
            Signed in as {session.user.name}
          </p>
        )}
      </header>

      {isAdmin && (
        <div className="mb-6">
          <Link href="/admin/knowledge-bases">
            <Button variant="secondary" size="sm">Manage Knowledge Bases</Button>
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {knowledgeBases.map((kb) => (
          <Link key={kb.id} href={`/kb/${kb.slug}`}>
            <Card className="hover:border-accent transition-colors cursor-pointer h-full">
              <div className="flex items-start gap-3">
                <Library className="w-5 h-5 text-accent mt-0.5 shrink-0" />
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink">
                    {kb.name}
                  </h2>
                  {kb.description && (
                    <p className="text-ink-muted text-sm mt-1 font-[family-name:var(--font-ui)]">
                      {kb.description}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {knowledgeBases.length === 0 && (
        <Card>
          <p className="text-ink-muted text-sm font-[family-name:var(--font-ui)]">
            No knowledge bases yet. {isAdmin ? 'Create one from the admin panel.' : 'Contact an admin to get started.'}
          </p>
        </Card>
      )}
    </main>
  );
}
