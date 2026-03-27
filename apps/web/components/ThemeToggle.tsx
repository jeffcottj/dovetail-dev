'use client';

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-8 h-8" />;

  const buttonClass = variant === 'header'
    ? 'w-8 h-8 flex items-center justify-center rounded-lg text-ink-muted hover:bg-parchment-warm hover:text-ink transition-colors'
    : 'w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active transition-colors';

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={buttonClass}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
