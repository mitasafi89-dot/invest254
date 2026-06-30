import { GameSocketProvider } from '@/lib/game/GameSocketProvider';
import { PriceHeader } from '@/components/game/PriceHeader';
import { TickerStrip } from '@/components/game/TickerStrip';
import { GameCurve } from '@/components/game/GameCurve';
import { ActivityTicker } from '@/components/game/ActivityTicker';
import { BetPanel } from '@/components/game/BetPanel';
import { Feed } from '@/components/game/Feed';

export default function GamePage() {
  return (
    <GameSocketProvider>
      <section className="flex flex-col gap-3 pb-20 md:pb-0">
        <PriceHeader />
        <TickerStrip />
        <GameCurve />
        <ActivityTicker />
        {/* Keep BUY/SELL pinned above the mobile bottom nav so they're always
            visible without scrolling. Reverts to normal flow on md+ screens. */}
        <div
          data-testid="bet-panel-dock"
          className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 md:static md:bottom-auto md:z-auto"
        >
          <BetPanel />
        </div>
        <Feed />
      </section>
    </GameSocketProvider>
  );
}
