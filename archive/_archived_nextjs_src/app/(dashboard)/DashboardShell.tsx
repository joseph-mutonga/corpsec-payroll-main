'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { UserSession } from '@/types';

export function DashboardShell({
  session,
  children,
}: {
  session: UserSession;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-container">
      <Sidebar
        session={session}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        <Header
          session={session}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        />

        <main className="page-wrapper">{children}</main>
      </div>
    </div>
  );
}
