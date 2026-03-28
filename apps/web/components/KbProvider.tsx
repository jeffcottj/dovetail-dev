'use client';

import { KbContext } from '../lib/hooks/useKb';
import type { KnowledgeBase } from '@dovetail/types';

export function KbProvider({ kb, children }: { kb: KnowledgeBase; children: React.ReactNode }) {
  return <KbContext.Provider value={kb}>{children}</KbContext.Provider>;
}
