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
  seed: number;
}

const KIND_PALETTE: Record<
  ProjectileVfxKind,
  { core: string; glow: string; trail: string; accent: string }
> = {
  fireball: { core: '#fff7ed', glow: '#f97316', trail: '#dc2626', accent: '#fde047' },
  lightning: { core: '#f8fafc', glow: '#38bdf8', trail: '#6366f1', accent: '#bae6fd' },
  frost: { core: '#f0fdfa', glow: '#67e8f9', trail: '#0284c7', accent: '#e0f2fe' },
  arcane: { core: '#faf5ff', glow: '#c084fc', trail: '#7c3aed', accent: '#e879f9' },
  heal: { core: '#ecfdf5', glow: '#34d399', trail: '#059669', accent: '#fde68a' },
  blessing: { core: '#fefce8', glow: '#fde047', trail: '#d97706', accent: '#fffbeb' },
  curse: { core: '#fdf2f8', glow: '#a855f7', trail: '#4c1d95', accent: '#ec4899' },
  arrow: { core: '#fef3c7', glow: '#f59e0b', trail: '#b45309', accent: '#ffffff' },
  slash: { core: '#fef2f2', glow: '#f87171', trail: '#dc2626', accent: '#fde047' },
  radiant: { core: '#fffbeb', glow: '#facc15', trail: '#f59e0b', accent: '#ffffff' },
  necrotic: { core: '#e9d5ff', glow: '#7e22ce', trail: '#1e1b4b', accent: '#c084fc' },
  poison: { core: '#ecfccb', glow: '#84cc16', trail: '#15803d', accent: '#4ade80' },
  blood: { core: '#ffe4e6', glow: '#e11d48', trail: '#7f1d1d', accent: '#fb7185' },
  thunder: { core: '#f0f9ff', glow: '#60a5fa', trail: '#1d4ed8', accent: '#e0f2fe' },
};

function drawRuneRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot: number,
  color: string,
  lineWidth = 2
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([r * 0.28, r * 0.22]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // 4 cardinal rune ticks
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
    ctx.lineTo(Math.cos(a) * r * 1.12, Math.sin(a) * r * 1.12);
    ctx.stroke();
  }
  ctx.restore();
}

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
    seenIdsRef.current.forEach((id) => {
      if (!currentIds.has(id)) {
        seenIdsRef.current.delete(id);
      }
    });
    projectiles.forEach((p) => {
      if (!seenIdsRef.current.has(p.id)) {
        seenIdsRef.current.add(p.id);
        const isInstant =
          p.kind === 'lightning' ||
          p.kind === 'slash' ||
          p.kind === 'radiant' ||
          p.kind === 'thunder' ||
          p.kind === 'blood';
        activeMapRef.current.set(p.id, {
          proj: p,
          startTime: now,
          flightMs: isInstant ? 240 : 410,
          impactMs: p.isCrit ? 760 : 540,
          seed: Math.random() * 100,
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

        const { proj, flightMs, impactMs, seed } = anim;
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
            // Double-forked branching lightning bolt!
            const segs = 10;
            const perpX = -Math.sin(angle);
            const perpY = Math.cos(angle);
            const pts: Array<{ x: number; y: number }> = [{ x: x1, y: y1 }];
            for (let i = 1; i < segs; i++) {
              const f = i / segs;
              const jitter = Math.sin(i * 19.7 + elapsed * 0.055 + seed) * 0.72 * cellPx * 0.48;
              pts.push({ x: x1 + dx * f + perpX * jitter, y: y1 + dy * f + perpY * jitter });
            }
            pts.push({ x: x2, y: y2 });

            ctx.beginPath();
            pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = proj.isCrit ? 7 : 4.5;
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 22;
            ctx.stroke();

            ctx.strokeStyle = pal.core;
            ctx.lineWidth = 2.2;
            ctx.stroke();

            // Two branching side forks
            [3, 6].forEach((bIdx, k) => {
              const base = pts[bIdx];
              if (!base) return;
              const side = k % 2 === 0 ? 1 : -1;
              const bx = base.x + dx * 0.14 + perpX * side * cellPx * 0.55;
              const by = base.y + dy * 0.14 + perpY * side * cellPx * 0.55;
              ctx.beginPath();
              ctx.moveTo(base.x, base.y);
              ctx.lineTo((base.x + bx) / 2 + perpX * side * 8, (base.y + by) / 2);
              ctx.lineTo(bx, by);
              ctx.strokeStyle = pal.accent;
              ctx.lineWidth = 1.6;
              ctx.stroke();
            });
          } else if (proj.kind === 'radiant') {
            // Descending Golden Pillar of Light from the heavens!
            const pillarW = (proj.isCrit ? 0.95 : 0.68) * cellPx * (0.4 + 0.6 * t);
            const topY = Math.max(0, y2 - cellPx * 4.5);
            const pGrad = ctx.createLinearGradient(x2 - pillarW, y2, x2 + pillarW, y2);
            pGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
            pGrad.addColorStop(0.3, 'rgba(250, 204, 21, 0.45)');
            pGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.92)');
            pGrad.addColorStop(0.7, 'rgba(250, 204, 21, 0.45)');
            pGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
            ctx.fillStyle = pGrad;
            ctx.fillRect(x2 - pillarW, topY, pillarW * 2, y2 - topY + cellPx * 0.35);
            drawRuneRing(ctx, x2, y2, cellPx * (0.55 + t * 0.35), t * 2.4, pal.glow, 2.2);
          } else if (proj.kind === 'slash' || proj.kind === 'blood') {
            // Crescent blade or demonic crimson claw arc right across target!
            ctx.save();
            ctx.translate(x2, y2);
            ctx.rotate(angle - Math.PI * 0.45);
            const arcR = cellPx * (proj.kind === 'blood' ? 0.78 : 0.66);
            const sweep = -Math.PI * 0.65 + t * Math.PI * 1.3;
            ctx.beginPath();
            ctx.arc(0, 0, arcR, sweep - 1.15, sweep);
            ctx.strokeStyle = pal.glow;
            ctx.lineWidth = proj.isCrit ? 10 : 7;
            ctx.lineCap = 'round';
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 18;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, arcR, sweep - 0.85, sweep);
            ctx.strokeStyle = pal.core;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();

            if (proj.kind === 'blood') {
              drawRuneRing(ctx, x2, y2, cellPx * (0.48 + t * 0.28), -t * 3, pal.glow, 1.8);
            }
          } else if (proj.kind === 'thunder') {
            // Expanding triple sonic rings from caster toward target
            for (let ring = 0; ring < 3; ring++) {
              const rt = Math.max(0, t - ring * 0.16);
              if (rt <= 0) continue;
              const rx = x1 + dx * rt;
              const ry = y1 + dy * rt;
              ctx.globalAlpha = Math.max(0, 1 - rt * 0.8);
              ctx.beginPath();
              ctx.arc(rx, ry, cellPx * (0.3 + rt * 0.75), 0, Math.PI * 2);
              ctx.strokeStyle = ring === 0 ? pal.core : pal.glow;
              ctx.lineWidth = 3.5 - ring * 0.8;
              ctx.shadowColor = pal.glow;
              ctx.shadowBlur = 14;
              ctx.stroke();
            }
          } else if (proj.kind === 'arrow') {
            // Sleek glowing arrow with wind-wake trail
            const tailT = Math.max(0, t - 0.25);
            const tx = x1 + dx * tailT;
            const ty = y1 + dy * tailT;
            const grad = ctx.createLinearGradient(tx, ty, cx, cy);
            grad.addColorStop(0, 'rgba(245, 158, 11, 0)');
            grad.addColorStop(1, pal.glow);
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(cx, cy);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 3.2;
            ctx.stroke();

            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = pal.core;
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.moveTo(12, 0);
            ctx.lineTo(-6, -4.5);
            ctx.lineTo(-2, 0);
            ctx.lineTo(-6, 4.5);
            ctx.closePath();
            ctx.fill();
          } else {
            // Fireball / Frost / Arcane / Poison / Necrotic / Heal / Blessing / Curse comet projectile
            const tailT = Math.max(0, t - 0.38);
            const tx = x1 + dx * tailT;
            const ty = y1 + dy * tailT;
            const trailGrad = ctx.createLinearGradient(tx, ty, cx, cy);
            trailGrad.addColorStop(0, 'rgba(0,0,0,0)');
            trailGrad.addColorStop(0.5, pal.trail);
            trailGrad.addColorStop(1, pal.glow);

            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(cx, cy);
            ctx.strokeStyle = trailGrad;
            ctx.lineWidth = proj.kind === 'fireball' ? (proj.isCrit ? 14 : 10) : proj.isCrit ? 11 : 7.5;
            ctx.lineCap = 'round';
            ctx.shadowColor = pal.glow;
            ctx.shadowBlur = 20;
            ctx.stroke();

            // Spiral / ember trail particles
            const pCount = proj.kind === 'fireball' ? 9 : 6;
            for (let s = 0; s < pCount; s++) {
              const st = Math.max(0, t - s * 0.045);
              const wobble = proj.kind === 'necrotic' || proj.kind === 'heal' ? 11 : 7.5;
              const px = x1 + dx * st + Math.sin(elapsed * 0.035 + s * 2.8 + seed) * wobble;
              const py = y1 + dy * st + Math.cos(elapsed * 0.03 + s * 2.3 + seed) * wobble;
              ctx.beginPath();
              ctx.arc(px, py, Math.max(1.5, 4.5 - s * 0.45), 0, Math.PI * 2);
              ctx.fillStyle = s % 2 === 0 ? pal.accent : pal.glow;
              ctx.fill();
            }

            // Bright multi-layered core orb
            const orbR = proj.kind === 'fireball' ? 12.5 : proj.isCrit ? 11 : 8;
            const orbGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, orbR * 2.4);
            orbGrad.addColorStop(0, pal.core);
            orbGrad.addColorStop(0.4, pal.glow);
            orbGrad.addColorStop(0.75, pal.trail);
            orbGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.arc(cx, cy, orbR * 2.4, 0, Math.PI * 2);
            ctx.fillStyle = orbGrad;
            ctx.fill();
          }
        } else {
          // =====================================================
          // AAA IMPACT CHOREOGRAPHY (Element-specific + Crit Nova!)
          // =====================================================
          const it = Math.max(0, Math.min(1, (elapsed - flightMs) / impactMs));
          const ease = 1 - Math.pow(1 - it, 3);
          const alpha = Math.max(0, 1 - it);
          const baseScale =
            proj.isCrit
              ? 2.05
              : proj.kind === 'fireball' || proj.kind === 'thunder'
                ? 1.65
                : proj.kind === 'radiant' || proj.kind === 'necrotic' || proj.kind === 'blood'
                  ? 1.4
                  : 1.15;
          const maxR = baseScale * cellPx;
          const r = 8 + ease * maxR;

          // Primary Shockwave Ring
          ctx.globalAlpha = alpha * 0.92;
          ctx.beginPath();
          ctx.arc(x2, y2, r, 0, Math.PI * 2);
          ctx.strokeStyle = proj.isCrit ? '#fde047' : pal.glow;
          ctx.lineWidth = Math.max(1.5, (proj.isCrit ? 6.5 : 4) * (1 - it));
          ctx.shadowColor = proj.isCrit ? '#f59e0b' : pal.glow;
          ctx.shadowBlur = proj.isCrit ? 28 : 16;
          ctx.stroke();

          // Secondary delayed ring on Fireball, Thunder, Radiant, or Critical Hits
          if ((proj.isCrit || proj.kind === 'fireball' || proj.kind === 'thunder' || proj.kind === 'radiant') && it > 0.12) {
            const it2 = Math.min(1, (it - 0.12) / 0.88);
            ctx.globalAlpha = Math.max(0, 1 - it2) * 0.72;
            ctx.beginPath();
            ctx.arc(x2, y2, 6 + (1 - Math.pow(1 - it2, 3)) * maxR * 0.78, 0, Math.PI * 2);
            ctx.strokeStyle = proj.isCrit ? '#fef08a' : pal.accent;
            ctx.lineWidth = Math.max(1, 3 * (1 - it2));
            ctx.stroke();
          }

          // Rotating Runic Ring for Arcane / Blessing / Radiant / Curse / Necrotic / Blood
          if (
            proj.kind === 'arcane' ||
            proj.kind === 'blessing' ||
            proj.kind === 'radiant' ||
            proj.kind === 'curse' ||
            proj.kind === 'necrotic' ||
            proj.kind === 'blood'
          ) {
            ctx.globalAlpha = alpha * 0.85;
            const rotDir = proj.kind === 'curse' || proj.kind === 'necrotic' ? -1 : 1;
            drawRuneRing(ctx, x2, y2, r * 0.68, rotDir * it * 2.8, pal.accent, 1.8);
          }

          // Crystalline 6-pointed Ice Shatter for Frost
          if (proj.kind === 'frost') {
            ctx.globalAlpha = alpha * 0.9;
            ctx.strokeStyle = pal.core;
            ctx.lineWidth = 2.2;
            for (let i = 0; i < 6; i++) {
              const a = (i * Math.PI) / 3 + 0.25;
              ctx.beginPath();
              ctx.moveTo(x2 + Math.cos(a) * r * 0.2, y2 + Math.sin(a) * r * 0.2);
              ctx.lineTo(x2 + Math.cos(a) * r * 0.92, y2 + Math.sin(a) * r * 0.92);
              ctx.stroke();
            }
          }

          // Inner Core Flash
          if (it < 0.5) {
            const flashAlpha = (1 - it / 0.5) * 0.78;
            const fg = ctx.createRadialGradient(x2, y2, 2, x2, y2, r * 0.9);
            fg.addColorStop(0, proj.isCrit ? '#fef9c3' : pal.core);
            fg.addColorStop(0.45, proj.isCrit ? '#f59e0b' : pal.glow);
            fg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = flashAlpha;
            ctx.beginPath();
            ctx.arc(x2, y2, r * 0.9, 0, Math.PI * 2);
            ctx.fillStyle = fg;
            ctx.fill();
          }

          // Rising Healing / Blessing / Poison bubbles OR Radial Explosion Sparks
          if (proj.kind === 'heal' || proj.kind === 'blessing' || proj.kind === 'poison') {
            const moteCount = proj.isCrit ? 18 : 12;
            ctx.globalAlpha = alpha;
            for (let i = 0; i < moteCount; i++) {
              const phase = (i / moteCount) * Math.PI * 2 + seed;
              const spiralR = cellPx * (0.2 + (i % 4) * 0.14);
              const mx = x2 + Math.cos(phase + it * 3.5) * spiralR;
              const my = y2 + Math.sin(phase) * spiralR * 0.45 - it * cellPx * 1.15;
              const rad = Math.max(1.5, (proj.kind === 'poison' ? 4.4 : 3.4) * (1 - it * 0.65));
              ctx.beginPath();
              ctx.arc(mx, my, rad, 0, Math.PI * 2);
              ctx.fillStyle = i % 2 === 0 ? pal.core : pal.glow;
              ctx.fill();
            }
          } else {
            const sparkCount = proj.isCrit ? 24 : proj.kind === 'fireball' ? 16 : 10;
            ctx.globalAlpha = alpha;
            for (let i = 0; i < sparkCount; i++) {
              const a = (i / sparkCount) * Math.PI * 2 + seed * 0.1 + (proj.isCrit ? it * 0.65 : 0);
              const dist = r * (0.48 + ((i * 7) % 5) * 0.14);
              const sx = x2 + Math.cos(a) * dist;
              const sy = y2 + Math.sin(a) * dist;
              ctx.beginPath();
              ctx.arc(
                sx,
                sy,
                Math.max(1.2, (proj.isCrit ? 4.6 : 3.1) * (1 - it * 0.85)),
                0,
                Math.PI * 2
              );
              ctx.fillStyle = proj.isCrit && i % 2 === 0 ? '#fef08a' : i % 3 === 0 ? pal.accent : pal.glow;
              ctx.fill();
            }
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
