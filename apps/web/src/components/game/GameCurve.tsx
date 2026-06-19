 'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api/endpoints';
import { useGameSocket } from '@/lib/game/GameSocketProvider';
import { CurveCanvas } from '@/components/game/CurveCanvas';

const DEFAULT_TIMEFRAMES = [30, 60, 120, 300];

function labelFor(s: number): string {
  return s % 60 === 0 ? `${s / 60}m` : `${s}s`;
}

export function GameCurve() {
  const { status, online, fairness, getTicks, getLastTick } = useGameSocket();
  const { data: config } = useQuery({ queryKey: ['gameConfig'], queryFn: api.gameConfig, staleTime: 5 * 60_000 });
  const timeframes = config?.timeframesS && config.timeframesS.length > 0 ? config.timeframesS : DEFAULT_TIMEFRAMES;
  const [tf, setTf] = useState<number>(timeframes[0] ?? 30);

  const statusDot = status === 'open' ? 'bg-up' : status === 'connecting' ? 'bg-yellow-400' : 'bg-down';
  const seedShort = useMemo(
    () => (fairness ? `${fairness.serverSeedHash.slice(0, 10)}…` : null),
    [fairness],
  );

  return (
    <Card className="flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">BTC/KES</span>
          <span className={cn('h-2 w-2 rounded-full', statusDot)} title={status} />
        </div>
        <div className="flex items-center gap-1 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-up" />
          {online.toLocaleString('en-KE')} online
        </div>
      </div>

      <div className="relative h-52 w-full overflow-hidden rounded-xl bg-surface-2/40 sm:h-72">
        <CurveCanvas getTicks={getTicks} getLastTick={getLastTick} windowMs={tf * 1000} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {timeframes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTf(s)}
              className={cn(
                'h-8 rounded-lg px-3 text-xs font-medium transition',
                tf === s ? 'bg-accent text-accent-fg' : 'text-muted hover:text-fg',
              )}
            >
              {labelFor(s)}
            </button>
          ))}
        </div>
      </div>

      {seedShort ? (
        <p className="text-center text-[11px] text-muted">
          Provably fair · seed {seedShort}
          {fairness?.tradeDate ? ` · ${fairness.tradeDate}` : ''}
        </p>
      ) : null}
    </Card>
  );
}
