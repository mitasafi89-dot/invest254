import { DEFAULT_CONFIG } from '@printpesa/shared/config';
import { formatKes } from '@printpesa/shared/money';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Money } from '@/components/ui/Money';
import { GameSocketProvider } from '@/lib/game/GameSocketProvider';
import { GameCurve } from '@/components/game/GameCurve';

export default function GamePage() {
  return (
    <GameSocketProvider>
      <section className="flex flex-col gap-4">
        <GameCurve />

        {/* Bet panel placeholder — wired up in FE4. */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Min stake</span>
            <Money cents={DEFAULT_CONFIG.minStakeCents} className="font-medium" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Max payout</span>
            <span className="font-medium">×{DEFAULT_CONFIG.maxMultiplier.toFixed(1)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="up" size="lg" fullWidth disabled>BUY</Button>
            <Button variant="down" size="lg" fullWidth disabled>SELL</Button>
          </div>
          <p className="text-center text-xs text-muted">
            Trading wires up in FE4. Quick chips start at {formatKes(DEFAULT_CONFIG.minStakeCents)}.
          </p>
        </Card>
      </section>
    </GameSocketProvider>
  );
}
