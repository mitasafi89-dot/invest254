 'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { env } from '@/lib/env';
import { useSession } from '@/lib/auth/session';
import type { ConnStatus, Envelope, FairnessData, HelloData, OnlineData, Tick } from '@/lib/game/types';

const MAX_TICKS = 3000;

interface GameSocketValue {
  status: ConnStatus;
  online: number;
  fairness: FairnessData | null;
  getTicks: () => Tick[];
  getLastTick: () => Tick | null;
}

const Ctx = createContext<GameSocketValue | null>(null);

function isTick(v: unknown): v is Tick {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as Tick).t === 'number' && typeof (v as Tick).rate === 'number'
  );
}

export function GameSocketProvider({ children }: { children: React.ReactNode }) {
  const token = useSession((s) => s.token);
  const tokenRef = useRef<string | null>(token);
  tokenRef.current = token;

  const ticksRef = useRef<Tick[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const closedRef = useRef(false);
  const attemptRef = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeat = useRef<ReturnType<typeof setInterval> | null>(null);

  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [online, setOnline] = useState(0);
  const [fairness, setFairness] = useState<FairnessData | null>(null);

  const getTicks = useCallback(() => ticksRef.current, []);
  const getLastTick = useCallback(
    () => (ticksRef.current.length > 0 ? ticksRef.current[ticksRef.current.length - 1]! : null),
    [],
  );

  useEffect(() => {
    closedRef.current = false;

    const clearTimers = () => {
      if (heartbeat.current) clearInterval(heartbeat.current);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      heartbeat.current = null;
      reconnectTimer.current = null;
    };

    const pushTick = (t: Tick) => {
      const buf = ticksRef.current;
      buf.push(t);
      if (buf.length > MAX_TICKS) buf.splice(0, buf.length - MAX_TICKS);
    };

    const handle = (env_: Envelope) => {
      switch (env_.type) {
        case 'hello': {
          const d = env_.data as HelloData;
          if (d?.serverSeedHash) setFairness({ serverSeedHash: d.serverSeedHash, tradeDate: d.tradeDate });
          break;
        }
        case 'tick': {
          if (isTick(env_.data)) pushTick(env_.data);
          break;
        }
        case 'tick_batch': {
          const items = (env_.data as { ticks?: unknown[] })?.ticks ?? [];
          for (const it of items) if (isTick(it)) pushTick(it);
          break;
        }
        case 'online': {
          const d = env_.data as OnlineData;
          if (typeof d?.count === 'number') setOnline(d.count);
          break;
        }
        case 'fairness': {
          const d = env_.data as FairnessData;
          if (d?.serverSeedHash) setFairness({ serverSeedHash: d.serverSeedHash, tradeDate: d.tradeDate });
          break;
        }
        default:
          break; // balance / position_* / chat / activity handled in later phases
      }
    };

    const connect = () => {
      if (closedRef.current) return;
      setStatus('connecting');
      let ws: WebSocket;
      try {
        ws = new WebSocket(env.wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus('open');
        if (tokenRef.current) ws.send(JSON.stringify({ type: 'auth', data: { token: tokenRef.current } }));
        heartbeat.current = setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping', data: {} }));
        }, 15_000);
      };

      ws.onmessage = (ev) => {
        let parsed: Envelope;
        try {
          parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '') as Envelope;
        } catch {
          return;
        }
        if (parsed && typeof parsed.type === 'string') handle(parsed);
      };

      ws.onclose = () => {
        if (heartbeat.current) clearInterval(heartbeat.current);
        heartbeat.current = null;
        if (!closedRef.current) {
          setStatus('closed');
          scheduleReconnect();
        }
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      const n = attemptRef.current++;
      const delay = Math.min(1000 * 2 ** n, 10_000) + Math.random() * 500;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedRef.current = true;
      clearTimers();
      const ws = wsRef.current;
      if (ws && (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING)) ws.close();
      wsRef.current = null;
    };
  }, []);

  return (
    <Ctx.Provider value={{ status, online, fairness, getTicks, getLastTick }}>{children}</Ctx.Provider>
  );
}

export function useGameSocket(): GameSocketValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGameSocket must be used within <GameSocketProvider>');
  return v;
}
