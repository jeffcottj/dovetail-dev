'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { ThemeToggle } from './ThemeToggle';

export function HeaderUserArea() {
  const { user, isAdmin, isLoading, isAuthenticated } = useCurrentUser();

  if (isLoading || !isAuthenticated || !user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle variant="header" />
      {isAdmin && (
        <Link
          href="/admin"
          className="flex items-center gap-1.5 text-xs font-[family-name:var(--font-ui)] text-ink-muted hover:text-ink transition-colors px-2 py-1.5 rounded hover:bg-parchment-warm"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Admin</span>
        </Link>
      )}
      <div className="flex items-center gap-2 pl-3 border-l border-border ml-1">
        {user.image ? (
          <img src={user.image} alt={user.name} className="w-7 h-7 rounded-full shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-parchment-warm border border-border flex items-center justify-center text-xs font-[family-name:var(--font-ui)] font-medium text-ink shrink-0">
            {initials}
          </div>
        )}
        <span className="text-sm font-[family-name:var(--font-ui)] font-medium text-ink">{user.name}</span>
        <Badge
          variant={user.role === 'admin' ? 'info' : user.role === 'editor' ? 'published' : 'archived'}
        >
          {user.role}
        </Badge>
      </div>
      <button
        onClick={() => signOut({ callbackUrl: '/login' })}
        className="flex items-center gap-1.5 text-xs font-[family-name:var(--font-ui)] text-ink-muted hover:text-ink transition-colors px-2 py-1.5 rounded hover:bg-parchment-warm ml-1"
        aria-label="Sign out"
      >
        <LogOut className="w-3.5 h-3.5" />
        <span>Sign out</span>
      </button>
    </div>
  );
}
