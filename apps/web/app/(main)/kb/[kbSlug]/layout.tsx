import { notFound } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { KbProvider } from '../../../../components/KbProvider';
import { KbSidebar } from '../../../../components/KbSidebar';
import { SidebarWrapper } from '../../../../components/SidebarWrapper';
import type { KnowledgeBase } from '@dovetail/types';

async function getKbBySlug(slug: string): Promise<KnowledgeBase | null> {
  try {
    const kbs = await apiFetch<KnowledgeBase[]>('/api/knowledge-bases');
    return kbs.find(kb => kb.slug === slug) ?? null;
  } catch {
    return null;
  }
}

export default async function KbLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ kbSlug: string }>;
}) {
  const { kbSlug } = await params;
  const kb = await getKbBySlug(kbSlug);

  if (!kb) notFound();

  return (
    <KbProvider kb={kb}>
      <SidebarWrapper>
        <KbSidebar kbId={kb.id} kbSlug={kb.slug} />
      </SidebarWrapper>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </KbProvider>
  );
}
