'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { ThemeToggle } from './ThemeToggle';

export function UserMenu() {
  const { user, isAdmin, isLoading, isAuthenticated } = useCurrentUser();

  if (isLoading || !isAuthenticated || !user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="border-t border-sidebar-hover p-4">
      <div className="flex items-center gap-3 mb-3">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name}
            className="w-8 h-8 rounded-full shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-sidebar-hover flex items-center justify-center text-xs font-[family-name:var(--font-ui)] font-medium text-sidebar-text-active shrink-0">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-[family-name:var(--font-ui)] font-medium text-sidebar-text-active truncate">
            {user.name}
          </p>
          <Badge
            variant={user.role === 'admin' ? 'info' : user.role === 'editor' ? 'published' : 'archived'}
            className="mt-0.5"
          >
            {user.role}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        {isAdmin && (
          <Link
            href="/admin"
            className="flex items-center gap-1.5 text-xs font-[family-name:var(--font-ui)] text-sidebar-text/60 hover:text-sidebar-text-active transition-colors px-2 py-1.5 rounded hover:bg-sidebar-hover"
            aria-label="Admin settings"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Admin</span>
          </Link>
        )}
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-1.5 text-xs font-[family-name:var(--font-ui)] text-sidebar-text/60 hover:text-sidebar-text-active transition-colors px-2 py-1.5 rounded hover:bg-sidebar-hover"
          aria-label="Sign out"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );
}
