import type { AdminActivityItem } from '@dovetail/types';
import { formatAdminActivityLine } from '../lib/admin/format';
import { Card } from './ui/Card';

interface WorkspaceActivityFeedProps {
  items: AdminActivityItem[];
  unavailableMessage?: string | null;
}

function formatActivityTime(createdAt: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(createdAt));
}

export function WorkspaceActivityFeed({ items, unavailableMessage }: WorkspaceActivityFeedProps) {
  return (
    <section aria-labelledby="workspace-activity-feed">
      <Card>
        <h2
          id="workspace-activity-feed"
          className="font-[family-name:var(--font-display)] text-lg font-semibold text-ink"
        >
          Recent Activity
        </h2>

        <div className="mt-4 space-y-4">
          {unavailableMessage ? (
            <p className="text-sm text-ink-light">{unavailableMessage}</p>
          ) : items.length > 0 ? (
            items.map((item) => (
              <article key={item.id} className="rounded-lg border border-border-light bg-parchment px-4 py-3">
                <p className="text-sm font-medium text-ink">{formatAdminActivityLine(item)}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {formatActivityTime(item.createdAt)} · {item.actor.email}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-ink-light">No recent activity yet.</p>
          )}
        </div>
      </Card>
    </section>
  );
}
