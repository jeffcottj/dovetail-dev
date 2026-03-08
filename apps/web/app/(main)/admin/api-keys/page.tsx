import { auth } from '../../../../auth';
import { redirect } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { ApiKeyManager } from './ApiKeyManager';

interface ApiKey {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export default async function AdminApiKeysPage() {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  let keys: ApiKey[] = [];
  try {
    keys = await apiFetch<ApiKey[]>('/api/admin/api-keys');
  } catch {
    // API unavailable
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-ink mb-2 tracking-tight">
        API Key Management
      </h1>
      <p className="text-ink-muted font-[family-name:var(--font-ui)] text-sm mb-8">
        Create and manage API keys for RAG integrations.
      </p>

      <ApiKeyManager initialKeys={keys} />
    </div>
  );
}
