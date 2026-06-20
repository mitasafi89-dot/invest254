'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Money } from '@/components/ui/Money';
import { StatusBadge } from '@/components/ui/Badge';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast/ToastProvider';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/auth/session';
import { PageHeader, StatCard, Section, Empty, ConfirmButton } from '@/components/admin/ui';
import { useUser, useSetUserStatus, useAdjustBalance, useSetCommissionRate, useSetUserRole } from '@/lib/admin/hooks';

const ROLES = ['player', 'marketer', 'admin'] as const;

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const q = useUser(id);

  return (
    <>
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/users" className="text-accent hover:underline">
          ← Users
        </Link>
      </div>

      {q.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : q.isError || !q.data ? (
        <Empty title="User not found" description="This account may have been removed." />
      ) : (
        <>
          <PageHeader
            title={`@${q.data.username}`}
            subtitle={`${q.data.role} · joined ${formatDateTime(q.data.createdAtMs)}`}
            actions={<StatusBadge status={q.data.status} />}
          />

          <Section title="Balances">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Real balance" money={q.data.realBalanceCents} />
              <StatCard label="Bonus balance" money={q.data.bonusBalanceCents} />
              <StatCard label="Turnover" money={q.data.turnoverCents} />
              <StatCard label="Net revenue (GGR)" money={q.data.ggrCents} tone="up" />
            </div>
          </Section>

          <Section title="Profile">
            <Card className="flex flex-col gap-2 text-sm">
              <Row label="User ID" value={q.data.userId} mono />
              <Row label="Phone" value={q.data.phone || '—'} />
              <Row label="Referred by" value={q.data.referredBy ? `${q.data.referredBy.slice(0, 8)}…` : '—'} mono />
            </Card>
          </Section>

          {q.data.role === 'superadmin' ? (
            <Section title="System owner">
              <Card className="flex flex-col gap-1">
                <span className="text-sm font-medium text-fg">Protected account</span>
                <span className="text-sm text-muted">
                  This is the system owner (superadmin). Their role and status are locked and their wallet can&apos;t be adjusted — no
                  account can demote, suspend, ban, or modify the owner.
                </span>
              </Card>
            </Section>
          ) : (
            <>
              <StatusActions id={id} status={q.data.status} />
              <RoleManage id={id} current={q.data.role} />
              <BalanceAdjust id={id} />
              {q.data.role === 'marketer' ? <CommissionRate id={id} /> : null}
            </>
          )}
        </>
      )}
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={'font-medium text-fg ' + (mono ? 'font-mono text-xs' : '')}>{value}</span>
    </div>
  );
}

function StatusActions({ id, status }: { id: string; status: string }) {
  const m = useSetUserStatus();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const s = status.toLowerCase();

  function run(action: 'suspend' | 'ban' | 'reactivate') {
    m.mutate(
      { id, action, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      {
        onSuccess: () => {
          setReason('');
          toast.push({ tone: 'success', title: `Account ${action}d` });
        },
        onError: (e) =>
          toast.push({ tone: 'error', title: 'Action failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
      },
    );
  }

  return (
    <Section title="Account status">
      <Card className="flex flex-col gap-3">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (recorded in the audit log)"
          className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-2">
          {s !== 'active' ? (
            <ConfirmButton label="Reactivate" variant="primary" busy={m.isPending} onConfirm={() => run('reactivate')} />
          ) : null}
          {s === 'active' ? (
            <ConfirmButton label="Suspend" variant="outline" busy={m.isPending} onConfirm={() => run('suspend')} />
          ) : null}
          {s !== 'banned' ? (
            <ConfirmButton label="Ban" variant="down" confirmLabel="Ban account" busy={m.isPending} onConfirm={() => run('ban')} />
          ) : null}
        </div>
        <p className="text-xs text-muted">Suspended users can&apos;t log in; banned is permanent. Every change is audited.</p>
      </Card>
    </Section>
  );
}

function RoleManage({ id, current }: { id: string; current: string }) {
  const m = useSetUserRole();
  const toast = useToast();
  const myRole = useSession((s) => s.user?.role);
  const [role, setRole] = useState(current);

  // Role changes are sensitive — superadmin only (the API enforces this too).
  if (myRole !== 'superadmin') return null;

  function run() {
    m.mutate(
      { id, role },
      {
        onSuccess: () => toast.push({ tone: 'success', title: 'Role updated', description: 'Takes effect on the user’s next login.' }),
        onError: (e) => toast.push({ tone: 'error', title: 'Update failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
      },
    );
  }

  return (
    <Section title="Role">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Account role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <ConfirmButton
          label="Change role"
          confirmLabel="Confirm role change"
          size="md"
          variant={role === 'admin' || role === 'superadmin' ? 'down' : 'primary'}
          busy={m.isPending}
          disabled={role === current}
          onConfirm={run}
        />
      </Card>
      <p className="text-xs text-muted">
        Promoting to admin or superadmin grants back-office access. Changes are audited and apply on the user’s next login.
      </p>
    </Section>
  );
}

function BalanceAdjust({ id }: { id: string }) {
  const m = useAdjustBalance();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [dir, setDir] = useState<'credit' | 'debit'>('credit');
  const [reason, setReason] = useState('');

  const cents = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && reason.trim().length > 0;

  function run() {
    const signed = dir === 'debit' ? -cents : cents;
    m.mutate(
      { id, amountCents: signed, reason: reason.trim() },
      {
        onSuccess: (r) => {
          setAmount('');
          setReason('');
          toast.push({ tone: 'success', title: `Balance ${r.direction}ed`, description: 'Wallet updated and audited.' });
        },
        onError: (e) =>
          toast.push({ tone: 'error', title: 'Adjustment failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
      },
    );
  }

  return (
    <Section title="Manual balance adjustment">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value as 'credit' | 'debit')}
            className="h-10 rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
          >
            <option value="credit">Credit (+)</option>
            <option value="debit">Debit (−)</option>
          </select>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="Amount (KES)"
            className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
          />
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, audited)"
          className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
        />
        <ConfirmButton
          label={dir === 'credit' ? 'Credit wallet' : 'Debit wallet'}
          confirmLabel="Confirm adjustment"
          variant={dir === 'credit' ? 'primary' : 'down'}
          size="md"
          busy={m.isPending}
          disabled={!valid}
          onConfirm={run}
        />
        <p className="text-xs text-muted">Adjusts the real balance with an immutable ledger entry. No overdraw on debit.</p>
      </Card>
    </Section>
  );
}

function CommissionRate({ id }: { id: string }) {
  const m = useSetCommissionRate();
  const toast = useToast();
  const [ratePct, setRatePct] = useState('20');
  const pct = Number(ratePct);
  const valid = Number.isFinite(pct) && pct >= 0 && pct <= 100;

  function run() {
    m.mutate(
      { id, rate: pct / 100 },
      {
        onSuccess: () => toast.push({ tone: 'success', title: 'Commission rate updated' }),
        onError: (e) =>
          toast.push({ tone: 'error', title: 'Update failed', description: e instanceof ApiError ? e.message : 'Try again.' }),
      },
    );
  }

  return (
    <Section title="Affiliate commission rate">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Rate (%)</span>
          <input
            value={ratePct}
            onChange={(e) => setRatePct(e.target.value)}
            inputMode="decimal"
            className="h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent"
          />
        </label>
        <ConfirmButton label="Update rate" size="md" busy={m.isPending} disabled={!valid} onConfirm={run} />
      </Card>
    </Section>
  );
}
