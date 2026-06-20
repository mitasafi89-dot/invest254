'use client';

import { Money } from '@/components/ui/Money';
import { useSession } from '@/lib/auth/session';
import { useHydrated } from '@/lib/useHydrated';
import { useWallet } from '@/lib/wallet/hooks';
import { useDepositUi } from '@/lib/wallet/depositUi';

/**
 * Top-bar balance. Tapping it opens the wallet sheet on the Withdraw tab (the natural intent
 * when you tap "your money"); a one-tap toggle switches to Deposit. Always visible when signed in.
 */
export function BalancePill() {
  const hydrated = useHydrated();
  const token = useSession((s) => s.token);
  const { data } = useWallet();
  const openWithdraw = useDepositUi((s) => s.openWithdraw);

  if (!hydrated || !token || !data) return null;

  return (
    <button
      type="button"
      onClick={openWithdraw}
      aria-label="Open wallet"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-fg transition hover:border-accent"
    >
      <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
      <Money cents={data.real} />
    </button>
  );
}
