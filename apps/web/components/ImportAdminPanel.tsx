'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ImportWizard from './ImportWizard';
import { ImportHistory } from './ImportHistory';

export function ImportAdminPanel({ kbId }: { kbId: string }) {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <ImportWizard
        kbId={kbId}
        onImportComplete={() => {
          setRefreshKey((value) => value + 1);
          router.refresh();
        }}
      />
      <ImportHistory kbId={kbId} refreshKey={refreshKey} />
    </div>
  );
}
