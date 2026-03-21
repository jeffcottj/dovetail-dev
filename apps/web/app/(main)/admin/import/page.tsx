import { RoleGate } from '../../../../components/RoleGate';
import ImportWizard from './ImportWizard';

export default async function ImportPage() {
  return (
    <RoleGate minimumRole="admin" fallback={<p>Admin access required.</p>}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-[family-name:var(--font-display)] font-bold text-ink mb-2 tracking-tight">
          Import Content
        </h1>
        <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
          Import content from external knowledge bases.
        </p>
        <ImportWizard />
      </div>
    </RoleGate>
  );
}
