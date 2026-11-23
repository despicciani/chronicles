import React, { useEffect, useRef } from 'react';
import { MapProjectileVfx, ProjectileVfxKind } from '../shared/types';

interface ProjectileVfxCanvasProps {
  projectiles: MapProjectileVfx[];
  cellPx: number;
  gridWidth: number;
  gridHeight: number;
}

interface ActiveAnim {
  proj: MapProjectileVfx;
  startTime: number;
  flightMs: number;
  impactMs: number;
}

const KIND_PALETTE: Record<
  ProjectileVfxKind,
  { core: string; glow: string; trail: string }
> = {
  fireball: { core: '#fff7ed', glow: '#f97316', trail: '#ef4444' },
  lightning: { core: '#f0f9ff', glow: '#38bdf8', trail: '#818cf8' },
  frost: { core: '#ecfeff', glow: '#67e8f9', trail: '#0ea5e9' },
  arcane: { core: '#faf5ff', glow: '#c084fc', trail: '#7c3aed' },
  heal: { core: '#ecfdf5', glow: '#34d399', trail: '#10b981' },
  blessing: { core: '#fefce8', glow: '#fde047', trail: '#f59e0b' },
  curse: { core: '#fdf2f8', glow: '#a855f7', trail: '#4c1d95' },
  arrow: { core: '#fef3c7', glow: '#f59e0b', trail: '#d97706' },
  slash: { core: '#fef2f2', glow: '#f87171', trail: '#dc2626' },
};

