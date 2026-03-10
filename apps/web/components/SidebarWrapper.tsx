'use client';

import { useState, useEffect, type ReactNode } from 'react';
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
    <>
      <aside
        className={`shrink-0 bg-sidebar text-sidebar-text min-h-screen flex flex-col border-r border-sidebar-hover transition-[width] duration-200 ${
          collapsed ? 'w-0 overflow-hidden' : 'w-64'
        }`}
        style={{ opacity: mounted ? 1 : 0 }}
      >
        {children}
      </aside>
      <button
        onClick={toggle}
        className="fixed bottom-4 left-4 z-50 w-8 h-8 flex items-center justify-center rounded-lg bg-sidebar text-sidebar-text-active border border-sidebar-hover hover:bg-sidebar-hover transition-colors shadow-md"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <PanelLeft className="w-4 h-4" />
        ) : (
          <PanelLeftClose className="w-4 h-4" />
        )}
      </button>
    </>
  );
}
