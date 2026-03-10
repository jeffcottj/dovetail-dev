import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumbs({ segments }: BreadcrumbsProps) {
  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-[family-name:var(--font-ui)] text-ink-muted mb-3">
      {segments.map((segment, i) => {
        const isLast = i === segments.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-border" />}
            {segment.href && !isLast ? (
              <Link href={segment.href} className="hover:text-accent transition-colors">
                {segment.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-ink-light' : ''}>{segment.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
