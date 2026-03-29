import { notFound } from 'next/navigation';
import { getKbBySlug } from '../../../../../../lib/kb';
import { RoleGate } from '../../../../../../components/RoleGate';
import ImportWizard from '../../../../../../components/ImportWizard';

export default async function KbImportPage({ params }: { params: Promise<{ kbSlug: string }> }) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  return (
    <RoleGate minimumRole="admin">
      <main id="main-content" className="flex-1 p-8">
        <div className="max-w-4xl">
          <h1 className="text-2xl font-[family-name:var(--font-display)] font-bold text-ink mb-2">
            Import Content
          </h1>
          <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-6">
            Import content into this knowledge base.
          </p>
          <ImportWizard kbId={kb.id} />
        </div>
      </main>
    </RoleGate>
  );
}
