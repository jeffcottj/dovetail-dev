import type { ReactNode } from 'react';

type BadgeVariant = 'published' | 'draft' | 'archived' | 'info' | 'custom';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  published: 'bg-success/10 text-success',
  draft: 'bg-warning/10 text-warning',
  archived: 'bg-ink-muted/10 text-ink-muted',
  info: 'bg-accent/10 text-accent',
  custom: '',
};

export function Badge({ variant = 'info', className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center text-xs font-[family-name:var(--font-ui)] font-medium px-2 py-0.5 rounded-full ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
