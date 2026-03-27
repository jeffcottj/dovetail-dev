'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import { PanelLeftClose, PanelLeft } from 'lucide-react';

const STORAGE_KEY = 'dovetail-sidebar-collapsed';

interface SidebarWrapperProps {
  children: ReactNode;
}

export function SidebarWrapper({ children }: SidebarWrapperProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
    setMounted(true);
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  };

  return (
    <div className="flex shrink-0 relative" style={{ visibility: mounted ? 'visible' : 'hidden' }}>
      <aside
        className={`bg-sidebar text-sidebar-text min-h-screen flex flex-col border-r border-border ${
          mounted ? 'transition-[width] duration-200' : ''
        } ${collapsed ? 'w-0 overflow-hidden' : 'w-96'}`}
      >
        {children}
      </aside>
      {collapsed && (
        <div className="w-10 flex flex-col items-center pt-3 bg-sidebar border-r border-border">
          <Image
            src="/logos/mla-mark-white.png"
            alt="Maryland Legal Aid"
            width={24}
            height={40}
            className="w-6 h-auto"
          />
        </div>
      )}
      <button
        onClick={toggle}
        className="absolute top-8 -right-4 z-20 w-8 h-8 rounded-full bg-sidebar border border-border/40 flex items-center justify-center text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active transition-colors shadow-md"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed
          ? <PanelLeft className="w-3.5 h-3.5" />
          : <PanelLeftClose className="w-3.5 h-3.5" />
        }
      </button>
    </div>
  );
}
