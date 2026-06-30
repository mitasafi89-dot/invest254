'use client';

import { useEffect, useState } from 'react';
import { CURVE_AMPLITUDE, CURVE_BASE_RATE } from '@invest254/shared/config';
import { cn } from '@/lib/cn';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import { useSession } from '@/lib/auth/session';
import { useOnlineDisplay } from '@/lib/game/onlineDisplay';

/** Signed display value the chart plots: rate = BASE + AMP * value. */
const toValue = (rate: number) => (rate - CURVE_BASE_RATE) / CURVE_AMPLITUDE;
const fmt = (v: number) => v.toFixed(4);
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

/**
 * Headline price strip (mobile-first): BTC/KES signed value + % pill, with
 * 24H high/low (window extremes) and the live online count on the right.
 * The number is the game's synthetic curve value, not a real BTC price.
 */
export function PriceHeader() {
  const { getTicks, getLastTick, online, status } = useGameSocket();
  const role = useSession((s) => s.user?.role);
  // Staff see the real concurrency; everyone else sees a believable, gently
  // fluctuating crowd figure (social proof) — never the raw dev/low value.
  const displayOnline = useOnlineDisplay(online, role);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => (n + 1) % 1_000_000), 250);
    return () => clearInterval(id);
  }, []);

  const last = getLastTick();
  const value = last ? toValue(last.rate) : null;

  let hi: number | null = null;
  let lo: number | null = null;
  const ticks = getTicks();
  if (ticks.length > 0) {
    let mx = -Infinity;
    let mn = Infinity;
    for (const t of ticks) {
      const v = toValue(t.rate);
      if (v > mx) mx = v;
      if (v < mn) mn = v;
    }
    hi = mx;
    lo = mn;
  }

  const up = (value ?? 0) >= 0;
  const statusDot = status === 'open' ? 'bg-up' : status === 'connecting' ? 'bg-warn' : 'bg-down';

  return (
    <div className="flex items-start justify-between gap-2 sm:gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', statusDot)} title={status} />
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-medium text-muted">BTC/KES</span>
          <div className="flex items-center gap-2">
            <span className={cn('text-xl font-bold tabular-nums sm:text-2xl', up ? 'text-up' : 'text-down')}>
              {value !== null ? fmt(value) : '—'}
            </span>
            {value !== null ? (
              <span
                className={cn(
                  'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                  up ? 'bg-up/15 text-up' : 'bg-down/15 text-down',
                )}
              >
                {signed(value * 100)}%
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-2.5 text-right sm:gap-4">
        <Stat className="hidden xs:flex" label="24H HIGH" value={hi !== null ? fmt(hi) : '—'} />
        <Stat className="hidden xs:flex" label="24H LOW" value={lo !== null ? fmt(lo) : '—'} />
        <Stat label="ONLINE" value={displayOnline > 0 ? displayOnline.toLocaleString('en-KE') : '—'} />
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex flex-col', className)}>
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-fg">{value}</span>
    </div>
  );
}
