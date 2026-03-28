import { notFound } from 'next/navigation';
import { getKbBySlug } from '../../../../lib/kb';
import { KbProvider } from '../../../../components/KbProvider';
import { KbSidebar } from '../../../../components/KbSidebar';
import { SidebarWrapper } from '../../../../components/SidebarWrapper';

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
