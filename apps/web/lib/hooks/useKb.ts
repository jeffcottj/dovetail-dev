'use client';

import { createContext, useContext } from 'react';
import type { KnowledgeBase } from '@dovetail/types';

export const KbContext = createContext<KnowledgeBase | null>(null);

export function useKb(): KnowledgeBase {
  const kb = useContext(KbContext);
  if (!kb) throw new Error('useKb must be used within a KbProvider');
  return kb;
}

/** Non-throwing variant — returns null when outside KbProvider */
export function useOptionalKb(): KnowledgeBase | null {
  return useContext(KbContext);
}
