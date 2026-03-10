import Link from 'next/link';
import { FilePlus, Search, Clock, FileEdit } from 'lucide-react';
import { auth } from '../../auth';
import { apiFetch } from '../../lib/api';
import { hasMinimumRole } from '../../lib/roles';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import type { Article, Role } from '@dovetail/types';

interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export default async function HomePage() {
  const session = await auth();
  const userRole = (session?.user?.role as Role) ?? 'viewer';
  const isEditor = hasMinimumRole(userRole, 'editor');

  let recentArticles: Article[] = [];
  let userDrafts: Article[] = [];

  try {
    const recent = await apiFetch<PaginatedResponse<Article>>(
      '/api/articles?limit=10&status=published',
    );
    recentArticles = recent.data;
  } catch {
    // API unavailable
  }

  if (isEditor) {
    try {
      const drafts = await apiFetch<PaginatedResponse<Article>>(
        '/api/articles?limit=5&status=draft',
      );
      userDrafts = drafts.data;
    } catch {
      // API unavailable
    }
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
          Welcome to Dovetail
        </h1>
        {session?.user?.name && (
          <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">
            Signed in as {session.user.name}
          </p>
        )}
      </header>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 mb-10">
        {isEditor && (
          <Link href="/articles/new">
            <Button>
              <FilePlus className="w-4 h-4" />
              New Article
            </Button>
          </Link>
        )}
        <Link href="/search">
          <Button variant="secondary">
            <Search className="w-4 h-4" />
            Search
          </Button>
        </Link>
      </div>

      {/* Your Drafts (editor+ only) */}
      {isEditor && userDrafts.length > 0 && (
        <section className="mb-10">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink mb-4 flex items-center gap-2">
            <FileEdit className="w-5 h-5 text-warning" />
            Recent Drafts
          </h2>
          <div className="space-y-1">
            {userDrafts.map((article) => (
              <Link
                key={article.id}
                href={`/articles/${article.slug}`}
                className="block px-4 py-3 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="font-[family-name:var(--font-ui)] text-sm font-medium text-ink group-hover:text-accent transition-colors truncate">
                    {article.title}
                  </span>
                  <Badge variant="draft">draft</Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recently Updated Articles */}
      <section>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-ink-muted" />
          Recently Updated
        </h2>
        {recentArticles.length === 0 ? (
          <Card>
            <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm">
              No articles yet. {isEditor ? 'Create the first article to get started.' : 'Check back soon for new content.'}
            </p>
          </Card>
        ) : (
          <ul className="space-y-1">
            {recentArticles.map((article) => (
              <li key={article.id}>
                <Link
                  href={`/articles/${article.slug}`}
                  className="block px-4 py-4 -mx-4 rounded-lg hover:bg-parchment-warm transition-colors duration-150 group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink group-hover:text-accent transition-colors truncate">
                        {article.title}
                      </h3>
                      <p className="text-xs text-ink-muted font-[family-name:var(--font-ui)] mt-1">
                        Updated{' '}
                        {new Date(article.updatedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <Badge variant={article.status as 'published' | 'draft' | 'archived'}>
                      {article.status}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
