 'use client';

import { useEffect, useRef } from 'react';
import type { Tick } from '@/lib/game/types';

interface Colors {
  up: string;
  down: string;
  border: string;
  muted: string;
}

function readColors(): Colors {
  const cs = getComputedStyle(document.documentElement);
  const g = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return {
    up: g('--pp-up', '#22e07e'),
    down: g('--pp-down', '#ff5470'),
    border: g('--pp-border', '#262a33'),
    muted: g('--pp-muted', '#8b909a'),
  };
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '').trim();
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return hex;
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

type Pt = [number, number];

function smoothPath(ctx: CanvasRenderingContext2D, p: Pt[]): void {
  const first = p[0];
  if (!first) return;
  ctx.moveTo(first[0], first[1]);
  for (let i = 0; i < p.length - 1; i++) {
    const p1 = p[i];
    const p2 = p[i + 1];
    if (!p1 || !p2) continue;
    const p0 = p[i - 1] ?? p1;
    const p3 = p[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
  }
}

export function CurveCanvas({
  getTicks,
  getLastTick,
  windowMs,
}: {
  getTicks: () => Tick[];
  getLastTick: () => Tick | null;
  windowMs: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const windowRef = useRef(windowMs);
  windowRef.current = windowMs;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let colors = readColors();
    let seenT = 0;
    let seenPerf = 0;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      cssW = r.width;
      cssH = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const mo = new MutationObserver(() => {
      colors = readColors();
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const drawEmpty = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, cssH / 2);
      ctx.lineTo(cssW, cssH / 2);
      ctx.stroke();
      ctx.fillStyle = colors.muted;
      ctx.font = '12px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for live ticks…', cssW / 2, cssH / 2 - 8);
    };

    const render = () => {
      const w = windowRef.current;
      const last = getLastTick();
      if (last && last.t !== seenT) {
        seenT = last.t;
        seenPerf = performance.now();
      }
      const rightEdge = last ? last.t + (reduce ? 0 : performance.now() - seenPerf) : Date.now();
      const start = rightEdge - w;

      const all = getTicks();
      let pts: Tick[] = [];
      for (let i = 0; i < all.length; i++) {
        const t = all[i]!;
        if (t.t >= start) pts.push(t);
      }
      if (pts.length < 2) {
        drawEmpty();
        return;
      }
      // decimate for very dense windows
      if (pts.length > 800) {
        const step = Math.ceil(pts.length / 800);
        const ds: Tick[] = [];
        for (let i = 0; i < pts.length; i += step) ds.push(pts[i]!);
        const tail = pts[pts.length - 1]!;
        if (ds[ds.length - 1] !== tail) ds.push(tail);
        pts = ds;
      }

      let mn = Infinity;
      let mx = -Infinity;
      for (const p of pts) {
        if (p.rate < mn) mn = p.rate;
        if (p.rate > mx) mx = p.rate;
      }
      if (mx - mn < 1e-9) {
        mx += 1e-3;
        mn -= 1e-3;
      }

      const padY = 14;
      const usableH = Math.max(1, cssH - 2 * padY);
      const X = (t: number) => ((t - start) / w) * cssW;
      const Y = (r: number) => padY + usableH * (1 - (r - mn) / (mx - mn));

      const last2 = pts[pts.length - 1]!;
      const coords: Pt[] = pts.map((p) => [X(p.t), Y(p.rate)]);
      coords.push([cssW, Y(last2.rate)]); // hold the line to the live right edge

      const up = (last2.delta ?? 0) >= 0;
      const line = up ? colors.up : colors.down;
      const first = coords[0]!;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // area fill
      ctx.beginPath();
      smoothPath(ctx, coords);
      ctx.lineTo(cssW, cssH);
      ctx.lineTo(first[0], cssH);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      grad.addColorStop(0, hexA(line, 0.3));
      grad.addColorStop(1, hexA(line, 0));
      ctx.fillStyle = grad;
      ctx.fill();

      // glowing stroke
      ctx.beginPath();
      smoothPath(ctx, coords);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = line;
      ctx.shadowColor = line;
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // live dot
      const lx = cssW;
      const ly = Y(last2.rate);
      ctx.beginPath();
      ctx.arc(lx - 1, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = line;
      ctx.fill();
    };

    let raf = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    if (reduce) {
      interval = setInterval(render, 250);
      render();
    } else {
      const loop = () => {
        render();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (interval) clearInterval(interval);
      ro.disconnect();
      mo.disconnect();
    };
  }, [getTicks, getLastTick]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-label="Live price curve" role="img" />;
}
