import { redirect, notFound } from 'next/navigation';
import { auth } from '../../../../../auth';
import { KbProvider } from '../../../../../components/KbProvider';
import { getKbBySlug } from '../../../../../lib/kb';

export default async function KbAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kbSlug: string }>;
}) {
  const session = await auth();
  if ((session?.user as any)?.role !== 'admin') {
    redirect('/');
  }

  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);
  if (!kb) notFound();

  return <KbProvider kb={kb}>{children}</KbProvider>;
}
