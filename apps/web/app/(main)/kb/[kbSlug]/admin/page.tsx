import Link from 'next/link';
import { Users, Tag, Upload } from 'lucide-react';
import { Card } from '../../../../../components/ui/Card';
import { RoleGate } from '../../../../../components/RoleGate';

export default async function KbAdminPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-ink mb-6">
          KB Administration
        </h1>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href={`/kb/${kbSlug}/admin/users`}>
            <Card className="hover:border-accent transition-colors cursor-pointer">
              <Users className="w-6 h-6 text-accent mb-2" />
              <h2 className="font-semibold text-ink">Users & Roles</h2>
              <p className="text-ink-muted text-sm mt-1">Manage user roles in this KB</p>
            </Card>
          </Link>
          <Link href={`/kb/${kbSlug}/admin/tags`}>
            <Card className="hover:border-accent transition-colors cursor-pointer">
              <Tag className="w-6 h-6 text-accent mb-2" />
              <h2 className="font-semibold text-ink">Tags</h2>
              <p className="text-ink-muted text-sm mt-1">Manage tags for this KB</p>
            </Card>
          </Link>
          <Link href={`/kb/${kbSlug}/admin/import`}>
            <Card className="hover:border-accent transition-colors cursor-pointer">
              <Upload className="w-6 h-6 text-accent mb-2" />
              <h2 className="font-semibold text-ink">Import</h2>
              <p className="text-ink-muted text-sm mt-1">Import content into this KB</p>
            </Card>
          </Link>
        </div>
      </main>
    </RoleGate>
  );
}
