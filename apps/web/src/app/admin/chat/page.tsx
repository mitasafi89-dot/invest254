'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast/ToastProvider';
import { formatRelativeTime } from '@/lib/format';
import { PageHeader, Section, Empty, Toolbar, ConfirmButton } from '@/components/admin/ui';
import { useChatMod, useChatModAction } from '@/lib/admin/hooks';
import type { AdminChatModRow } from '@/lib/admin/types';

export default function ChatModerationPage() {
  const [includeHidden, setIncludeHidden] = useState(true);
  const q = useChatMod(includeHidden);
  const rows = q.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Chat moderation"
        subtitle="Review the live trade-room feed. Hide messages that violate community rules; unhide to restore."
        actions={
          <Toolbar>
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={includeHidden}
                onChange={(e) => setIncludeHidden(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[var(--pp-accent)]"
              />
              Show hidden
            </label>
          </Toolbar>
        }
      />

      <Section>
        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : q.isError ? (
          <Empty title="Couldn't load chat" description="Try again shortly." />
        ) : rows.length === 0 ? (
          <Empty title="No messages" description="The trade room is quiet right now." />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((m) => (
              <ChatRow key={m.id} m={m} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function ChatRow({ m }: { m: AdminChatModRow }) {
  const action = useChatModAction();
  const toast = useToast();

  function run(hide: boolean) {
    action.mutate(
      { id: m.id, hide },
      {
        onSuccess: () => toast.push({ tone: 'success', title: hide ? 'Message hidden' : 'Message restored' }),
        onError: (e) => toast.push({ tone: 'error', title: 'Action failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
      },
    );
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-medium text-fg">@{m.username}</span>
          {m.userId ? <span className="font-mono">{m.userId.slice(0, 8)}…</span> : null}
          <span>·</span>
          <span>{formatRelativeTime(m.createdAtMs)} ago</span>
          {m.isHidden ? (
            <span className="rounded-md bg-down/10 px-1.5 py-0.5 font-medium text-down">Hidden</span>
          ) : null}
        </div>
        <p className={m.isHidden ? 'mt-1 break-words text-sm text-muted line-through' : 'mt-1 break-words text-sm text-fg'}>{m.message}</p>
      </div>
      <div className="shrink-0">
        {m.isHidden ? (
          <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => run(false)}>
            Unhide
          </Button>
        ) : (
          <ConfirmButton label="Hide" confirmLabel="Hide" variant="outline" busy={action.isPending} onConfirm={() => run(true)} />
        )}
      </div>
    </li>
  );
}
