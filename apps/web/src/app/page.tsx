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
        <BetPanel />
        <Feed />
      </section>
    </GameSocketProvider>
  );
}
