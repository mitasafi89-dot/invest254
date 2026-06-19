'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const items = [
  { href: '/', label: 'Game' },
  { href: '/wallet', label: 'Wallet' },
  { href: '/affiliate', label: 'Earn' },
  { href: '/account', label: 'Account' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface md:hidden">
      <ul className="mx-auto flex w-full max-w-app items-stretch">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-xs',
                  active ? 'text-accent' : 'text-muted',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-accent' : 'bg-transparent')} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
