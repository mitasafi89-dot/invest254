'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { formatRelativeTime } from '@/lib/format';
import { PageHeader, TableWrap, Th, Td, Empty, Toolbar, FilterSelect } from '@/components/admin/ui';
import { useUsers } from '@/lib/admin/hooks';

const ROLE_OPTS = [
  { value: '', label: 'All roles' },
  { value: 'player', label: 'Players' },
  { value: 'marketer', label: 'Marketers' },
  { value: 'admin', label: 'Admins' },
  { value: 'superadmin', label: 'Superadmins' },
];
const STATUS_OPTS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

export default function UsersPage() {
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  const filter = useMemo(
    () => ({ ...(role ? { role } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) }),
    [role, status, q],
  );
  const query = useUsers(filter);
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  return (
    <>
      <PageHeader title="Users" subtitle="Search, filter and manage player and staff accounts." />

      <Toolbar>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search username…"
          className="h-9 w-full max-w-xs rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg outline-none focus:border-accent sm:w-64"
        />
        <FilterSelect value={role} onChange={setRole} options={ROLE_OPTS} />
        <FilterSelect value={status} onChange={setStatus} options={STATUS_OPTS} />
      </Toolbar>

      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <Empty title="Couldn't load users" description="Try again shortly." />
      ) : rows.length === 0 ? (
        <Empty title="No users match" description="Adjust your search or filters." />
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr className="border-b border-border">
                <Th>Username</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th className="text-right">Manage</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.userId} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                  <Td className="font-medium">@{u.username}</Td>
                  <Td className="capitalize text-muted">{u.role}</Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-muted">{formatRelativeTime(u.createdAtMs)} ago</Td>
                  <Td className="text-right">
                    <Link href={`/admin/users/${u.userId}`} className="text-sm font-medium text-accent hover:underline">
                      Open
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {query.hasNextPage ? (
            <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
              {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
