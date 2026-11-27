import React, { useEffect, useRef, useState } from 'react';
import { Crown, Skull, Swords } from 'lucide-react';
import { ExecutionCinematicEvent } from '../shared/types';
import { TokenPortrait } from './TokenPortrait';

interface ExecutionOverlayProps {
  event: ExecutionCinematicEvent;
  resolvedKillerPortraitUrl: string;
  onDismiss: () => void;
}

/**
 * Visceral Execution Climax Banner ("ABATE BRUTAL!" / "EXECUÇÃO DE CHEFE!" — "COMO VOCÊ QUER FAZER ISSO?")
 * Triggers on every combat kill with a razor-sharp diagonal blade slash on 60fps canvas + crimson sparks.
 */
export const ExecutionOverlay: React.FC<ExecutionOverlayProps> = ({
  event,
  resolvedKillerPortraitUrl,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<'slash' | 'hold' | 'exit'>('slash');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isBoss = Boolean(event.isBoss);
  const accent = isBoss ? '#f59e0b' : '#dc2626';

  useEffect(() => {
    setPhase('slash');
    const tHold = window.setTimeout(() => setPhase('hold'), 110);
    const tExit = window.setTimeout(() => setPhase('exit'), isBoss ? 2550 : 1850);
    return () => {
      window.clearTimeout(tHold);
      window.clearTimeout(tExit);
    };
  }, [event.id, isBoss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

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
    const startTs = performance.now();

    interface Ember {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      alpha: number;
      isGold: boolean;
    }

    const embers: Ember[] = [];
    for (let i = 0; i < (isBoss ? 85 : 55); i++) {
      const t = Math.random();
      const sx = w() * (0.1 + t * 0.8);
      const sy = h() * (0.58 - t * 0.16);
      const ang = -0.35 + (Math.random() - 0.5) * 2.2;
      const spd = 4 + Math.random() * 18;
      embers.push({
        x: sx,
        y: sy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 2,
        r: 1.6 + Math.random() * 3.8,
        alpha: 0.9,
        isGold: isBoss ? Math.random() < 0.5 : Math.random() < 0.25,
      });
    }

    let lastTs = startTs;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const step = dt * 60;
      const velDamp = Math.pow(0.96, step);
      const alphaDamp = Math.pow(0.965, step);
      const cw = w();
      const ch = h();
      const elapsed = now - startTs;
      ctx.clearRect(0, 0, cw, ch);

      // Blazing Diagonal Execution Slash Streak (0 -> 450ms)
      if (elapsed < 480) {
        const p = Math.min(1, elapsed / 140);
        const fade = Math.max(0, 1 - Math.max(0, elapsed - 120) / 360);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade;
        const x1 = cw * 0.04;
        const y1 = ch * 0.62;
        const x2 = x1 + (cw * 0.92) * p;
        const y2 = y1 - (ch * 0.24) * p;
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, accent);
        grad.addColorStop(0.88, '#ffffff');
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = isBoss ? 14 : 9;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 28;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      }

      // Flying Crimson / Gold Shatter Sparks
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        e.x += e.vx * step;
        e.y += e.vy * step;
        e.vx *= velDamp;
        e.vy = e.vy * velDamp + 0.14 * step;
        e.alpha *= alphaDamp;
        if (e.alpha < 0.02) {
          embers.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = e.alpha;
        ctx.strokeStyle = e.isGold ? '#fde68a' : '#ef4444';
        ctx.lineWidth = e.r;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x - e.vx * 1.9, e.y - e.vy * 1.9);
        ctx.stroke();
      }
      ctx.restore();

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [accent, event.id, isBoss]);

  const isSlash = phase === 'slash';
  const isExit = phase === 'exit';

  return (
    <div
      data-modal-overlay="true"
      data-sub-overlay="true"
      onClick={onDismiss}
      className={`fixed inset-0 z-[92] pointer-events-auto cursor-pointer overflow-hidden select-none flex items-center justify-center transition-opacity duration-300 ${
        isExit ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        background: isSlash
          ? 'rgba(255,255,255,0.28)'
          : isBoss
            ? 'radial-gradient(ellipse at 50% 50%, rgba(153,27,27,0.34) 0%, rgba(4,4,8,0.82) 72%, rgba(0,0,0,0.92) 100%)'
            : 'radial-gradient(ellipse at 50% 50%, rgba(153,27,27,0.22) 0%, rgba(4,4,8,0.58) 72%, rgba(0,0,0,0.72) 100%)',
      }}
      title="Clique ou pressione Esc para fechar"
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Razor-Sharp Horizontal Execution Ribbon */}
      <div
        className={`relative z-10 w-full py-5 sm:py-6 px-6 flex items-center justify-center border-y-2 ${
          isSlash ? 'scale-y-110 animate-map-shake-heavy' : 'animate-ultimate-title-slam'
        }`}
        style={{
          background: isBoss
            ? 'linear-gradient(90deg, rgba(6,4,8,0.94) 0%, rgba(46,12,16,0.96) 50%, rgba(6,4,8,0.94) 100%)'
            : 'linear-gradient(90deg, rgba(6,4,8,0.88) 0%, rgba(36,10,14,0.94) 50%, rgba(6,4,8,0.88) 100%)',
          borderColor: accent,
          boxShadow: `0 0 60px ${accent}55, inset 0 0 42px ${accent}30`,
        }}
      >
        <div className="max-w-4xl w-full flex items-center justify-center gap-4 sm:gap-6">
          {/* Killer Slanted Portrait Medallion */}
          <div className="shrink-0 hidden sm:block">
            {resolvedKillerPortraitUrl ? (
              <div
                className="w-20 h-24 overflow-hidden bg-[#060810]"
                style={{
                  clipPath: 'polygon(12% 0%, 100% 0%, 88% 100%, 0% 100%)',
                  border: `2px solid ${accent}`,
                  boxShadow: `0 0 22px ${accent}88`,
                }}
              >
                <img
                  src={resolvedKillerPortraitUrl}
                  alt={event.killerName}
                  className="w-full h-full object-cover object-[50%_15%]"
                />
              </div>
            ) : (
              <TokenPortrait
                name={event.killerName}
                playerColor={event.killerColor || accent}
                frameStyle={isBoss ? 'gold' : 'crimson'}
                sizePx={72}
              />
            )}
          </div>

          <div className="text-center sm:text-left space-y-1 min-w-0">
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-black/80 border text-[10px] sm:text-xs font-display font-black tracking-[0.26em] uppercase"
              style={{ borderColor: accent, color: isBoss ? '#fde68a' : '#fca5a5' }}
            >
              {isBoss ? <Crown className="w-3.5 h-3.5 text-amber-400" /> : <Skull className="w-3.5 h-3.5 text-red-400" />}
              <span>{isBoss ? 'CHEFE ANIQUILADO' : 'GOLPE FINALIZADOR'}</span>
            </div>

            <h2
              className="font-chronicle font-black text-3xl sm:text-5xl tracking-[0.12em] uppercase text-white leading-none"
              style={{
                textShadow: `0 0 28px ${accent}, 0 4px 12px rgba(0,0,0,0.98)`,
              }}
            >
              {isBoss ? 'EXECUÇÃO DE CHEFE!' : 'EXECUÇÃO!'}
            </h2>

            <p className="font-lore italic text-sm sm:text-lg text-amber-200/95 tracking-wide">
              &ldquo;Como você quer fazer isso?&rdquo;
            </p>

            <div className="flex items-center justify-center sm:justify-start gap-2 text-xs font-display font-bold pt-0.5 text-[#e6dfd1]">
              <span style={{ color: event.killerColor || '#f59e0b' }}>{event.killerName}</span>
              <Swords className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-red-300 line-through decoration-red-500/80">
                {event.victimName}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
