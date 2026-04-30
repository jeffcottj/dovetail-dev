import { redirect, notFound } from 'next/navigation';
import { auth } from '../../../../../auth';
import { KbProvider } from '../../../../../components/KbProvider';
import { apiFetch } from '../../../../../lib/api';
import { getKbBySlug } from '../../../../../lib/kb';

export default async function KbAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kbSlug: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/');
  }

  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  try {
    await apiFetch(`/api/knowledge-bases/${kb.id}/admin/overview`);
  } catch {
    redirect('/');
  }

  return <KbProvider kb={kb}>{children}</KbProvider>;
}
