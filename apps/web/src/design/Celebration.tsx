// Full-screen win celebration: your character cheers while particles fly.

import React, { useEffect, useRef } from 'react';
import { Character, type Extras, type Look } from './Character.tsx';
import { prefersReducedMotion, store } from '../lib/store.ts';
import { sfx } from '../lib/audio.ts';

const COLORS = ['#e2bd68', '#f0cf86', '#b8332d', '#2f8463', '#f1e8d6', '#5a7ad4'];

interface P { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; c: string; life: number; kind: string }

export function CelebrationOverlay({ kind, look, extras, onDone, headline, sub }: {
  kind: string; look: Look; extras?: Extras; onDone: () => void; headline?: string; sub?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = prefersReducedMotion(store.get().settings);
  useEffect(() => {
    sfx.win();
    const t = setTimeout(onDone, 3800);
    const cv = ref.current;
    if (!cv || reduced) return () => clearTimeout(t);
    const ctx = cv.getContext('2d');
    if (!ctx) return () => clearTimeout(t);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (cv.width = cv.clientWidth * dpr);
    const H = (cv.height = cv.clientHeight * dpr);
    const ps: P[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (n: number, at?: [number, number]) => {
      for (let i = 0; i < n; i++) {
        const c = COLORS[i % COLORS.length];
        if (kind === 'fireworks' && at) {
          const a = rnd(0, Math.PI * 2); const sp = rnd(2, 7) * dpr;
          ps.push({ x: at[0], y: at[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rnd(1.5, 3) * dpr, rot: 0, vr: 0, c, life: rnd(50, 80), kind: 'spark' });
        } else if (kind === 'chips') {
          ps.push({ x: rnd(0, W), y: rnd(-H, 0), vx: rnd(-1, 1) * dpr, vy: rnd(3, 7) * dpr, r: rnd(8, 13) * dpr, rot: rnd(0, 6), vr: rnd(-.1, .1), c: ['#a83434', '#1d3561', '#1f5a43', '#e2bd68'][i % 4], life: 400, kind: 'chip' });
        } else if (kind === 'snow') {
          ps.push({ x: rnd(0, W), y: rnd(-H, 0), vx: rnd(-0.6, 0.6) * dpr, vy: rnd(1, 2.6) * dpr, r: rnd(2, 5) * dpr, rot: rnd(0, 6), vr: rnd(-.03, .03), c: i % 4 ? '#f4f8ff' : '#cfe0f4', life: 600, kind: 'snow' });
        } else if (kind === 'hearts') {
          ps.push({ x: rnd(0, W), y: H + rnd(0, H * .6), vx: rnd(-0.6, 0.6) * dpr, vy: -rnd(2, 4.5) * dpr, r: rnd(6, 13) * dpr, rot: rnd(-.4, .4), vr: rnd(-.01, .01), c: ['#e04a6a', '#c23a5a', '#f0b8c4', '#e2bd68'][i % 4], life: 500, kind: 'heart' });
        } else if (kind === 'petals') {
          ps.push({ x: rnd(0, W), y: rnd(-H * .8, 0), vx: rnd(-1.4, 1.4) * dpr, vy: rnd(1.4, 3.2) * dpr, r: rnd(4, 8) * dpr, rot: rnd(0, 6), vr: rnd(-.08, .08), c: ['#f0b8c8', '#f7d6e0', '#fff4f6', '#f2dc7a'][i % 4], life: 600, kind: 'petal' });
        } else if (kind === 'sparkle') {
          ps.push({ x: rnd(W * .2, W * .8), y: rnd(H * .1, H * .8), vx: 0, vy: rnd(-.5, -.1) * dpr, r: rnd(2, 6) * dpr, rot: rnd(0, 6), vr: .05, c: i % 2 ? '#f0cf86' : '#fff8e0', life: rnd(40, 120), kind: 'star' });
        } else {
          ps.push({ x: rnd(0, W), y: rnd(-H * .6, 0), vx: rnd(-1.5, 1.5) * dpr, vy: rnd(2, 5) * dpr, r: rnd(4, 8) * dpr, rot: rnd(0, 6), vr: rnd(-.2, .2), c, life: 400, kind: 'confetti' });
        }
      }
    };
    if (kind === 'fireworks') spawn(0); else spawn(kind === 'sparkle' ? 40 : kind === 'snow' ? 220 : kind === 'hearts' ? 70 : 160);
    let raf = 0;
    let frame = 0;
    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);
      if (kind === 'fireworks' && frame % 22 === 1) spawn(70, [rnd(W * .15, W * .85), rnd(H * .1, H * .45)]);
      if (kind === 'sparkle' && frame % 6 === 0) spawn(4);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        if (p.kind === 'spark') { p.vy += 0.06 * dpr; p.vx *= 0.985; }
        if (p.kind === 'snow' || p.kind === 'petal') p.x += Math.sin((frame + i * 7) / 30) * 0.6 * dpr;
        if (p.life <= 0 || p.y > H + 40 || p.y < -H) { ps.splice(i, 1); continue; }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = p.kind === 'spark' || p.kind === 'star' ? Math.min(1, p.life / 30) : 1;
        ctx.fillStyle = p.c;
        if (p.kind === 'confetti') ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        else if (p.kind === 'heart') {
          const r = p.r;
          ctx.beginPath(); ctx.moveTo(0, r * .35);
          ctx.bezierCurveTo(-r * 1.1, -r * .35, -r * .45, -r * 1.1, 0, -r * .45);
          ctx.bezierCurveTo(r * .45, -r * 1.1, r * 1.1, -r * .35, 0, r * .35); ctx.fill();
        } else if (p.kind === 'petal') { ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * .5, 0, 0, Math.PI * 2); ctx.fill(); }
        else if (p.kind === 'chip') {
          ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#f1e8d6'; ctx.setLineDash([3 * dpr, 3 * dpr]); ctx.lineWidth = 2 * dpr; ctx.stroke();
        } else if (p.kind === 'star') {
          ctx.beginPath();
          for (let k = 0; k < 8; k++) { const rr = k % 2 ? p.r * .35 : p.r; ctx.lineTo(Math.cos(k * Math.PI / 4) * rr, Math.sin(k * Math.PI / 4) * rr); }
          ctx.fill();
        } else { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, []);
  return (
    <div className="celebration" onClick={onDone} role="dialog" aria-label={headline ?? 'You win'}>
      <canvas ref={ref} className="cel-canvas" aria-hidden="true" />
      <div className="cel-stage">
        {headline && <p className="cel-head display">{headline}</p>}
        {sub && <p className="cel-sub">{sub}</p>}
        <div className="cel-figure"><Character look={look} extras={extras} pose={kind === 'fireworks' ? 'fistpump' : 'cheer'} animate={!reduced} width="100%" height="100%" /></div>
        <p className="cel-tap">Tap to continue</p>
      </div>
    </div>
  );
}