export const ProjectileVfxCanvas: React.FC<ProjectileVfxCanvasProps> = ({
  projectiles,
  cellPx,
  gridWidth,
  gridHeight,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeMapRef = useRef<Map<string, ActiveAnim>>(new Map());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const currentIds = new Set(projectiles.map((p) => p.id));
    // Prune old seen IDs that are no longer in the prop array
    seenIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        seenIdsRef.current.delete(id);
      }
    });
    projectiles.forEach((p) => {
      if (!seenIdsRef.current.has(p.id)) {
        seenIdsRef.current.add(p.id);
        const isInstantBeam = p.kind === 'lightning' || p.kind === 'slash';
        activeMapRef.current.set(p.id, {
          proj: p,
          startTime: now,
          flightMs: isInstantBeam ? 240 : 400,
          impactMs: p.isCrit ? 620 : 420,
        });
      }
    });
  }, [projectiles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = Math.max(1, Math.round(gridWidth * cellPx));
    const height = Math.max(1, Math.round(gridHeight * cellPx));
    canvas.width = width;
    canvas.height = height;

    let hadActiveLastFrame = false;

    const render = (now: number) => {
      if (activeMapRef.current.size === 0) {
        if (hadActiveLastFrame) {
          ctx.clearRect(0, 0, width, height);
          hadActiveLastFrame = false;
        }
        rafRef.current = window.requestAnimationFrame(render);
        return;
      }
      hadActiveLastFrame = true;
      ctx.clearRect(0, 0, width, height);

      activeMapRef.current.forEach((anim, id) => {
        const elapsed = now - anim.startTime;
        const total = anim.flightMs + anim.impactMs;
        if (elapsed >= total) {
          activeMapRef.current.delete(id);
          return;
        }

        const { proj, flightMs, impactMs } = anim;
        const pal = KIND_PALETTE[proj.kind] || KIND_PALETTE.arcane;
        const x1 = proj.fromX * cellPx;
        const y1 = proj.fromY * cellPx;
        const x2 = proj.toX * cellPx;
        const y2 = proj.toY * cellPx;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        if (elapsed < flightMs) {
          const tRaw = Math.max(0, Math.min(1, elapsed / flightMs));
          const t = 1 - Math.pow(1 - tRaw, 2.2);
          const cx = x1 + dx * t;
          const cy = y1 + dy * t;

          if (proj.kind === 'lightning') {
            // Jagged forked lightning bolt from caster to target
            const segs = 9;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            const perpX = -Math.sin(angle);
            const perpY = Math.cos(angle);
            for (let i = 1; i < segs; i++) {
              const f = i / segs;
              const jitter = (Math.sin(i * 19.7 + elapsed * 0.04) * 0.65) * cellPx * 0.45;
              ctx.lineTo(x1 + dx * f + perpX * jitter, y1 + dy * f + perpY * jitter);
            }
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = proj.isCrit ? 6 : 4;
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 18;
            ctx.stroke();

            ctx.strokeStyle = pal.core;
            ctx.lineWidth = 2;
            ctx.stroke();
          } else if (proj.kind === 'arrow') {
            // Sleek glowing arrow with feathered trail
            const tailT = Math.max(0, t - 0.22);
            const tx = x1 + dx * tailT;
            const ty = y1 + dy * tailT;
            const grad = ctx.createLinearGradient(tx, ty, cx, cy);
            grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
            grad.addColorStop(1, pal.glow);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(cx, cy);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = pal.core;
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(-5, -4);
            ctx.lineTo(-2, 0);
            ctx.lineTo(-5, 4);
            ctx.closePath();
            ctx.fill();
          } else {
            // Glowing magical orb / fireball / frost shard / blessing mote with tapered comet trail
            const tailT = Math.max(0, t - 0.34);
            const tx = x1 + dx * tailT;
            const ty = y1 + dy * tailT;
            const trailGrad = ctx.createLinearGradient(tx, ty, cx, cy);
            trailGrad.addColorStop(0, 'rgba(0,0,0,0)');
            trailGrad.addColorStop(0.55, pal.trail);
            trailGrad.addColorStop(1, pal.glow);

            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(cx, cy);
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = proj.isCrit ? 11 : 7;
            ctx.lineCap = 'round';
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 16;
            ctx.stroke();

            // Spark particles along trail
            for (let s = 0; s < 5; s++) {
              const st = Math.max(0, t - s * 0.055);
              const px = x1 + dx * st + Math.sin(elapsed * 0.03 + s * 3.1) * 7;
              const py = y1 + dy * st + Math.cos(elapsed * 0.025 + s * 2.7) * 7;
              ctx.beginPath();
              ctx.arc(px, py, Math.max(1.5, 4 - s * 0.6), 0, Math.PI * 2);
              ctx.fillStyle = pal.glow;
              ctx.fill();
            }

            // Bright core orb
            const orbR = proj.kind === 'fireball' ? 11 : proj.isCrit ? 10 : 7.5;
            const orbGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, orbR * 2.2);
            orbGrad.addColorStop(0, pal.core);
            orbGrad.addColorStop(0.45, pal.glow);
            orbGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.arc(cx, cy, orbR * 2.2, 0, Math.PI * 2);
            ctx.fillStyle = orbGrad;
            ctx.fill();
          }
        } else {
          // Impact Shockwave + Radial Particle Burst (+ Golden Nova on Critical Hit!)
          const it = Math.max(0, Math.min(1, (elapsed - flightMs) / impactMs));
          const ease = 1 - Math.pow(1 - it, 3);
          const alpha = Math.max(0, 1 - it);
          const maxR = (proj.isCrit ? 1.85 : proj.kind === 'fireball' ? 1.45 : 1.05) * cellPx;
          const r = 8 + ease * maxR;

          ctx.globalAlpha = alpha * 0.9;
          ctx.beginPath();
          ctx.arc(x2, y2, r, 0, Math.PI * 2);
          ctx.strokeStyle = proj.isCrit ? '#fde047' : pal.glow;
          ctx.lineWidth = Math.max(1.5, (proj.isCrit ? 6 : 3.5) * (1 - it));
          ctx.shadowColor = proj.isCrit ? '#f59e0b' : pal.glow;
          ctx.shadowBlur = proj.isCrit ? 24 : 14;
          ctx.stroke();

          // Inner glow flash
          if (it < 0.45) {
            const flashAlpha = (1 - it / 0.45) * 0.7;
            const fg = ctx.createRadialGradient(x2, y2, 2, x2, y2, r * 0.85);
            fg.addColorStop(0, proj.isCrit ? '#fef9c3' : pal.core);
            fg.addColorStop(0.5, proj.isCrit ? '#f59e0b' : pal.glow);
            fg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = flashAlpha;
            ctx.beginPath();
            ctx.arc(x2, y2, r * 0.85, 0, Math.PI * 2);
            ctx.fillStyle = fg;
            ctx.fill();
          }

          // Flying radial sparks
          const sparkCount = proj.isCrit ? 14 : 8;
          ctx.globalAlpha = alpha;
          for (let i = 0; i < sparkCount; i++) {
            const a = (i / sparkCount) * Math.PI * 2 + (proj.isCrit ? it * 0.6 : 0);
            const dist = r * (0.55 + (i % 3) * 0.22);
            const sx = x2 + Math.cos(a) * dist;
            const sy = y2 + Math.sin(a) * dist;
            ctx.beginPath();
            ctx.arc(sx, sy, Math.max(1.2, (proj.isCrit ? 4.2 : 2.8) * (1 - it)), 0, Math.PI * 2);
            ctx.fillStyle = proj.isCrit && i % 2 === 0 ? '#fef08a' : pal.glow;
            ctx.fill();
          }
        }

        ctx.restore();
      });

      rafRef.current = window.requestAnimationFrame(render);
    };

    rafRef.current = window.requestAnimationFrame(render);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [cellPx, gridHeight, gridWidth]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-35"
      style={{ width: gridWidth * cellPx, height: gridHeight * cellPx }}
    />
  );
};
