'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Image from 'next/image';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

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
    <div className="flex shrink-0">
      <aside
        className={`bg-sidebar text-sidebar-text min-h-screen flex flex-col border-r border-sidebar-hover transition-[width] duration-200 ${
          collapsed ? 'w-0 overflow-hidden' : 'w-64'
        }`}
        style={{ opacity: mounted ? 1 : 0 }}
      >
        {children}
        {!collapsed && (
          <button
            onClick={toggle}
            className="mt-auto p-3 border-t border-sidebar-hover flex items-center justify-center hover:bg-sidebar-hover transition-colors"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </aside>
      {collapsed && (
        <div className="w-10 flex flex-col items-center pt-3 pb-4 bg-sidebar border-r border-sidebar-hover">
          <Image
            src="/logos/mla-mark-white.png"
            alt="Maryland Legal Aid"
            width={24}
            height={40}
            className="w-6 h-auto mb-auto"
          />
          <ThemeToggle />
          <button
            onClick={toggle}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-sidebar-text-active hover:bg-sidebar-hover transition-colors"
            aria-label="Expand sidebar"
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
