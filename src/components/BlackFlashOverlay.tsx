import React, { useEffect, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import { BlackFlashCinematicEvent } from '../shared/types';

interface BlackFlashOverlayProps {
  event: BlackFlashCinematicEvent;
  onDismiss: () => void;
}

/**
 * Ultra-fast (~740ms), visceral Jujutsu Kaisen-style BLACK FLASH (Kokusen) critical hit overlay.
 * Renders 60fps jagged pitch-black core / crimson-red rim lightning arcs + 120ms B&W Impact Frame.
 * Pointer-events-none after impact so combat rhythm never stalls!
 */
export const BlackFlashOverlay: React.FC<BlackFlashOverlayProps> = ({ event, onDismiss }) => {
  const [phase, setPhase] = useState<'impact' | 'flash' | 'exit'>('impact');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<'impact' | 'flash' | 'exit'>('impact');
  phaseRef.current = phase;

  useEffect(() => {
    setPhase('impact');
    const tFlash = window.setTimeout(() => setPhase('flash'), 125);
    const tExit = window.setTimeout(() => setPhase('exit'), 640);
    return () => {
      window.clearTimeout(tFlash);
      window.clearTimeout(tExit);
    };
  }, [event.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    interface Spark {
      x: number;
      y: number;
      vx: number;
      vy: number;
      len: number;
      blackCore: boolean;
      alpha: number;
    }

    const sparks: Spark[] = [];
    const cx = w() * 0.5;
    const cy = h() * 0.5;
    for (let i = 0; i < 90; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 14 + Math.random() * 34;
      sparks.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        len: 1.8 + Math.random() * 3.4,
        blackCore: Math.random() < 0.55,
        alpha: 0.95,
      });
    }

    const drawBlackFlashBolt = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      jitter: number,
      thickness: number
    ) => {
      const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
      const segs = 9;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        pts.push({
          x: x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter,
          y: y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter,
        });
      }
      pts.push({ x: x2, y: y2 });

      const strokePath = () => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      };

      // Outer crimson aura glow
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = thickness * 3.1;
      ctx.lineJoin = 'miter';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 26;
      strokePath();

      // Razor white-crimson inner rim
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = thickness * 1.5;
      strokePath();

      // Iconic pitch-black Kokusen lightning core!
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#040406';
      ctx.lineWidth = thickness * 0.95;
      strokePath();
      ctx.restore();
    };

    let ringR = 18;
    let lastTs = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const step = dt * 60;
      const sparkDamp = Math.pow(0.92, step);
      const cw = w();
      const ch = h();
      const curPhase = phaseRef.current;
      ctx.clearRect(0, 0, cw, ch);

      // Expanding black-and-red shockwave ring
      ringR += ((Math.max(cw, ch) * 0.85 - ringR) * 0.2 + 18) * step;
      const ringAlpha = Math.max(0, 1 - ringR / (Math.max(cw, ch) * 0.72));
      if (ringAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha = ringAlpha;
        ctx.beginPath();
        ctx.arc(cw * 0.5, ch * 0.5, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 14;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 30;
        ctx.stroke();
        ctx.strokeStyle = '#050507';
        ctx.lineWidth = 5;
        ctx.shadowBlur = 0;
        ctx.stroke();
        ctx.restore();
      }

      // Jagged Black Flash Lightning Bolts tearing from center
      const bolts = curPhase === 'impact' ? 7 : 4;
      for (let b = 0; b < bolts; b++) {
        const ang = (Math.PI * 2 * b) / bolts + (Math.random() - 0.5) * 0.5;
        const len = Math.max(cw, ch) * (0.45 + Math.random() * 0.25);
        drawBlackFlashBolt(
          cw * 0.5,
          ch * 0.5,
          cw * 0.5 + Math.cos(ang) * len,
          ch * 0.5 + Math.sin(ang) * len,
          72,
          curPhase === 'impact' ? 5.5 : 3.6
        );
      }

      // Explosive radial sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx * step;
        s.y += s.vy * step;
        s.vx *= sparkDamp;
        s.vy *= sparkDamp;
        s.alpha *= sparkDamp;
        if (s.alpha < 0.03) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = s.blackCore ? 5.5 : 2.5;
        ctx.lineCap = 'round';
        ctx.shadowColor = '#dc2626';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * s.len, s.y - s.vy * s.len);
        ctx.stroke();
        if (s.blackCore) {
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#040406';
          ctx.lineWidth = 2.4;
          ctx.stroke();
        }
        ctx.restore();
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [event.id]);

  const isImpact = phase === 'impact';
  const isExit = phase === 'exit';

  return (
    <div
      className={`fixed inset-0 z-[96] pointer-events-none overflow-hidden select-none flex items-center justify-center transition-opacity duration-150 ${
        isExit ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        background: isImpact
          ? 'radial-gradient(circle at 50% 50%, #ffffff 0%, #fee2e2 35%, #090306 100%)'
          : 'radial-gradient(circle at 50% 50%, rgba(220,38,38,0.22) 0%, rgba(5,2,4,0.68) 65%, rgba(0,0,0,0.88) 100%)',
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          filter: isImpact ? 'contrast(2.6) saturate(1.4)' : undefined,
        }}
      />

      {/* Crisp Kinetic Stamp (clickable to dismiss early without blocking rest of map) */}
      <div
        onClick={onDismiss}
        className={`relative z-10 text-center px-6 pointer-events-auto cursor-pointer ${
          isImpact ? 'scale-115 animate-map-shake-heavy' : 'scale-100 transition-transform duration-150'
        }`}
      >
        <div
          className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded bg-black/90 border border-red-500/90 text-[10px] sm:text-xs font-display font-black tracking-[0.32em] uppercase text-red-400 shadow-[0_0_24px_rgba(220,38,38,0.85)]"
        >
          <Zap className="w-3.5 h-3.5 text-red-400 fill-red-500" />
          <span>CRÍTICO NATURAL • 20</span>
        </div>
        <h2
          className="font-chronicle font-black text-4xl sm:text-6xl lg:text-7xl tracking-[0.14em] uppercase mt-1"
          style={{
            color: isImpact ? '#050507' : '#ffffff',
            WebkitTextStroke: isImpact ? '2px #dc2626' : '2px #050507',
            textShadow: isImpact
              ? '0 0 28px #ef4444'
              : '0 0 26px #dc2626, 0 0 55px #991b1b, 0 8px 18px rgba(0,0,0,0.98)',
          }}
        >
          BLACK FLASH!
        </h2>
        <div
          className="mt-1 font-display font-bold text-xs sm:text-base tracking-[0.22em] uppercase"
          style={{
            color: isImpact ? '#050507' : '#fecaca',
            textShadow: isImpact ? 'none' : '0 2px 12px rgba(0,0,0,0.95)',
          }}
        >
          {event.attackerName}
          {event.targetName ? ` ➔ ${event.targetName}` : ''}
        </div>
      </div>
    </div>
  );
};
