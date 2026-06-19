import * as React from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

export function PageStub({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted">{phase}</span>
      </div>
      {children ?? (
        <EmptyState title="Coming soon" description={`This screen is implemented in ${phase}.`} />
      )}
    </section>
  );
}
