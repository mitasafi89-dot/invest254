import * as React from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { BottomNav } from '@/components/layout/BottomNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      {/* Bottom padding clears the mobile nav; removed at md where nav is hidden. */}
      <main className="mx-auto w-full max-w-app flex-1 px-4 py-4 pb-24 md:pb-8">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
